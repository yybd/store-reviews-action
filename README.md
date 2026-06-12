# Store Reviews Action & Telegram Bot

This project is a complete **Web Dashboard and Telegram Bot** designed to track Mac App Store reviews for a specific developer. It automatically scrapes Apple's servers for your apps, stores reviews in a local database (SQLite), provides a beautiful Web Dashboard, and keeps you updated via Telegram notifications.

## Telegram Integration (Core Feature)

One of the main strengths of this system is its deep Telegram integration, allowing you to stay connected to your user feedback from anywhere. 

There are two distinct types of Telegram interactions:

### 1. Automated Push Notifications (Active)
The system runs silently in the background, checking the App Store at regular intervals (default: every hour). 
- Whenever a **brand new review** is published for any of your apps, the bot will automatically send a **push notification** directly to your Telegram chat.
- The notification includes the app's official icon, the star rating, the author's name, the app version, and the full text of the review.
- You do not need to do anything to trigger this; it happens entirely automatically.

### 2. 📊 On-Demand Summaries (Manual)
If you want to quickly check the current status of your apps without waiting for a new review, you can manually request a summary:
- **How to trigger**: Click the "Send Summary" button on the Web Dashboard, or simply type `/apps` in your Telegram chat with the bot.
- **What you get**: The bot will reply with a clean summary listing all your apps, their average ratings, and total review counts.
- **Interactive Buttons**: Below the summary, the bot attaches inline buttons for each app. Clicking an app's button will instantly reply with its **last 5 reviews**.

---

## 💻 Web Dashboard

The project includes a sleek, modern web interface accessible from your browser (e.g., `http://localhost:3000`).
- **Apps Grid**: Displays a card for each of your apps, showing its icon, name, average rating, and total review count.
- **Reviews Modal**: Click on any app to open a scrollable window containing all its saved reviews.
- **In-Browser Settings**: A built-in Settings modal allows you to configure your Developer Name, Telegram Bot Token, and Telegram Chat ID directly from the UI—no need to mess with `.env` files once the server is running.

---

## 🛠 Setup Instructions

### 1. Install & Run
1. Open your terminal in the project folder and install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to `http://localhost:3000`.

### 2. Configure Settings (via Web UI)
1. In the Web Dashboard, click the **Settings** button at the top right.
2. **Developer Name**: Enter your exact App Store developer name (this is used to search for your apps).
3. **Telegram Configuration**:
   - Create a bot via **@BotFather** on Telegram to get your **Bot Token**.
   - Use a bot like **@userinfobot** to find your numeric **Chat ID**.
   - Enter both into the settings window and click "Save".

*(Note: The system saves these settings persistently in a local database. You only need to configure them once).*

## Technical Overview

- **`scraper.js`**: Connects to the iTunes Search API and RSS feeds to fetch apps, ratings, and reviews. Filters results strictly to ensure only your apps are tracked.
- **`telegram.js`**: Manages the Telegram bot lifecycle, polling, inline keyboards, and automated photo/text messages.
- **`db.js`**: Handles the local SQLite database (`data/reviews.sqlite`), storing persistent settings and preventing duplicate reviews.
- **`server.js`**: The Express server that orchestrates the backend, serves the frontend UI, and runs the background scraping loops.
