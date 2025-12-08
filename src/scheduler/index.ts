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

    // Monitor new coin launches every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
      try {
        await this.monitoringService.monitorNewLaunches();
      } catch (error) {
        logger.error("Error in coin launch monitoring:", error);
      }
    });

    // Monitor news every 15 minutes
    cron.schedule("*/15 * * * *", async () => {
      try {
        await this.monitoringService.monitorNews();
      } catch (error) {
        logger.error("Error in news monitoring:", error);
      }
    });

    // Process and post tweets every 20 minutes
    cron.schedule("*/20 * * * *", async () => {
      try {
        await this.tweetService.processPendingTweets();
      } catch (error) {
        logger.error("Error in tweet processing:", error);
      }
    });

    // Process and post Telegram messages every 20 minutes
    cron.schedule("*/20 * * * *", async () => {
      try {
        await this.telegramService.processPendingMessages();
      } catch (error) {
        logger.error("Error in Telegram message processing:", error);
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
