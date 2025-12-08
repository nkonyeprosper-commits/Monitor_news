import { TwitterClient } from "../config/twitter";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { Tweet, ITweet } from "../models/Tweet";
import { TweetData } from "../types";
import { logger } from "../utils/logger";

export class TweetService {
  private twitter: TwitterClient;
  private rateLimitTracker = {
    tweetsPosted: 0,
    windowStart: Date.now(),
    windowDuration: 15 * 60 * 1000, // 15 minutes
    maxTweetsPerWindow: 50, // Twitter allows 50 tweets per 15 minutes
  };

  constructor() {
    this.twitter = new TwitterClient();
  }

  async processPendingTweets(): Promise<void> {
    try {
      logger.info("🐦 ========================================");
      logger.info("🐦 STARTING TWITTER POSTING CYCLE");
      logger.info("🐦 ========================================");

      // Process new coin launches
      await this.processNewCoinTweets();

      // Process news tweets
      await this.processNewsTweets();

      logger.info("🐦 ========================================");
      logger.info("🐦 TWITTER POSTING CYCLE COMPLETED");
      logger.info("🐦 ========================================");
    } catch (error) {
      logger.error("🐦 ❌ CRITICAL ERROR in processPendingTweets:", error);
      throw error;
    }
  }

  private async processNewCoinTweets(): Promise<void> {
    logger.info("🐦 📊 Checking for unposted coins...");

    const unpostedCoins = await Coin.find({ isPosted: false })
      .sort({ launchTime: -1 })
      .limit(2); // Reduced from 5 to 2 for better pacing

    logger.info(`🐦 📊 Found ${unpostedCoins.length} unposted coins`);

    if (unpostedCoins.length === 0) {
      logger.info("🐦 📊 No unposted coins to tweet about");
      return;
    }

    for (const coin of unpostedCoins) {
      try {
        logger.info(`🐦 💎 Processing coin: ${coin.symbol} (${coin.name})`);
        logger.info(`🐦 💎 Contract: ${coin.contractAddress}`);
        logger.info(`🐦 💎 Network: ${coin.network}`);

        const tweetContent = this.generateCoinLaunchTweet(coin);
        logger.info(`🐦 💎 Tweet content generated (${tweetContent.length} chars)`);
        logger.info(`🐦 💎 Tweet preview: ${tweetContent.substring(0, 100)}...`);

        logger.info(`🐦 💎 Attempting to post tweet...`);
        const tweetId = await this.twitter.tweet(tweetContent);

        if (tweetId) {
          logger.info(`🐦 ✅ Tweet posted successfully! Tweet ID: ${tweetId}`);

          // Save tweet record
          const tweet = new Tweet({
            content: tweetContent,
            coinId: coin.id,
            type: "launch",
            tweetId,
            isPosted: true,
            postedAt: new Date(),
          });
          await tweet.save();
          logger.info(`🐦 ✅ Tweet record saved to database`);

          // Mark coin as posted
          coin.isPosted = true;
          await coin.save();
          logger.info(`🐦 ✅ Coin marked as posted: ${coin.symbol}`);
        } else {
          logger.warn(`🐦 ⚠️ Tweet posting returned null (failed) for coin: ${coin.symbol}`);
        }
      } catch (error) {
        logger.error(`🐦 ❌ Error posting tweet for coin ${coin.symbol}:`, error);
      }
    }
  }

