const fs = require('fs');

// Simulate parseNDJSON and extractEndpointStats
function parseNDJSON(lines) {
  const data = {
    metrics: {},
    points: []
  };

  lines.forEach(line => {
    if (line.trim() === '') return;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'Metric') {
        data.metrics[obj.metric] = obj.data;
      } else if (obj.type === 'Point') {
        data.points.push(obj);
      }
    } catch (e) {
      console.error('Error parsing line:', e.message);
    }
  });

  return data;
}

function calculatePercentile(sortedArray, percentile) {
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sortedArray[lower];
  }

  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

function extractEndpointStats(results) {
  const endpoints = {};

  if (!Array.isArray(results.points)) {
    return { endpoints: [], topEndpoints: [] };
  }

  results.points.forEach(point => {
    const metric = point.metric;
    const endpoint = point.data?.tags?.name || point.data?.tags?.url || 'Unknown';

    if (metric === 'http_req_duration' || metric === 'http_reqs') {
      if (!endpoints[endpoint]) {
        endpoints[endpoint] = {
          name: endpoint,
          count: 0,
          avgDuration: 0,
          minDuration: Infinity,
          maxDuration: -Infinity,
          totalDuration: 0,
          durations: [],
          successCount: 0,
          failCount: 0
        };
      }

      if (metric === 'http_reqs') {
        endpoints[endpoint].count += point.data?.value || 1;
        const status = point.data?.tags?.status;
        if (status && status >= 400) {
          endpoints[endpoint].failCount++;
        } else {
          endpoints[endpoint].successCount++;
        }
      }

      if (metric === 'http_req_duration') {
        const value = point.data?.value || 0;
        endpoints[endpoint].durations.push(value);
        endpoints[endpoint].totalDuration += value;
        if (value < endpoints[endpoint].minDuration) {
          endpoints[endpoint].minDuration = value;
        }
        if (value > endpoints[endpoint].maxDuration) {
          endpoints[endpoint].maxDuration = value;
        }
      }
    }
  });

  // Calculate averages and percentiles
  Object.values(endpoints).forEach(endpoint => {
    if (endpoint.durations.length > 0) {
      endpoint.avgDuration = endpoint.totalDuration / endpoint.durations.length;
      
      // Sort durations for percentile calculation
      const sorted = endpoint.durations.sort((a, b) => a - b);
      
      // Calculate percentiles
      endpoint.p50 = calculatePercentile(sorted, 50);
      endpoint.p75 = calculatePercentile(sorted, 75);
      endpoint.p90 = calculatePercentile(sorted, 90);
      endpoint.p95 = calculatePercentile(sorted, 95);
      endpoint.p99 = calculatePercentile(sorted, 99);
    }
    if (!isFinite(endpoint.minDuration)) {
      endpoint.minDuration = 0;
    }
    if (!isFinite(endpoint.maxDuration)) {
      endpoint.maxDuration = 0;
    }
    delete endpoint.durations;
    delete endpoint.totalDuration;
  });

  // Sort by count descending
  const sortedEndpoints = Object.values(endpoints).sort((a, b) => b.count - a.count);

  return {
    endpoints: sortedEndpoints,
    topEndpoints: sortedEndpoints.slice(0, 15)
  };
}

// Test with test.json
const fileContent = fs.readFileSync('test.json', 'utf-8');
const lines = fileContent.split('\n');
const parsed = parseNDJSON(lines);
const stats = extractEndpointStats(parsed);

console.log('Total endpoints found:', stats.endpoints.length);
console.log('Top endpoints:', stats.topEndpoints.length);
console.log('\nFirst 5 endpoints with percentiles:');
stats.topEndpoints.slice(0, 5).forEach((ep, i) => {
  console.log(`\n${i + 1}. ${ep.name}`);
  console.log(`   Requests: ${ep.count}`);
  console.log(`   Avg Duration: ${ep.avgDuration ? ep.avgDuration.toFixed(2) : 0} ms`);
  console.log(`   p50: ${ep.p50 ? ep.p50.toFixed(2) : 0} ms`);
  console.log(`   p75: ${ep.p75 ? ep.p75.toFixed(2) : 0} ms`);
  console.log(`   p90: ${ep.p90 ? ep.p90.toFixed(2) : 0} ms`);
  console.log(`   p95: ${ep.p95 ? ep.p95.toFixed(2) : 0} ms`);
  console.log(`   p99: ${ep.p99 ? ep.p99.toFixed(2) : 0} ms`);
});
