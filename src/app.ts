import express from "express";
import { logger } from "./utils/logger";
import scheduler from "./controller/SchedulerController";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API endpoints for monitoring
app.get("/api/coins", async (req, res) => {
  try {
    const { Coin } = await import("@/models/Coin");
    const coins = await Coin.find().sort({ createdAt: -1 }).limit(20);
    res.json(coins);
  } catch (error) {
    logger.error("Error fetching coins:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const { News } = await import("@/models/News");
    const news = await News.find().sort({ publishedAt: -1 }).limit(20);
    res.json(news);
  } catch (error) {
    logger.error("Error fetching news:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/tweets", async (req, res) => {
  try {
    const { Tweet } = await import("@/models/Tweet");
    const tweets = await Tweet.find().sort({ createdAt: -1 }).limit(20);
    res.json(tweets);
  } catch (error) {
    logger.error("Error fetching tweets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/telegram_messages", async (req, res) => {
  try {
    const { TelegramMessage } = await import("@/models/TelegramMessage");
    const messages = await TelegramMessage.find().sort({ createdAt: -1 }).limit(20);
    res.json(messages);
  } catch (error) {
    logger.error("Error fetching Telegram messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/monitor_newcoin_launch", async (req, res) => {
  try {
    // Monitor new coin launches every 5 minutes
    scheduler.monitorCoin();

    res.status(200).json({
      status: true,
      message: "Worked",
    });
  } catch (error) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during coin monitoring",
    });
  }
});

app.get("/api/monitor_news", async (req, res) => {
  try {
    // Monitor news every 15 minutes

    scheduler.monitorNews();

    res.status(200).json({
      status: true,
      message: "Worked",
    });
  } catch (error) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during coin monitoring",
    });
  }
});

app.get("/api/process_posttweets", async (req, res) => {
  try {
    // Process and post tweets every 2 minutes
    const result = await scheduler.processTweet();

    console.log(result, "I think it worked");

    res.status(200).json({
      status: true,
      message: "Tweet processing completed successfully",
    });
  } catch (error: any) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during tweet processing",
      error: error.message,
    });
  }
});

app.get("/api/process_telegram", async (req, res) => {
  try {
    // Process and post Telegram messages
    const result = await scheduler.processTelegram();

    res.status(200).json({
      status: true,
      message: "Telegram message processing completed successfully",
    });
  } catch (error: any) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during Telegram message processing",
      error: error.message,
    });
  }
});

app.get("/api/process_socialmedia", async (req, res) => {
  try {
    // Process both Twitter and Telegram messages
    const result = await scheduler.processSocialMedia();

    res.status(200).json({
      status: true,
      message: "Social media processing (Twitter & Telegram) completed successfully",
    });
  } catch (error: any) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during social media processing",
      error: error.message,
    });
  }
});

app.get("/api/twitter_health", async (req, res) => {
  try {
    // Health check every hour

    scheduler.checkHealth();

    res.status(200).json({
      status: true,
      message: "Worked",
    });
  } catch (error) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error occurred during coin monitoring",
    });
  }
});

app.get("/api/telegram_health", async (req, res) => {
  try {
    const { TelegramService } = await import("@/services/TelegramService");
    const telegramService = new TelegramService();
    const isConnected = await telegramService.verifyTelegramConnection();

    res.status(200).json({
      status: isConnected,
      message: isConnected
        ? "Telegram bot is connected and ready"
        : "Telegram bot is not connected or disabled",
    });
  } catch (error: any) {
    logger.error("Endpoint error:", error);
    res.status(500).json({
      status: false,
      message: "Error checking Telegram health",
      error: error.message,
    });
  }
});

// Error handling middleware
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
);

export { app };
