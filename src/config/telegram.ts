import { Telegraf } from "telegraf";
import { logger } from "../utils/logger";

export class TelegramClient {
  private bot: Telegraf | undefined;
  private channelId: string;
  private groupId: string;
  private enabled: boolean;

  constructor() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    this.channelId = process.env.TELEGRAM_CHANNEL_ID!;
    this.groupId = process.env.TELEGRAM_GROUP_ID!;
    this.enabled = process.env.TELEGRAM_ENABLED === "true";

    if (!this.enabled) {
      logger.info("Telegram bot is disabled");
      return;
    }

    if (!botToken || !this.channelId) {
      logger.warn(
        "Telegram bot token or channel ID not configured. Telegram posting will be disabled."
      );
      this.enabled = false;
      return;
    }

    this.bot = new Telegraf(botToken);
    logger.info("Telegram bot initialized successfully");
  }

  async sendMessage(content: string, chatId?: string): Promise<number | null> {
    if (!this.enabled || !this.bot) {
      logger.warn("Telegram is disabled or not initialized, skipping message send");
      return null;
    }

    const targetChatId = chatId || this.channelId;

    try {
      const message = await this.bot.telegram.sendMessage(
        targetChatId,
        content,
        {
          parse_mode: "HTML",
          link_preview_options: {
            is_disabled: false,
          },
        }
      );
      logger.info(`Telegram message posted successfully: ${message.message_id}`);
      return message.message_id;
    } catch (error) {
      logger.error("Error posting Telegram message:", error);
      return null;
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.enabled || !this.bot) {
      logger.warn("Telegram is disabled or not initialized");
      return false;
    }

    try {
      const botInfo = await this.bot.telegram.getMe();
      logger.info(
        `Telegram bot verified: @${botInfo.username} (${botInfo.first_name})`
      );
      return true;
    } catch (error) {
      logger.error("Telegram bot verification failed:", error);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getChannelId(): string {
    return this.channelId;
  }

  getGroupId(): string {
    return this.groupId;
  }
}
