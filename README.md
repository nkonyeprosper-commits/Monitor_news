# Crypto Monitor Bot

Automated bot that monitors Sui and BNB networks for new token launches and crypto news, then posts updates to Twitter and Telegram.

## Features

- 🔍 **Real-time Monitoring**
  - Scans Sui network for new token launches
  - Monitors BNB chain for new contracts
  - Tracks DexScreener, CoinMarketCap, and CoinGecko

- 📰 **News Aggregation**
  - CryptoPanic API integration
  - NewsAPI crypto news
  - CoinMarketCap news feed

- 🐦 **Twitter Integration**
  - Automated tweet posting
  - Rate limit handling
  - Tweet tracking and analytics

- 📱 **Telegram Integration**
  - Channel message posting
  - Formatted updates with links
  - Real-time notifications

- 💾 **Data Storage**
  - MongoDB Atlas cloud database
  - Historical data tracking
  - Analytics and reporting

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **APIs:** Twitter API v2, Telegram Bot API
- **Scheduling:** node-cron
- **Logging:** Winston

## Quick Start

### Prerequisites

- Node.js 18+ installed
- MongoDB Atlas account
- Twitter Developer account with API keys
- Telegram bot token
- API keys for crypto data services

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/crypto-monitor-bot.git
   cd crypto-monitor-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```env
   MONGODB_URI=your_mongodb_connection_string
   TWITTER_API_KEY=your_twitter_api_key
   TWITTER_API_SECRET=your_twitter_api_secret
   TWITTER_API_ACCESS_TOKEN=your_twitter_access_token
   TWITTER_API_ACCESS_TOKEN_SECRET=your_twitter_token_secret
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_ENABLED=true
   COINMARKETCAP_API_KEY=your_cmc_api_key
   CRYPTO_PANIC_API_KEY=your_cryptopanic_key
   NEWSAPI_KEY=your_newsapi_key
   BNB_RPC_URL=your_bnb_rpc_url
   MIN_MARKET_CAP=10000
   MIN_VOLUME_24H=1000
   ```

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## Deployment

### Railway (Recommended)

Railway is the easiest and most reliable deployment method.

**See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed instructions.**

**Quick steps:**
1. Push code to GitHub
2. Connect GitHub repo to Railway
3. Add environment variables in Railway dashboard
4. Deploy automatically!

**Advantages:**
- ✅ Auto-deploy from GitHub
- ✅ Built-in monitoring and logs
- ✅ Free $5/month credit
- ✅ Zero-downtime deployments
- ✅ Internal scheduler works perfectly

### Other Options

- **Render:** Similar to Railway, easy deployment
- **Heroku:** Classic PaaS, $7/month
- **DigitalOcean:** VPS with full control, $6/month
- **AWS/GCP/Azure:** Cloud platforms with free tiers

**Note:** Shared hosting (cPanel) is NOT recommended for this bot.

## Project Structure

```
crypto-monitor-bot/
├── src/
│   ├── index.ts              # Application entry point
│   ├── app.ts                # Express app setup
│   ├── config/               # Configuration files
│   │   ├── database.ts       # MongoDB connection
│   │   ├── twitter.ts        # Twitter config
│   │   └── telegram.ts       # Telegram config
│   ├── models/               # Database models
│   │   ├── Coin.ts           # Coin data model
│   │   ├── News.ts           # News model
│   │   ├── Tweet.ts          # Tweet tracking
│   │   └── TelegramMessage.ts
│   ├── services/             # Business logic
│   │   ├── MonitoringService.ts
│   │   ├── TweetService.ts
│   │   ├── TelegramService.ts
│   │   ├── DexScreenerService.ts
│   │   └── ...
│   ├── controller/           # Route controllers
│   │   └── SchedulerController.ts
│   ├── scheduler/            # Cron job scheduler
│   │   └── index.ts
│   └── utils/                # Utilities
│       ├── logger.ts
│       └── validation.ts
├── dist/                     # Compiled JavaScript
├── logs/                     # Application logs
├── package.json
├── tsconfig.json
├── railway.json              # Railway configuration
└── README.md
```

