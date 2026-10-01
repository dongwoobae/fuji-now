// 2026-10-01 과거 예보 API에서 jma_msm의 2018-08-01 값이 나오는 것을 확인했다. 그보다 이른 날짜는 확인하지 않았다.
export const BACKFILL_FROM = "2018-08-01";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// 일본 날짜로 어제. 오늘은 아직 끝나지 않았고 매시 기록이 채운다.
export function jstYesterday(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
}

// 요청 하나가 너무 커지지 않게 달력 달 단위로 자른다. 양 끝을 포함한다.
export function monthRanges(from: string, to: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (cursor <= last) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const end = monthEnd < last ? monthEnd : last;
    ranges.push({ start: cursor.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return ranges;
}
