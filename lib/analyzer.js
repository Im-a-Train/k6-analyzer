const fs = require('fs');
const readline = require('readline');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX_SEGMENT_RE = /(\/)[0-9a-f]{24,}(\/|$)/gi;
const NUMERIC_SEGMENT_RE = /(\/)\d+(\/|$)/g;

function createEmptyMetrics() {
  return {
    samples: 0,
    passes: 0,
    failures: 0,
    iterationDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
    httpReqDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
    httpReqs: 0,
    dataReceived: 0,
    dataSent: 0,
    wsSessions: 0,
    wsMsgsSent: 0,
    wsMsgsReceived: 0,
    checks: { passed: 0, failed: 0 },
    vus: { min: 0, max: 0, value: 0 },
    testDuration: 0
  };
}

function applyMetricPoint(metrics, metric, value) {
  const numericValue = Number(value) || 0;

  if (metric === 'http_reqs') metrics.httpReqs += numericValue;
  if (metric === 'data_received') metrics.dataReceived += numericValue;
  if (metric === 'data_sent') metrics.dataSent += numericValue;
  if (metric === 'ws_sessions') metrics.wsSessions += numericValue;
  if (metric === 'ws_msgs_sent') metrics.wsMsgsSent += numericValue;
  if (metric === 'ws_msgs_received') metrics.wsMsgsReceived += numericValue;

  if (metric === 'http_req_duration' && value !== undefined) {
    if (value < metrics.httpReqDuration.min) metrics.httpReqDuration.min = value;
    if (value > metrics.httpReqDuration.max) metrics.httpReqDuration.max = value;
    metrics.httpReqDuration.avg += value;
    metrics.httpReqDuration.count += 1;
  }

  if (metric === 'iteration_duration' && value !== undefined) {
    if (value < metrics.iterationDuration.min) metrics.iterationDuration.min = value;
    if (value > metrics.iterationDuration.max) metrics.iterationDuration.max = value;
    metrics.iterationDuration.avg += value;
    metrics.iterationDuration.count += 1;
  }

  if (metric === 'checks') {
    const checkValue = Number(value);
    metrics.checks.passed += checkValue === 1 ? 1 : 0;
    metrics.checks.failed += checkValue === 0 ? 1 : 0;
  }

  if (metric === 'vus') {
    const numeric = Number(value) || 0;
    metrics.vus.value = numeric;
    metrics.vus.max = Math.max(metrics.vus.max, numeric);
    if (metrics.vus.min === 0) {
      metrics.vus.min = numeric;
    } else {
      metrics.vus.min = Math.min(metrics.vus.min, numeric);
    }
  }
}

function finalizeMetrics(metrics) {
  if (metrics.httpReqDuration.count > 0) {
    metrics.httpReqDuration.avg = metrics.httpReqDuration.avg / metrics.httpReqDuration.count;
  }
  if (metrics.iterationDuration.count > 0) {
    metrics.iterationDuration.avg = metrics.iterationDuration.avg / metrics.iterationDuration.count;
  }

  if (!isFinite(metrics.httpReqDuration.min)) metrics.httpReqDuration.min = 0;
  if (!isFinite(metrics.httpReqDuration.max)) metrics.httpReqDuration.max = 0;
  if (!isFinite(metrics.iterationDuration.min)) metrics.iterationDuration.min = 0;
  if (!isFinite(metrics.iterationDuration.max)) metrics.iterationDuration.max = 0;
}

function analyzeUploadedFile(filePath, options = {}) {
  return analyzeUploadedFileInternal(filePath, {
    maxFullJsonParseBytes: options.maxFullJsonParseBytes || 128 * 1024 * 1024,
    maxDurationSamplesPerEndpoint: options.maxDurationSamplesPerEndpoint || 5000
  });
}

