import { TwitterApi } from "twitter-api-v2";
import { logger } from "../utils/logger";

export class TwitterClient {
  private client: TwitterApi;
  //   private bearer: TwitterApi;

  constructor() {
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_API_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_API_ACCESS_TOKEN_SECRET!,
    });
  }

  async tweet(content: string): Promise<string | null> {
    try {
      // Try v2 API first (requires Elevated access)
      const tweet = await this.client.readWrite.v2.tweet(content);
      logger.info(`✅ Tweet posted successfully (v2): ${tweet.data.id}`);
      return tweet.data.id;
    } catch (error: any) {
      // Log detailed error
      logger.error("❌ Error posting tweet with v2 API:", error);

      // If v2 fails, try v1.1 API (works with Essential access)
      try {
        logger.info("🔄 Attempting to use v1.1 API fallback...");
        const v1Tweet = await this.client.readWrite.v1.tweet(content);
        logger.info(`✅ Tweet posted successfully (v1.1): ${v1Tweet.id_str}`);
        return v1Tweet.id_str;
      } catch (v1Error) {
        logger.error("❌ Error posting tweet with v1.1 API fallback:", v1Error);
        return null;
      }
    }
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      const user = await this.client.v2.me();
      logger.info(
        `Twitter credentials verified for user: ${user.data.username}`
      );
      return true;
    } catch (error) {
      logger.error("Twitter credentials verification failed:", error);
      return false;
    }
  }
}
