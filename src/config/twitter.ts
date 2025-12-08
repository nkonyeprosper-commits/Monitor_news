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
      //   this.client.readWrite.v2.tweet();
      //   const tweet = await this.client.v2.tweet(content);
      const tweet = await this.client.readWrite.v2.tweet(content);
      logger.info(`Tweet posted successfully: ${tweet.data.id}`);
      return tweet.data.id;
    } catch (error) {
      logger.error("Error posting tweet:", error);
      return null;
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
