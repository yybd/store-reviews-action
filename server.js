require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { scrapeReviews } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES || '15', 10);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Coolify
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// API endpoint for frontend config and connection status
app.get('/api/config', async (req, res) => {
  const { fetchDeveloperApps } = require('./scraper');
  try {
    const apps = await fetchDeveloperApps();
    const developerName = process.env.DEVELOPER_TERM || 'Your Developer Name';
    res.json({ 
      developerName, 
      connected: apps.length > 0,
      appsCount: apps.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch developer config', connected: false });
  }
});

// Test Telegram notification / Summary
app.post('/api/send-apps-summary', async (req, res) => {
  const { sendSummaryMessage } = require('./telegram');
  const { fetchDeveloperApps } = require('./scraper');
  
  try {
    const apps = await fetchDeveloperApps();
    const success = await sendSummaryMessage(apps);
    if (success) {
      res.json({ success: true, message: 'Summary sent to Telegram' });
    } else {
      res.status(500).json({ success: false, message: 'Telegram not configured or failed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error generating summary' });
  }
});

// API endpoint to get all reviews, sorted by newest
app.get('/api/reviews', (req, res) => {
  db.all('SELECT * FROM reviews ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve reviews' });
      return;
    }
    res.json(rows);
  });
});

// Initial scrape on startup
setTimeout(() => {
  scrapeReviews();
}, 2000); // Wait 2s to ensure DB is initialized

// Setup polling interval
setInterval(() => {
  scrapeReviews();
}, POLL_INTERVAL_MINUTES * 60 * 1000);

const { bot } = require('./telegram');

if (bot) {
  // Handle /apps command
  bot.onText(/\/(start|apps)/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== process.env.TELEGRAM_CHAT_ID) return;

    const { fetchDeveloperApps } = require('./scraper');
    bot.sendMessage(chatId, '🔄 Fetching apps data...');
    
    try {
      const apps = await fetchDeveloperApps();
      if (apps.length === 0) {
        bot.sendMessage(chatId, 'No apps found.');
        return;
      }

      let text = `📊 *Apps Rating Summary*\n\n`;
      const keyboard = [];

      apps.forEach(app => {
        const stars = app.rating > 0 ? '⭐'.repeat(Math.round(app.rating)) + '☆'.repeat(5 - Math.round(app.rating)) : 'No ratings yet';
        text += `📱 *${app.name}*\n${stars} (${app.rating} avg from ${app.ratingCount} reviews)\n\n`;
        
        keyboard.push([{ text: `View Reviews: ${app.name}`, callback_data: `app_${app.id}` }]);
      });

      bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (err) {
      bot.sendMessage(chatId, 'Error fetching apps data.');
    }
  });

  // Handle button clicks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (chatId.toString() !== process.env.TELEGRAM_CHAT_ID) return;

    const data = query.data;
    if (data.startsWith('app_')) {
      const appId = data.split('_')[1];
      
      // Fetch latest reviews from DB
      db.all('SELECT * FROM reviews WHERE app_id = ? ORDER BY updated_at DESC LIMIT 5', [appId], (err, rows) => {
        if (err || !rows || rows.length === 0) {
          bot.answerCallbackQuery(query.id, { text: 'No reviews found in the local database.' });
          bot.sendMessage(chatId, 'No reviews found in the local database for this app. They will appear here once new reviews are discovered.');
          return;
        }

        let reviewText = `📝 *Latest 5 Reviews:*\n\n`;
        rows.forEach(r => {
          const stars = '⭐'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
          reviewText += `${stars}\n*${r.title}* by _${r.author_name}_\n${r.content}\n\n`;
        });

        bot.answerCallbackQuery(query.id);
        bot.sendMessage(chatId, reviewText, { parse_mode: 'Markdown' });
      });
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Polling interval set to ${POLL_INTERVAL_MINUTES} minutes.`);
});
