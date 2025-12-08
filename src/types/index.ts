export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  network: "sui" | "bnb";
  contractAddress: string;
  marketCap: number;
  volume24h: number;
  price: number;
  priceChange24h: number;
  launchTime: Date;

  // Platform URLs
  dextoolsUrl?: string;
  dexscreenerUrl?: string;
  coinmarketcapUrl?: string;
  coingeckoUrl?: string;

  // DexTools specific fields
  holders?: number;
  transactions24h?: number;
  liquidity?: number;

  // Additional metadata
  totalSupply?: number;
  circulatingSupply?: number;
  verified?: boolean;
  risk?: {
    score: number;
    factors: string[];
  };
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  coinSymbol: string;
  network: "sui" | "bnb";
  source: string;

  // Additional metadata for DexTools news
  tokenAddress?: string;
  priceChange?: number;
  volume?: number;
  sentiment?: "positive" | "negative" | "neutral";
  tags?: string[];
}

export interface TweetData {
  content: string;
  coinId?: string;
  newsId?: string;
  type: "launch" | "news";
  scheduledFor?: Date;
}

export interface TelegramMessageData {
  content: string;
  coinId?: string;
  newsId?: string;
  type: "launch" | "news";
  scheduledFor?: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
