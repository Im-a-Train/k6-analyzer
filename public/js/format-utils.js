export function formatTimeLabel(timestampMs) {
  const date = new Date(timestampMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatBytes(bytes) {
  if (bytes === 0 || bytes === '-' || bytes === null || bytes === undefined) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatNumberCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Math.round(value).toLocaleString();
}

export function formatDurationCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${Math.round(value)} ms`;
}

export function truncateMiddle(value, maxLength = 52) {
  if (!value || value.length <= maxLength) return value;
  const keep = Math.max(8, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function truncateFromFront(value, maxLength = 52) {
  if (!value || value.length <= maxLength) return value;
  const keep = Math.max(8, maxLength - 3);
  return `...${value.slice(-keep)}`;
}
