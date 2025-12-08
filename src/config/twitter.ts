import { TwitterApi } from "twitter-api-v2";
import { logger } from "../utils/logger";

export class TwitterClient {
  private client: TwitterApi;
  //   private bearer: TwitterApi;

  constructor() {
    logger.info("🐦 🔧 Initializing Twitter client...");
    logger.info(`🐦 🔧 API Key present: ${!!process.env.TWITTER_API_KEY}`);
    logger.info(`🐦 🔧 API Secret present: ${!!process.env.TWITTER_API_SECRET}`);
    logger.info(`🐦 🔧 Access Token present: ${!!process.env.TWITTER_API_ACCESS_TOKEN}`);
    logger.info(`🐦 🔧 Access Secret present: ${!!process.env.TWITTER_API_ACCESS_TOKEN_SECRET}`);

    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_API_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_API_ACCESS_TOKEN_SECRET!,
    });

    logger.info("🐦 ✅ Twitter client initialized");
  }

  async tweet(content: string): Promise<string | null> {
    logger.info("🐦 📤 tweet() method called");
    logger.info(`🐦 📤 Content length: ${content.length} characters`);

    try {
      logger.info("🐦 📤 Attempting v2 API...");
      // Try v2 API first (requires Elevated access)
      const tweet = await this.client.readWrite.v2.tweet(content);
      logger.info(`🐦 ✅ Tweet posted successfully (v2): ${tweet.data.id}`);
      logger.info(`🐦 ✅ Tweet text: ${tweet.data.text?.substring(0, 50)}...`);
      return tweet.data.id;
    } catch (error: any) {
      // Log detailed error
      logger.error("🐦 ❌ Error posting tweet with v2 API:");
      logger.error(`🐦 ❌ Error type: ${error.constructor.name}`);
      logger.error(`🐦 ❌ Error message: ${error.message}`);
      logger.error(`🐦 ❌ Error code: ${error.code}`);
      logger.error(`🐦 ❌ Error data:`, JSON.stringify(error.data || error, null, 2));
      logger.error(`🐦 ❌ Full error:`, error);

      // If v2 fails, try v1.1 API (works with Essential access)
      try {
        logger.info("🐦 🔄 Attempting to use v1.1 API fallback...");
        const v1Tweet = await this.client.readWrite.v1.tweet(content);
        logger.info(`🐦 ✅ Tweet posted successfully (v1.1): ${v1Tweet.id_str}`);
        logger.info(`🐦 ✅ Tweet text: ${v1Tweet.text?.substring(0, 50)}...`);
        return v1Tweet.id_str;
      } catch (v1Error: any) {
        logger.error("🐦 ❌ Error posting tweet with v1.1 API fallback:");
        logger.error(`🐦 ❌ v1.1 Error type: ${v1Error.constructor.name}`);
        logger.error(`🐦 ❌ v1.1 Error message: ${v1Error.message}`);
        logger.error(`🐦 ❌ v1.1 Error code: ${v1Error.code}`);
        logger.error(`🐦 ❌ v1.1 Error data:`, JSON.stringify(v1Error.data || v1Error, null, 2));
        logger.error(`🐦 ❌ v1.1 Full error:`, v1Error);
        return null;
      }
    }
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      logger.info("🐦 🔐 Verifying Twitter credentials...");
      const user = await this.client.v2.me();
      logger.info(`🐦 ✅ Twitter credentials verified for user: @${user.data.username}`);
      logger.info(`🐦 ✅ User ID: ${user.data.id}`);
      logger.info(`🐦 ✅ User name: ${user.data.name}`);
      return true;
    } catch (error: any) {
      logger.error("🐦 ❌ Twitter credentials verification failed:");
      logger.error(`🐦 ❌ Error type: ${error.constructor.name}`);
      logger.error(`🐦 ❌ Error message: ${error.message}`);
      logger.error(`🐦 ❌ Error code: ${error.code}`);
      logger.error(`🐦 ❌ Full error:`, error);
      return false;
    }
  }
}
