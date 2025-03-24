import { TradeToken, TradeSide, CurrencyType, delay } from "./raydiumBotClient";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

const getTimestamp = (): string => new Date().toLocaleTimeString("en-US", { hour12: false });

dotenv.config();


const RPC_PROVIDER = process.env.RPC_PROVIDER ?? "";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const POOL_ADDRESS = process.env.POOL_ADDRESS ?? ""; 
const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export let isWaitingForTransaction: boolean = false;

if (!PRIVATE_KEY || !RPC_PROVIDER || !POOL_ADDRESS) {
    console.error("❌ Missing environment variables! Check your .env file.");
    process.exit(1);
}

const botAccount = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
let solBoughtAmount: number | null = null; // Store the amount of SOL bought

const connection = new Connection(RPC_PROVIDER, "processed");

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await fn();
        } catch (error: any) {
            if (error.message.includes("429")) {
                const waitTime = 500 * (2 ** attempt);
                console.log(`🌐 Rate limited. Retrying in ${waitTime / 1000}s...`);
                await delay(waitTime);
                attempt++;
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached");
}

export async function getSolBalance(): Promise<number> {
    return retryWithBackoff(async () => {
        const balance = await connection.getBalance(botAccount.publicKey);
        return balance / 1e9;
    });
}

export async function getUsdcBalance(): Promise<number> {
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            botAccount.publicKey,
            { mint: new PublicKey(USDC_MINT_ADDRESS) } 
        );

        if (tokenAccounts.value.length > 0) {
            const usdcAccount = tokenAccounts.value[0];
            return parseFloat(usdcAccount.account.data.parsed.info.tokenAmount.uiAmount);
        }

        return 0; 
    } catch (error) {
        console.error("Error fetching USDC balance:", error);
        throw error;
    }
}

export async function buySolana(amountInDollars: number): Promise<void> {
    console.log(`${getTimestamp()} | 💸 Attempting to buy SOL...`);

    try {
        isWaitingForTransaction = true;
        const solBefore = await getSolBalance();
        console.log(`${getTimestamp()} | SOL Balance Before: ${solBefore.toFixed(6)}`);

        await TradeToken(
            RPC_PROVIDER,
            botAccount,
            amountInDollars / 1000,
            USDC_MINT_ADDRESS,
            POOL_ADDRESS,
            9,
            CurrencyType.SOL,
            TradeSide.Sell 
        );

        console.log(`${getTimestamp()} | ⏳ Waiting for transaction confirmation...`);
        await delay(5000);

        const solAfter = await getSolBalance();
        solBoughtAmount = solAfter - solBefore;

        if (solBoughtAmount > 0) {
            console.log(`${getTimestamp()} | ✅ Successfully bought ${solBoughtAmount.toFixed(6)} SOL!`);
            console.log(`${getTimestamp()} | SOL Balance After: ${solAfter.toFixed(6)}`);
        } else {
            console.log(`${getTimestamp()} | ❌ No SOL received!`);
        }
    } catch (error) {
        console.error(`${getTimestamp()} | ❌ Error buying SOL:`, error);
        throw error;
    } finally {
        isWaitingForTransaction = false; 
    }
}

export let usdcReceived: number | null = null;

export async function sellSolana(): Promise<void> {
    if (solBoughtAmount === null) {
        console.log(`${getTimestamp()} | ❌ No SOL bought yet. Skipping sell.`);
        return;
    }

    console.log(`${getTimestamp()} | 💰 Selling ${solBoughtAmount.toFixed(6)} SOL...`);

    try {
        isWaitingForTransaction = true;
        const usdcBefore = await getUsdcBalance();
        console.log(`${getTimestamp()} | USDC Balance Before: $${usdcBefore.toFixed(2)}`);

        // Execute the sell transaction
        await TradeToken(
            RPC_PROVIDER,
            botAccount,
            solBoughtAmount,
            USDC_MINT_ADDRESS,
            POOL_ADDRESS,
            9,
            CurrencyType.SOL,
            TradeSide.Buy
        );
        await delay(5000);

        const usdcAfter = await getUsdcBalance();
        usdcReceived = usdcAfter - usdcBefore;

        if (usdcReceived > 0) {
            console.log(`${getTimestamp()} | ✅ Successfully sold ${solBoughtAmount.toFixed(6)} SOL for $${usdcReceived.toFixed(2)} USDC!`);
            console.log(`${getTimestamp()} | USDC Balance After: $${usdcAfter.toFixed(2)}`);
        } else {
            console.log(`${getTimestamp()} | ❌ No USDC received!`);
        }

        solBoughtAmount = null;
    } catch (error) {
        console.error(`${getTimestamp()} | ❌ Error selling SOL:`, error);
        throw error;
    } finally {
        isWaitingForTransaction = false;
    }
}

