const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const app = express();
let PORT = process.env.PORT || 3000;
const MAX_UPLOAD_GB = Number(process.env.MAX_UPLOAD_GB || 5);
const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_GB * 1024 * 1024 * 1024);
const MAX_FULL_JSON_PARSE_BYTES = Number(process.env.MAX_FULL_JSON_PARSE_MB || 128) * 1024 * 1024;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.static('public'));

// Setup multer for file uploads with increased size limit
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

// Store only aggregated analysis in memory (not full raw results)
let currentAnalysis = null;
const MAX_DURATION_SAMPLES_PER_ENDPOINT = 5000;

// API Routes

// Upload and analyze k6 results with memory-safe processing
app.post('/api/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxGb = (MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)).toFixed(1);
      return res.status(413).json({
        error: `File too large. Maximum upload size is ${maxGb} GB.`,
        code: err.code
      });
    }

    return res.status(400).json({ error: err.message, code: err.code || 'UPLOAD_ERROR' });
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    currentAnalysis = await analyzeUploadedFile(filePath);

    // Clean up uploaded file
    fs.unlink(filePath, () => {});

    res.json({ 
      success: true, 
      message: 'Results analyzed successfully',
      summary: currentAnalysis.summary
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Raw results are intentionally not returned to avoid browser OOM for large files.
app.get('/api/results', (req, res) => {
  res.status(410).json({
    error: 'Raw results endpoint disabled for memory safety. Use /api/metrics, /api/timeseries, and /api/endpoints.'
  });
});

// Get metrics summary
app.get('/api/metrics', (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({ error: 'No results loaded' });
  }

  res.json(currentAnalysis.metrics);
});

// Get time-series data for charts
app.get('/api/timeseries', (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({ error: 'No results loaded' });
  }

  res.json(currentAnalysis.timeseries);
});

// Get endpoint statistics
app.get('/api/endpoints', (req, res) => {
  if (!currentAnalysis) {
    return res.status(404).json({ error: 'No results loaded' });
  }

  res.json(currentAnalysis.endpoints);
});
async function analyzeUploadedFile(filePath) {
  const streamed = await analyzeNDJSONStream(filePath);
  if (streamed.parsedLines > 0) {
    return finalizeStreamedAnalysis(streamed);
  }

  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FULL_JSON_PARSE_BYTES) {
    throw new Error(
      `File is too large for full JSON parsing (${Math.round(stats.size / 1024 / 1024)} MB). ` +
      'For large files, use k6 NDJSON output (k6 run ... -o json=results.json).'
    );
  }

  // Fallback for non-NDJSON payloads
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
    metrics: {
      samples: 0,
      passes: 0,
      failures: 0,
      iterationDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
      httpReqDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
      httpReqs: 0,
      dataReceived: 0,
      dataSent: 0,
      checks: { passed: 0, failed: 0 },
      vus: { min: 0, max: 0, value: 0 }
    },
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
      iterations: 0
    });
  }
  return store.get(bucket);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX_SEGMENT_RE = /(\/)[0-9a-f]{24,}(\/|$)/gi;
const NUMERIC_SEGMENT_RE = /(\/)\d+(\/|$)/g;

