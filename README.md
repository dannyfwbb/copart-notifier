# Copart Car Notifier

A NestJS application that uses Telegram bot to notify users about new car listings from Copart.

## Features

- Fetches new car listings from Copart API periodically
- Sends notifications to Telegram users about new listings
- Allows users to customize notification schedule using cron expressions
- Stores car listings and user preferences in a database

## Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Telegram Bot Token (obtained from BotFather)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd copart-notifier
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your Telegram bot token:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

## Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm run start:prod
```

### Testing the Copart API Integration

To test the Copart API integration without running the full application:

```bash
npm run test:copart-api
```

This will run a test script that fetches car listings from Copart and displays sample results. The script will show the first few listings with details like lot number, model, year, price, auction date, and image URL.

Example output:

```
Testing Copart API integration...
Sending request to Copart API...
Successfully fetched 20 car listings

Sample listings:

Listing 1:
- Lot Number: 64388354
- Model: A4 PREMIUM
- Year: 2017
- Price: $2350
- Auction Date: 4/21/2025
- Image URL: https://cs.copart.com/v1/AUTH_svc.pdoc00001/lpp/0724/80505467e3644ca9af56cd6bec9140d2_thb.jpg
```

## Bot Commands

- `/start` - Start receiving notifications
- `/help` - Show available commands
- `/setschedule [cron]` - Set notification schedule using cron expression (e.g., `/setschedule 0 */2 * * *` for every 2 hours)
- `/status` - Show current notification settings
- `/stop` - Stop receiving notifications

## Creating a Telegram Bot

1. Open Telegram and search for "BotFather"
2. Start a chat with BotFather and send the command `/newbot`
3. Follow the instructions to create a new bot
4. Once created, BotFather will provide you with a token
5. Copy this token to your `.env` file

## Project Structure

- `apps/copart-notifier/src/app/bot` - Telegram bot integration
- `apps/copart-notifier/src/app/copart` - Copart API integration and data processing
  - `interfaces` - TypeScript interfaces for Copart API request/response
- `apps/copart-notifier/src/app/database` - Database entities and configuration
- `apps/copart-notifier/src/app/scheduler` - Scheduled tasks for fetching data

## Copart API Integration

The application uses the Copart API to fetch car listings:

- Endpoint: `https://www.copart.com/public/lots/vehicle-finder-search-results`
- Method: POST
- Request: JSON payload with filters, sorting, and pagination
- Response: JSON with car listings including details like model, year, price, auction date, etc.

The API integration allows for filtering by make, model, year, drive type, and other parameters, which can be customized in the `createFilter` method of the `CopartService`.

## License

MIT
