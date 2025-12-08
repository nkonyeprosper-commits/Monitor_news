import { ethers, getDefaultProvider, JsonRpcProvider, Provider } from "ethers";
import { CoinData, ApiResponse } from "../types";
import { logger } from "../utils/logger";
import { SuiClient } from "@mysten/sui.js/client";
import { getFullnodeUrl } from "@mysten/sui.js/client";

// PancakeSwap Factory (v2) on BNB mainnet
const PANCAKESWAP_FACTORY_ADDRESS =
  "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
// PancakeSwap Router (v2) on BNB mainnet - this is where AddLiquidityETH events come from
const PANCAKESWAP_ROUTER_ADDRESS = "0x10ed43c718714eb63d5aa57b78b54704e256024e";

// Event signatures for different approaches
const EVENT_SIGNATURES = {
  // Original pair creation events
  v2: "PairCreated(address,address,address,uint256)",
  v2_simple: "PairCreated(address,address,address)",
  v3: "PoolCreated(address,address,uint24,int24,address)",

  // Liquidity addition events - these are more reliable for catching "live" tokens
  addLiquidityETH:
    "AddLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  addLiquidity:
    "AddLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",

  // Alternative liquidity events from different DEX versions
  mint: "Mint(address,uint256,uint256)", // From pair contracts
  sync: "Sync(uint112,uint112)", // From pair contracts when liquidity changes
};

// Topic hashes for the events
const PAIR_CREATED_TOPIC_V2 = ethers.id(EVENT_SIGNATURES.v2);
const PAIR_CREATED_TOPIC_V2_SIMPLE = ethers.id(EVENT_SIGNATURES.v2_simple);
const POOL_CREATED_TOPIC_V3 = ethers.id(EVENT_SIGNATURES.v3);
const ADD_LIQUIDITY_ETH_TOPIC = ethers.id(EVENT_SIGNATURES.addLiquidityETH);
const ADD_LIQUIDITY_TOPIC = ethers.id(EVENT_SIGNATURES.addLiquidity);
const MINT_TOPIC = ethers.id(EVENT_SIGNATURES.mint);

// Replace this with the actual Sui factory address and event name once known
const SUI_FACTORY = process.env.SUI_FACTORY_ADDRESS || "";
const SUI_TOPIC = "AddLiquidityEvent";

export class OnchainPairScannerService {
  private bnbProvider: Provider;
  private suiClient: SuiClient;

  constructor() {
    console.log(process.env.BNB_RPC_URL, "checking something");
    this.bnbProvider = new JsonRpcProvider(process.env.BNB_RPC_URL, {
      name: "binance",
      chainId: 56,
    });
    console.log(this.bnbProvider, "checking something out");
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl("mainnet");
    this.suiClient = new SuiClient({ url: rpcUrl });
  }

  /**
   * Enhanced method that scans for both pair creations AND liquidity additions
   * This gives us tokens that are actually tradeable with initial liquidity
   */
  async getRecentBNBPairCreations(): Promise<ApiResponse<CoinData[]>> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      const fromBlock = latestBlock - 100; // last 100 blocks

      logger.info(
        `📦 Scanning BNB blocks ${fromBlock} to ${latestBlock} for new pairs and liquidity additions...`
      );

      // Get both pair creation events and liquidity addition events
      const [pairCreationResults, liquidityResults] = await Promise.allSettled([
        this.getPairCreationEvents(fromBlock, latestBlock),
        this.getLiquidityAdditionEvents(fromBlock, latestBlock),
      ]);

      const allCoins: CoinData[] = [];

      // Process pair creation events
      if (pairCreationResults.status === "fulfilled") {
        allCoins.push(...pairCreationResults.value);
        logger.info(
          `Found ${pairCreationResults.value.length} coins from pair creation events`
        );
      }

      // Process liquidity addition events (often more reliable)
      if (liquidityResults.status === "fulfilled") {
        allCoins.push(...liquidityResults.value);
        logger.info(
          `Found ${liquidityResults.value.length} coins from liquidity addition events`
        );
      }

      // Remove duplicates based on contract address
      const uniqueCoins = this.removeDuplicateCoins(allCoins);