async function analyzeUploadedFileInternal(filePath, options) {
  const streamed = await analyzeNDJSONStream(filePath, options.maxDurationSamplesPerEndpoint);
  if (streamed.parsedLines > 0) {
    return finalizeStreamedAnalysis(streamed);
  }

  const stats = fs.statSync(filePath);
  if (stats.size > options.maxFullJsonParseBytes) {
    throw new Error(
      `File is too large for full JSON parsing (${Math.round(stats.size / 1024 / 1024)} MB). ` +
      'For large files, use k6 NDJSON output (k6 run ... -o json=results.json).'
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  return {
    summary: extractSummary(parsed),
    metrics: extractMetrics(parsed),
    timeseries: extractTimeSeries(parsed),
    endpoints: extractEndpointStats(parsed)
  };
}

function createEmptyStreamAnalysis() {
  return {
    parsedLines: 0,
    invalidLines: 0,
    metricsDefinitionCount: 0,
    hasMetrics: false,
    samples: 0,
    metrics: createEmptyMetrics(),
    timeBuckets: new Map(),
    scenarioBuckets: new Map(),
    endpoints: new Map()
  };
}

function getOrCreateTimeBucket(store, bucket) {
  if (!store.has(bucket)) {
    store.set(bucket, {
      vusSum: 0,
      vusCount: 0,
      requests: 0,
      failedRequests: 0,
      responseTimeSum: 0,
      responseTimeCount: 0,
      iterations: 0,
      wsMsgsSent: 0,
      wsMsgsReceived: 0
    });
  }
  return store.get(bucket);
}

function normalizeEndpointPath(rawEndpoint) {
  if (!rawEndpoint || rawEndpoint === 'Unknown') return rawEndpoint;
  try {
    const parsed = new URL(rawEndpoint);
    return parsed.pathname
      .replace(UUID_RE, '{id}')
      .replace(LONG_HEX_SEGMENT_RE, '$1{id}$2')
      .replace(NUMERIC_SEGMENT_RE, '$1{id}$2');
  } catch {
    return rawEndpoint
      .replace(UUID_RE, '{id}')
      .replace(LONG_HEX_SEGMENT_RE, '$1{id}$2')
      .replace(NUMERIC_SEGMENT_RE, '$1{id}$2');
  }
}

function getEndpointContext(point) {
  const endpointUrl = point.data?.tags?.url;
  const endpointName = point.data?.tags?.name;
  const rawEndpoint = endpointUrl || endpointName || 'Unknown';

  return {
    rawEndpoint,
    normalizedEndpoint: normalizeEndpointPath(rawEndpoint),
    isHttps: String(endpointUrl || endpointName || '').startsWith('https://')
  };
}

function getOrCreateEndpoint(endpoints, endpoint) {
  if (!endpoints.has(endpoint)) {
    endpoints.set(endpoint, {
      name: endpoint,
      count: 0,
      avgDuration: 0,
      minDuration: Infinity,
      maxDuration: -Infinity,
      totalDuration: 0,
      durationSamples: [],
      durationSeen: 0,
      successCount: 0,
      failCount: 0,
      failedStatusCodes: {}
    });
  }
  return endpoints.get(endpoint);
}

function recordEndpointRequestOutcome(endpointEntry, status, requestCount = 1, isHttps = false) {
  endpointEntry.count += requestCount;

  if (Number.isFinite(status) && status >= 400) {
    endpointEntry.failCount += requestCount;

    if (isHttps) {
      const statusKey = String(status);
      endpointEntry.failedStatusCodes[statusKey] = (endpointEntry.failedStatusCodes[statusKey] || 0) + requestCount;
    }

    return;
  }

  endpointEntry.successCount += requestCount;
}

function serializeEndpoint(endpoint) {
  if (endpoint.durationSamples.length > 0) {
    endpoint.avgDuration = endpoint.totalDuration / endpoint.durationSeen;
    const sorted = endpoint.durationSamples.sort((a, b) => a - b);
    endpoint.p50 = calculatePercentile(sorted, 50);
    endpoint.p75 = calculatePercentile(sorted, 75);
    endpoint.p90 = calculatePercentile(sorted, 90);
    endpoint.p95 = calculatePercentile(sorted, 95);
    endpoint.p99 = calculatePercentile(sorted, 99);
  } else {
    endpoint.avgDuration = 0;
    endpoint.p50 = 0;
    endpoint.p75 = 0;
    endpoint.p90 = 0;
    endpoint.p95 = 0;
    endpoint.p99 = 0;
  }

  if (!isFinite(endpoint.minDuration)) endpoint.minDuration = 0;
  if (!isFinite(endpoint.maxDuration)) endpoint.maxDuration = 0;

  endpoint.failedStatusCodes = Object.entries(endpoint.failedStatusCodes || {})
    .map(([statusCode, count]) => ({ statusCode, count }))
    .sort((a, b) => b.count - a.count || Number(a.statusCode) - Number(b.statusCode));

  delete endpoint.durationSamples;
  delete endpoint.totalDuration;
  delete endpoint.durationSeen;

  return endpoint;
}

function addDurationSample(entry, value, maxDurationSamplesPerEndpoint) {
  entry.durationSeen += 1;
  if (entry.durationSamples.length < maxDurationSamplesPerEndpoint) {
    entry.durationSamples.push(value);
    return;
  }

  const replaceIndex = Math.floor(Math.random() * entry.durationSeen);
  if (replaceIndex < maxDurationSamplesPerEndpoint) {
    entry.durationSamples[replaceIndex] = value;
  }
}

function getScenarioName(point) {
  return point?.data?.tags?.scenario || point?.data?.tags?.group || 'Overall';
}

function processPoint(analysis, point, maxDurationSamplesPerEndpoint) {
  const metric = point.metric;
  const value = point.data?.value;

  analysis.samples += 1;
  applyMetricPoint(analysis.metrics, metric, value);

  const timestamp = new Date(point.data?.time).getTime();
  if (timestamp && !isNaN(timestamp)) {
    const bucket = Math.floor(timestamp / 1000) * 1000;
    const scenario = getScenarioName(point);

    const overallBucket = getOrCreateTimeBucket(analysis.timeBuckets, bucket);

    if (!analysis.scenarioBuckets.has(bucket)) {
      analysis.scenarioBuckets.set(bucket, new Map());
    }
    const scenarioMap = analysis.scenarioBuckets.get(bucket);
    const scenarioBucket = getOrCreateTimeBucket(scenarioMap, scenario);

    if (metric === 'vus') {
      const numeric = Number(value) || 0;
      overallBucket.vusSum += numeric;
      overallBucket.vusCount += 1;
      scenarioBucket.vusSum += numeric;
      scenarioBucket.vusCount += 1;
    }
    if (metric === 'http_reqs' || metric === 'http_req_duration') {
      overallBucket.requests += 1;
      scenarioBucket.requests += 1;
    }
    if (metric === 'http_req_duration') {
      const numericDuration = Number(value) || 0;
      overallBucket.responseTimeSum += numericDuration;
      overallBucket.responseTimeCount += 1;
      scenarioBucket.responseTimeSum += numericDuration;
      scenarioBucket.responseTimeCount += 1;
    }
    if (metric === 'http_reqs') {
      const status = Number(point.data?.tags?.status);
      if (Number.isFinite(status) && status >= 400) {
        overallBucket.failedRequests += 1;
        scenarioBucket.failedRequests += 1;
      }
    }
    if (metric === 'iteration_duration') {
      overallBucket.iterations += 1;
      scenarioBucket.iterations += 1;
    }
    if (metric === 'ws_msgs_sent') {
      const numericMessages = Number(value) || 0;
      overallBucket.wsMsgsSent += numericMessages;
      scenarioBucket.wsMsgsSent += numericMessages;
    }
    if (metric === 'ws_msgs_received') {
      const numericMessages = Number(value) || 0;
      overallBucket.wsMsgsReceived += numericMessages;
      scenarioBucket.wsMsgsReceived += numericMessages;
    }
  }

  const endpointContext = getEndpointContext(point);
  if (metric === 'http_req_duration' || metric === 'http_reqs') {
    const endpointEntry = getOrCreateEndpoint(analysis.endpoints, endpointContext.normalizedEndpoint);

    if (metric === 'http_reqs') {
      const status = Number(point.data?.tags?.status);
      recordEndpointRequestOutcome(endpointEntry, status, Number(value) || 1, endpointContext.isHttps);
    }

    if (metric === 'http_req_duration') {
      const duration = Number(value) || 0;
      endpointEntry.totalDuration += duration;
      endpointEntry.minDuration = Math.min(endpointEntry.minDuration, duration);
      endpointEntry.maxDuration = Math.max(endpointEntry.maxDuration, duration);
      addDurationSample(endpointEntry, duration, maxDurationSamplesPerEndpoint);
    }
  }
}

async function analyzeNDJSONStream(filePath, maxDurationSamplesPerEndpoint) {
  const analysis = createEmptyStreamAnalysis();
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const json = JSON.parse(trimmed);
      analysis.parsedLines += 1;

      if (json.type === 'Metric') {
        analysis.hasMetrics = true;
        analysis.metricsDefinitionCount += 1;
      } else if (json.type === 'Point' || json.metric) {
        processPoint(analysis, json, maxDurationSamplesPerEndpoint);
      }
    } catch (e) {
      analysis.invalidLines += 1;
    }
  }

  return analysis;
}

