import axios, { AxiosInstance } from "axios";
import { CoinData, ApiResponse } from "../types";
import { logger } from "../utils/logger";

export class CoinMarketCapService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: "https://pro-api.coinmarketcap.com/v1",
      timeout: 10000,
      headers: {
        "X-CMC_PRO_API_KEY": process.env.COINMARKETCAP_API_KEY || "",
      },
    });
  }

  async getNewListings(): Promise<ApiResponse<CoinData[]>> {
    try {
      const response = await this.api.get("/cryptocurrency/listings/latest", {
        params: {
          limit: 100,
          sort: "date_added",
          sort_dir: "desc",
        },
      });

      const coins: CoinData[] = response.data.data
        .filter((coin: any) => {
          const platform = coin.platform?.name?.toLowerCase();
          return platform === "binance smart chain" || platform === "sui";
        })
        .map((coin: any) => ({
          id: coin.id.toString(),
          symbol: coin.symbol,
          name: coin.name,
          network: coin.platform?.name?.toLowerCase() === "sui" ? "sui" : "bnb",
          contractAddress: coin.platform?.token_address || "",
          marketCap: coin.quote?.USD?.market_cap || 0,
          volume24h: coin.quote?.USD?.volume_24h || 0,
          price: coin.quote?.USD?.price || 0,
          priceChange24h: coin.quote?.USD?.percent_change_24h || 0,
          launchTime: new Date(coin.date_added),
          coinmarketcapUrl: `https://coinmarketcap.com/currencies/${coin.slug}/`,
        }));

      return { success: true, data: coins };
    } catch (error) {
      logger.error("CoinMarketCap API error:", error);
      return {
        success: false,
        error: "Failed to fetch data from CoinMarketCap",
      };
    }
  }

  async getCoinInfo(symbol: string): Promise<ApiResponse<CoinData>> {
    try {
      const response = await this.api.get("/cryptocurrency/quotes/latest", {
        params: { symbol: symbol.toUpperCase() },
      });

      const coinData = response.data.data[symbol.toUpperCase()];
      if (!coinData) {
        return { success: false, error: "Coin not found" };
      }

      const coin: CoinData = {
        id: coinData.id.toString(),
        symbol: coinData.symbol,
        name: coinData.name,
        network:
          coinData.platform?.name?.toLowerCase() === "sui" ? "sui" : "bnb",
        contractAddress: coinData.platform?.token_address || "",
        marketCap: coinData.quote?.USD?.market_cap || 0,
        volume24h: coinData.quote?.USD?.volume_24h || 0,
        price: coinData.quote?.USD?.price || 0,
        priceChange24h: coinData.quote?.USD?.percent_change_24h || 0,
        launchTime: new Date(coinData.date_added),
        coinmarketcapUrl: `https://coinmarketcap.com/currencies/${coinData.slug}/`,
      };

      return { success: true, data: coin };
    } catch (error) {
      logger.error("CoinMarketCap coin info error:", error);
      return { success: false, error: "Failed to fetch coin info" };
    }
  }
}
