import axios, { AxiosInstance } from "axios";
import { CoinData, NewsItem, ApiResponse } from "../types";
import { logger } from "../utils/logger";

export class DexToolsService {
  private api: AxiosInstance;
  private chainMapping: Record<string, string> = {
    sui: "sui",
    bnb: "bnb",
  };

  constructor() {
    this.api = axios.create({
      baseURL: "https://open-api.dextools.io/free/v2",
      timeout: 15000,
      headers: {
        "X-API-KEY": process.env.DEXTOOLS_API_KEY || "",
        "Content-Type": "application/json",
      },
    });
  }

  async getNewTokens(network: "sui" | "bnb"): Promise<ApiResponse<CoinData[]>> {
    try {
      const chain = this.chainMapping[network];
      if (!chain) {
        return { success: false, error: `Unsupported network: ${network}` };
      }

      // Get latest blocks and extract new tokens
      const [latestBlocksResponse, chainInfoResponse] = await Promise.all([
        this.api.get(`/blockchain/${chain}/swaps/blocks/latest`),
        this.api.get(`/blockchain/${chain}`),
      ]);

      const coins: CoinData[] = [];

      // Process latest blocks to find new tokens
      if (latestBlocksResponse.data?.data) {
        const blocks = latestBlocksResponse.data.data;

        for (const block of blocks.slice(0, 10)) {
          // Limit to recent blocks
          if (block.swaps) {
            for (const swap of block.swaps) {
              if (swap.token && this.isNewToken(swap.token)) {
                const coinData = await this.processTokenData(
                  swap.token,
                  network,
                  chain
                );
                if (coinData) {
                  coins.push(coinData);
                }
              }
            }
          }
        }
      }

      // Remove duplicates based on contract address
      const uniqueCoins = this.removeDuplicateCoins(coins);

      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error(`DexTools API error for ${network}:`, error);
      return {
        success: false,
        error: `Failed to fetch data from DexTools for ${network}`,
      };
    }
  }

  private async processTokenData(
    token: any,
    network: "sui" | "bnb",
    chain: string
  ): Promise<CoinData | null> {
    try {
      // Get detailed token information
      const tokenDetailResponse = await this.api.get(
        `/token/${chain}/${token.address}`
      );

      const tokenDetail = tokenDetailResponse.data?.data;
      if (!tokenDetail) return null;

      // Get pool information for better market data
      const poolResponse = await this.api.get(
        `/token/${chain}/${token.address}/pools`
      );

      const pools = poolResponse.data?.data || [];
      const mainPool = pools.find((pool: any) => pool.mainPool) || pools[0];

      return {
        id: token.address,
        symbol: tokenDetail.symbol || token.symbol,
        name: tokenDetail.name || token.name,
        network,
        contractAddress: token.address,
        marketCap: this.calculateMarketCap(tokenDetail, mainPool),
        volume24h: mainPool?.volume24h || 0,
        price: mainPool?.price || tokenDetail.price || 0,
        priceChange24h: mainPool?.priceChange24h || 0,
        launchTime: new Date(tokenDetail.creationTime || Date.now()),
        dextoolsUrl: `https://www.dextools.io/app/en/${chain}/pair-explorer/${token.address}`,
        // Additional DexTools specific data
        holders: tokenDetail.holders || 0,
        transactions24h: mainPool?.transactions24h || 0,
        liquidity: mainPool?.liquidity || 0,
      };
    } catch (error) {
      logger.error(`Error processing token ${token.address}:`, error);
      return null;
    }
  }

  private calculateMarketCap(tokenDetail: any, pool: any): number {
    if (tokenDetail.marketCap) return tokenDetail.marketCap;
    if (tokenDetail.totalSupply && pool?.price) {
      return tokenDetail.totalSupply * pool.price;
    }
    return 0;
  }

  private isNewToken(token: any): boolean {
    // Check if token is considered "new" based on various criteria
    const now = Date.now();
    const tokenAge = token.creationTime
      ? now - new Date(token.creationTime).getTime()
      : 0;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    return tokenAge <= maxAge;
  }