## Scheduled Tasks

The bot runs these tasks automatically:

| Task | Frequency | Description |
|------|-----------|-------------|
| Monitor Coin Launches | Every 5 min | Scans Sui & BNB for new tokens |
| Monitor News | Every 15 min | Fetches crypto news |
| Post Tweets | Every 20 min | Posts pending tweets |
| Post Telegram | Every 20 min | Posts pending messages |
| Health Check | Every hour | Verifies API connections |

## API Endpoints

The bot exposes these HTTP endpoints:

- `GET /health` - Health check
- `GET /api/coins` - Recent coins detected
- `GET /api/news` - Recent news fetched
- `GET /api/tweets` - Recent tweets posted
- `GET /api/telegram_messages` - Recent Telegram messages
- `GET /api/monitor_newcoin_launch` - Manually trigger coin monitoring
- `GET /api/monitor_news` - Manually trigger news monitoring
- `GET /api/process_socialmedia` - Manually trigger social media posting
- `GET /api/twitter_health` - Check Twitter connection
- `GET /api/telegram_health` - Check Telegram connection

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ Yes | MongoDB Atlas connection string |
| `TWITTER_API_KEY` | ✅ Yes | Twitter API key |
| `TWITTER_API_SECRET` | ✅ Yes | Twitter API secret |
| `TWITTER_API_ACCESS_TOKEN` | ✅ Yes | Twitter access token |
| `TWITTER_API_ACCESS_TOKEN_SECRET` | ✅ Yes | Twitter token secret |
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Telegram bot token |
| `TELEGRAM_ENABLED` | ✅ Yes | Enable Telegram (true/false) |
| `COINMARKETCAP_API_KEY` | ✅ Yes | CoinMarketCap API key |
| `CRYPTO_PANIC_API_KEY` | ✅ Yes | CryptoPanic API key |
| `NEWSAPI_KEY` | ✅ Yes | NewsAPI key |
| `BNB_RPC_URL` | ✅ Yes | BNB RPC endpoint |
| `MIN_MARKET_CAP` | ⚠️ Optional | Minimum market cap filter |
| `MIN_VOLUME_24H` | ⚠️ Optional | Minimum 24h volume filter |
| `PORT` | ⚠️ Optional | Server port (default: 3200) |

## Monitoring

### Logs

Logs are stored in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Errors only

### Health Checks

Visit `/health` endpoint to verify:
- Server is running
- Database is connected
- APIs are accessible

## Security

- ✅ Environment variables for sensitive data
- ✅ No credentials in code
- ✅ Rate limiting on API calls
- ✅ Input validation
- ✅ Error handling and logging

**Important:** Never commit `.env` file to Git!

## Troubleshooting

### Build Errors

```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Database Connection Issues

- Check MongoDB Atlas IP whitelist (add `0.0.0.0/0`)
- Verify connection string in `.env`
- Ensure cluster is running

### Twitter API Errors

- Check API credentials
- Verify API access level (need v2 access)
- Check rate limits in Twitter Developer Dashboard

### Telegram Issues

- Verify bot token is correct
- Check bot permissions in Telegram
- Ensure `TELEGRAM_ENABLED=true`

## Contributing

This is a private project, but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Check the [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) guide
- Review logs in `logs/` directory
- Check MongoDB Atlas dashboard
- Verify Twitter/Telegram API dashboards

## Roadmap

Future enhancements:
- [ ] Discord integration
- [ ] Price alerts
- [ ] Advanced filtering
- [ ] Web dashboard
- [ ] Multiple Twitter accounts
- [ ] Sentiment analysis
- [ ] Custom webhooks

---

**Built with ❤️ for crypto enthusiasts**
