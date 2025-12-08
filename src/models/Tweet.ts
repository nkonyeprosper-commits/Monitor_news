import mongoose, { Document, Schema } from "mongoose";

export interface ITweet extends Document {
  content: string;
  coinId?: string;
  newsId?: string;
  type: "launch" | "news";
  tweetId?: string;
  isPosted: boolean;
  scheduledFor?: Date;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TweetSchema: Schema = new Schema(
  {
    content: { type: String, required: true },
    coinId: { type: String },
    newsId: { type: String },
    type: { type: String, enum: ["launch", "news"], required: true },
    tweetId: { type: String },
    isPosted: { type: Boolean, default: false },
    scheduledFor: { type: Date },
    postedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

TweetSchema.index({ type: 1, isPosted: 1 });
TweetSchema.index({ scheduledFor: 1 });

export const Tweet = mongoose.model<ITweet>("Tweet", TweetSchema);
