import cron from "node-cron";
import { MonitoringService } from "../services/MonitoringService";
import { TweetService } from "../services/TweetService";
import { TelegramService } from "../services/TelegramService";
import { logger } from "../utils/logger";

export class Scheduler {
  private monitoringService: MonitoringService;
  private tweetService: TweetService;
  private telegramService: TelegramService;

  constructor() {
    this.monitoringService = new MonitoringService();
    this.tweetService = new TweetService();
    this.telegramService = new TelegramService();
  }

  start(): void {
    logger.info("Starting scheduler...");

    // Monitor new coin launches every 15 minutes (collects data only)
    cron.schedule("*/15 * * * *", async () => {
      try {
        await this.monitoringService.monitorNewLaunches();
      } catch (error) {
        logger.error("Error in coin launch monitoring:", error);
      }
    });

    // Monitor news every 30 minutes (collects data only)
    cron.schedule("*/30 * * * *", async () => {
      try {
        await this.monitoringService.monitorNews();
      } catch (error) {
        logger.error("Error in news monitoring:", error);
      }
    });

    // Process and post tweets every 1 hour (at minute 0)
    // Max 3 posts per cycle (2 coins + 1 news)
    cron.schedule("0 * * * *", async () => {
      try {
        await this.tweetService.processPendingTweets();
      } catch (error) {
        logger.error("Error in tweet processing:", error);
      }
    });

    // Process and post Telegram messages every 1 hour (at minute 30, offset from Twitter)
    // Max 3 posts per cycle (2 coins + 1 news)
    cron.schedule("30 * * * *", async () => {
      try {
        await this.telegramService.processPendingMessages();
      } catch (error) {
        logger.error("Error in Telegram message processing:", error);
      }
    });

    // Post news to Telegram group daily at 9:00 AM
    // 1 news item per day (mix of all crypto news)
    cron.schedule("0 9 * * *", async () => {
      try {
        await this.telegramService.processGroupNews();
      } catch (error) {
        logger.error("Error in Telegram group news posting:", error);
      }
    });

    // Health check every hour
    cron.schedule("0 * * * *", async () => {
      try {
        const isTwitterConnected =
          await this.tweetService.verifyTwitterConnection();
        if (!isTwitterConnected) {
          logger.error("Twitter connection lost!");
        }

        const isTelegramConnected =
          await this.telegramService.verifyTelegramConnection();
        if (!isTelegramConnected) {
          logger.warn("Telegram connection not active or disabled");
        }

        logger.info("Health check completed");
      } catch (error) {
        logger.error("Error in health check:", error);
      }
    });

    logger.info("Scheduler started successfully");
  }
}
