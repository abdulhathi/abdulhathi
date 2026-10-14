import path from 'node:path';

export type Order = { id: number; customerId: number; subtotal: number };
export type Customer = { id: number; name: string; country: string };
export type Country = { code: string; vatRate: number };

export const FIXTURES = path.join(import.meta.dirname, '..', '..', 'fixtures');

export function receipt(order: Order, customer: Customer, country: Country): string {
  const total = order.subtotal * (1 + country.vatRate);
  return `Order ${order.id} for ${customer.name}: €${total.toFixed(2)} incl. VAT`;
}
