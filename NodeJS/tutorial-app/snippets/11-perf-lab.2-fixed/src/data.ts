export type Order = { id: number; customer: string; product: string; quantity: number; price: number };

// A small seeded random number generator (mulberry32), so every run sees the same orders.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeOrders(count: number, seed = 42): Order[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, id) => ({
    id,
    customer: `customer-${Math.floor(random() * (count / 4))}`,
    product: `product-${Math.floor(random() * 300)}`,
    quantity: 1 + Math.floor(random() * 5),
    price: Math.round(random() * 10_000) / 100,
  }));
}
