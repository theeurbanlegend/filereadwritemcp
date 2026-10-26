export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [2592000, 'month'],
    [31536000, 'year'],
  ];
  let unit = 'minute';
  let size = 60;
  for (const [s, u] of units) if (diff >= s) [size, unit] = [s, u];
  const n = Math.round(diff / size);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
