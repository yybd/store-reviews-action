document.addEventListener('DOMContentLoaded', () => {
    fetchConfig();
    fetchReviews();
    setupTestButton();
    setupSettingsModal();
});

async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        
        const devNameEl = document.getElementById('developer-name-display');
        if (devNameEl && config.developerName) {
            devNameEl.textContent = `Tracking feedback for ${config.developerName}'s Apps`;
        }
        
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.classList.remove('hidden');
            let statusHtml = '';
            
            if (config.connected) {
                statusHtml += `<span style="color: #4ade80;" title="App Store Connected">●</span> Store (${config.appsCount} apps)`;
            } else {
                statusHtml += `<span style="color: #ff5e5e;" title="App Store Disconnected">●</span> Store (Check DEVELOPER_TERM)`;
            }
            
            statusHtml += `<span style="margin: 0 6px; color: #cbd5e1;">|</span>`;
            
            const testBtn = document.getElementById('test-telegram-btn');
            if (config.telegramConnected) {
                statusHtml += `<span style="color: #4ade80;" title="Telegram Connected">●</span> Telegram`;
                if (testBtn) {
                    testBtn.disabled = false;
                    testBtn.style.opacity = '1';
                    testBtn.style.cursor = 'pointer';
                    testBtn.title = 'Send an instant summary to Telegram';
                }
            } else {
                statusHtml += `<span style="color: #ff5e5e;" title="Telegram Disconnected">●</span> Telegram`;
                if (testBtn) {
                    testBtn.disabled = true;
                    testBtn.style.opacity = '0.5';
                    testBtn.style.cursor = 'not-allowed';
                    testBtn.title = 'Telegram is not configured';
                }
            }
            
            statusEl.innerHTML = statusHtml;
        }
    } catch (error) {
        console.error('Error fetching config:', error);
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = `<span style="color: #ff5e5e;">●</span> Failed to connect to server.`;
        }
    }
}

function setupTestButton() {
    const testBtn = document.getElementById('test-telegram-btn');
    if (!testBtn) return;
    
        testBtn.addEventListener('click', async () => {
        const originalText = testBtn.textContent;
        testBtn.textContent = 'Sending...';
        testBtn.disabled = true;
        testBtn.style.opacity = '0.7';
        
        try {
            const res = await fetch('/api/send-apps-summary', { method: 'POST' });
            if (res.ok) {
                testBtn.textContent = 'Sent! ✅';
            } else {
                testBtn.textContent = 'Failed ❌';
            }
        } catch (error) {
            testBtn.textContent = 'Error ❌';
        }
        
        setTimeout(() => {
            testBtn.textContent = originalText;
            testBtn.disabled = false;
            testBtn.style.opacity = '1';
        }, 3000);
    });
}

async function fetchReviews() {
    const loadingEl = document.getElementById('loading');
    const gridEl = document.getElementById('reviews-grid');
    const emptyStateEl = document.getElementById('empty-state');
    const totalReviewsEl = document.getElementById('total-reviews');

    try {
        const response = await fetch('/api/reviews');
        if (!response.ok) throw new Error('Failed to fetch reviews');
        
        const reviews = await response.json();
        
        loadingEl.classList.add('hidden');
        
        if (reviews.length === 0) {
            emptyStateEl.classList.remove('hidden');
            totalReviewsEl.textContent = '0';
            return;
        }

        totalReviewsEl.textContent = reviews.length.toLocaleString();
        
        gridEl.innerHTML = ''; // Clear previous content
        
        reviews.forEach((review, index) => {
            const card = createReviewCard(review);
            // Staggered animation
            card.style.animationDelay = `${index * 50}ms`;
            gridEl.appendChild(card);
        });
        
        gridEl.classList.remove('hidden');

    } catch (error) {
        console.error('Error fetching reviews:', error);
        loadingEl.innerHTML = `<p style="color: #ff5e5e;">Error loading reviews. Retrying soon...</p>`;
        // Optional: auto-retry
        setTimeout(fetchReviews, 10000);
    }
}

function createReviewCard(review) {
    const card = document.createElement('div');
    card.className = 'review-card fade-in';
    
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const date = new Date(review.updated_at).toLocaleDateString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric' 
    });

    card.innerHTML = `
        <div class="review-header">
            <div class="stars">${stars}</div>
            <div class="review-date">${date}</div>
        </div>
        <h3 class="review-title">${escapeHTML(review.title)}</h3>
        <div class="review-content">${escapeHTML(review.content)}</div>
        <div class="review-footer">
            <span class="review-author">${escapeHTML(review.author_name)}</span>
            <span class="review-version">v${escapeHTML(review.version)}</span>
        </div>
    `;

    return card;
}

// Basic HTML escaping to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Poll for updates every 60 seconds
setInterval(fetchReviews, 60000);

function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('close-settings-btn');
    const saveBtn = document.getElementById('save-settings-btn');
    const tokenInput = document.getElementById('telegram-token');
    const chatIdInput = document.getElementById('telegram-chat-id');
    const developerNameInput = document.getElementById('developer-name');
    const statusEl = document.getElementById('settings-save-status');

    if (!modal || !settingsBtn) return;

    settingsBtn.addEventListener('click', async () => {
        if (statusEl) {
            statusEl.textContent = 'Loading...';
            statusEl.style.color = 'var(--text-secondary)';
        }
        modal.classList.remove('hidden');
        
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (tokenInput) tokenInput.value = data.telegramToken || '';
            if (chatIdInput) chatIdInput.value = data.telegramChatId || '';
            if (developerNameInput) developerNameInput.value = data.developerName || '';
            if (statusEl) statusEl.textContent = '';
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = 'Error loading settings';
                statusEl.style.color = '#ff5e5e';
            }
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        if (statusEl) statusEl.textContent = '';
        
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramToken: tokenInput ? tokenInput.value.trim() : '',
                    telegramChatId: chatIdInput ? chatIdInput.value.trim() : '',
                    developerName: developerNameInput ? developerNameInput.value.trim() : ''
                })
            });
            
            const data = await res.json();
            if (data.success) {
                if (statusEl) {
                    statusEl.textContent = 'Saved successfully! ✅';
                    statusEl.style.color = '#4ade80';
                }
                fetchConfig();
                // We should also trigger fetchReviews in case developer name changed
                fetchReviews();
                
                setTimeout(() => {
                    modal.classList.add('hidden');
                    if (statusEl) statusEl.textContent = '';
                }, 1500);
            } else {
                throw new Error(data.error || 'Failed to save');
            }
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = e.message;
                statusEl.style.color = '#ff5e5e';
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    });
}
