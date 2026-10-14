export const PI = 3.14159;
export function area(r: number): number {
  return PI * r * r;
}
export type Shape = { kind: 'circle'; r: number };
export default function describe(shape: Shape): string {
  return `${shape.kind} with area ${area(shape.r).toFixed(1)}`;
}
