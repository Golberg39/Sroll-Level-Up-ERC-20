import { config as loadEnvVariables } from "dotenv";
import {
  createWalletClient,
  http,
  getContract,
  erc20Abi,
  parseUnits,
  maxUint256,
  publicActions,
  concat,
  numberToHex,
  size,
} from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scroll } from "viem/chains";
import { wethAbi } from "./abi/weth-abi";

// Code for 0x Challenge on Scroll

/* 
1. Show liquidity source percentage breakdown
2. Add affiliate fees and surplus collection
3. Display buy/sell taxes for tokens with tax
4. List all liquidity sources on Scroll
*/

const querystring = require("qs");

// Load environment variables
loadEnvVariables();
const { PRIVATE_KEY, ZERO_EX_API_KEY, ALCHEMY_HTTP_TRANSPORT_URL } = process.env;

// Ensure environment variables are set
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY is missing.");
if (!ZERO_EX_API_KEY) throw new Error("ZERO_EX_API_KEY is missing.");
if (!ALCHEMY_HTTP_TRANSPORT_URL) throw new Error("ALCHEMY_HTTP_TRANSPORT_URL is missing.");

// Define request headers
const requestHeaders = new Headers({
  "Content-Type": "application/json",
  "0x-api-key": ZERO_EX_API_KEY,
  "0x-version": "v2",
});

// Initialize wallet client
const walletClient = createWalletClient({
  account: privateKeyToAccount(`0x${PRIVATE_KEY}` as `0x${string}`),
  chain: scroll,
  transport: http(ALCHEMY_HTTP_TRANSPORT_URL),
}).extend(publicActions); // Add public actions

const [walletAddress] = await walletClient.getAddresses();

// Initialize contracts
const wethContract = getContract({
  address: "0x5300000000000000000000000000000000000004",
  abi: wethAbi,
  client: walletClient,
});

const wstethContract = getContract({
  address: "0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32",
  abi: erc20Abi,
  client: walletClient,
});

// Function to show liquidity sources' percentage breakdown
function showLiquidityBreakdown(route: any) {
  const liquiditySources = route.fills;
  const totalBasisPoints = liquiditySources.reduce(
    (acc: number, fill: any) => acc + parseInt(fill.proportionBps),
    0
  );

  console.log(`${liquiditySources.length} Sources`);
  liquiditySources.forEach((fill: any) => {
    const percentage = (parseInt(fill.proportionBps) / 100).toFixed(2);
    console.log(`${fill.source}: ${percentage}%`);
  });
}

// Function to show token buy/sell taxes
function showTokenTaxes(tokenDetails: any) {
  const buyTokenBuyTax = (parseInt(tokenDetails.buyToken.buyTaxBps) / 100).toFixed(2);
  const buyTokenSellTax = (parseInt(tokenDetails.buyToken.sellTaxBps) / 100).toFixed(2);
  const sellTokenBuyTax = (parseInt(tokenDetails.sellToken.buyTaxBps) / 100).toFixed(2);
  const sellTokenSellTax = (parseInt(tokenDetails.sellToken.sellTaxBps) / 100).toFixed(2);

  if (buyTokenBuyTax > 0 || buyTokenSellTax > 0) {
    console.log(`Buy Token Buy Tax: ${buyTokenBuyTax}%`);
    console.log(`Buy Token Sell Tax: ${buyTokenSellTax}%`);
  }

  if (sellTokenBuyTax > 0 || sellTokenSellTax > 0) {
    console.log(`Sell Token Buy Tax: ${sellTokenBuyTax}%`);
    console.log(`Sell Token Sell Tax: ${sellTokenSellTax}%`);
  }
}

// Function to retrieve liquidity sources on Scroll
const fetchLiquiditySources = async () => {
  const chainId = walletClient.chain.id.toString();
  const params = new URLSearchParams({ chainId: chainId });

  const response = await fetch(
    `https://api.0x.org/swap/v1/sources?${params.toString()}`,
    {
      headers: requestHeaders,
    }
  );

  const data = await response.json();
  const liquiditySources = Object.keys(data.sources);
  console.log("Scroll chain liquidity sources:");
  console.log(liquiditySources.join(", "));
};

const main = async () => {
  // Fetch liquidity sources on Scroll
  await fetchLiquiditySources();

  // Define sell amount
  const tokenDecimals = (await wethContract.read.decimals()) as number;
  const sellAmount = parseUnits("0.1", tokenDecimals);

  // Set affiliate fee and surplus collection parameters
  const affiliateFee = "100"; // 1%
  const surplusCollect = "true";

  // Fetch price with monetization parameters
  const priceParams = new URLSearchParams({
    chainId: walletClient.chain.id.toString(),
    sellToken: wethContract.address,
    buyToken: wstethContract.address,
    sellAmount: sellAmount.toString(),
    taker: walletClient.account.address,
    affiliateFee: affiliateFee,
    surplusCollection: surplusCollect,
  });

  const priceResponse = await fetch(
    `https://api.0x.org/swap/permit2/price?${priceParams.toString()}`,
    {
      headers: requestHeaders,
    }
  );

  const priceData = await priceResponse.json();
  console.log("Price for swapping 0.1 WETH for wstETH:");
  console.log(priceData);

  // Check if approval is needed
  if (priceData.issues.allowance !== null) {
    try {
      const approvalRequest = await wethContract.simulate.approve([
        priceData.issues.allowance.spender,
        maxUint256,
      ]);
      console.log("Approving...");
      const approvalHash = await wethContract.write.approve(approvalRequest.args);
      console.log("Approval successful.", await walletClient.waitForTransactionReceipt({ hash: approvalHash }));
    } catch (error) {
      console.error("Approval failed:", error);
    }
  } else {
    console.log("No approval needed for Permit2.");
  }

  // Fetch quote and handle transaction signing and submission...

  // Fetch and display liquidity breakdown and token taxes, sign transactions, etc.
};

main();
