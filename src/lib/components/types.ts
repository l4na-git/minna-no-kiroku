export type EventPeriod = 'morning' | 'afternoon' | 'evening' | 'night' | null;

export type Category = { id: string; name: string; sortOrder: number };
export type EntryValues = { body: string; eventDate: string; eventPeriod: string | null; categoryId: string; version: string };
export type User = { id: string; displayName: string; email: string; color: number };
export type Entry = {
  id: string;
  eventDate: string;
  eventPeriod: EventPeriod;
  categoryId: string;
  categoryName: string;
  categoryOrder: number;
  body: string;
  authorId: string;
  authorName: string;
  authorColor: number;
  createdAt: number;
  editedAt: number | null;
};

export const palette = ['#5b9cc0', '#d8876b', '#d3a252', '#8f9db1', '#bb7d8c', '#8f816e'];
export const colorFor = (index: number) => palette[((index % palette.length) + palette.length) % palette.length];
export const periodLabel = (period: EventPeriod) => period ? ({ morning: '朝', afternoon: '昼', evening: '夕方', night: '夜' })[period] : '';
export const timestampLabel = (value: number, timeZone = 'Asia/Tokyo') => new Intl.DateTimeFormat('ja-JP', { timeZone, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
export const dateLabel = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
};
export const monthLabel = (month: string) => `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
export function shiftMonth(month: string, shift: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + shift, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
