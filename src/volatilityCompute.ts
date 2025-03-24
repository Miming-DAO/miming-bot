import { listenToSolPrice } from './priceFetcher';

let numberOfPrices = 10;

export async function trackSolPriceChanges() {
    const prices: number[] = [];
    const changes: { positive: number[]; negative: number[] } = { positive: [], negative: [] };

    for (let i = 0; i < numberOfPrices; i++) {
        const price = await listenToSolPrice();

        if (!price || price <= 0 || isNaN(price)) {
            console.warn(`⚠️ Skipping invalid price received: ${price}`);
            continue;
        }

        if (prices.length > 0) {
            const change = price - prices[prices.length - 1];

            if (change > 0) {
                changes.positive.push(change);
            } else if (change < 0) {
                changes.negative.push(change);
            }
        }

        prices.push(price);
    }

    const positiveVolatility = changes.positive.length > 0
        ? changes.positive.reduce((a, b) => a + b, 0) / changes.positive.length
        : 0;

    const negativeVolatility = changes.negative.length > 0
        ? changes.negative.reduce((a, b) => a + b, 0) / changes.negative.length
        : 0;

    return { positiveVolatility, negativeVolatility };
}
