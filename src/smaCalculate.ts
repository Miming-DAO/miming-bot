import { prices } from "./swapBot";

export function getSMA(): { sma9: number; sma30: number } {
    function calculateSMA(period: number): number {
        if (prices.length < period) return 0; 
        const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    return {
        sma9: calculateSMA(9),
        sma30: calculateSMA(30),
    };
}
