import axios from "axios";
import { NewsItem } from "../types";

const CRYPTOPANIC_BASE_URL = "https://cryptopanic.com/api/developer/v2/posts/";
const NEWSAPI_BASE_URL = "https://newsapi.org/v2/everything";
// const CRYPTONEWS_BASE_URL = "https://cryptonews-api.com/api/v1/category";

export class EnhancedCryptoNewsService {
  private xml2js = require("xml2js");

  // Fallback 1: CoinTelegraph RSS (No API key needed)
  async getCoinTelegraphNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get("https://cointelegraph.com/rss", {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        },
      });

      const parser = new this.xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const items = result.rss.channel[0].item || [];

      const news: NewsItem[] = items
        .slice(0, 15)
        .map((item: any, index: number) => ({
          id: `ct_${Date.now()}_${index}`,
          title: item.title[0],
          description: item.description
            ? item.description[0].replace(/<[^>]*>/g, "")
            : "",
          url: item.link[0],
          publishedAt: new Date(item.pubDate[0]),
          coinSymbol: "",
          network: "general",
          source: "CoinTelegraph",
          tokenAddress: "",
          priceChange: 0,
          volume: 0,
        }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "CoinTelegraph RSS error",
      };
    }
  }

  // Fallback 2: CoinDesk RSS (No API key needed)
  async getCoinDeskNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get(
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
        {
          timeout: 10000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
          },
        }
      );

      const parser = new this.xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const items = result.rss.channel[0].item || [];

      const news: NewsItem[] = items
        .slice(0, 15)
        .map((item: any, index: number) => ({
          id: `cd_${Date.now()}_${index}`,
          title: item.title[0],
          description: item.description
            ? item.description[0].replace(/<[^>]*>/g, "")
            : "",
          url: item.link[0],
          publishedAt: new Date(item.pubDate[0]),
          coinSymbol: "",
          network: "general",
          source: "CoinDesk",
          tokenAddress: "",
          priceChange: 0,
          volume: 0,
        }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "CoinDesk RSS error",
      };
    }
  }

  // Fallback 3: CoinJournal RSS (No API key needed)
  async getCoinJournalNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get("https://coinjournal.net/feed/", {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
        },
      });

      const parser = new this.xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const items = result.rss.channel[0].item || [];

      const news: NewsItem[] = items
        .slice(0, 10)
        .map((item: any, index: number) => ({
          id: `cj_${Date.now()}_${index}`,
          title: item.title[0],
          description: item.description
            ? item.description[0].replace(/<[^>]*>/g, "")
            : "",
          url: item.link[0],
          publishedAt: new Date(item.pubDate[0]),
          coinSymbol: "",
          network: "general",
          source: "CoinJournal",
          tokenAddress: "",
          priceChange: 0,
          volume: 0,
        }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "CoinJournal RSS error",
      };
    }
  }

  // Your existing CryptoPanic service
  async getCryptoPanicNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get(CRYPTOPANIC_BASE_URL, {
        params: {
          auth_token: process.env.CRYPTOPANIC_API_KEY,
          filter: "rising",
          public: true,
        },
        timeout: 10000, // 10 second timeout
      });

      const news: NewsItem[] = response.data.results.map((item: any) => ({
        id: `cp_${item.id}`,
        title: item.title,
        description: item.description || "",
        url: item.url,
        publishedAt: new Date(item.published_at),
        coinSymbol: "",
        network: "general",
        source: "CryptoPanic",
        tokenAddress: "",
        priceChange: 0,
        volume: 0,
      }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "CryptoPanic API error",
      };
    }
  }

  // NewsAPI for SUI-specific news (always runs)
  async getSuiNewsFromNewsAPI(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const response = await axios.get(NEWSAPI_BASE_URL, {
        params: {
          apiKey: process.env.NEWSAPI_KEY,
          q: 'SUI blockchain OR "Sui Network" OR "SUI crypto"',
          language: "en",
          sortBy: "publishedAt",
          pageSize: 20,
        },
      });

      const news: NewsItem[] = response.data.articles.map(
        (item: any, index: number) => ({
          id: `news_sui_${index}_${Date.now()}`,
          title: item.title,
          description: item.description || "",
          url: item.url,
          publishedAt: new Date(item.publishedAt),
          coinSymbol: "SUI",
          network: "sui",
          source: item.source.name || "NewsAPI",
          tokenAddress: "",
          priceChange: 0,
          volume: 0,
        })
      );

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "NewsAPI error",
      };
    }
  }

  // Google News RSS for SUI (No API key needed)
  async getSuiNewsFromGoogleRSS(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      const xml2js = require("xml2js");

      const response = await axios.get(
        `https://news.google.com/rss/search?q=SUI+blockchain+cryptocurrency&hl=en&gl=US&ceid=US:en`,
        {
          timeout: 10000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
          },
        }
      );

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const items = result.rss.channel[0].item || [];

      const news: NewsItem[] = items
        .slice(0, 10)
        .map((item: any, index: number) => ({
          id: `google_sui_${index}_${Date.now()}`,
          title: item.title[0],
          description: item.description ? item.description[0] : "",
          url: item.link[0],
          publishedAt: new Date(item.pubDate[0]),
          coinSymbol: "SUI",
          network: "sui",
          source: "Google News",
          tokenAddress: "",
          priceChange: 0,
          volume: 0,
        }));

      return { success: true, data: news };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Google RSS error",
      };
    }
  }

  // Simple fallback method: CryptoPanic with CoinTelegraph backup
  async getGeneralCryptoNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    try {
      // First try CryptoPanic
      const cryptoPanicResult = await this.getCryptoPanicNews();

      if (
        cryptoPanicResult.success &&
        cryptoPanicResult.data &&
        cryptoPanicResult.data.length > 0
      ) {
        console.log("✅ CryptoPanic working - using primary source");
        return cryptoPanicResult;
      } else {
        console.log("⚠️ CryptoPanic failed, trying CoinTelegraph fallback...");

        // Fallback to CoinTelegraph
        const coinTelegraphResult = await this.getCoinTelegraphNews();

        if (
          coinTelegraphResult.success &&
          coinTelegraphResult.data &&
          coinTelegraphResult.data.length > 0
        ) {
          console.log("✅ CoinTelegraph fallback working");
          return coinTelegraphResult;
        } else {
          return {
            success: false,
            error: `Both CryptoPanic and CoinTelegraph failed. CryptoPanic: ${cryptoPanicResult.error}, CoinTelegraph: ${coinTelegraphResult.error}`,
          };
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch general crypto news",
      };
    }
  }

  // Get only SUI news (NewsAPI always runs)
  async getSuiNews(): Promise<{
    success: boolean;
    data?: NewsItem[];
    error?: string;
  }> {
    const [newsApiResult, googleRssResult] = await Promise.allSettled([
      this.getSuiNewsFromNewsAPI(),
      this.getSuiNewsFromGoogleRSS(),
    ]);

    let suiNews: NewsItem[] = [];

    if (newsApiResult.status === "fulfilled" && newsApiResult.value.success) {
      suiNews = [...suiNews, ...(newsApiResult.value.data || [])];
    }

    if (
      googleRssResult.status === "fulfilled" &&
      googleRssResult.value.success
    ) {
      suiNews = [...suiNews, ...(googleRssResult.value.data || [])];
    }

    const uniqueSuiNews = this.removeDuplicates(suiNews);

    return {
      success: true,
      data: uniqueSuiNews,
    };
  }

  // MAIN METHOD: Get all news with robust fallbacks
  async getAllNews(): Promise<{
    success: boolean;
    data?: {
      general: NewsItem[];
      sui: NewsItem[];
      combined: NewsItem[];
    };
    error?: string;
  }> {
    try {
      // Get general crypto news (with multiple fallbacks)
      const generalResult = await this.getGeneralCryptoNews();

      // Get SUI-specific news
      const suiResult = await this.getSuiNews();

      const generalNews = generalResult.success ? generalResult.data || [] : [];
      const suiNews = suiResult.success ? suiResult.data || [] : [];

      // Combine and sort all news by date
      const combinedNews = [...generalNews, ...suiNews].sort(
        (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
      );

      return {
        success: true,
        data: {
          general: generalNews,
          sui: suiNews,
          combined: combinedNews,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to fetch news from all sources",
      };
    }
  }

  // Helper method to remove duplicate news items
  private removeDuplicates(news: NewsItem[]): NewsItem[] {
    const seen = new Set();
    return news.filter((item) => {
      const key = item.title.toLowerCase().trim();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
