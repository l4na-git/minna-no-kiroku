import { expect, it } from 'vitest';
import { currentDate } from './time';

it('出来事の日付の初期値は運用タイムゾーンの暦日にする', () => {
  const instant = new Date('2026-10-05T15:30:00Z');
  expect(currentDate(instant, 'Asia/Tokyo')).toBe('2026-10-06');
  expect(currentDate(instant, 'UTC')).toBe('2026-10-05');
});
