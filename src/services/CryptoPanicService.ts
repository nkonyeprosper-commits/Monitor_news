import axios from "axios";
import { NewsItem } from "../types";

const API_KEY = process.env.CRYPTOPANIC_API_KEY || "";
const BASE_URL = "https://cryptopanic.com/api/developer/v2/posts/";

export class CryptoPanicService {
  async getLatestNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          auth_token: process.env.CRYPTO_PANIC_API_KEY,
          filter: "rising",
          public: true,
        },
      });

      //   console.log(response.data, "Big response here mine");

      const news: NewsItem[] = response.data.results.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        description: item.description || "",
        url: item.url,
        publishedAt: new Date(item.published_at),
        coinSymbol: "",
        network: "bnb", // or leave blank if not known
        source: "CryptoPanic",
        tokenAddress: "",
        priceChange: 0,
        volume: 0,
      }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }
}
