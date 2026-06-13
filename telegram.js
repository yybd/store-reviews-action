const TelegramBot = require('node-telegram-bot-api');
const dbModule = require('./db');

let bot = null;
let activeChatId = null;

// Escape user-generated content for Telegram's HTML parse mode.
// (Markdown mode breaks on review text containing *, _, [ etc. — HTML is robust.)
const escapeHtml = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Telegram messages are capped at 4096 chars; trim long review bodies
const truncate = (text, max) => {
  const s = String(text === null || text === undefined ? '' : text);
  return s.length > max ? s.slice(0, max) + '…' : s;
};

const setupListeners = () => {
  if (!bot) return;

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err.message || err);
  });

  // Handle /start and /apps commands
  bot.onText(/\/(start|apps)/, async (msg) => {
    const chatId = msg.chat.id;
    if (String(chatId) !== activeChatId) return;

    const { fetchDeveloperApps } = require('./scraper');
    bot.sendMessage(chatId, 'Fetching apps data...').catch(() => {});

    try {
      const apps = await fetchDeveloperApps();
      await sendSummaryMessage(apps);
    } catch (err) {
      console.error('Error handling /apps command:', err);
      bot.sendMessage(chatId, 'Error fetching apps data.').catch(() => {});
    }
  });

  // Handle button clicks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (String(chatId) !== activeChatId) return;

    const data = query.data || '';
    if (data.startsWith('app_')) {
      const appId = data.substring(4);

      // Fetch latest reviews from DB
      dbModule.all('SELECT * FROM reviews WHERE app_id = ? ORDER BY updated_at DESC LIMIT 5', [appId], (err, rows) => {
        if (err || !rows || rows.length === 0) {
          bot.answerCallbackQuery(query.id, { text: 'No reviews found in the local database.' }).catch(() => {});
          bot.sendMessage(chatId, 'No reviews found in the local database for this app.').catch(() => {});
          return;
        }

        let reviewText = `<b>Latest 5 Reviews:</b>\n\n`;
        rows.forEach(r => {
          reviewText += `Rating: ${r.rating}/5\n<b>${escapeHtml(truncate(r.title, 300))}</b> by <i>${escapeHtml(r.author_name)}</i>\n${escapeHtml(truncate(r.content, 600))}\n\n`;
        });

        bot.answerCallbackQuery(query.id).catch(() => {});
        bot.sendMessage(chatId, reviewText, { parse_mode: 'HTML' }).catch((e) => {
          console.error('Error sending reviews message:', e.message || e);
        });
      });
    }
  });
};

const initBot = async (token, chatId) => {
  if (bot) {
    console.log('Stopping existing Telegram bot...');
    try {
      await bot.stopPolling();
    } catch (e) {
      console.error('Error stopping bot polling:', e);
    }
    bot = null;
  }

  activeChatId = chatId ? String(chatId).trim() : null;

  if (token && activeChatId) {
    try {
      bot = new TelegramBot(token, { polling: true });
      setupListeners();
      console.log('Telegram bot configured with polling.');
      return true;
    } catch (e) {
      console.error('Failed to initialize bot:', e);
      bot = null;
      return false;
    }
  } else {
    console.log('Telegram bot token or chat ID not provided. Telegram notifications disabled.');
    return false;
  }
};

const getFlagEmoji = (countryCode) => {
  if (!countryCode || !/^[a-z]{2}$/i.test(countryCode)) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
};

const sendReviewNotification = async (review, appName, iconUrl, countryCode) => {
  if (!bot || !activeChatId) return;

  const rating = Math.max(0, Math.min(5, review.rating || 0));
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const flag = countryCode ? `${getFlagEmoji(countryCode)} (${countryCode.toUpperCase()}) ` : '';

  let message = `<b>New Review for ${escapeHtml(appName)}</b>\n`;
  message += `${flag}${stars}\n`;
  message += `<b>Author:</b> ${escapeHtml(review.author_name)}\n`;
  message += `<b>Version:</b> ${escapeHtml(review.version)}\n\n`;
  message += `<b>${escapeHtml(truncate(review.title, 300))}</b>\n${escapeHtml(truncate(review.content, 3000))}`;

  try {
    const options = { parse_mode: 'HTML' };
    if (iconUrl) {
      options.link_preview_options = {
        url: iconUrl,
        prefer_small_media: true,
        show_above_text: true
      };
    }

    await bot.sendMessage(activeChatId, message, options);
    console.log(`Sent Telegram notification for review ${review.id}`);
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
};

// Pure builder for the summary text + inline keyboard (no bot I/O), so it can be
// unit-tested. `downloadsInfo` is the shape returned by fetchDownloadsPrivate():
// { available, periodDays, downloads: { appId: count } }. The download line is
// added only when downloads are available and the app has a count.
const buildAppsSummary = (apps, downloadsInfo = {}) => {
  const downloads = downloadsInfo.downloads || {};
  const downloadsAvailable = !!downloadsInfo.available;
  const downloadsPeriod = downloadsInfo.periodDays || 30;

  let message = `<b>Apps Rating Summary</b>\n\n`;
  const keyboard = [];

  if (!apps || apps.length === 0) {
    message += `No apps found.`;
    return { message, keyboard };
  }

  apps.forEach(app => {
    const ratings = app.ratingsByCountry || [];
    const totalCount = ratings.reduce((sum, r) => sum + r.count, 0);
    const totalRatingPoints = ratings.reduce((sum, r) => sum + (r.rating * r.count), 0);
    const avgRating = totalCount > 0 ? (totalRatingPoints / totalCount).toFixed(1) : '0.0';
    const unpublishedTag = app.isPublished === false ? ' [Not in Store]' : '';
    message += `<b>${escapeHtml(app.name)}</b>${escapeHtml(unpublishedTag)}\nRating: ${avgRating}/5 (${totalCount} reviews)\n`;
    const dlCount = downloads[app.id];
    if (downloadsAvailable && typeof dlCount === 'number') {
      message += `Downloads: ${dlCount.toLocaleString()} (last ${downloadsPeriod}d)\n`;
    }
    message += `\n`;
    keyboard.push([{ text: `View Reviews: ${app.name}`, callback_data: `app_${app.id}` }]);
  });

  return { message, keyboard };
};

const sendSummaryMessage = async (apps) => {
  if (!bot || !activeChatId) return false;

  // Download counts are Private-API only and best-effort: stays empty/unavailable
  // in Public mode, without a Vendor Number, or if the key lacks sales access — in
  // which case the summary simply omits the download line. Required lazily to avoid
  // a load-time circular dependency with scraper.js.
  let downloadsInfo = {};
  try {
    const { fetchDownloadsPrivate } = require('./scraper');
    downloadsInfo = await fetchDownloadsPrivate();
  } catch (e) {
    console.error('Error fetching downloads for summary:', e.message || e);
  }

  const { message, keyboard } = buildAppsSummary(apps, downloadsInfo);

  try {
    await bot.sendMessage(activeChatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    console.log('Sent Telegram summary notification.');
    return true;
  } catch (error) {
    console.error('Error sending Telegram summary:', error);
    return false;
  }
};

const isBotConnected = () => !!bot;

module.exports = { initBot, isBotConnected, sendReviewNotification, sendSummaryMessage, buildAppsSummary };
