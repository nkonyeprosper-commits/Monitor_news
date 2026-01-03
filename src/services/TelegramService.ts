import { TelegramClient } from "../config/telegram";
import { Coin, ICoin } from "../models/Coin";
import { News, INews } from "../models/News";
import { TelegramMessage, ITelegramMessage } from "../models/TelegramMessage";
import { logger } from "../utils/logger";

export class TelegramService {
  private telegram: TelegramClient;

  constructor() {
    this.telegram = new TelegramClient();
  }

  async processPendingMessages(): Promise<void> {
    try {
      if (!this.telegram.isEnabled()) {
        logger.info("Telegram is disabled, skipping message processing");
        return;
      }

      logger.info("Processing pending Telegram messages...");

      // Process new coin launches
      await this.processNewCoinMessages();

      // Process news messages
      await this.processNewsMessages();
    } catch (error) {
      logger.error("Error processing Telegram messages:", error);
      throw error;
    }
  }

  private async processNewCoinMessages(): Promise<void> {
    const unpostedCoins = await Coin.find({ isTelegramPosted: false })
      .sort({ launchTime: -1 })
      .limit(2); // Reduced from 5 to 2 for better pacing

    for (const coin of unpostedCoins) {
      try {
        const messageContent = this.generateCoinLaunchMessage(coin);
        const messageId = await this.telegram.sendMessage(messageContent);

        if (messageId) {
          // Save message record
          const message = new TelegramMessage({
            content: messageContent,
            coinId: coin.id,
            type: "launch",
            messageId,
            chatId: this.telegram.getChannelId(),
            isPosted: true,
            postedAt: new Date(),
          });
          await message.save();

          // Mark coin as posted to Telegram
          coin.isTelegramPosted = true;
          await coin.save();

          logger.info(`Telegram message posted for coin: ${coin.symbol}`);
        }
      } catch (error) {
        logger.error(
          `Error posting Telegram message for coin ${coin.symbol}:`,
          error
        );
      }
    }
  }

  private async processNewsMessages(): Promise<void> {
    const unpostedNews = await News.find({ isTelegramPosted: false })
      .sort({ publishedAt: -1 })
      .limit(1);

    for (const news of unpostedNews) {
      try {
        const messageContent = this.generateNewsMessage(news);
        const messageId = await this.telegram.sendMessage(messageContent);

        if (messageId) {
          // Save message record
          const message = new TelegramMessage({
            content: messageContent,
            newsId: news.id,
            type: "news",
            messageId,
            chatId: this.telegram.getChannelId(),
            isPosted: true,
            postedAt: new Date(),
          });
          await message.save();

          // Mark news as posted to Telegram
          news.isTelegramPosted = true;
          await news.save();

          logger.info(`Telegram news message posted: ${news.title}`);
        }
      } catch (error) {
        logger.error(`Error posting Telegram news message:`, error);
      }
    }
  }

  private async isNewsPostedToDestination(
    newsId: string,
    chatId: string
  ): Promise<boolean> {
    const existingMessage = await TelegramMessage.findOne({
      newsId,
      chatId,
      isPosted: true,
    });
    return !!existingMessage;
  }