function normalizeEndpointPath(rawEndpoint) {
  if (!rawEndpoint || rawEndpoint === 'Unknown') return rawEndpoint;
  try {
    const parsed = new URL(rawEndpoint);
    // Normalize path only; strip host and query string
    const normalizedPath = parsed.pathname
      .replace(UUID_RE, '{id}')
      .replace(LONG_HEX_SEGMENT_RE, '$1{id}$2')
      .replace(NUMERIC_SEGMENT_RE, '$1{id}$2');
    return normalizedPath;
  } catch {
    // Not a full URL — normalize path-like string
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

function addDurationSample(entry, value) {
  entry.durationSeen += 1;
  if (entry.durationSamples.length < MAX_DURATION_SAMPLES_PER_ENDPOINT) {
    entry.durationSamples.push(value);
    return;
  }

  // Reservoir sampling to cap memory while preserving an unbiased sample.
  const replaceIndex = Math.floor(Math.random() * entry.durationSeen);
  if (replaceIndex < MAX_DURATION_SAMPLES_PER_ENDPOINT) {
    entry.durationSamples[replaceIndex] = value;
  }
}

function getScenarioName(point) {
  return point?.data?.tags?.scenario || point?.data?.tags?.group || 'Overall';
}

function processPoint(analysis, point) {
  const metric = point.metric;
  const value = point.data?.value;

  analysis.samples += 1;

  if (metric === 'http_reqs') analysis.metrics.httpReqs += value || 0;
  if (metric === 'data_received') analysis.metrics.dataReceived += value || 0;
  if (metric === 'data_sent') analysis.metrics.dataSent += value || 0;

  if (metric === 'http_req_duration' && value !== undefined) {
    if (value < analysis.metrics.httpReqDuration.min) analysis.metrics.httpReqDuration.min = value;
    if (value > analysis.metrics.httpReqDuration.max) analysis.metrics.httpReqDuration.max = value;
    analysis.metrics.httpReqDuration.avg += value;
    analysis.metrics.httpReqDuration.count += 1;
  }

  if (metric === 'iteration_duration' && value !== undefined) {
    if (value < analysis.metrics.iterationDuration.min) analysis.metrics.iterationDuration.min = value;
    if (value > analysis.metrics.iterationDuration.max) analysis.metrics.iterationDuration.max = value;
    analysis.metrics.iterationDuration.avg += value;
    analysis.metrics.iterationDuration.count += 1;
  }

  if (metric === 'checks') {
    const checkValue = Number(value);
    analysis.metrics.checks.passed += checkValue === 1 ? 1 : 0;
    analysis.metrics.checks.failed += checkValue === 0 ? 1 : 0;
  }

  if (metric === 'vus') {
    const numeric = Number(value) || 0;
    analysis.metrics.vus.value = numeric;
    analysis.metrics.vus.max = Math.max(analysis.metrics.vus.max, numeric);
    if (analysis.metrics.vus.min === 0) {
      analysis.metrics.vus.min = numeric;
    } else {
      analysis.metrics.vus.min = Math.min(analysis.metrics.vus.min, numeric);
    }
  }

  // Build timeseries aggregations without storing raw points.
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
  }

  // Build endpoint aggregations with bounded duration samples.
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
      addDurationSample(endpointEntry, duration);
    }
  }
}

async function analyzeNDJSONStream(filePath) {
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
        processPoint(analysis, json);
      }
    } catch (e) {
      analysis.invalidLines += 1;
    }
  }

  return analysis;
}

