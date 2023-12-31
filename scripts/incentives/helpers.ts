import { ethers } from "ethers";
import hre from "hardhat";
import { bigNumberify } from "../../utils/math";
import fetch from "node-fetch";

const ARBITRUM_SUBGRAPH_ENDPOINT =
  "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/version/incentives3-231107223152-5284f8c/api";
const API_ENDPOINT = "https://arbitrum-api.gmxinfra.io";

export const STIP_LP_DISTRIBUTION_TYPE_ID = 1001;
export const STIP_MIGRATION_DISTRIBUTION_TYPE_ID = 1002;
export const STIP_TRADING_INCENTIVES_DISTRIBUTION_TYPE_ID = 1003;

export async function requestSubgraph(query: string) {
  const payload = JSON.stringify({ query });
  const res = await fetch(ARBITRUM_SUBGRAPH_ENDPOINT, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });

  const j = await res.json();
  if (j.errors) {
    throw new Error(JSON.stringify(j));
  }

  return j.data;
}

export function guessBlockNumberByTimestamp(block: ethers.providers.Block, timestamp: number) {
  return block.number - Math.floor((block.timestamp - timestamp) * 3.75);
}

export async function getBlockByTimestamp(timestamp: number) {
  const tolerance = 30; // 30 seconds
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  let nextBlockNumber = guessBlockNumberByTimestamp(latestBlock, timestamp);

  console.log("latest block: %s %s", latestBlock.number, latestBlock.timestamp);

  const i = 0;
  while (i < 10) {
    console.log("requesting next block %s", nextBlockNumber);
    const block = await hre.ethers.provider.getBlock(nextBlockNumber);
    if (Math.abs(block.timestamp - timestamp) < tolerance) {
      console.log("found block %s %s diff %s", block.number, block.timestamp, block.timestamp - timestamp);
      return block;
    }

    console.log("%s seconds away", block.timestamp - timestamp);

    nextBlockNumber = guessBlockNumberByTimestamp(block, timestamp);

    if (block.number === nextBlockNumber) {
      console.log("search stopped");
      return block;
    }
  }
  throw new Error("block is not found");
}

export async function requestPrices() {
  const url = new URL(`${API_ENDPOINT}/prices/tickers`);
  const res = await fetch(url);
  const prices = (await res.json()) as {
    maxPrice: string;
    minPrice: string;
    tokenSymbol: string;
    tokenAddress: string;
  }[];

  return prices;
}

export async function requestAllocationData(timestamp: number) {
  const url = new URL(`${API_ENDPOINT}/incentives/stip`);
  url.searchParams.set("timestamp", String(timestamp));
  if (process.env.IGNORE_START_DATE) {
    url.searchParams.set("ignoreStartDate", "1");
  }
  const res = await fetch(url);
  const data = (await res.json()) as {
    lp: {
      isActive: boolean;
      totalRewards: string;
      period: number;
      rewardsPerMarket: Record<string, string>;
    };
    migration: {
      isActive: boolean;
      maxRebateBps: number;
      period: number;
    };
  };

  return {
    lp: {
      ...data.lp,
      totalRewards: bigNumberify(data.lp.totalRewards || 0),
      rewardsPerMarket:
        data.lp.rewardsPerMarket &&
        Object.fromEntries(
          Object.entries(data.lp.rewardsPerMarket).map(([marketAddress, rewards]) => {
            return [marketAddress, bigNumberify(rewards)];
          })
        ),
    },
    migration: data.migration,
  };
}

function getChainId() {
  if (hre.network.name === "arbitrum") {
    return 42161;
  }

  if (hre.network.name === "avax") {
    return 43114;
  }

  throw new Error("Unsupported network");
}

export async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248");
    const signer = frame.getSigner();
    if (getChainId() !== (await signer.getChainId())) {
      throw new Error("Incorrect frame network");
    }
    return signer;
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`);
  }
}
