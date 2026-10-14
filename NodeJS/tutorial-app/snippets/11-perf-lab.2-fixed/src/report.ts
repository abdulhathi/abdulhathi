import type { Order } from './data.ts';

export type Report = { orders: number; customers: number; revenue: number; topProducts: [string, number][] };

export function uniqueCustomers(orders: Order[]): string[] {
  // A Set checks membership in constant time; includes() scanned the whole array each time.
  return [...new Set(orders.map((order) => order.customer))];
}

export function revenueByProduct(orders: Order[]): Record<string, number> {
  // Update one object in place instead of copying every key on every order.
  const totals: Record<string, number> = {};
  for (const order of orders) {
    totals[order.product] = (totals[order.product] ?? 0) + order.quantity * order.price;
  }
  return totals;
}

export function buildReport(orders: Order[]): Report {
  const totals = revenueByProduct(orders);
  const topProducts = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([product, revenue]): [string, number] => [product, Math.round(revenue)]);

  return {
    orders: orders.length,
    customers: uniqueCustomers(orders).length,
    revenue: Math.round(Object.values(totals).reduce((sum, revenue) => sum + revenue, 0)),
    topProducts,
  };
}
