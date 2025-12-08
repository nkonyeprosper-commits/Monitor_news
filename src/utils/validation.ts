import { CoinData, NewsItem } from "@/types";

export const validateCoinData = (coin: CoinData): boolean => {
  return !!(
    coin.symbol &&
    coin.name &&
    coin.contractAddress &&
    coin.network &&
    ["sui", "bnb"].includes(coin.network) &&
    coin.price >= 0 &&
    coin.marketCap >= 0 &&
    coin.volume24h >= 0
  );
};

export const validateNewsItem = (news: NewsItem): boolean => {
  return !!(
    news.title &&
    news.url &&
    news.publishedAt &&
    news.coinSymbol &&
    news.network &&
    ["sui", "bnb"].includes(news.network)
  );
};

export const sanitizeTweetContent = (content: string): string => {
  // Remove or replace potentially problematic characters
  return content
    .replace(/[^\w\s\n!@#$%^&*(),.?":{}|<>]/g, "")
    .substring(0, 280) // Twitter character limit
    .trim();
};
