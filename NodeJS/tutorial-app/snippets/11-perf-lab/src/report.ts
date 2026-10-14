import type { Order } from './data.ts';

export type Report = { orders: number; customers: number; revenue: number; topProducts: [string, number][] };

export function uniqueCustomers(orders: Order[]): string[] {
  const seen: string[] = [];
  for (const order of orders) {
    if (!seen.includes(order.customer)) seen.push(order.customer);
  }
  return seen;
}

export function revenueByProduct(orders: Order[]): Record<string, number> {
  return orders.reduce<Record<string, number>>(
    (totals, order) => ({
      ...totals,
      [order.product]: (totals[order.product] ?? 0) + order.quantity * order.price,
    }),
    {},
  );
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
