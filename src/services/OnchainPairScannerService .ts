import {
  Block,
  ethers,
  getDefaultProvider,
  JsonRpcProvider,
  Provider,
  TransactionReceipt,
} from "ethers";
import { CoinData, ApiResponse } from "../types";
import { logger } from "../utils/logger";
import { SuiClient } from "@mysten/sui.js/client";
import { getFullnodeUrl } from "@mysten/sui.js/client";

// PancakeSwap addresses
const PANCAKESWAP_FACTORY_ADDRESS =
  "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
const PANCAKESWAP_ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

// Event signatures
const PAIR_CREATED_TOPIC = ethers.id(
  "PairCreated(address,address,address,uint256)"
);
const ADD_LIQUIDITY_ETH_TOPIC = ethers.id(
  "AddLiquidityETH(address,uint256,uint256,uint256,address,uint256)"
);
const ADD_LIQUIDITY_TOPIC = ethers.id(
  "AddLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"
);
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Sui factory address
const SUI_FACTORY = process.env.SUI_FACTORY_ADDRESS || "";

export class OnchainPairScannerService {
  private bnbProvider: Provider;
  private suiClient: SuiClient;
  private readonly MAX_BLOCKS_PER_BATCH = 50; // Process in smaller chunks
  private blockCache: Map<number, Block> = new Map(); // Cache blocks to avoid duplicate fetches
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests

  constructor() {
    console.log(process.env.BNB_RPC_URL, "checking something");

    // Add fallback RPC URLs
    const primaryRpc = process.env.BNB_RPC_URL;
    const fallbackRpc = "https://bsc-dataseed1.binance.org/";

    try {
      this.bnbProvider = new JsonRpcProvider(primaryRpc, {
        name: "binance",
        chainId: 56,
      });
    } catch (e) {
      logger.warn("Primary RPC failed, using fallback");
      this.bnbProvider = new JsonRpcProvider(fallbackRpc, {
        name: "binance",
        chainId: 56,
      });
    }

    console.log(this.bnbProvider, "checking something out");
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("mainnet");
    this.suiClient = new SuiClient({ url: rpcUrl });
  }

  // Your original function - enhanced to detect more tokens
  async getRecentBNBPairCreations(): Promise<ApiResponse<CoinData[]>> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      // Reduced to 5 minutes to prevent memory overflow (assuming ~3 second block time on BSC)
      const blocksIn5Min = Math.floor((5 * 60) / 3); // ~100 blocks
      const fromBlock = latestBlock - blocksIn5Min;

      logger.info(
        `🔍 Scanning BNB blocks ${fromBlock} to ${latestBlock} (last 5 minutes)...`
      );

      // Run detection methods with controlled concurrency
      const [factoryLogs, liquidityLogs] = await Promise.allSettled([
        this.getFactoryPairLogs(fromBlock, latestBlock),
        this.getLiquidityLogs(fromBlock, latestBlock),
        // V3 temporarily disabled due to decoding issues
        // this.getV3FactoryLogs(fromBlock, latestBlock),
      ]);

      // V3 disabled for now to avoid errors
      const v3FactoryLogs = { status: "fulfilled", value: [] } as any;

      const allCoins: CoinData[] = [];

      // Process factory pair creation logs
      if (factoryLogs.status === "fulfilled") {
        logger.info(
          `📊 Processing ${factoryLogs.value.length} factory events...`
        );
        for (const log of factoryLogs.value) {
          const coinData = await this.decodeFactoryPairLog(log);
          if (coinData) {
            allCoins.push(coinData);
            logger.info(`✅ Found new pair: ${coinData.symbol}`);
          }
        }
      } else {
        logger.warn("Factory logs failed:", factoryLogs.reason);
      }

      // Process V3 factory logs
      if (v3FactoryLogs.status === "fulfilled") {
        for (const log of v3FactoryLogs.value) {
          const coinData = await this.decodeV3PoolLog(log);
          if (coinData) {
            allCoins.push(coinData);
            logger.info(`✅ Found V3 pool: ${coinData.symbol}`);
          }
        }
      }