      logger.info(
        `✅ Successfully found ${uniqueCoins.length} unique new tradeable pairs`
      );
      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ BNB Pair Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan BNB network for new pairs.",
      };
    }
  }

  /**
   * Scan for AddLiquidityETH events - these indicate when tokens get their first real liquidity
   */
  private async getLiquidityAdditionEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CoinData[]> {
    const coins: CoinData[] = [];

    try {
      // Get AddLiquidityETH events from PancakeSwap Router
      const addLiquidityETHLogs = await this.bnbProvider.getLogs({
        address: PANCAKESWAP_ROUTER_ADDRESS,
        fromBlock,
        toBlock,
        topics: [ADD_LIQUIDITY_ETH_TOPIC],
      });

      logger.info(`Found ${addLiquidityETHLogs.length} AddLiquidityETH events`);

      for (const log of addLiquidityETHLogs) {
        try {
          const coinData = await this.decodeAddLiquidityETHLog(log);
          if (coinData) {
            coins.push(coinData);
          }
        } catch (error) {
          logger.warn("Failed to decode AddLiquidityETH log:", error);
        }
      }

      // Also scan for regular AddLiquidity events (token-token pairs)
      const addLiquidityLogs = await this.bnbProvider.getLogs({
        address: PANCAKESWAP_ROUTER_ADDRESS,
        fromBlock,
        toBlock,
        topics: [ADD_LIQUIDITY_TOPIC],
      });

      logger.info(`Found ${addLiquidityLogs.length} AddLiquidity events`);

      for (const log of addLiquidityLogs) {
        try {
          const coinData = await this.decodeAddLiquidityLog(log);
          if (coinData) {
            coins.push(coinData);
          }
        } catch (error) {
          logger.warn("Failed to decode AddLiquidity log:", error);
        }
      }
    } catch (error) {
      logger.error("Error getting liquidity addition events:", error);
    }

    return coins;
  }

  /**
   * Original pair creation event scanning (kept for completeness)
   */
  private async getPairCreationEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CoinData[]> {
    const coins: CoinData[] = [];

    try {
      const [v2Logs, v2SimpleLogs] = await Promise.allSettled([
        this.bnbProvider.getLogs({
          address: PANCAKESWAP_FACTORY_ADDRESS,
          fromBlock,
          toBlock,
          topics: [PAIR_CREATED_TOPIC_V2],
        }),
        this.bnbProvider.getLogs({
          address: PANCAKESWAP_FACTORY_ADDRESS,
          fromBlock,
          toBlock,
          topics: [PAIR_CREATED_TOPIC_V2_SIMPLE],
        }),
      ]);

      const allLogs = [];

      if (v2Logs.status === "fulfilled") {
        allLogs.push(...v2Logs.value.map((log) => ({ ...log, type: "v2" })));
      }

      if (v2SimpleLogs.status === "fulfilled") {
        allLogs.push(
          ...v2SimpleLogs.value.map((log) => ({ ...log, type: "v2_simple" }))
        );
      }

      for (const log of allLogs) {
        try {
          const coinData = await this.decodeLogSafely(log);
          if (coinData) {
            coins.push(coinData);
          }
        } catch (error) {
          logger.warn("Failed to decode pair creation log:", error);
        }
      }
    } catch (error) {
      logger.error("Error getting pair creation events:", error);
    }

    return coins;
  }

  /**
   * Decode AddLiquidityETH events
   * Event signature: AddLiquidityETH(address,uint256,uint256,uint256,address,uint256)
   * Parameters: token, amountToken, amountTokenMin, amountETHMin, to, deadline
   */
  private async decodeAddLiquidityETHLog(log: any): Promise<CoinData | null> {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["address", "uint256", "uint256", "uint256", "address", "uint256"],
        log.data
      );

      const [token, amountToken, amountTokenMin, amountETHMin, to, deadline] =
        decoded;

      // Get the transaction to find the pair address
      const tx = await this.bnbProvider.getTransaction(log.transactionHash);
      if (!tx) return null;

      // Find the pair address by looking for the token and WETH pair
      const WETH_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB on BSC
      const pairAddress = await this.getPairAddress(token, WETH_ADDRESS);

      if (!pairAddress) return null;

      // Get token information
      const tokenInfo = await this.getTokenInfoSafely(token, WETH_ADDRESS);
      if (!tokenInfo) return null;

      const { token0Name, token0Symbol, token1Name, token1Symbol } = tokenInfo;

      return {
        id: `${pairAddress.toLowerCase()}`,
        symbol: `${token0Symbol}/BNB`,
        name: `${token0Name} / Binance Coin`,
        network: "bnb",
        contractAddress: pairAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date(),
        // Add metadata to track that this came from liquidity addition
        // liquidityInfo: {
        //   type: "AddLiquidityETH",
        //   amountToken: amountToken.toString(),
        //   amountETH: amountETHMin.toString(),
        //   provider: to,
        // },
      };
    } catch (error) {
      logger.warn("Failed to decode AddLiquidityETH log:", error);
      return null;
    }
  }

  /**
   * Decode AddLiquidity events (token-token pairs)
   */
  private async decodeAddLiquidityLog(log: any): Promise<CoinData | null> {
    try {
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

      const [
        tokenA,
        tokenB,
        amountADesired,
        amountBDesired,
        amountAMin,
        amountBMin,
        to,
        deadline,
      ] = decoded;

      // Get pair address
      const pairAddress = await this.getPairAddress(tokenA, tokenB);
      if (!pairAddress) return null;

      // Get token information
      const tokenInfo = await this.getTokenInfoSafely(tokenA, tokenB);
      if (!tokenInfo) return null;

      const { token0Name, token0Symbol, token1Name, token1Symbol } = tokenInfo;

      return {
        id: `${pairAddress.toLowerCase()}`,
        symbol: `${token0Symbol}/${token1Symbol}`,
        name: `${token0Name} / ${token1Name}`,
        network: "bnb",
        contractAddress: pairAddress.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date(),
        // liquidityInfo: {
        //   type: "AddLiquidity",
        //   amountA: amountADesired.toString(),
        //   amountB: amountBDesired.toString(),
        //   provider: to,
        // },
      };
    } catch (error) {
      logger.warn("Failed to decode AddLiquidity log:", error);
      return null;
    }
  }

  /**
   * Get pair address from factory contract
   */
  private async getPairAddress(
    tokenA: string,
    tokenB: string
  ): Promise<string | null> {
    try {
      const factoryAbi = [
        "function getPair(address tokenA, address tokenB) external view returns (address pair)",
      ];

      const factoryContract = new ethers.Contract(
        PANCAKESWAP_FACTORY_ADDRESS,
        factoryAbi,
        this.bnbProvider
      );

      const pairAddress = await factoryContract.getPair(tokenA, tokenB);

      // Check if pair exists (not zero address)
      if (pairAddress === "0x0000000000000000000000000000000000000000") {
        return null;
      }

      return pairAddress;
    } catch (error) {
      logger.warn("Failed to get pair address:", error);
      return null;
    }
  }

  /**
   * Remove duplicate coins based on contract address
   */
  private removeDuplicateCoins(coins: CoinData[]): CoinData[] {
    const seen = new Set<string>();
    return coins.filter((coin) => {
      const key = coin.contractAddress.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Method to focus ONLY on liquidity addition events (most reliable)
   */
  async getRecentLiquidityAdditions(): Promise<ApiResponse<CoinData[]>> {
    try {
      const latestBlock = await this.bnbProvider.getBlockNumber();
      const fromBlock = latestBlock - 50; // Smaller range for more recent activity

      logger.info(
        `💧 Scanning BNB blocks ${fromBlock} to ${latestBlock} for liquidity additions...`
      );

      const coins = await this.getLiquidityAdditionEvents(
        fromBlock,
        latestBlock
      );
      const uniqueCoins = this.removeDuplicateCoins(coins);

      logger.info(`✅ Found ${uniqueCoins.length} tokens with new liquidity`);
      return { success: true, data: uniqueCoins };
    } catch (error) {
      logger.error("⛔ Liquidity Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan for liquidity additions.",
      };
    }
  }

  // ... rest of your existing methods (decodeLogSafely, getTokenInfoSafely, etc.)

  private async decodeLogSafely(log: any): Promise<CoinData | null> {
    try {
      let decoded;
      let token0: string, token1: string, pair: string;

      const dataLength = log.data.length;
      logger.info(
        `Processing log with data length: ${dataLength}, type: ${log.type}`
      );

      if (log.type === "v2") {
        try {
          decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address", "uint256"],
            log.data
          );
          [token0, token1, pair] = decoded;
        } catch (decodeError) {
          logger.warn("V2 decode failed, trying alternative:", decodeError);
          decoded = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address"],
            log.data
          );
          [token0, token1, pair] = decoded;
        }
      } else if (log.type === "v2_simple") {
        decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["address", "address", "address"],
          log.data
        );
        [token0, token1, pair] = decoded;
      } else {
        logger.warn("Unknown log type:", log.type);
        return null;
      }

      const tokenInfo = await this.getTokenInfoSafely(token0, token1);
      if (!tokenInfo) {
        return null;
      }

      const { token0Name, token0Symbol, token1Name, token1Symbol } = tokenInfo;

      return {
        id: `${pair.toLowerCase()}`,
        symbol: `${token0Symbol}/${token1Symbol}`,
        name: `${token0Name} / ${token1Name}`,
        network: "bnb",
        contractAddress: pair.toLowerCase(),
        marketCap: 0,
        volume24h: 0,
        price: 0,
        priceChange24h: 0,
        launchTime: new Date(),
      };
    } catch (error: any) {
      logger.warn("Failed to decode log safely:", {
        error: error.message,
        logData: log.data,
        logDataLength: log.data?.length,
      });
      return null;
    }
  }

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
      if (!allSucceeded) {
        logger.warn("Some token info calls failed:", results);
        return null;
      }

      const [token0Name, token0Symbol, token1Name, token1Symbol] = results.map(
        (result: any) => result.value
      );

      if (!token0Symbol || !token1Symbol || !token0Name || !token1Name) {
        logger.warn("Got empty token info:", {
          token0Symbol,
          token1Symbol,
          token0Name,
          token1Name,
        });
        return null;
      }

      return { token0Name, token0Symbol, token1Name, token1Symbol };
    } catch (error) {
      logger.warn("Failed to get token info:", error);
      return null;
    }
  }

  // ... rest of your existing methods (debugLogData, getRecentSuiPairs, etc.)
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
        topics: [PAIR_CREATED_TOPIC_V2],
      });

      for (const log of logs.slice(0, 3)) {
        logger.info("Raw log data:", {
          address: log.address,
          topics: log.topics,
          data: log.data,
          dataLength: log.data.length,
          dataHex: log.data,
        });

        try {
          const decoded4 = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address", "uint256"],
            log.data
          );
          logger.info("4-param decode success:", decoded4);
        } catch (e: any) {
          logger.info("4-param decode failed:", e.message);
        }

        try {
          const decoded3 = ethers.AbiCoder.defaultAbiCoder().decode(
            ["address", "address", "address"],
            log.data
          );
          logger.info("3-param decode success:", decoded3);
        } catch (e: any) {
          logger.info("3-param decode failed:", e.message);
        }
      }
    } catch (error) {
      logger.error("Debug failed:", error);
    }
  }

  async getRecentSuiPairs(): Promise<ApiResponse<CoinData[]>> {
    try {
      const factoryPackageId =
        "0x886b3ff4623c7a9d101e0470012e0612621fbc67fa4cedddd3b17b273e35a50e";
      const pairCreatedEvent = `${factoryPackageId}::factory::PairCreated`;

      const now = Date.now();
      const past24h = now - 24 * 60 * 60 * 1000;

      const result = await this.suiClient.queryEvents({
        query: {
          MoveEventType: pairCreatedEvent,
        },
        limit: 50,
      });

      const coins: CoinData[] = [];

      for (const ev of result.data) {
        try {
          const event = ev.parsedJson as any;

          const tokenA = event.token_x;
          const tokenB = event.token_y;
          const pairObjectId = event.pair;

          const symbol = `${tokenA.symbol}/${tokenB.symbol}`;
          const name = `${tokenA.name} / ${tokenB.name}`;

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
            launchTime: new Date(ev.timestampMs || now),
          });
        } catch (decodeError) {
          logger.warn("❌ Failed to decode Sui event:", decodeError);
        }
      }

      return { success: true, data: coins };
    } catch (error) {
      logger.error("⛔ Sui Pair Scanner Error:", error);
      return {
        success: false,
        error: "Failed to scan Sui network for new pairs.",
      };
    }
  }
}
