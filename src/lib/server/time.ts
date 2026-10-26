/** 出来事の日付と表示日時は、設置先のタイムゾーンで扱う。 */
export function timeZone(): string {
  const zone = process.env.TZ || 'Asia/Tokyo';
  // 不正な設定は日付を誤って保存するよりも明示的に失敗させる。
  new Intl.DateTimeFormat('ja-JP', { timeZone: zone });
  return zone;
}

export function currentDate(now = new Date(), zone = timeZone()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const field = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
