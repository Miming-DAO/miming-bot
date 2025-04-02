import { prices } from "./swapBot"; 

export async function trackSolPriceChanges() {
    if (prices.length < 30) {
        console.warn(`⚠️ Not enough data for volatility calculation. (${prices.length}/30 prices stored)`);
        return { positiveVolatility: 0, negativeVolatility: 0 };
    }

    const changes: { positive: number[]; negative: number[] } = { positive: [], negative: [] };

    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];

        if (change > 0) {
            changes.positive.push(change);
        } else if (change < 0) {
            changes.negative.push(change);
        }
    }

    const positiveVolatility = changes.positive.length > 0
        ? changes.positive.reduce((a, b) => a + b, 0) / changes.positive.length
        : 0;

    const negativeVolatility = changes.negative.length > 0
        ? changes.negative.reduce((a, b) => a + b, 0) / changes.negative.length
        : 0;

    return { positiveVolatility, negativeVolatility };
}
