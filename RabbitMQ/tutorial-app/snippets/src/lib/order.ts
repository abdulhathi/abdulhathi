import { randomUUID } from 'node:crypto';

export type Region = 'us' | 'eu' | 'apac';

export type Order = {
  id: string;
  customer: string;
  region: Region;
  items: { sku: string; qty: number }[];
  total: number;
};

export const REGIONS: Region[] = ['us', 'eu', 'apac'];
const CUSTOMERS = ['ada@example.com', 'grace@example.com', 'linus@example.com', 'margaret@example.com'];
const SKUS = ['KB-101', 'MS-220', 'HD-330', 'CB-440', 'ST-550'];

export function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// A random but realistic order. Pass overrides to pin any field.
export function fakeOrder(overrides: Partial<Order> = {}): Order {
  const items = Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => ({
    sku: pick(SKUS),
    qty: 1 + Math.floor(Math.random() * 3),
  }));
  return {
    id: `ord_${randomUUID().slice(0, 8)}`,
    customer: pick(CUSTOMERS),
    region: pick(REGIONS),
    items,
    total: Number(items.reduce((sum, i) => sum + i.qty * 24.5, 0).toFixed(2)),
    ...overrides,
  };
}
