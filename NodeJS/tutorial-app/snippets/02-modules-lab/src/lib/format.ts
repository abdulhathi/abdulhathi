// A default export: at most one per module. The importer picks the name.
export default function formatPrice(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}
