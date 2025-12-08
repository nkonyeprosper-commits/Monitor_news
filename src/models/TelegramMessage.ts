import mongoose, { Document, Schema } from "mongoose";

export interface ITelegramMessage extends Document {
  content: string;
  coinId?: string;
  newsId?: string;
  type: "launch" | "news";
  messageId?: number;
  chatId?: string;
  isPosted: boolean;
  scheduledFor?: Date;
  postedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramMessageSchema: Schema = new Schema(
  {
    content: { type: String, required: true },
    coinId: { type: String },
    newsId: { type: String },
    type: { type: String, enum: ["launch", "news"], required: true },
    messageId: { type: Number },
    chatId: { type: String },
    isPosted: { type: Boolean, default: false },
    scheduledFor: { type: Date },
    postedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

TelegramMessageSchema.index({ type: 1, isPosted: 1 });
TelegramMessageSchema.index({ scheduledFor: 1 });

export const TelegramMessage = mongoose.model<ITelegramMessage>(
  "TelegramMessage",
  TelegramMessageSchema
);