function finalizeStreamedAnalysis(analysis) {
  finalizeMetrics(analysis.metrics);

  const timeseries = {
    vus: { overall: [], byScenario: {} },
    requests: { overall: [], byScenario: {} },
    failedRequests: { overall: [], byScenario: {} },
    responseTimeAvg: { overall: [], byScenario: {} },
    iterations: { overall: [], byScenario: {} },
    wsMsgsSent: { overall: [], byScenario: {} },
    wsMsgsReceived: { overall: [], byScenario: {} }
  };

  const sortedBuckets = Array.from(analysis.timeBuckets.keys()).sort((a, b) => a - b);
  if (sortedBuckets.length >= 2) {
    analysis.metrics.testDuration = sortedBuckets[sortedBuckets.length - 1] - sortedBuckets[0];
  } else {
    analysis.metrics.testDuration = 0;
  }

  sortedBuckets.forEach((bucket) => {
    const bucketData = analysis.timeBuckets.get(bucket);
    const date = new Date(bucket).toISOString().substr(11, 8);
    const vusAverage = bucketData.vusCount > 0 ? bucketData.vusSum / bucketData.vusCount : 0;
    const responseTimeAverage = bucketData.responseTimeCount > 0
      ? bucketData.responseTimeSum / bucketData.responseTimeCount
      : 0;

    timeseries.vus.overall.push({ time: date, timestamp: bucket, value: vusAverage });
    timeseries.requests.overall.push({ time: date, timestamp: bucket, value: bucketData.requests });
    timeseries.failedRequests.overall.push({ time: date, timestamp: bucket, value: bucketData.failedRequests });
    timeseries.responseTimeAvg.overall.push({ time: date, timestamp: bucket, value: responseTimeAverage });
    timeseries.iterations.overall.push({ time: date, timestamp: bucket, value: bucketData.iterations });
    timeseries.wsMsgsSent.overall.push({ time: date, timestamp: bucket, value: bucketData.wsMsgsSent });
    timeseries.wsMsgsReceived.overall.push({ time: date, timestamp: bucket, value: bucketData.wsMsgsReceived });

    const scenarioMap = analysis.scenarioBuckets.get(bucket) || new Map();
    scenarioMap.forEach((scenarioData, scenario) => {
      if (!timeseries.vus.byScenario[scenario]) {
        timeseries.vus.byScenario[scenario] = [];
        timeseries.requests.byScenario[scenario] = [];
        timeseries.failedRequests.byScenario[scenario] = [];
        timeseries.responseTimeAvg.byScenario[scenario] = [];
        timeseries.iterations.byScenario[scenario] = [];
        timeseries.wsMsgsSent.byScenario[scenario] = [];
        timeseries.wsMsgsReceived.byScenario[scenario] = [];
      }

      const scenarioVusAverage = scenarioData.vusCount > 0
        ? scenarioData.vusSum / scenarioData.vusCount
        : 0;
      const scenarioResponseTimeAverage = scenarioData.responseTimeCount > 0
        ? scenarioData.responseTimeSum / scenarioData.responseTimeCount
        : 0;

      timeseries.vus.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioVusAverage });
      timeseries.requests.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioData.requests });
      timeseries.failedRequests.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioData.failedRequests });
      timeseries.responseTimeAvg.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioResponseTimeAverage });
      timeseries.iterations.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioData.iterations });
      timeseries.wsMsgsSent.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioData.wsMsgsSent });
      timeseries.wsMsgsReceived.byScenario[scenario].push({ time: date, timestamp: bucket, value: scenarioData.wsMsgsReceived });
    });
  });

  const endpoints = Array.from(analysis.endpoints.values())
    .map((endpoint) => serializeEndpoint(endpoint))
    .sort((a, b) => b.count - a.count);

  const failedHttpsRequests = endpoints
    .filter((endpoint) => endpoint.failCount > 0 && endpoint.failedStatusCodes.length > 0)
    .sort((a, b) => b.failCount - a.failCount || b.count - a.count)
    .map((endpoint) => ({
      name: endpoint.name,
      failCount: endpoint.failCount,
      failedStatusCodes: endpoint.failedStatusCodes
    }));

  return {
    summary: {
      timestamp: new Date().toISOString(),
      hasMetrics: analysis.hasMetrics,
      hasGroups: false,
      metricsCount: analysis.metricsDefinitionCount,
      parsedLines: analysis.parsedLines,
      invalidLines: analysis.invalidLines,
      samples: analysis.samples
    },
    metrics: analysis.metrics,
    timeseries,
    endpoints: {
      endpoints,
      topEndpoints: endpoints.slice(0, 15),
      failedHttpsRequests
    }
  };
}