  private async processNewsTweets(): Promise<void> {
    logger.info("🐦 📰 Checking for unposted news...");

    const unpostedNews = await News.find({ isPosted: false })
      .sort({ publishedAt: -1 })
      .limit(1);

    logger.info(`🐦 📰 Found ${unpostedNews.length} unposted news items`);

    if (unpostedNews.length === 0) {
      logger.info("🐦 📰 No unposted news to tweet about");
      return;
    }

    for (const news of unpostedNews) {
      try {
        logger.info(`🐦 📰 Processing news: ${news.title}`);
        logger.info(`🐦 📰 Source: ${news.source}`);
        logger.info(`🐦 📰 Network: ${news.network}`);

        const tweetContent = this.generateNewsTweet(news);
        logger.info(`🐦 📰 Tweet content generated (${tweetContent.length} chars)`);
        logger.info(`🐦 📰 Tweet preview: ${tweetContent.substring(0, 100)}...`);

        logger.info(`🐦 📰 Attempting to post tweet...`);
        const tweetId = await this.twitter.tweet(tweetContent);

        if (tweetId) {
          logger.info(`🐦 ✅ News tweet posted successfully! Tweet ID: ${tweetId}`);

          // Save tweet record
          const tweet = new Tweet({
            content: tweetContent,
            newsId: news.id,
            type: "news",
            tweetId,
            isPosted: true,
            postedAt: new Date(),
          });
          await tweet.save();
          logger.info(`🐦 ✅ Tweet record saved to database`);

          // Mark news as posted
          news.isPosted = true;
          await news.save();
          logger.info(`🐦 ✅ News marked as posted: ${news.title.substring(0, 50)}...`);
        } else {
          logger.warn(`🐦 ⚠️ News tweet posting returned null (failed): ${news.title}`);
        }
      } catch (error) {
        logger.error(`🐦 ❌ Error posting news tweet:`, error);
      }
    }
  }

  private generateCoinLaunchTweet(coin: ICoin): string {
    const networkEmoji = coin.network === "sui" ? "🌊" : "🚀";
    const priceChangeEmoji = coin.priceChange24h >= 0 ? "📈" : "📉";

    // Add timestamp or random element for uniqueness
    // const timestamp = new Date().toLocaleTimeString();

    const variations = [
      "🚨 BREAKING: New token launch detected!",
      "⚡ FRESH LAUNCH ALERT!",
      "🎯 NEW TOKEN SPOTTED!",
      "💫 LAUNCH NOTIFICATION!",
    ];
    const randomIntro =
      variations[Math.floor(Math.random() * variations.length)];

    let tweet = `${networkEmoji} ${randomIntro} \n\n`;
    tweet += `💎 ${coin.name} ($${coin.symbol})\n`;
    tweet += `🏷️ ${coin.network.toUpperCase()} Network\n`;
    tweet += `💰 Price: $${coin.price.toFixed(6)}\n`;
    tweet += `📊 Market Cap: $${this.formatNumber(coin.marketCap)}\n`;
    tweet += `📈 24h Volume: $${this.formatNumber(coin.volume24h)}\n`;
    tweet += `${priceChangeEmoji} 24h Change: ${coin.priceChange24h.toFixed(
      2
    )}%\n\n`;

    if (coin.dexscreenerUrl) {
      tweet += `📊 DexScreener: ${coin.dexscreenerUrl}\n`;
    }

    tweet += `\n#${coin.network.toUpperCase()}Network #CryptoLaunch #DeFi #NewToken`;

    return tweet;
  }

  private generateNewsTweet(news: INews): string {
    const networkEmoji = news.network === "sui" ? "🌊" : "🚀";
    const timestamp = new Date().toLocaleTimeString();

    let tweet = `${networkEmoji} CRYPTO NEWS ALERT! [${timestamp}]\n\n`;
    tweet += `📰 ${news.title}\n\n`;
    tweet += `🪙 ${news.coinSymbol.toUpperCase()}\n`;
    tweet += `🏷️ ${news.network.toUpperCase()} Network\n`;
    tweet += `📅 ${news.publishedAt.toLocaleDateString()}\n\n`;
    tweet += `🔗 ${news.url}\n\n`;
    tweet += `#${news.network.toUpperCase()}Network #CryptoNews #${news.coinSymbol.toUpperCase()}`;

    return tweet;
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(2);
  }

  async verifyTwitterConnection(): Promise<boolean> {
    return await this.twitter.verifyCredentials();
  }
}
