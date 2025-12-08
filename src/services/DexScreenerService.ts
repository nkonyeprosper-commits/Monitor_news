import axios, { AxiosInstance } from "axios";
import { CoinData, ApiResponse } from "../types";
import { logger } from "../utils/logger";

// interface TokenProfile {
//   url: string;
//   chainId: string;
//   tokenAddress: string;
//   icon: string;
//   header: string;
//   description: string;
//   links: Array<{
//     type: string;
//     label: string;
//     url: string;
//   }>;
// }

// interface TokenOrder {
//   type: string;
//   status: string;
//   paymentTimestamp: number;
// }

export class DexScreenerService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: "https://api.dexscreener.com",
      timeout: 10000,
      headers: {
        "X-API-Key": process.env.DEXSCREENER_API_KEY || "",
      },
    });
  }

  async getNewTokens(network: "sui" | "bnb"): Promise<ApiResponse<CoinData[]>> {
    try {
      const chainId = network === "sui" ? "sui" : "bsc";
      const response = await this.api.get(`/token-profiles/latest/v1`);

      const coins: CoinData[] =
        response.data.pairs?.map((pair: any) => ({
          id: pair.pairAddress,
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          network,
          contractAddress: pair.baseToken.address,
          marketCap: parseFloat(pair.fdv || "0"),
          volume24h: parseFloat(pair.volume?.h24 || "0"),
          price: parseFloat(pair.priceUsd || "0"),
          priceChange24h: parseFloat(pair.priceChange?.h24 || "0"),
          launchTime: new Date(pair.pairCreatedAt),
          dexscreenerUrl: pair.url,
        })) || [];

      return { success: true, data: coins };
    } catch (error) {
      logger.error(`DexScreener API error for ${network}:`, error);
      return { success: false, error: "Failed to fetch data from DexScreener" };
    }
  }

  async getTokenInfo(
    contractAddress: string,
    network: "sui" | "bnb"
  ): Promise<ApiResponse<CoinData>> {
    try {
      const chainId = network === "sui" ? "sui" : "bsc";
      const response = await this.api.get(
        `/orders/v1/${chainId}/${contractAddress}`
      );

      if (!response.data.pairs || response.data.pairs.length === 0) {
        return { success: false, error: "Token not found" };
      }

      const pair = response.data.pairs[0];
      const coin: CoinData = {
        id: pair.pairAddress,
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        network,
        contractAddress: pair.baseToken.address,
        marketCap: parseFloat(pair.fdv || "0"),
        volume24h: parseFloat(pair.volume?.h24 || "0"),
        price: parseFloat(pair.priceUsd || "0"),
        priceChange24h: parseFloat(pair.priceChange?.h24 || "0"),
        launchTime: new Date(pair.pairCreatedAt),
        dexscreenerUrl: pair.url,
      };

      return { success: true, data: coin };
    } catch (error) {
      logger.error(`DexScreener token info error:`, error);
      return { success: false, error: "Failed to fetch token info" };
    }
  }
}
