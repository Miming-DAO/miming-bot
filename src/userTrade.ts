import { TradeToken, TradeSide, CurrencyType } from "./raydiumBotClient";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();


const RPC_PROVIDER = process.env.RPC_PROVIDER ?? "";
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const POOL_ADDRESS = process.env.POOL_ADDRESS ?? ""; 
const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";   // SOL

if (!PRIVATE_KEY || !RPC_PROVIDER || !POOL_ADDRESS) {
    console.error("❌ Missing environment variables! Check your .env file.");
    process.exit(1);
}

const connection = new Connection(RPC_PROVIDER, "confirmed");
const botAccount = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

/**
 * =
 */
async function fetchPoolAddress(): Promise<string | null> {
    // console.log(`✅ Using hardcoded pool address: ${POOL_ADDRESS}`);
    return POOL_ADDRESS;
}

/**
 * Fetches the SOL balance of the bot's account.
 */
export async function getSolBalance(): Promise<number> {
    try {
        const balance = await connection.getBalance(botAccount.publicKey);
        return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
        console.error("❌ Error fetching SOL balance:", error);
        return 0;
    }
}

/**
 * Fetches the USDC balance of the bot's account.
 */
export async function getUsdcBalance(): Promise<number> {
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            botAccount.publicKey,
            { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") } // Token Program ID
        );

        for (const account of tokenAccounts.value) {
            const mintAddress = account.account.data.parsed.info.mint;
            if (mintAddress === USDC_MINT_ADDRESS) {
                return parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount);
            }
        }

        console.warn("⚠️ No USDC account found for this wallet.");
        return 0;
    } catch (error) {
        console.error("❌ Error fetching USDC balance:", error);
        return 0;
    }
}

/**
 * Uses USDC to buy SOL.
 * @param {number} amount - Amount of SOL to buy
 */
export async function buySolana(amount: number): Promise<void> {
    if (!amount || amount <= 0) {
        console.error("❌ Invalid trade amount:", amount);
        return;
    }

    // Get hardcoded USDC/SOL pool address
    const poolAddress = await fetchPoolAddress();
    if (!poolAddress) {
        console.error("❌ Could not fetch USDC/SOL pool address.");
        return;
    }

    // Check USDC balance
    const usdcBalance = await getUsdcBalance();
    if (usdcBalance < amount) {
        console.error(`❌ Insufficient USDC balance! Available: ${usdcBalance}, Required: ${amount}`);
        return;
    }

    try {
        await TradeToken(
            RPC_PROVIDER,
            botAccount,
            amount,               // Amount in USDC
            SOL_MINT_ADDRESS,      // Buy SOL
            poolAddress,           // Hardcoded pool address
            9,                     // USDC decimals
            CurrencyType.USDC,      // Corrected CurrencyType
            TradeSide.Buy           // Buy trade
        );
        console.log(`✅ Successfully bought ${amount} USDC worth of SOL.`);
    } catch (error) {
        console.error("❌ Error buying SOL:", error);
    }
}

/**
 * Sells SOL for USDC.
 * @param {number} amount - Amount of SOL to sell
 */
export async function sellSolana(amount: number): Promise<void> {
    if (!amount || amount <= 0) {
        console.error("❌ Invalid trade amount:", amount);
        return;
    }

    // Get hardcoded USDC/SOL pool address
    const poolAddress = await fetchPoolAddress();
    if (!poolAddress) {
        console.error("❌ Could not fetch USDC/SOL pool address.");
        return;
    }

    // Check SOL balance
    const solBalance = await getSolBalance();
    if (solBalance < amount) {
        console.error(`❌ Insufficient SOL balance! Available: ${solBalance}, Required: ${amount}`);
        return;
    }

    try {
        await TradeToken(
            RPC_PROVIDER,
            botAccount,
            amount,              // Amount in SOL
            USDC_MINT_ADDRESS,   // Sell SOL, receive USDC
            poolAddress,         // Hardcoded pool address
            9,                   // SOL decimals
            CurrencyType.SOL,    // Using SOL
            TradeSide.Sell       // Sell trade
        );
        console.log(`✅ Successfully sold ${amount} SOL for USDC.`);
    } catch (error) {
        console.error("❌ Error selling SOL:", error);
    }
}
