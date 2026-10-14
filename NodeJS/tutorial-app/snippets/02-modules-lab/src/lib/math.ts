// Named exports: a module can export as many as it likes.
export const PI = 3.14159;

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

// Not exported, so private to this file.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function circleArea(radius: number): number {
  return round2(PI * radius * radius);
}
