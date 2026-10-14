export type PartOfDay = 'night' | 'morning' | 'afternoon' | 'evening';

export function partOfDay(date: Date): PartOfDay {
  const hour = date.getHours();
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function greet(name: string, date = new Date()): string {
  return `Good ${partOfDay(date)}, ${name}!`;
}
