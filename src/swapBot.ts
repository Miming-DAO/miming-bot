        import { listenToSolPrice, getSolanaGasFee, fakePriceSol } from './priceFetcher';
        import { AMOUNT, TAKE_PROFIT, STOP_LOSS, TIMEFRAME } from '../config';
        import { buySolana, sellSolana, getSolBalance, getUsdcBalance, isWaitingForTransaction, usdcReceived } from './userTrade';
        import { delay } from './raydiumBotClient';
        import { trackSolPriceChanges } from './volatilityCompute';
        import { getSMA } from './smaCalculate';


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

        const maxPriceHistory = 30;
        export let prices: number[] = [];
        
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

            } catch (error) {
                console.error(`${getTimestamp()} | ❌ Error in sellSolanaTrade:`, error);
            }
        }

        let highestPrice = 0;
        let dynamicStopLoss = 0;

        function checkSellCondition(priceChange: number, currentPrice: number, sma9: number, sma30: number): void {
            if (boughtTokens) {
                totalAmount += priceChange;

                if ((priceChange <= -negativeVolatility) && (sma9 <= sma30)) {
                    console.log(`SMA9: $${sma9.toFixed(2)} < SMA30: $${sma30.toFixed(2)}... Selling now`)
                    boughtTokens = false;
                    totalAmount = 0;
                    highestPrice = 0;
                    dynamicStopLoss = 0;
                    sellSolanaTrade(currentPrice);
                }

                if (currentPrice > highestPrice) {
                    highestPrice = currentPrice;
                    dynamicStopLoss = highestPrice - negativeVolatility;
                }

                if (currentPrice <= dynamicStopLoss && sma9 >= sma30) {
                    boughtTokens = false;
                    highestPrice = 0;
                    dynamicStopLoss = 0;
                    totalAmount = 0;
                    console.log(`SMA9: $${sma9.toFixed(2)} < SMA30: $${sma30.toFixed(2)}... Selling now`)
                    sellSolanaTrade(currentPrice);
                }
            }
        }

        async function checkBuyCondition(priceChange: number, sma9: number, sma30: number): Promise<void> {
            if (!boughtTokens && priceChange >= positiveVolatility && sma9 >= sma30) {
                console.log(`SMA9: $${sma9.toFixed(2)} > SMA30: $${sma30.toFixed(2)}... Buying now`)
                totalIncrease = 0;
                totalAmount = 0;
                highestPrice = 0;
                dynamicStopLoss = 0;
                await buySolanaTrade();
            }
        }


        async function executeTrade(): Promise<void> {
            while (true) {
                if (prices.length < maxPriceHistory) {                   
                    await delay(TIMEFRAME * 1000);
                    continue;
                }
        
                if (!isVolatilityUpdated) {
                    await updateMarketVolatility();
                    isVolatilityUpdated = true; 
                }
        
                const latestPrice = prices[prices.length - 1];
                const previousPrice = prices.length > 1 ? prices[prices.length - 2] : latestPrice;
                const priceChange = latestPrice - previousPrice;
                const trendIcon = priceChange > 0 ? "📈" : priceChange < 0 ? "📉" : "➖";
                const { sma9, sma30 } = getSMA();
        
                console.log(`${getTimestamp()} | ${trendIcon} Price: $${latestPrice.toFixed(2)} | Change: $${priceChange.toFixed(2)} | SMA9: ${(sma9)?.toFixed(2)} | SMA30: ${(sma30)?.toFixed(2)}`);
        
                if (boughtTokens) {
                    checkSellCondition(priceChange, latestPrice, sma9, sma30);

                    if (!boughtTokens) {
                        // await updateMarketVolatility();
                    }
                } else {
                    await checkBuyCondition(priceChange, sma9, sma30);
                }
        
                await delay(TIMEFRAME * 2 * 1000);
            }
        }
        
        async function updateMarketVolatility(): Promise<void> {   
            const volatility = await trackSolPriceChanges();
            isVolatilityUpdated = true;
        
            positiveVolatility = volatility.positiveVolatility * 1.2;
            negativeVolatility = Math.abs(volatility.negativeVolatility * 1.2);

            const { sma9, sma30 } = getSMA();
        
            console.log(`${getTimestamp()} | 📊 Calculated Volatility and SMA: Positive = $${positiveVolatility.toFixed(4)}, Negative = $-${negativeVolatility.toFixed(4)} | SMA9: $${sma9?.toFixed(2) || "N/A"}, SMA30: $${sma30?.toFixed(2) || "N/A"}`);
        }

        async function fetchSolPriceLoop(): Promise<void> {
            while (true) {
                try {
                    const newPrice = await listenToSolPrice();
                    if (newPrice !== null && newPrice > 0) {
                        current_price = newPrice;
                        prices.push(newPrice);

                        if (prices.length > maxPriceHistory) {
                            prices.shift(); 
                        }  
                        if (prices.length < maxPriceHistory) {
                            console.clear();
                            console.log(`${getTimestamp()} | ⏳ Waiting for price data... (${prices.length}/30 collected) | Current price: ${prices[prices.length - 1]}`);
                        }
                    }
                } catch (error) {
                    console.error(`${getTimestamp()} | ❌ Error fetching price:`, error);
                }
                await delay(TIMEFRAME * 1000);
            }
        }        
             
        console.log("Starting USDC-SOL trading bot..");

        async function main() {
            try {
                console.log(`${getTimestamp()} | 🚀 Starting price fetching loop...`);
                fetchSolPriceLoop(); 

                console.log(`${getTimestamp()} | 🚀 Starting trade execution...`);
                await executeTrade(); 
                
            } catch (error) {
                console.error(`${getTimestamp()} | ❌ Unhandled error:`, error);
            }
        }

        if (require.main === module) {
            main();
        }