import { listenToSolPrice, getSolanaGasFee, fakePriceSol } from './priceFetcher';
import { AMOUNT, TAKE_PROFIT, STOP_LOSS, TIMEFRAME } from '../config';
import { buySolana, sellSolana, getSolBalance, getUsdcBalance, isWaitingForTransaction, usdcReceived } from './userTrade';
import { delay } from './raydiumBotClient';
import { trackSolPriceChanges } from './volatilityCompute';


const getTimestamp = (): string => new Date().toLocaleTimeString("en-US", { hour12: false });

let boughtTokens: boolean = false;
export let current_price: number | null = null;
let previous_price: number | null = null;
export let originalBuyPrice: number | null = null;
let totalAmount: number = 0;
let totalNetProfit: number = 0;
let buyAmount:number = AMOUNT
let totalIncrease: number = 0.01
let timeframe = TIMEFRAME

let negativeVolatility: number = 0
let positiveVolatility: number = 0
let isVolatilityUpdated = false


async function buySolanaTrade(): Promise<void> {
    try {
        const pricePerSol = await listenToSolPrice();

        if (!pricePerSol || pricePerSol <= 0 || isNaN(pricePerSol)) {
            return;
        }

        const amountOfSol = buyAmount / pricePerSol;

        if (!amountOfSol || !isFinite(amountOfSol)) {
            return;
        }

        console.log(`${getTimestamp()} | ✅ Buy: $${buyAmount.toFixed(3)}: ${amountOfSol.toFixed(6)} SOL @ $${pricePerSol.toFixed(2)} per SOL`);

        originalBuyPrice = pricePerSol;
        boughtTokens = true;
        totalAmount = 0;
    } catch (error) {
        console.error(`${getTimestamp()} | ❌ Error in buySolanaTrade:`, error);
    }
}



export async function sellSolanaTrade(pricePerSol: number): Promise<void> {
    if (!originalBuyPrice || originalBuyPrice <= 0 || isNaN(originalBuyPrice)) {
        console.log(`${getTimestamp()} | ❌ Invalid original buy price. Cannot sell.`);
        return;
    }

    try {
        const updatedPrice = await listenToSolPrice();
        if (!updatedPrice || updatedPrice <= 0 || isNaN(updatedPrice)) {
            return;
        }

        pricePerSol = updatedPrice;

        const amountOfSol = buyAmount / originalBuyPrice;
        if (!amountOfSol || !isFinite(amountOfSol)) {
            return;
        }

        const profit = (pricePerSol - originalBuyPrice) * amountOfSol;
        const gasFee = await getSolanaGasFee();

        totalNetProfit += profit;
        boughtTokens = false;
        console.log(`${getTimestamp()} | 🚀 Sell: $${(AMOUNT + totalNetProfit).toFixed(2)}: ${amountOfSol.toFixed(3)} SOL @ $${pricePerSol.toFixed(2)} | Profit: $${profit.toFixed(3)} | Gas fees: $${gasFee.toFixed(6)} | Total net profit: $${totalNetProfit.toFixed(3)}`);

        buyAmount = AMOUNT + totalNetProfit;
        originalBuyPrice = null;
        totalAmount = 0;
        isVolatilityUpdated = false;
        await updateMarketVolatility();

    } catch (error) {
        console.error(`${getTimestamp()} | ❌ Error in sellSolanaTrade:`, error);
    }
}


let highestPrice = 0;
let dynamicStopLoss = 0;

function checkSellCondition(priceChange: number, currentPrice: number): void {
    if (boughtTokens) {
        totalAmount += priceChange;

        if (priceChange <= -negativeVolatility) {
            sellSolanaTrade(currentPrice);
            totalAmount = 0;
            highestPrice = 0;
            dynamicStopLoss = 0;
            return;
        }
        if (currentPrice > highestPrice) {
            highestPrice = currentPrice;
            dynamicStopLoss = highestPrice - negativeVolatility;
            // console.log(`New Highest Price: ${highestPrice}, New Stop Loss: ${dynamicStopLoss}`);
        }

        if (currentPrice <= dynamicStopLoss) {
            sellSolanaTrade(currentPrice);
            highestPrice = 0; 
            dynamicStopLoss = 0;
            totalAmount = 0;
        }
    }
}

async function checkBuyCondition(priceChange: number): Promise<void> {
    if ((!boughtTokens && priceChange > 0)) {
        totalIncrease += priceChange;

        if (totalIncrease >= positiveVolatility) {
            await buySolanaTrade();
            totalAmount = 0;
            highestPrice = 0;
            dynamicStopLoss = 0;
            totalIncrease=0
        }
    }
}



async function executeTrade(): Promise<void> {
    while (true) {
        try {
            current_price = await listenToSolPrice();
            // current_price = await fakePriceSol()
        } catch (error) {
            console.log(`${getTimestamp()} | ❌ Could not fetch price. Retrying...`);
            await delay(timeframe * 1000);
            continue;
        }

        if (isWaitingForTransaction) {
            await delay(timeframe * 1000);
            continue;
        }

        if ((previous_price !== null && current_price !== null) && isVolatilityUpdated) {
            const priceChange: number = current_price - previous_price;
            const trendIcon: string = priceChange > 0 ? "📈" : priceChange < 0 ? "📉" : "➖";
            console.log(`${getTimestamp()} | ${trendIcon} Price: $${current_price.toFixed(2)} | Change: $${priceChange.toFixed(2)}`);

            if (boughtTokens) {
                checkSellCondition(priceChange, current_price);
            } else {
                await checkBuyCondition(priceChange);
            }
        }

        previous_price = current_price;

        await delay(timeframe * 1000);
    }
}

async function updateMarketVolatility(): Promise<void> {
    console.log("🔄 Calculating market volatility...");
    const volatility = await trackSolPriceChanges();

    isVolatilityUpdated = true;
    
    positiveVolatility = volatility.positiveVolatility * 1.2;
    negativeVolatility = Math.abs(volatility.negativeVolatility * 1.2);


    console.log(`📊 Updated Volatility: Positive = $${((positiveVolatility * 1.2)).toFixed(4)}, Negative = $-${(negativeVolatility * 1.2).toFixed(4)}`);
}



console.log("Starting USDC-SOL trading bot..");

async function main() {
    try {
        
        await updateMarketVolatility();
        if (!isVolatilityUpdated) {
            return;
        }
        // await buySolanaTrade(); 
        await executeTrade();
    } catch (error) {
        console.error(`${getTimestamp()} | ❌ Unhandled error:`, error);
    }
}

if (require.main === module) {
    main();
}