      // Process liquidity addition logs
      if (liquidityLogs.status === "fulfilled") {
        for (const log of liquidityLogs.value) {
          const coinData = await this.decodeLiquidityLog(log);
          if (coinData) allCoins.push(coinData);
        }
        logger.info(`✅ Liquidity: ${liquidityLogs.value.length} events`);
      }

      // Removed transfer log processing to prevent memory overflow
      // Transfer events are too numerous on BSC and cause heap exhaustion

      // Remove duplicates and sort by newest first
      const uniqueCoins = this.removeDuplicatesAndSort(allCoins);

      logger.info(`🎯 Total unique tokens found: ${uniqueCoins.length}`);

      // If no tokens found, try alternative approach
      if (uniqueCoins.length === 0) {
        logger.info("🔄 No tokens found, trying alternative detection...");
        const alternativeCoins = await this.detectNewTokensAlternative(
          fromBlock,
          latestBlock
        );
        return { success: true, data: alternativeCoins };
      }

      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ BNB Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan BNB network for new pairs.",
      };
    }
  }

  // Scan specific Sui event with proper package ID
  private async scanSuiSpecificEvent(
    packageId: string,
    eventType: string,
    thirtyMinutesAgo: number
  ): Promise<CoinData[]> {
    try {
      // For Sui events, we need the full module path
      // Try different query approaches
      const coins: CoinData[] = [];

      try {
        // Approach 1: Query by transaction filter (more reliable)
        const result = await this.suiClient.queryEvents({
          query: {
            TimeRange: {
              startTime: thirtyMinutesAgo.toString(),
              endTime: Date.now().toString(),
            },
          },
          limit: 100,
        });

        // Filter for events from our target package
        const relevantEvents = result.data.filter((ev) => {
          const type = ev.type;
          return type && type.includes(packageId) && type.includes(eventType);
        });

        for (const ev of relevantEvents) {
          const coinData = this.parseSuiEvent(ev);
          if (coinData) coins.push(coinData);
        }
      } catch (e) {
        logger.warn(
          `TimeRange query failed for ${packageId}, trying alternative methods`
        );

        // Approach 2: Try with full event type if we know the module
        const modules = this.getKnownModules(packageId);
        for (const module of modules) {
          try {
            const fullEventType = `${packageId}::${module}::${eventType}`;
            const result = await this.suiClient.queryEvents({
              query: { MoveEventType: fullEventType },
              limit: 50,
            });

            for (const ev of result.data) {
              const coinData = this.parseSuiEvent(ev);
              if (coinData) coins.push(coinData);
            }
          } catch (moduleError) {
            // Continue with next module
          }
        }
      }

      return coins;
    } catch (error) {
      logger.warn(`Sui ${packageId}::${eventType} scan failed:`, error);
      return [];
    }
  }

  // Helper: Get known modules for each DEX package
  private getKnownModules(packageId: string): string[] {
    const moduleMap: Record<string, string[]> = {
      // Cetus
      "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb": [
        "factory",
        "pool",
        "clmm_pool",
        "amm_swap",
      ],
      // Turbos
      "0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1": [
        "swap",
        "pool_factory",
        "pool",
        "turbos_swap",
      ],
      // Generic factory
      "0x886b3ff4623c7a9d101e0470012e0612621fbc67fa4cedddd3b17b273e35a50e": [
        "factory",
        "pair",
        "swap",
      ],
    };

    return moduleMap[packageId] || ["factory", "pool", "swap", "pair"];
  }

  // Helper: Parse Sui event into CoinData
  private parseSuiEvent(ev: any): CoinData | null {
    try {
      const eventTime = ev.timestampMs || Date.now();
      const event = ev.parsedJson as any;

      let symbol = "UNKNOWN";
      let name = "Unknown Token";
      let contractAddress = ev.id?.txDigest || "";

      // Handle different event structures
      if (event?.token_x && event?.token_y) {
        symbol = `${event.token_x.symbol || "UNK"}/${
          event.token_y.symbol || "UNK"
        }`;
        name = `${event.token_x.name || "Unknown"} / ${
          event.token_y.name || "Unknown"
        }`;
        contractAddress = event.pair || ev.id.txDigest;
      } else if (event?.coin_type_a && event?.coin_type_b) {
        const symbolA = event.coin_type_a.split("::").pop() || "UNK";
        const symbolB = event.coin_type_b.split("::").pop() || "UNK";
        symbol = `${symbolA}/${symbolB}`;
        name = `${symbolA} / ${symbolB}`;
        contractAddress = event.pool_id || ev.id.txDigest;
      } else if (event?.coin_type) {
        symbol = event.coin_type.split("::").pop() || "UNKNOWN";
        name = symbol;
        contractAddress = event.coin_type;
      } else if (event?.pool_id) {
        symbol = `POOL_${event.pool_id.slice(-8)}`;
        name = `Pool ${event.pool_id.slice(-8)}`;
        contractAddress = event.pool_id;
      } else if (ev.type) {
        // Try to extract from event type
        const typeParts = ev.type.split("::");
        if (typeParts.length >= 3) {
          symbol = `${typeParts[2]}_${ev.id.txDigest.slice(-6)}`;
          name = `${typeParts[2]} Event`;
        }
      }

      if (!contractAddress) return null;

      return {
        id: `${contractAddress}-${ev.id?.eventSeq || Date.now()}`,
        symbol,
        name,
        network: "sui",
        contractAddress,
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date(eventTime),
        dextoolsUrl: `https://www.dextools.io/app/en/sui/pair-explorer/${contractAddress}`,
        dexscreenerUrl: `https://dexscreener.com/sui/${contractAddress}`,
        verified: false,
      };
    } catch (error) {
      logger.warn("Failed to parse Sui event:", error);
      return null;
    }
  }

  // Your original function - enhanced for better Sui detection
  async getRecentSuiPairs(): Promise<ApiResponse<CoinData[]>> {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000; // Reduced from 30 to 5 minutes

      logger.info(`🔍 Scanning Sui events from last 5 minutes...`);

      // Use proper Sui DEX package IDs and event types
      const dexPackages = [
        {
          packageId:
            "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb", // Cetus DEX
          events: ["PoolCreatedEvent", "AddLiquidityEvent"],
        },
        {
          packageId:
            "0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1", // Turbos DEX
          events: ["PoolCreated", "LiquidityAdded"],
        },
        {
          packageId:
            "0x886b3ff4623c7a9d101e0470012e0612621fbc67fa4cedddd3b17b273e35a50e", // Your factory
          events: ["PairCreated"],
        },
      ];

      const allCoins: CoinData[] = [];

      for (const dex of dexPackages) {
        for (const eventType of dex.events) {
          try {
            const coins = await this.scanSuiSpecificEvent(
              dex.packageId,
              eventType,
              fiveMinutesAgo
            );
            allCoins.push(...coins);
            logger.info(
              `✅ ${dex.packageId.slice(0, 8)}...::${eventType}: ${
                coins.length
              } events`
            );
          } catch (eventError) {
            logger.warn(
              `Sui ${dex.packageId.slice(0, 8)}...::${eventType} scan failed:`,
              eventError
            );
          }
        }
      }

      const uniqueCoins = this.removeDuplicatesAndSort(allCoins);

      logger.info(`🎯 Sui tokens found: ${uniqueCoins.length}`);
      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ Sui Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan Sui network for new pairs.",
      };
    }
  }

  // Helper: Get factory pair creation logs
  private async getFactoryPairLogs(fromBlock: number, toBlock: number) {
    try {
      return await this.bnbProvider.getLogs({
        address: PANCAKESWAP_FACTORY_ADDRESS,
        fromBlock,
        toBlock,
        topics: [PAIR_CREATED_TOPIC],
      });
    } catch (error) {
      logger.warn("Failed to get factory logs:", error);
      return [];
    }
  }

  // Helper: Get V3 factory logs
  private async getV3FactoryLogs(fromBlock: number, toBlock: number) {
    try {
      const V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // PancakeSwap V3
      const POOL_CREATED_TOPIC = ethers.id(
        "PoolCreated(address,address,uint24,int24,address)"
      );

      return await this.bnbProvider.getLogs({
        address: V3_FACTORY,
        fromBlock,
        toBlock,
        topics: [POOL_CREATED_TOPIC],
      });
    } catch (error) {
      logger.warn("Failed to get V3 factory logs:", error);
      return [];
    }
  }

  // Decode V3 pool creation log
  private async decodeV3PoolLog(log: any): Promise<CoinData | null> {
    try {
      // V3 PoolCreated event: token0 and token1 are indexed
      const token0 = "0x" + log.topics[1].slice(-40);
      const token1 = "0x" + log.topics[2].slice(-40);

      // PancakeSwap V3 PoolCreated event only has fee and pool address in data
      // event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
      // Note: fee is also indexed (topics[3]), so data only contains tickSpacing and pool
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["int24", "address"], // Only tickSpacing and pool in data
        log.data
      );
      const pool = decoded[1]; // pool is the second parameter

      const tokenInfo = await this.getTokenInfoSafely(token0, token1);
      if (!tokenInfo) return null;

      // Use cached block or fetch with rate limiting
      const block = await this.getBlockWithCache(log.blockNumber);
      if (!block) return null;

      return {
        id: `v3-${pool.toLowerCase()}`,
        symbol: `${tokenInfo.token0Symbol}/${tokenInfo.token1Symbol}`,
        name: `${tokenInfo.token0Name} / ${tokenInfo.token1Name} V3`,
        network: "bnb",
        contractAddress: pool.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${pool}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${pool}`,
        verified: false,
      };
    } catch (error) {
      logger.warn("Failed to decode V3 pool log:", error);
      return null;
    }
  }

  // Alternative detection method - scan for new ERC20 deployments
  private async detectNewTokensAlternative(
    fromBlock: number,
    toBlock: number
  ): Promise<CoinData[]> {
    try {
      logger.info("🔄 Running alternative token detection...");

      // Limit scan to last 20 blocks to prevent memory issues
      const limitedFromBlock = Math.max(fromBlock, toBlock - 20);

      // Look for Transfer events with zero address (minting)
      const mintLogs = await this.bnbProvider.getLogs({
        fromBlock: limitedFromBlock,
        toBlock,
        topics: [
          TRANSFER_TOPIC,
          ethers.zeroPadValue(ethers.ZeroAddress, 32), // from = 0x0 (minting)
        ],
      });

      const uniqueTokens = new Set<string>();
      const tokens: CoinData[] = [];

      for (const log of mintLogs.slice(0, 50)) {
        // Limit to 50 to avoid overload
        const tokenAddress = log.address.toLowerCase();

        if (!uniqueTokens.has(tokenAddress)) {
          uniqueTokens.add(tokenAddress);

          const tokenInfo = await this.getEnhancedTokenInfo(log.address);
          if (tokenInfo && tokenInfo.symbol && tokenInfo.symbol !== "UNKNOWN") {
            const block = await this.getBlockWithCache(log.blockNumber);
            if (!block) continue;

            tokens.push({
              id: `mint-${tokenAddress}-${log.transactionHash}`,
              symbol: tokenInfo.symbol,
              name: tokenInfo.name,
              network: "bnb",
              contractAddress: tokenAddress,
              marketCap: 0,
              volume24h: 0,
              price: 0,
              priceChange24h: 0,
              launchTime: new Date((block as Block).timestamp * 1000),
              dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`,
              dexscreenerUrl: `https://dexscreener.com/bsc/${tokenAddress}`,
              totalSupply: tokenInfo.totalSupply,
              verified: false,
              risk: {
                score: 70,
                factors: ["New mint detected", "No liquidity verified"],
              },
            });
          }
        }
      }

      logger.info(`🎯 Alternative detection found ${tokens.length} new tokens`);
      return tokens;
    } catch (error) {
      logger.error("Alternative detection failed:", error);
      return [];
    }
  }

  // Helper: Get liquidity addition logs from multiple routers
  private async getLiquidityLogs(fromBlock: number, toBlock: number) {
    const routers = [
      "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeSwap V2
      "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap V3
    ];

    const allLogs = [];

    for (const router of routers) {
      try {
        const [ethLogs, tokenLogs] = await Promise.allSettled([
          this.bnbProvider.getLogs({
            address: router,
            fromBlock,
            toBlock,
            topics: [ADD_LIQUIDITY_ETH_TOPIC],
          }),
          this.bnbProvider.getLogs({
            address: router,
            fromBlock,
            toBlock,
            topics: [ADD_LIQUIDITY_TOPIC],
          }),
        ]);

        if (ethLogs.status === "fulfilled") {
          allLogs.push(
            ...ethLogs.value.map((log) => ({ ...log, type: "addLiquidityETH" }))
          );
        }
        if (tokenLogs.status === "fulfilled") {
          allLogs.push(
            ...tokenLogs.value.map((log) => ({ ...log, type: "addLiquidity" }))
          );
        }
      } catch (routerError) {
        logger.warn(`Router ${router} failed:`, routerError);
      }
    }

    return allLogs;
  }

  // Helper: Get large transfer logs (DEPRECATED - causes memory overflow)
  // This function is kept for reference but should not be used
  private async getLargeTransferLogs(fromBlock: number, toBlock: number) {
    // DISABLED: Transfer events are too numerous on BSC
    // Scanning all transfers causes heap exhaustion
    // Use factory and liquidity events instead
    return [];
  }

  // Decode factory pair creation log with flexible parameter handling
  private async decodeFactoryPairLog(log: any): Promise<CoinData | null> {
    try {
      // PancakeSwap V2 Factory PairCreated event structure:
      // event PairCreated(address indexed token0, address indexed token1, address pair, uint);
      // Topics: [eventSignature, token0, token1]
      // Data: [pair, pairLength] (non-indexed parameters)

      let token0: string, token1: string, pair: string;

      // Get indexed parameters from topics
      if (log.topics && log.topics.length >= 3) {
        // Topics[0] is the event signature
        // Topics[1] is indexed token0
        // Topics[2] is indexed token1
        token0 = "0x" + log.topics[1].slice(-40); // Extract address from topic
        token1 = "0x" + log.topics[2].slice(-40); // Extract address from topic

        // Decode non-indexed parameters from data
        const dataLength = log.data.length - 2; // Remove '0x' prefix

        if (dataLength === 128) {
          // Standard format: pair address + uint256
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "uint256"],
            log.data
          );
          pair = decoded[0];
        } else if (dataLength === 64) {
          // Only pair address
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address"],
            log.data
          );
          pair = decoded[0];
        } else {
          // Unexpected format, try to decode what we can
          logger.warn(`Unexpected data length: ${dataLength + 2} bytes`);
          try {
            // Try to extract first 20 bytes as address
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
              ["address"],
              "0x" + log.data.slice(2, 66) // First 32 bytes (64 hex chars)
            );
            pair = decoded[0];
          } catch (e) {
            logger.warn("Could not decode pair address from data");
            return null;
          }
        }
      } else {
        logger.warn("Insufficient topics in PairCreated event");
        return null;
      }

      const tokenInfo = await this.getTokenInfoSafely(token0, token1);
      if (!tokenInfo) return null;

      const block = await this.getBlockWithCache(log.blockNumber);
      if (!block) return null;

      return {
        id: `${pair.toLowerCase()}`,
        symbol: `${tokenInfo.token0Symbol}/${tokenInfo.token1Symbol}`,
        name: `${tokenInfo.token0Name} / ${tokenInfo.token1Name}`,
        network: "bnb",
        contractAddress: pair.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${pair}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${pair}`,
        verified: false,
      };
    } catch (error) {
      logger.warn("Failed to decode factory pair log:", error);
      return null;
    }
  }

  // Decode liquidity addition log
  private async decodeLiquidityLog(log: any): Promise<CoinData | null> {
    try {
      let tokenAddress: string | null = null;

      if (log.type === "addLiquidityETH") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "uint256", "uint256", "uint256", "address", "uint256"],
          log.data
        );
        tokenAddress = decoded[0];
      } else if (log.type === "addLiquidity") {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          [
            "address",
            "address",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "address",
            "uint256",
          ],
          log.data
        );

        const [tokenA, tokenB] = decoded;
        const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaeBF2De08d9173bc095c";

        if (tokenA.toLowerCase() === WBNB_ADDRESS.toLowerCase()) {
          tokenAddress = tokenB;
        } else if (tokenB.toLowerCase() === WBNB_ADDRESS.toLowerCase()) {
          tokenAddress = tokenA;
        }
      }

      if (!tokenAddress) return null;

      const tokenInfo = await this.getEnhancedTokenInfo(tokenAddress);
      if (!tokenInfo) return null;

      const block = await this.getBlockWithCache(log.blockNumber);
      if (!block) return null;

      return {
        id: `${tokenAddress.toLowerCase()}-${log.transactionHash}`,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        network: "bnb",
        contractAddress: tokenAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${tokenAddress}`,
        totalSupply: tokenInfo.totalSupply,
        verified: false,
        liquidity: 0, // Could calculate from log data
        risk: {
          score: 50,
          factors: ["New token"],
        },
      };
    } catch (error) {
      logger.warn("Failed to decode liquidity log:", error);
      return null;
    }
  }

  // Decode transfer log
  private async decodeTransferLog(log: any): Promise<CoinData | null> {
    try {
      const tokenAddress = log.address;
      const tokenInfo = await this.getEnhancedTokenInfo(tokenAddress);
      if (!tokenInfo) return null;

      const block = await this.getBlockWithCache(log.blockNumber);
      if (!block) return null;

      return {
        id: `${tokenAddress.toLowerCase()}-transfer-${log.transactionHash}`,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        network: "bnb",
        contractAddress: tokenAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date((block as Block).timestamp * 1000),
        dextoolsUrl: `https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`,
        dexscreenerUrl: `https://dexscreener.com/bsc/${tokenAddress}`,
        totalSupply: tokenInfo.totalSupply,
        verified: false,
        risk: {
          score: 60,
          factors: ["New token", "Large transfer detected"],
        },
      };
    } catch (error) {
      logger.warn("Failed to decode transfer log:", error);
      return null;
    }
  }

  // Scan specific Sui event type
  private async scanSuiEventType(
    eventType: string,
    thirtyMinutesAgo: number
  ): Promise<CoinData[]> {
    try {
      const result = await this.suiClient.queryEvents({
        query: { MoveEventType: eventType },
        limit: 50,
      });

      const coins: CoinData[] = [];

      for (const ev of result.data) {
        try {
          const eventTime = ev.timestampMs || Date.now();
          if ((eventTime as number) < thirtyMinutesAgo) continue;

          const event = ev.parsedJson as any;
          let symbol = "UNKNOWN";
          let name = "Unknown Token";

          if (event.token_x && event.token_y) {
            symbol = `${event.token_x.symbol}/${event.token_y.symbol}`;
            name = `${event.token_x.name} / ${event.token_y.name}`;
          } else if (event.coin_type) {
            symbol = event.coin_type.split("::").pop() || "UNKNOWN";
            name = symbol;
          }

          const pairObjectId = event.pair || ev.id.txDigest;

          coins.push({
            id: pairObjectId,
            symbol,
            name,
            network: "sui",
            contractAddress: pairObjectId,
            marketCap: 0,
            volume24h: 0,
            price: 0,
            priceChange24h: 0,
            launchTime: new Date(eventTime),
            dextoolsUrl: `https://www.dextools.io/app/en/sui/pair-explorer/${pairObjectId}`,
            dexscreenerUrl: `https://dexscreener.com/sui/${pairObjectId}`,
            verified: false,
          });
        } catch (eventError) {
          continue;
        }
      }

      return coins;
    } catch (error) {
      logger.warn(`Sui ${eventType} scan failed:`, error);
      return [];
    }
  }

  // Get enhanced token information
  private async getEnhancedTokenInfo(tokenAddress: string): Promise<any> {
    try {
      const tokenAbi = [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
      ];

      const tokenContract = new ethers.Contract(
        tokenAddress,
        tokenAbi,
        this.bnbProvider
      );

      const results = await Promise.allSettled([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply(),
      ]);

      const allSucceeded = results.every(
        (result) => result.status === "fulfilled"
      );
      if (!allSucceeded) return null;

      const [name, symbol, decimals, totalSupply] = results.map(
        (result: any) => result.value
      );

      if (!symbol || !name) return null;

      return {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: Number(ethers.formatUnits(totalSupply, decimals)),
      };
    } catch (error) {
      return null;
    }
  }

  // Get basic token info (your original method)
  private async getTokenInfoSafely(
    token0: string,
    token1: string
  ): Promise<any> {
    try {
      const tokenAbi = [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
      ];

      const token0Contract = new ethers.Contract(
        token0,
        tokenAbi,
        this.bnbProvider
      );
      const token1Contract = new ethers.Contract(
        token1,
        tokenAbi,
        this.bnbProvider
      );

      const results = await Promise.allSettled([
        token0Contract.name(),
        token0Contract.symbol(),
        token1Contract.name(),
        token1Contract.symbol(),
      ]);

      const allSucceeded = results.every(
        (result) => result.status === "fulfilled"
      );
      if (!allSucceeded) return null;

      const [token0Name, token0Symbol, token1Name, token1Symbol] = results.map(
        (result: any) => result.value
      );

      if (!token0Symbol || !token1Symbol || !token0Name || !token1Name)
        return null;

      return { token0Name, token0Symbol, token1Name, token1Symbol };
    } catch (error) {
      return null;
    }
  }

  // Remove duplicates and sort by newest first
  private removeDuplicatesAndSort(coins: CoinData[]): CoinData[] {
    const uniqueCoins = coins.filter(
      (coin, index, arr) =>
        arr.findIndex((c) => c.contractAddress === coin.contractAddress) ===
        index
    );

    return uniqueCoins.sort(
      (a, b) => b.launchTime.getTime() - a.launchTime.getTime()
    );
  }

  // Helper: Get block with caching and rate limiting
  private async getBlockWithCache(blockNumber: number): Promise<Block | null> {
    try {
      // Check cache first
      if (this.blockCache.has(blockNumber)) {
        return this.blockCache.get(blockNumber)!;
      }

      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest)
        );
      }
      this.lastRequestTime = Date.now();

      // Fetch block with retry logic
      let retries = 3;
      let block: Block | null = null;

      while (retries > 0 && !block) {
        try {
          block = await this.bnbProvider.getBlock(blockNumber);
          if (block) {
            // Cache the block (keep cache size limited)
            if (this.blockCache.size > 100) {
              const firstKey = this.blockCache.keys().next().value;
              this.blockCache.delete(firstKey as number);
            }
            this.blockCache.set(blockNumber, block);
          }
        } catch (error: any) {
          if (
            error.code === "BAD_DATA" ||
            error.message?.includes("Too Many Requests")
          ) {
            retries--;
            if (retries > 0) {
              logger.warn(
                `Rate limited, retrying in ${1000 * (4 - retries)}ms...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (4 - retries))
              );
            }
          } else {
            throw error;
          }
        }
      }

      return block;
    } catch (error) {
      logger.warn(`Failed to get block ${blockNumber}:`, error);
      // Return a default block with current timestamp as fallback
      return {
        number: blockNumber,
        timestamp: Math.floor(Date.now() / 1000),
        hash: "0x0",
      } as Block;
    }
  }

  // Debug method (your original)
  async debugLogData(): Promise<void> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      const fromBlock = latestBlock - 10;

      logger.info(
        `🔍 Debugging logs from blocks ${fromBlock} to ${latestBlock}`
      );

      const logs = await this.bnbProvider.getLogs({
        address: PANCAKESWAP_FACTORY_ADDRESS,
        fromBlock,
        toBlock: latestBlock,
        topics: [PAIR_CREATED_TOPIC],
      });

      for (const log of logs.slice(0, 3)) {
        logger.info("Raw log data:", {
          address: log.address,
          topics: log.topics,
          data: log.data,
          dataLength: log.data.length,
        });

        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address", "uint256"],
            log.data
          );
          logger.info("Decoded successfully:", decoded);
        } catch (e: any) {
          logger.info("Decode failed:", e.message);
        }
      }
    } catch (error) {
      logger.error("Debug failed:", error);
    }
  }
}
