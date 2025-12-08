import axios, { AxiosInstance } from "axios";
import { CoinData, NewsItem, ApiResponse } from "@/types";
import { logger } from "../utils/logger";

export class CoinGeckoService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: "https://api.coingecko.com/api/v3",
      timeout: 10000,
      headers: {
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY || "",
      },
    });
  }

  async getNewCoins(): Promise<ApiResponse<CoinData[]>> {
    try {
      const response = await this.api.get("/coins/list/new");
      const newCoins = response.data.slice(0, 50);

      const coins: CoinData[] = [];

      for (const coin of newCoins) {
        const detailResponse = await this.api.get(`/coins/${coin.id}`);
        const detail = detailResponse.data;

        const platform = detail.platforms;
        let network: "sui" | "bnb" | null = null;
        let contractAddress = "";

        if (platform["binance-smart-chain"]) {
          network = "bnb";
          contractAddress = platform["binance-smart-chain"];
        } else if (platform["sui"]) {
          network = "sui";
          contractAddress = platform["sui"];
        }

        if (network) {
          coins.push({
            id: detail.id,
            symbol: detail.symbol,
            name: detail.name,
            network,
            contractAddress,
            marketCap: detail.market_data?.market_cap?.usd || 0,
            volume24h: detail.market_data?.total_volume?.usd || 0,
            price: detail.market_data?.current_price?.usd || 0,
            priceChange24h:
              detail.market_data?.price_change_percentage_24h || 0,
            launchTime: new Date(detail.genesis_date || Date.now()),
            coingeckoUrl: `https://www.coingecko.com/en/coins/${detail.id}`,
          });
        }
      }

      return { success: true, data: coins };
    } catch (error) {
      logger.error("CoinGecko API error:", error);
      return { success: false, error: "Failed to fetch data from CoinGecko" };
    }
  }

  async getNewsForCoin(coinId: string): Promise<ApiResponse<NewsItem[]>> {
    try {
      const response = await this.api.get(`/coins/${coinId}/news`);

      const news: NewsItem[] = response.data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        url: item.url,
        publishedAt: new Date(item.published_at),
        coinSymbol: coinId,
        network: "sui", // This would need to be determined based on the coin
        source: item.source,
      }));

      return { success: true, data: news };
    } catch (error) {
      logger.error("CoinGecko news error:", error);
      return { success: false, error: "Failed to fetch news from CoinGecko" };
    }
  }
}