function finalizeStreamedAnalysis(analysis) {
  if (analysis.metrics.httpReqDuration.count > 0) {
    analysis.metrics.httpReqDuration.avg = analysis.metrics.httpReqDuration.avg / analysis.metrics.httpReqDuration.count;
  }
  if (analysis.metrics.iterationDuration.count > 0) {
    analysis.metrics.iterationDuration.avg = analysis.metrics.iterationDuration.avg / analysis.metrics.iterationDuration.count;
  }

  if (!isFinite(analysis.metrics.httpReqDuration.min)) analysis.metrics.httpReqDuration.min = 0;
  if (!isFinite(analysis.metrics.httpReqDuration.max)) analysis.metrics.httpReqDuration.max = 0;
  if (!isFinite(analysis.metrics.iterationDuration.min)) analysis.metrics.iterationDuration.min = 0;
  if (!isFinite(analysis.metrics.iterationDuration.max)) analysis.metrics.iterationDuration.max = 0;

  const timeseries = {
    vus: { overall: [], byScenario: {} },
    requests: { overall: [], byScenario: {} },
    failedRequests: { overall: [], byScenario: {} },
    responseTimeAvg: { overall: [], byScenario: {} },
    iterations: { overall: [], byScenario: {} }
  };

  const sortedBuckets = Array.from(analysis.timeBuckets.keys()).sort((a, b) => a - b);
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

    const scenarioMap = analysis.scenarioBuckets.get(bucket) || new Map();
    scenarioMap.forEach((scenarioData, scenario) => {
      if (!timeseries.vus.byScenario[scenario]) {
        timeseries.vus.byScenario[scenario] = [];
        timeseries.requests.byScenario[scenario] = [];
        timeseries.failedRequests.byScenario[scenario] = [];
        timeseries.responseTimeAvg.byScenario[scenario] = [];
        timeseries.iterations.byScenario[scenario] = [];
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

// Helper function to extract time-series data
function extractTimeSeries(results) {
  const timeseries = {
    vus: { overall: [], byScenario: {} },
    requests: { overall: [], byScenario: {} },
    failedRequests: { overall: [], byScenario: {} },
    responseTimeAvg: { overall: [], byScenario: {} },
    iterations: { overall: [], byScenario: {} }
  };

  if (!Array.isArray(results.points)) {
    return timeseries;
  }

  // Group data points by time bucket (1 second intervals)
  const timeBuckets = {};
  const scenarioBuckets = {};

  results.points.forEach(point => {
    const timestamp = new Date(point.data?.time).getTime();
    if (!timestamp || isNaN(timestamp)) return;

    const bucket = Math.floor(timestamp / 1000) * 1000; // 1 second buckets
    const scenario = getScenarioName(point);

    if (!timeBuckets[bucket]) {
      timeBuckets[bucket] = {
        vusSum: 0,
        vusCount: 0,
        requests: 0,
        failedRequests: 0,
        responseTimeSum: 0,
        responseTimeCount: 0,
        iterations: 0
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
        iterations: 0
      };
    }

    const metric = point.metric;
    const value = point.data?.value || 0;

    // Aggregate metrics
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
  });

  // Convert to sorted arrays
  const sortedBuckets = Object.keys(timeBuckets).sort((a, b) => a - b);

  sortedBuckets.forEach(bucket => {
    const bucketTime = parseInt(bucket);
    const date = new Date(bucketTime).toISOString().substr(11, 8); // HH:MM:SS format
    const overallVusAverage = timeBuckets[bucket].vusCount > 0
      ? timeBuckets[bucket].vusSum / timeBuckets[bucket].vusCount
      : 0;
    const overallResponseTimeAverage = timeBuckets[bucket].responseTimeCount > 0
      ? timeBuckets[bucket].responseTimeSum / timeBuckets[bucket].responseTimeCount
      : 0;

    timeseries.vus.overall.push({
      time: date,
      timestamp: bucketTime,
      value: overallVusAverage
    });

    timeseries.requests.overall.push({
      time: date,
      timestamp: bucketTime,
      value: timeBuckets[bucket].requests
    });

    timeseries.failedRequests.overall.push({
      time: date,
      timestamp: bucketTime,
      value: timeBuckets[bucket].failedRequests
    });

    timeseries.responseTimeAvg.overall.push({
      time: date,
      timestamp: bucketTime,
      value: overallResponseTimeAverage
    });

    timeseries.iterations.overall.push({
      time: date,
      timestamp: bucketTime,
      value: timeBuckets[bucket].iterations
    });

    // Add by-scenario data
    const bucketScenarios = scenarioBuckets[bucket];
    Object.keys(bucketScenarios).forEach(scenario => {
      if (!timeseries.vus.byScenario[scenario]) {
        timeseries.vus.byScenario[scenario] = [];
        timeseries.requests.byScenario[scenario] = [];
        timeseries.failedRequests.byScenario[scenario] = [];
        timeseries.responseTimeAvg.byScenario[scenario] = [];
        timeseries.iterations.byScenario[scenario] = [];
      }

      const scenarioVusAverage = bucketScenarios[scenario].vusCount > 0
        ? bucketScenarios[scenario].vusSum / bucketScenarios[scenario].vusCount
        : 0;
      const scenarioResponseTimeAverage = bucketScenarios[scenario].responseTimeCount > 0
        ? bucketScenarios[scenario].responseTimeSum / bucketScenarios[scenario].responseTimeCount
        : 0;

      timeseries.vus.byScenario[scenario].push({
        time: date,
        timestamp: bucketTime,
        value: scenarioVusAverage
      });

      timeseries.requests.byScenario[scenario].push({
        time: date,
        timestamp: bucketTime,
        value: bucketScenarios[scenario].requests
      });

      timeseries.failedRequests.byScenario[scenario].push({
        time: date,
        timestamp: bucketTime,
        value: bucketScenarios[scenario].failedRequests
      });

      timeseries.responseTimeAvg.byScenario[scenario].push({
        time: date,
        timestamp: bucketTime,
        value: scenarioResponseTimeAverage
      });

      timeseries.iterations.byScenario[scenario].push({
        time: date,
        timestamp: bucketTime,
        value: bucketScenarios[scenario].iterations
      });
    });
  });

  return timeseries;
}

// Helper function to extract endpoint statistics
function extractEndpointStats(results) {
  const endpoints = {};

  if (!Array.isArray(results.points)) {
    return { endpoints: [], timeseriesData: {} };
  }

  results.points.forEach(point => {
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

  // Calculate averages and percentiles
  Object.values(endpoints).forEach(endpoint => {
    endpoint.durationSamples = endpoint.durations;
    endpoint.durationSeen = endpoint.durations.length;
    delete endpoint.durations;
    serializeEndpoint(endpoint);
  });

  // Sort by count descending
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

// Helper function to calculate percentiles
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

// Helper function to extract key metrics
function extractMetrics(results) {
  const metrics = {
    samples: 0,
    passes: 0,
    failures: 0,
    iterationDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
    httpReqDuration: { min: Infinity, max: -Infinity, avg: 0, count: 0 },
    httpReqs: 0,
    dataReceived: 0,
    dataSent: 0,
    checks: { passed: 0, failed: 0 },
    vus: { min: 0, max: 0, value: 0 }
  };

  // Handle NDJSON format (with points array)
  if (Array.isArray(results.points)) {
    results.points.forEach(point => {
      const metric = point.metric;
      const value = point.data?.value;

      if (metric === 'http_reqs') metrics.httpReqs += value || 0;
      if (metric === 'data_received') metrics.dataReceived += value || 0;
      if (metric === 'data_sent') metrics.dataSent += value || 0;
      if (metric === 'http_req_duration' && value !== undefined) {
        if (value < metrics.httpReqDuration.min) metrics.httpReqDuration.min = value;
        if (value > metrics.httpReqDuration.max) metrics.httpReqDuration.max = value;
        metrics.httpReqDuration.avg += value;
        metrics.httpReqDuration.count++;
      }
      if (metric === 'iteration_duration' && value !== undefined) {
        if (value < metrics.iterationDuration.min) metrics.iterationDuration.min = value;
        if (value > metrics.iterationDuration.max) metrics.iterationDuration.max = value;
        metrics.iterationDuration.avg += value;
        metrics.iterationDuration.count++;
      }
      if (metric === 'checks') {
        const checkValue = Number(value);
        metrics.checks.passed += checkValue === 1 ? 1 : 0;
        metrics.checks.failed += checkValue === 0 ? 1 : 0;
      }
    });

    // Calculate averages
    if (metrics.httpReqDuration.count > 0) {
      metrics.httpReqDuration.avg = metrics.httpReqDuration.avg / metrics.httpReqDuration.count;
    }
    if (metrics.iterationDuration.count > 0) {
      metrics.iterationDuration.avg = metrics.iterationDuration.avg / metrics.iterationDuration.count;
    }

    // Clean up infinity values
    if (!isFinite(metrics.httpReqDuration.min)) metrics.httpReqDuration.min = 0;
    if (!isFinite(metrics.httpReqDuration.max)) metrics.httpReqDuration.max = 0;
    if (!isFinite(metrics.iterationDuration.min)) metrics.iterationDuration.min = 0;
    if (!isFinite(metrics.iterationDuration.max)) metrics.iterationDuration.max = 0;
  }
  // Handle traditional JSON format (with metrics object)
  else if (results.metrics) {
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

// Helper function to extract summary
function extractSummary(results) {
  const summary = {
    timestamp: new Date().toISOString(),
    hasMetrics: !!results.metrics,
    hasGroups: !!results.groups,
    metricsCount: results.metrics ? Object.keys(results.metrics).length : 0
  };
  return summary;
}

// Start server
function startServer(attemptPort = PORT) {
  const server = app.listen(attemptPort, () => {
    console.log(`K6 Analyzer running at http://localhost:${attemptPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${attemptPort} is in use, trying ${attemptPort + 1}...`);
      startServer(attemptPort + 1);
    } else {
      throw err;
    }
  });
}

startServer();
