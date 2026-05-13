import { formatTimeLabel } from './format-utils.js';

export function aggregateSeries(points, bucketSizeMs) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const buckets = new Map();
  points.forEach((point) => {
    const timestamp = Number(point.timestamp);
    if (!Number.isFinite(timestamp)) return;

    const bucketStart = Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, { sum: 0, count: 0 });
    }

    const bucket = buckets.get(bucketStart);
    bucket.sum += Number(point.value) || 0;
    bucket.count += 1;
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, bucket]) => ({
      time: formatTimeLabel(timestamp),
      timestamp,
      value: bucket.count > 0 ? bucket.sum / bucket.count : 0
    }));
}

export function aggregateByScenario(byScenario, bucketSizeMs) {
  const aggregated = {};
  Object.entries(byScenario || {}).forEach(([scenario, points]) => {
    aggregated[scenario] = aggregateSeries(points, bucketSizeMs);
  });
  return aggregated;
}

export function getMetricStyle(metricKey, lineIndex = 0) {
  const palette = {
    vus: { borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.12)' },
    requests: { borderColor: '#059669', backgroundColor: 'rgba(5, 150, 105, 0.12)' },
    failedRequests: { borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.1)' },
    iterations: { borderColor: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.1)' },
    responseTimeAvg: { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }
  };

  const base = palette[metricKey] || { borderColor: '#475569', backgroundColor: 'rgba(71, 85, 105, 0.1)' };
  const dashByMetric = {
    failedRequests: [6, 4],
    responseTimeAvg: [2, 2]
  };

  return {
    ...base,
    borderDash: dashByMetric[metricKey] || [],
    pointRadius: lineIndex > 2 ? 0 : 2,
    pointHoverRadius: 4
  };
}

export function createDataset(label, dataValues, metricKey, axis, lineIndex) {
  const style = getMetricStyle(metricKey, lineIndex);
  return {
    label,
    data: dataValues,
    borderColor: style.borderColor,
    backgroundColor: style.backgroundColor,
    borderDash: style.borderDash,
    borderWidth: 2,
    fill: false,
    tension: 0.35,
    pointRadius: style.pointRadius,
    pointHoverRadius: style.pointHoverRadius,
    pointBackgroundColor: style.borderColor,
    yAxisID: axis
  };
}

export function collectSortedTimestampsFromSeries(series) {
  const timestamps = new Set();
  (series || []).forEach((point) => {
    if (Number.isFinite(point.timestamp)) timestamps.add(point.timestamp);
  });
  return Array.from(timestamps).sort((a, b) => a - b);
}

export function collectSortedTimestampsFromByScenario(byScenario) {
  const timestamps = new Set();
  Object.values(byScenario || {}).forEach((points) => {
    (points || []).forEach((point) => {
      if (Number.isFinite(point.timestamp)) timestamps.add(point.timestamp);
    });
  });
  return Array.from(timestamps).sort((a, b) => a - b);
}

export function generateColors(count) {
  const colors = [
    { border: '#0066cc', background: 'rgba(0, 102, 204, 0.1)' },
    { border: '#059669', background: 'rgba(5, 150, 105, 0.1)' },
    { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' },
    { border: '#dc2626', background: 'rgba(220, 38, 38, 0.1)' },
    { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' },
    { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' },
    { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' },
    { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.1)' }
  ];

  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(colors[i % colors.length]);
  }
  return result;
}