function extractTimeSeries(results) {
  const timeseries = {
    vus: { overall: [], byScenario: {} },
    requests: { overall: [], byScenario: {} },
    failedRequests: { overall: [], byScenario: {} },
    responseTimeAvg: { overall: [], byScenario: {} },
    iterations: { overall: [], byScenario: {} },
    wsMsgsSent: { overall: [], byScenario: {} },
    wsMsgsReceived: { overall: [], byScenario: {} }
  };

  if (!Array.isArray(results.points)) {
    return timeseries;
  }

  const timeBuckets = {};
  const scenarioBuckets = {};

  results.points.forEach((point) => {
    const timestamp = new Date(point.data?.time).getTime();
    if (!timestamp || isNaN(timestamp)) return;

    const bucket = Math.floor(timestamp / 1000) * 1000;
    const scenario = getScenarioName(point);

    if (!timeBuckets[bucket]) {
      timeBuckets[bucket] = {
        vusSum: 0,
        vusCount: 0,
        requests: 0,
        failedRequests: 0,
        responseTimeSum: 0,
        responseTimeCount: 0,
        iterations: 0,
        wsMsgsSent: 0,
        wsMsgsReceived: 0
      };
    }

    if (!scenarioBuckets[bucket]) {
      scenarioBuckets[bucket] = {};
    }

    if (!scenarioBuckets[bucket][scenario]) {
      scenarioBuckets[bucket][scenario] = {
        vusSum: 0,
        vusCount: 0,
        requests: 0,
        failedRequests: 0,
        responseTimeSum: 0,
        responseTimeCount: 0,
        iterations: 0,
        wsMsgsSent: 0,
        wsMsgsReceived: 0
      };
    }

    const metric = point.metric;
    const value = point.data?.value || 0;

    if (metric === 'vus') {
      timeBuckets[bucket].vusSum += value;
      timeBuckets[bucket].vusCount += 1;
      scenarioBuckets[bucket][scenario].vusSum += value;
      scenarioBuckets[bucket][scenario].vusCount += 1;
    }
    if (metric === 'http_reqs' || metric === 'http_req_duration') {
      timeBuckets[bucket].requests += 1;
      scenarioBuckets[bucket][scenario].requests += 1;
    }
    if (metric === 'http_req_duration') {
      timeBuckets[bucket].responseTimeSum += value;
      timeBuckets[bucket].responseTimeCount += 1;
      scenarioBuckets[bucket][scenario].responseTimeSum += value;
      scenarioBuckets[bucket][scenario].responseTimeCount += 1;
    }
    if (metric === 'http_reqs') {
      const status = Number(point.data?.tags?.status);
      if (Number.isFinite(status) && status >= 400) {
        timeBuckets[bucket].failedRequests += 1;
        scenarioBuckets[bucket][scenario].failedRequests += 1;
      }
    }
    if (metric === 'iteration_duration') {
      timeBuckets[bucket].iterations += 1;
      scenarioBuckets[bucket][scenario].iterations += 1;
    }
    if (metric === 'ws_msgs_sent') {
      timeBuckets[bucket].wsMsgsSent += value;
      scenarioBuckets[bucket][scenario].wsMsgsSent += value;
    }
    if (metric === 'ws_msgs_received') {
      timeBuckets[bucket].wsMsgsReceived += value;
      scenarioBuckets[bucket][scenario].wsMsgsReceived += value;
    }
  });

  const sortedBuckets = Object.keys(timeBuckets).sort((a, b) => a - b);

  sortedBuckets.forEach((bucket) => {
    const bucketTime = parseInt(bucket, 10);
    const date = new Date(bucketTime).toISOString().substr(11, 8);
    const overallVusAverage = timeBuckets[bucket].vusCount > 0
      ? timeBuckets[bucket].vusSum / timeBuckets[bucket].vusCount
      : 0;
    const overallResponseTimeAverage = timeBuckets[bucket].responseTimeCount > 0
      ? timeBuckets[bucket].responseTimeSum / timeBuckets[bucket].responseTimeCount
      : 0;

    timeseries.vus.overall.push({ time: date, timestamp: bucketTime, value: overallVusAverage });
    timeseries.requests.overall.push({ time: date, timestamp: bucketTime, value: timeBuckets[bucket].requests });
    timeseries.failedRequests.overall.push({ time: date, timestamp: bucketTime, value: timeBuckets[bucket].failedRequests });
    timeseries.responseTimeAvg.overall.push({ time: date, timestamp: bucketTime, value: overallResponseTimeAverage });
    timeseries.iterations.overall.push({ time: date, timestamp: bucketTime, value: timeBuckets[bucket].iterations });
    timeseries.wsMsgsSent.overall.push({ time: date, timestamp: bucketTime, value: timeBuckets[bucket].wsMsgsSent });
    timeseries.wsMsgsReceived.overall.push({ time: date, timestamp: bucketTime, value: timeBuckets[bucket].wsMsgsReceived });

    const bucketScenarios = scenarioBuckets[bucket];
    Object.keys(bucketScenarios).forEach((scenario) => {
      if (!timeseries.vus.byScenario[scenario]) {
        timeseries.vus.byScenario[scenario] = [];
        timeseries.requests.byScenario[scenario] = [];
        timeseries.failedRequests.byScenario[scenario] = [];
        timeseries.responseTimeAvg.byScenario[scenario] = [];
        timeseries.iterations.byScenario[scenario] = [];
        timeseries.wsMsgsSent.byScenario[scenario] = [];
        timeseries.wsMsgsReceived.byScenario[scenario] = [];
      }

      const scenarioVusAverage = bucketScenarios[scenario].vusCount > 0
        ? bucketScenarios[scenario].vusSum / bucketScenarios[scenario].vusCount
        : 0;
      const scenarioResponseTimeAverage = bucketScenarios[scenario].responseTimeCount > 0
        ? bucketScenarios[scenario].responseTimeSum / bucketScenarios[scenario].responseTimeCount
        : 0;

      timeseries.vus.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: scenarioVusAverage });
      timeseries.requests.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: bucketScenarios[scenario].requests });
      timeseries.failedRequests.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: bucketScenarios[scenario].failedRequests });
      timeseries.responseTimeAvg.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: scenarioResponseTimeAverage });
      timeseries.iterations.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: bucketScenarios[scenario].iterations });
      timeseries.wsMsgsSent.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: bucketScenarios[scenario].wsMsgsSent });
      timeseries.wsMsgsReceived.byScenario[scenario].push({ time: date, timestamp: bucketTime, value: bucketScenarios[scenario].wsMsgsReceived });
    });
  });

  return timeseries;
}

