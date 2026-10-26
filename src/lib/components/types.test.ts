import { describe, expect, it } from 'vitest';
import { colorFor, dateLabel, monthLabel, periodLabel, shiftMonth, timestampLabel } from './types';

describe('画面の表示用変換', () => {
  it('月の移動は年をまたぎ、月末に依存しない', () => {
    expect(shiftMonth('2026-01', -3)).toBe('2025-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-03')).toBe('2026年3月');
  });
  it('日付と時間帯を表示する', () => {
    expect(dateLabel('2026-01-09')).toBe('2026年1月9日');
    expect(periodLabel('morning')).toBe('朝');
    expect(periodLabel(null)).toBe('');
  });
  it('記録した日時は指定したタイムゾーンで表示する', () => {
    expect(timestampLabel(Date.UTC(2026, 0, 1, 16, 30), 'Asia/Tokyo')).toContain('2026年1月2日');
  });
  it('色は並び順を6色で繰り返す', () => {
    expect(colorFor(0)).toBe('#5b9cc0');
    expect(colorFor(6)).toBe(colorFor(0));
  });
});
