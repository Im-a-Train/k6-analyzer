export function parseGranularityParts(value) {
  if (!value) return null;
  const match = String(value)
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(ms|msec|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const rawUnit = match[2];
  let unit = rawUnit;
  if (['msec', 'millisecond', 'milliseconds'].includes(rawUnit)) unit = 'ms';
  if (['sec', 'secs', 'second', 'seconds'].includes(rawUnit)) unit = 's';
  if (['min', 'mins', 'minute', 'minutes'].includes(rawUnit)) unit = 'm';
  if (['hr', 'hrs', 'hour', 'hours'].includes(rawUnit)) unit = 'h';

  return { amount, unit };
}

export function normalizeGranularity(value) {
  const parsed = parseGranularityParts(value);
  return `${parsed.amount}${parsed.unit}`;
}

export function parseGranularityToMs(value) {
  const parsed = parseGranularityParts(value);
  if (!parsed) return null;

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000
  };

  return parsed.amount * multipliers[parsed.unit];
}
