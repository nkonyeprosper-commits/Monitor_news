import { logger } from "../utils/logger";
import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/crypto_monitor";

    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info("Connected to MongoDB successfully");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

mongoose.connection.on("error", (error) => {
  logger.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});
