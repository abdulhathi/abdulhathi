/** Reads ?n= from a request URL. Returns null unless it is a whole number from 0 to 45. */
export function readN(url: URL): number | null {
  const n = Number(url.searchParams.get('n') ?? '40');
  return Number.isInteger(n) && n >= 0 && n <= 45 ? n : null;
}
