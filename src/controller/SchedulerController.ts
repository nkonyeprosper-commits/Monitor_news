import { logger } from "../utils/logger";
import { MonitoringService } from "../services/MonitoringService";
// import { TweetService } from "../services/TweetService";
// import { TelegramService } from "../services/TelegramService";

class SchedulerController {
  private monitoringService: MonitoringService;
  private _tweetService?: any; // Lazy loaded
  private _telegramService?: any; // Lazy loaded

  constructor() {
    this.monitoringService = new MonitoringService();
    // this.tweetService = new TweetService();
    // this.telegramService = new TelegramService();
  }

  private async getTweetService() {
    try {
      if (!this._tweetService) {
        const { TweetService } = await import("../services/TweetService");
        this._tweetService = new TweetService();
      }
      return this._tweetService;
    } catch (error) {
      throw error;
    }
  }

  private async getTelegramService() {
    try {
      if (!this._telegramService) {
        const { TelegramService } = await import("../services/TelegramService");
        this._telegramService = new TelegramService();
      }
      return this._telegramService;
    } catch (error) {
      throw error;
    }
  }

  // Monitor new coin launches every 5 minutes
  monitorCoin = async () => {
    try {
      await this.monitoringService.monitorNewLaunches();
    } catch (error) {
      logger.error("Error in coin launch monitoring:", error);
    }
  };

  // Monitor news every 15 minutes
  monitorNews = async () => {
    try {
      await this.monitoringService.monitorNews();
    } catch (error) {
      logger.error("Error in news monitoring:", error);
    }
  };

  // Process and post tweets every 20 minutes
  processTweet = async () => {
    try {
      const tweetService = await this.getTweetService();
      await tweetService.processPendingTweets();
    } catch (error: any) {
      logger.error("Error in tweet processing:", error);
    }
  };

  // Process and post Telegram messages every 20 minutes
  processTelegram = async () => {
    try {
      const telegramService = await this.getTelegramService();
      await telegramService.processPendingMessages();
    } catch (error: any) {
      logger.error("Error in Telegram message processing:", error);
    }
  };

  // Process both Twitter and Telegram messages
  processSocialMedia = async () => {
    try {
      // Process Twitter
      await this.processTweet();

      // Process Telegram
      await this.processTelegram();
    } catch (error: any) {
      logger.error("Error in social media processing:", error);
    }
  };

  // Health check every hour
  checkHealth = async () => {
    try {
      const tweetService = await this.getTweetService();
      const telegramService = await this.getTelegramService();

      const isTwitterConnected = await tweetService.verifyTwitterConnection();
      if (!isTwitterConnected) {
        logger.error("Twitter connection lost!");
      }

      const isTelegramConnected = await telegramService.verifyTelegramConnection();
      if (!isTelegramConnected) {
        logger.warn("Telegram connection not active or disabled");
      }

      logger.info("Health check completed");
    } catch (error) {
      logger.error("Error in health check:", error);
    }
  };
}

export default new SchedulerController();