function extractEndpointStats(results) {
  const endpoints = {};

  if (!Array.isArray(results.points)) {
    return { endpoints: [], timeseriesData: {} };
  }

  results.points.forEach((point) => {
    const metric = point.metric;
    const endpointContext = getEndpointContext(point);
    const endpoint = endpointContext.normalizedEndpoint;

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
          failCount: 0,
          failedStatusCodes: {}
        };
      }

      if (metric === 'http_reqs') {
        const status = Number(point.data?.tags?.status);
        recordEndpointRequestOutcome(
          endpoints[endpoint],
          status,
          Number(point.data?.value) || 1,
          endpointContext.isHttps
        );
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

  Object.values(endpoints).forEach((endpoint) => {
    endpoint.durationSamples = endpoint.durations;
    endpoint.durationSeen = endpoint.durations.length;
    delete endpoint.durations;
    serializeEndpoint(endpoint);
  });

  const sortedEndpoints = Object.values(endpoints).sort((a, b) => b.count - a.count);
  const failedHttpsRequests = sortedEndpoints
    .filter((endpoint) => endpoint.failCount > 0 && endpoint.failedStatusCodes.length > 0)
    .sort((a, b) => b.failCount - a.failCount || b.count - a.count)
    .map((endpoint) => ({
      name: endpoint.name,
      failCount: endpoint.failCount,
      failedStatusCodes: endpoint.failedStatusCodes
    }));

  return {
    endpoints: sortedEndpoints,
    topEndpoints: sortedEndpoints.slice(0, 15),
    failedHttpsRequests
  };
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

function extractMetrics(results) {
  const metrics = createEmptyMetrics();

  if (Array.isArray(results.points)) {
    let minTs = Infinity;
    let maxTs = -Infinity;

    results.points.forEach((point) => {
      applyMetricPoint(metrics, point.metric, point.data?.value);
      const ts = new Date(point.data?.time).getTime();
      if (ts && !isNaN(ts)) {
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
      }
    });

    metrics.testDuration = Number.isFinite(minTs) && Number.isFinite(maxTs) ? maxTs - minTs : 0;
    finalizeMetrics(metrics);
  } else if (results.metrics) {
    Object.entries(results.metrics).forEach(([key, value]) => {
      if (key.includes('duration')) {
        if (value.data && value.data.values) {
          const values = Object.values(value.data.values);
          metrics.httpReqDuration = {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length
          };
        }
      }
      if (key === 'http_reqs' && value.data) {
        metrics.httpReqs = value.data.value || 0;
      }
      if (key === 'data_received' && value.data) {
        metrics.dataReceived = value.data.value || 0;
      }
      if (key === 'data_sent' && value.data) {
        metrics.dataSent = value.data.value || 0;
      }
      if (key === 'ws_sessions' && value.data) {
        metrics.wsSessions = value.data.value || 0;
      }
      if (key === 'ws_msgs_sent' && value.data) {
        metrics.wsMsgsSent = value.data.value || 0;
      }
      if (key === 'ws_msgs_received' && value.data) {
        metrics.wsMsgsReceived = value.data.value || 0;
      }
      if (key === 'checks' && value.data) {
        metrics.checks = {
          passed: value.data.passed || 0,
          failed: value.data.failed || 0
        };
      }
      if (key === 'iteration_duration' && value.data && value.data.values) {
        const values = Object.values(value.data.values);
        metrics.iterationDuration = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length
        };
      }
    });
  }

  return metrics;
}

function extractSummary(results) {
  return {
    timestamp: new Date().toISOString(),
    hasMetrics: !!results.metrics,
    hasGroups: !!results.groups,
    metricsCount: results.metrics ? Object.keys(results.metrics).length : 0
  };
}

module.exports = {
  analyzeUploadedFile
};
