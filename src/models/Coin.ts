import mongoose, { Document, Schema } from "mongoose";

export interface ICoin extends Document {
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
  dexscreenerUrl?: string;
  coinmarketcapUrl?: string;
  coingeckoUrl?: string;
  isPosted: boolean;
  isTelegramPosted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CoinSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    network: { type: String, enum: ["sui", "bnb"], required: true },
    contractAddress: { type: String, required: true },
    marketCap: { type: Number, required: true },
    volume24h: { type: Number, required: true },
    price: { type: Number, required: true },
    priceChange24h: { type: Number, required: true },
    launchTime: { type: Date, required: true },
    dexscreenerUrl: { type: String },
    coinmarketcapUrl: { type: String },
    coingeckoUrl: { type: String },
    isPosted: { type: Boolean, default: false },
    isTelegramPosted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

CoinSchema.index({ network: 1, launchTime: -1 });
CoinSchema.index({ isPosted: 1 });
CoinSchema.index({ isTelegramPosted: 1 });
CoinSchema.index({ contractAddress: 1 });

export const Coin = mongoose.model<ICoin>("Coin", CoinSchema);