  async processGroupNews(): Promise<void> {
    try {
      const groupId = this.telegram.getGroupId();

      if (!groupId) {
        logger.warn("TELEGRAM_GROUP_ID not configured, skipping group news");
        return;
      }

      // Get all news (mix of general, SUI, BNB)
      const allNews = await News.find({
        network: { $in: ["general", "sui", "bnb"] },
      })
        .sort({ publishedAt: -1 })
        .limit(20); // Get more to filter from

      // Filter to find first one not posted to this group
      let newsToPost = null;
      for (const news of allNews) {
        const alreadyPosted = await this.isNewsPostedToDestination(
          news.id,
          groupId
        );
        if (!alreadyPosted) {
          newsToPost = news;
          break;
        }
      }

      if (!newsToPost) {
        logger.info("No unposted news available for group");
        return;
      }

      // Generate and send message
      const messageContent = this.generateNewsMessage(newsToPost);
      const messageId = await this.telegram.sendMessage(messageContent, groupId);

      if (messageId) {
        // Save TelegramMessage record with group chatId
        const message = new TelegramMessage({
          content: messageContent,
          newsId: newsToPost.id,
          type: "news",
          messageId,
          chatId: groupId, // Track which destination
          isPosted: true,
          postedAt: new Date(),
        });
        await message.save();

        logger.info(`Posted news to group: ${newsToPost.title}`);
        // NOTE: Do NOT set newsToPost.isTelegramPosted = true
        // This keeps channel and group posting independent
      }
    } catch (error) {
      logger.error("Error processing group news:", error);
      throw error;
    }
  }

  private generateCoinLaunchMessage(coin: ICoin): string {
    const networkEmoji = coin.network === "sui" ? "🌊" : "🚀";
    const priceChangeEmoji = coin.priceChange24h >= 0 ? "📈" : "📉";

    const variations = [
      "🚨 <b>BREAKING: New Token Launch Detected!</b>",
      "⚡ <b>FRESH LAUNCH ALERT!</b>",
      "🎯 <b>NEW TOKEN SPOTTED!</b>",
      "💫 <b>LAUNCH NOTIFICATION!</b>",
    ];
    const randomIntro =
      variations[Math.floor(Math.random() * variations.length)];

    let message = `${networkEmoji} ${randomIntro}\n\n`;
    message += `💎 <b>${coin.name}</b> ($${coin.symbol})\n`;
    message += `🏷️ Network: <b>${coin.network.toUpperCase()}</b>\n`;
    message += `💰 Price: $${coin.price.toFixed(8)}\n`;
    message += `📊 Market Cap: $${this.formatNumber(coin.marketCap)}\n`;
    message += `📈 24h Volume: $${this.formatNumber(coin.volume24h)}\n`;
    message += `${priceChangeEmoji} 24h Change: ${coin.priceChange24h.toFixed(
      2
    )}%\n`;
    message += `📅 Launch Time: ${coin.launchTime.toLocaleString()}\n`;

    if (coin.contractAddress) {
      message += `📝 Contract: <code>${coin.contractAddress}</code>\n`;
    }

    if (coin.dexscreenerUrl) {
      message += `\n📊 <a href="${coin.dexscreenerUrl}">View on DexScreener</a>\n`;
    }

    message += `\n#${coin.network.toUpperCase()}Network #CryptoLaunch #DeFi #NewToken`;

    return message;
  }

  private generateNewsMessage(news: INews): string {
    const networkEmoji = news.network === "sui" ? "🌊" : "🚀";

    let message = `${networkEmoji} <b>CRYPTO NEWS ALERT!</b>\n\n`;
    message += `📰 <b>${news.title}</b>\n\n`;

    if (news.description) {
      // Truncate description if too long
      const maxDescLength = 500;
      const description =
        news.description.length > maxDescLength
          ? news.description.substring(0, maxDescLength) + "..."
          : news.description;
      message += `${description}\n\n`;
    }

    message += `🪙 Coin: <b>${news.coinSymbol.toUpperCase()}</b>\n`;
    message += `🏷️ Network: <b>${news.network.toUpperCase()}</b>\n`;
    message += `📅 Published: ${news.publishedAt.toLocaleString()}\n`;
    message += `\n🔗 <a href="${news.url}">Read Full Article</a>\n\n`;
    message += `#${news.network.toUpperCase()}Network #CryptoNews #${news.coinSymbol.toUpperCase()}`;

    return message;
  }

  private formatNumber(num: number): string {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(2);
  }

  async verifyTelegramConnection(): Promise<boolean> {
    return await this.telegram.verifyConnection();
  }
}