  private removeDuplicateCoins(coins: CoinData[]): CoinData[] {
    const seen = new Set();
    return coins.filter((coin) => {
      const key = `${coin.contractAddress}-${coin.network}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getNewsForNetwork(
    network: "sui" | "bnb"
  ): Promise<ApiResponse<NewsItem[]>> {
    try {
      const chain = this.chainMapping[network];
      if (!chain) {
        return { success: false, error: `Unsupported network: ${network}` };
      }

      // Get trending tokens which often have news/activity
      const trendingResponse = await this.api.get(`/ranking/${chain}/trending`);

      const news: NewsItem[] = [];

      if (trendingResponse.data?.data) {
        const trendingTokens = trendingResponse.data.data.slice(0, 10);

        for (const token of trendingTokens) {
          // Generate news-like items from trending token data
          const newsItem: NewsItem = {
            id: `${token.address}-${Date.now()}`,
            title: `${token.name} (${
              token.symbol
            }) Trending on ${network.toUpperCase()}`,
            description: this.generateTokenDescription(token),
            url: `https://www.dextools.io/app/en/${chain}/pair-explorer/${token.address}`,
            publishedAt: new Date(),
            coinSymbol: token.symbol,
            network,
            source: "DexTools",
            // Additional metadata
            tokenAddress: token.address,
            priceChange: token.priceChange24h,
            volume: token.volume24h,
          };

          news.push(newsItem);
        }
      }

      return { success: true, data: news };
    } catch (error) {
      logger.error(`DexTools news error for ${network}:`, error);
      return {
        success: false,
        error: `Failed to fetch news from DexTools for ${network}`,
      };
    }
  }

  private generateTokenDescription(token: any): string {
    const priceChange = token.priceChange24h || 0;
    const volume = token.volume24h || 0;
    const direction = priceChange > 0 ? "up" : "down";
    const changeText = Math.abs(priceChange).toFixed(2);

    return `${
      token.name
    } is trending with a ${changeText}% price change ${direction} in the last 24 hours. 24h volume: $${volume.toLocaleString()}. Current price: $${
      token.price || 0
    }`;
  }

  async getTokenInfo(
    contractAddress: string,
    network: "sui" | "bnb"
  ): Promise<ApiResponse<CoinData>> {
    try {
      const chain = this.chainMapping[network];
      if (!chain) {
        return { success: false, error: `Unsupported network: ${network}` };
      }

      const [tokenResponse, poolsResponse] = await Promise.all([
        this.api.get(`/token/${chain}/${contractAddress}`),
        this.api.get(`/token/${chain}/${contractAddress}/pools`),
      ]);

      const tokenData = tokenResponse.data?.data;
      const pools = poolsResponse.data?.data || [];
      const mainPool = pools.find((pool: any) => pool.mainPool) || pools[0];

      if (!tokenData) {
        return { success: false, error: "Token not found" };
      }

      const coin: CoinData = {
        id: contractAddress,
        symbol: tokenData.symbol,
        name: tokenData.name,
        network,
        contractAddress,
        marketCap: this.calculateMarketCap(tokenData, mainPool),
        volume24h: mainPool?.volume24h || 0,
        price: mainPool?.price || tokenData.price || 0,
        priceChange24h: mainPool?.priceChange24h || 0,
        launchTime: new Date(tokenData.creationTime || Date.now()),
        dextoolsUrl: `https://www.dextools.io/app/en/${chain}/pair-explorer/${contractAddress}`,
        holders: tokenData.holders || 0,
        transactions24h: mainPool?.transactions24h || 0,
        liquidity: mainPool?.liquidity || 0,
      };

      return { success: true, data: coin };
    } catch (error) {
      logger.error(`DexTools token info error for ${contractAddress}:`, error);
      return { success: false, error: "Failed to fetch token info" };
    }
  }

  async getChainInfo(network: "sui" | "bnb"): Promise<ApiResponse<any>> {
    try {
      const chain = this.chainMapping[network];
      if (!chain) {
        return { success: false, error: `Unsupported network: ${network}` };
      }

      const response = await this.api.get(`/blockchain/${chain}`);
      return { success: true, data: response.data?.data };
    } catch (error) {
      logger.error(`DexTools chain info error for ${network}:`, error);
      return {
        success: false,
        error: `Failed to fetch chain info for ${network}`,
      };
    }
  }
}
