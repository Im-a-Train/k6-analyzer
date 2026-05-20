import { parseGranularityToMs, normalizeGranularity } from './js/granularity.js';
import {
  formatTimeLabel,
  formatBytes,
  formatNumberCompact,
  formatDurationCompact,
  truncateMiddle,
  truncateFromFront
} from './js/format-utils.js';
import {
  aggregateSeries,
  aggregateByScenario,
  createDataset,
  collectSortedTimestampsFromSeries,
  collectSortedTimestampsFromByScenario,
  generateColors
} from './js/chart-utils.js';
import { uploadResultsFile, fetchRunData } from './js/api-client.js';
import { getRunUiConfig } from './js/run-config.js';
import { exportReportAsPdf } from './js/pdf-export.js';

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadTargetInitial = document.getElementById('uploadTargetInitial');
const resultsSection = document.getElementById('resultsSection');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorText = document.getElementById('errorText');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressText = document.getElementById('progressText');
const rootContainer = document.querySelector('.container');

const RUN_KEYS = ['a', 'b', 'c'];

const uploadRunBtnA = document.getElementById('uploadRunBtnA');
const uploadRunBtnB = document.getElementById('uploadRunBtnB');
const uploadRunBtnC = document.getElementById('uploadRunBtnC');
const compareModeSelect = document.getElementById('compareModeSelect');
const coupleSettingsToggleA = document.getElementById('coupleSettingsToggleA');
const coupleSettingsToggleB = document.getElementById('coupleSettingsToggleB');
const coupleSettingsToggleC = document.getElementById('coupleSettingsToggleC');
const coupleSettingsWrapA = document.getElementById('coupleSettingsWrapA');
const coupleSettingsWrapB = document.getElementById('coupleSettingsWrapB');
const coupleSettingsWrapC = document.getElementById('coupleSettingsWrapC');
const resetResultsBtn = document.getElementById('resetResultsBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const resultsMainTitle = document.getElementById('resultsMainTitle');
const runHeaderTitleA = document.getElementById('runHeaderTitleA');
const runHeaderTitleB = document.getElementById('runHeaderTitleB');
const runHeaderTitleC = document.getElementById('runHeaderTitleC');
const runHeaderRangeA = document.getElementById('runHeaderRangeA');
const runHeaderRangeB = document.getElementById('runHeaderRangeB');
const runHeaderRangeC = document.getElementById('runHeaderRangeC');
const timeFilterValueA = document.getElementById('timeFilterValueA');
const timeFilterValueB = document.getElementById('timeFilterValueB');
const timeFilterValueC = document.getElementById('timeFilterValueC');
const timeFilterStartA = document.getElementById('timeFilterStartA');
const timeFilterEndA = document.getElementById('timeFilterEndA');
const timeFilterStartB = document.getElementById('timeFilterStartB');
const timeFilterEndB = document.getElementById('timeFilterEndB');
const timeFilterStartC = document.getElementById('timeFilterStartC');
const timeFilterEndC = document.getElementById('timeFilterEndC');
const timeFilterActiveA = document.getElementById('timeFilterActiveA');
const timeFilterActiveB = document.getElementById('timeFilterActiveB');
const timeFilterActiveC = document.getElementById('timeFilterActiveC');
const timeFilterResetA = document.getElementById('timeFilterResetA');
const timeFilterResetB = document.getElementById('timeFilterResetB');
const timeFilterResetC = document.getElementById('timeFilterResetC');

const granularityInput = document.getElementById('granularityInput');
const applyGranularityBtn = document.getElementById('applyGranularityBtn');
const metricSelectors = document.getElementById('metricSelectors');
const metricPresets = document.getElementById('metricPresets');
const granularityInputB = document.getElementById('granularityInputB');
const applyGranularityBtnB = document.getElementById('applyGranularityBtnB');
const metricSelectorsB = document.getElementById('metricSelectorsB');
const metricPresetsB = document.getElementById('metricPresetsB');
const granularityInputC = document.getElementById('granularityInputC');
const applyGranularityBtnC = document.getElementById('applyGranularityBtnC');
const metricSelectorsC = document.getElementById('metricSelectorsC');
const metricPresetsC = document.getElementById('metricPresetsC');
const chartToggleA = document.getElementById('chartToggleA');
const chartToggleB = document.getElementById('chartToggleB');
const chartToggleC = document.getElementById('chartToggleC');
const endpointSortSelect = document.getElementById('endpointSortSelect');
const endpointSortSelectB = document.getElementById('endpointSortSelectB');
const endpointSortSelectC = document.getElementById('endpointSortSelectC');
const scenarioErrorListA = document.getElementById('scenarioErrorListA');
const scenarioErrorListB = document.getElementById('scenarioErrorListB');
const scenarioErrorListC = document.getElementById('scenarioErrorListC');

const chartsCompareGrid = document.getElementById('chartsCompareGrid');
const chartsSectionB = document.getElementById('chartsSectionB');
const chartsSectionC = document.getElementById('chartsSectionC');
const metricsPanelB = document.getElementById('metricsPanelB');
const metricsPanelC = document.getElementById('metricsPanelC');
const endpointSectionB = document.getElementById('endpointSectionB');
const endpointSectionC = document.getElementById('endpointSectionC');
const metricsCompareGrid = document.getElementById('metricsCompareGrid');
const endpointCompareGrid = document.getElementById('endpointCompareGrid');

const uploadRunButtons = {
  a: uploadRunBtnA,
  b: uploadRunBtnB,
  c: uploadRunBtnC
};

const coupleSettingsToggles = {
  a: coupleSettingsToggleA,
  b: coupleSettingsToggleB,
  c: coupleSettingsToggleC
};

const coupleSettingsWraps = {
  a: coupleSettingsWrapA,
  b: coupleSettingsWrapB,
  c: coupleSettingsWrapC
};

const runHeaderTitles = {
  a: runHeaderTitleA,
  b: runHeaderTitleB,
  c: runHeaderTitleC
};

const runHeaderRanges = {
  a: runHeaderRangeA,
  b: runHeaderRangeB,
  c: runHeaderRangeC
};

const timeFilterElements = {
  a: {
    start: timeFilterStartA,
    end: timeFilterEndA,
    value: timeFilterValueA,
    active: timeFilterActiveA,
    reset: timeFilterResetA
  },
  b: {
    start: timeFilterStartB,
    end: timeFilterEndB,
    value: timeFilterValueB,
    active: timeFilterActiveB,
    reset: timeFilterResetB
  },
  c: {
    start: timeFilterStartC,
    end: timeFilterEndC,
    value: timeFilterValueC,
    active: timeFilterActiveC,
    reset: timeFilterResetC
  }
};

const controlElementsByRun = {
  a: {
    granularityInput,
    applyGranularityBtn,
    metricSelectors,
    metricPresets,
    chartToggle: chartToggleA
  },
  b: {
    granularityInput: granularityInputB,
    applyGranularityBtn: applyGranularityBtnB,
    metricSelectors: metricSelectorsB,
    metricPresets: metricPresetsB,
    chartToggle: chartToggleB
  },
  c: {
    granularityInput: granularityInputC,
    applyGranularityBtn: applyGranularityBtnC,
    metricSelectors: metricSelectorsC,
    metricPresets: metricPresetsC,
    chartToggle: chartToggleC
  }
};

const endpointSortSelects = {
  a: endpointSortSelect,
  b: endpointSortSelectB,
  c: endpointSortSelectC
};

const scenarioErrorLists = {
  a: scenarioErrorListA,
  b: scenarioErrorListB,
  c: scenarioErrorListC
};

const comparePanelsByRun = {
  b: {
    chartSection: chartsSectionB,
    metricsPanel: metricsPanelB,
    endpointSection: endpointSectionB
  },
  c: {
    chartSection: chartsSectionC,
    metricsPanel: metricsPanelC,
    endpointSection: endpointSectionC
  }
};

const METRIC_CONFIG = {
  vus: { label: 'Virtual Users', axis: 'y' },
  requests: { label: 'Requests', axis: 'y' },
  failedRequests: { label: 'Failed Requests', axis: 'y' },
  iterations: { label: 'Iterations', axis: 'y' },
  wsMsgsSent: { label: 'WS Messages Sent', axis: 'y' },
  wsMsgsReceived: { label: 'WS Messages Received', axis: 'y' },
  responseTimeAvg: { label: 'Response Time (avg ms)', axis: 'y1' }
};

const METRIC_PRESETS = {
  load: ['vus', 'requests', 'failedRequests'],
  errors: ['requests', 'failedRequests'],
  latency: ['responseTimeAvg', 'requests'],
  all: ['vus', 'requests', 'failedRequests', 'iterations', 'wsMsgsSent', 'wsMsgsReceived', 'responseTimeAvg']
};

const DEFAULT_METRICS = ['vus', 'requests', 'failedRequests'];

function createDefaultSettings() {
  return {
    chartView: 'overall',
    granularity: '1s',
    selectedMetrics: [...DEFAULT_METRICS],
    axisAssignments: Object.fromEntries(
      Object.entries(METRIC_CONFIG).map(([metricKey, config]) => [metricKey, config.axis])
    )
  };
}

function createEmptyRun() {
  return {
    loaded: false,
    metrics: null,
    timeseries: null,
    endpoints: null,
    timeFilter: null,
    filteredTimeseriesCache: null,
    filteredMetricsCache: null
  };
}

const runStore = Object.fromEntries(RUN_KEYS.map((runKey) => [runKey, createEmptyRun()]));

const settingsStore = Object.fromEntries(RUN_KEYS.map((runKey) => [runKey, createDefaultSettings()]));

const appState = {
  compareRunCount: 1,
  coupledSettings: true,
  settingsTarget: 'a',
  endpointSort: Object.fromEntries(RUN_KEYS.map((runKey) => [runKey, 'requests']))
};

const charts = {
  a: null,
  b: null,
  c: null,
  endpointRequestsA: null,
  endpointRequestsB: null,
  endpointRequestsC: null,
  endpointDurationA: null,
  endpointDurationB: null,
  endpointDurationC: null
};

const chartBrushInteractions = {
  a: null,
  b: null,
  c: null
};

let pendingUploadTarget = 'a';
let isAppInitialized = false;

function cloneSettings(settings) {
  return {
    chartView: settings.chartView,
    granularity: settings.granularity,
    selectedMetrics: [...settings.selectedMetrics],
    axisAssignments: { ...settings.axisAssignments }
  };
}

function getSettingsTargetForControls() {
  return appState.coupledSettings ? 'a' : appState.settingsTarget;
}

function isRunVisible(runKey) {
  if (runKey === 'a') return true;
  if (runKey === 'b') return appState.compareRunCount >= 2;
  if (runKey === 'c') return appState.compareRunCount >= 3;
  return false;
}

function getVisibleRunKeys() {
  return RUN_KEYS.filter((runKey) => isRunVisible(runKey));
}

function getControlElements(runKey) {
  return controlElementsByRun[runKey] || controlElementsByRun.a;
}

function getUploadTarget() {
  return pendingUploadTarget;
}

function getPrimaryRunKey() {
  for (const runKey of RUN_KEYS) {
    if (runStore[runKey].loaded) return runKey;
  }
  return 'a';
}

function getEndpointRunKey() {
  const preferred = getSettingsTargetForControls();
  if (runStore[preferred].loaded) return preferred;
  return getPrimaryRunKey();
}

function setUploadTargetControls(runKey) {
  if (uploadTargetInitial) uploadTargetInitial.value = runKey;
  pendingUploadTarget = runKey;
}

function bindUploadEvents() {
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileUpload(files[0], getUploadTarget());
      }
    });
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0], getUploadTarget());
      fileInput.value = '';
    }
  });

  if (uploadTargetInitial) {
    uploadTargetInitial.addEventListener('change', () => {
      pendingUploadTarget = uploadTargetInitial.value;
    });
  }

  RUN_KEYS.forEach((runKey) => {
    const button = uploadRunButtons[runKey];
    if (!button) return;

    button.addEventListener('click', () => {
      pendingUploadTarget = runKey;
      fileInput.click();
    });
  });

  if (resetResultsBtn) {
    resetResultsBtn.addEventListener('click', resetApplicationState);
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      exportReportAsPdf(runStore);
    });
  }
}

function applySettingsToTargets(mutator, sourceRunKey = 'a') {
  const targets = appState.coupledSettings ? RUN_KEYS : [sourceRunKey];
  targets.forEach((runKey) => mutator(settingsStore[runKey]));

  if (appState.coupledSettings) {
    RUN_KEYS.filter((runKey) => runKey !== 'a').forEach((runKey) => {
      settingsStore[runKey] = cloneSettings(settingsStore.a);
    });
  }
}

function bindControlEvents() {
  RUN_KEYS.forEach((runKey) => {
    const controls = getControlElements(runKey);

    if (controls.chartToggle) {
      controls.chartToggle.querySelectorAll('.chart-type-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const nextView = e.currentTarget.dataset.view;
          applySettingsToTargets((settings) => {
            settings.chartView = nextView;
          }, runKey);
          syncControlsFromActiveSettings();
          renderAll();
        });
      });
    }

    if (controls.applyGranularityBtn && controls.granularityInput) {
      controls.applyGranularityBtn.addEventListener('click', () => applyGranularity(runKey));
      controls.granularityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyGranularity(runKey);
        }
      });
    }

    if (controls.metricSelectors) {
      controls.metricSelectors.querySelectorAll('.metric-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const selected = getSelectedMetricValues(runKey);
          if (selected.length === 0) {
            checkbox.checked = true;
            showError('Select at least one metric to display.');
            return;
          }

          applySettingsToTargets((settings) => {
            settings.selectedMetrics = selected;
          }, runKey);
          syncControlsFromActiveSettings();
          hideError();
          renderAll();
        });
      });

      controls.metricSelectors.querySelectorAll('.metric-axis-select').forEach((select) => {
        select.addEventListener('change', (event) => {
          const metricKey = event.target.dataset.metric;
          const axis = event.target.value;

          applySettingsToTargets((settings) => {
            settings.axisAssignments[metricKey] = axis;
          }, runKey);

          syncControlsFromActiveSettings();
          renderAll();
        });
      });
    }

    if (controls.metricPresets) {
      controls.metricPresets.querySelectorAll('.metric-preset-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const preset = METRIC_PRESETS[button.dataset.preset];
          if (!preset) return;

          applySettingsToTargets((settings) => {
            settings.selectedMetrics = [...preset];
          }, runKey);

          syncControlsFromActiveSettings();
          renderAll();
        });
      });
    }
  });

  if (compareModeSelect) {
    compareModeSelect.addEventListener('change', () => {
      const nextCount = Number(compareModeSelect.value);
      appState.compareRunCount = [1, 2, 3].includes(nextCount) ? nextCount : 1;
      renderAll();
    });
  }

  const onCoupleToggleChange = (checked) => {
    appState.coupledSettings = checked;
    if (appState.coupledSettings) {
      RUN_KEYS.filter((runKey) => runKey !== 'a').forEach((runKey) => {
        settingsStore[runKey] = cloneSettings(settingsStore.a);
      });
    }
    syncControlsFromActiveSettings();
    updateToolbarState();
    renderAll();
  };

  RUN_KEYS.forEach((runKey) => {
    const toggle = coupleSettingsToggles[runKey];
    if (toggle) {
      toggle.addEventListener('change', () => {
        onCoupleToggleChange(toggle.checked);
      });
    }

    const sortSelect = endpointSortSelects[runKey];
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        appState.endpointSort[runKey] = sortSelect.value;
        renderEndpointSectionForRun(runKey);
      });
    }

    const { start, end, reset } = getTimeFilterElements(runKey);
    if (!start || !end || !reset) return;

    const onRangeInput = (source) => {
      const run = runStore[runKey];
      if (!run.timeFilter) return;

      let nextStart = Number(start.value);
      let nextEnd = Number(end.value);

      if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) return;

      if (nextStart > nextEnd) {
        if (source === 'start') {
          nextEnd = nextStart;
          end.value = String(nextEnd);
        } else {
          nextStart = nextEnd;
          start.value = String(nextStart);
        }
      }

      run.timeFilter.startTs = nextStart;
      run.timeFilter.endTs = nextEnd;
      invalidateFilterCache(runKey);
      updateTimeFilterUiForRun(runKey);
      hideError();
      renderAll();
    };

    start.addEventListener('input', () => onRangeInput('start'));
    end.addEventListener('input', () => onRangeInput('end'));
    reset.addEventListener('click', () => resetTimeFilterForRun(runKey));
  });
}

function formatHeaderDateTime(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year} ${hh}:${mm}:${ss}`;
}

function getTimeFilterElements(runKey) {
  return timeFilterElements[runKey] || timeFilterElements.a;
}

function resetTimeFilterForRun(runKey) {
  const run = runStore[runKey];
  if (!run?.timeFilter) return;
  run.timeFilter.startTs = run.timeFilter.minTs;
  run.timeFilter.endTs = run.timeFilter.maxTs;
  invalidateFilterCache(runKey);
  updateTimeFilterUiForRun(runKey);
  hideError();
  renderAll();
}

function getRunBoundsFromTimeseries(timeseries) {
  if (!timeseries) return null;

  let minTs = Infinity;
  let maxTs = -Infinity;

  Object.values(timeseries).forEach((metricSeries) => {
    (metricSeries?.overall || []).forEach((point) => {
      const ts = Number(point.timestamp);
      if (!Number.isFinite(ts)) return;
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);
    });
  });

  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) return null;
  return { minTs, maxTs };
}

function ensureRunTimeFilter(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.timeseries) {
    run.timeFilter = null;
    return;
  }

  const bounds = getRunBoundsFromTimeseries(run.timeseries);
  if (!bounds) {
    run.timeFilter = null;
    return;
  }

  const previous = run.timeFilter;
  const startTs = previous ? Math.max(bounds.minTs, Math.min(previous.startTs, bounds.maxTs)) : bounds.minTs;
  const endTs = previous ? Math.max(startTs, Math.min(previous.endTs, bounds.maxTs)) : bounds.maxTs;

  run.timeFilter = {
    minTs: bounds.minTs,
    maxTs: bounds.maxTs,
    startTs,
    endTs
  };
}

function invalidateFilterCache(runKey) {
  runStore[runKey].filteredTimeseriesCache = null;
  runStore[runKey].filteredMetricsCache = null;
}

function formatDateRangeText(startTs, endTs) {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return '-';
  return `${formatHeaderDateTime(startTs)} - ${formatHeaderDateTime(endTs)}`;
}

function isTimeFilterActive(runKey) {
  const filter = runStore[runKey].timeFilter;
  if (!filter) return false;
  return filter.startTs > filter.minTs || filter.endTs < filter.maxTs;
}

function updateTimeFilterUiForRun(runKey) {
  const run = runStore[runKey];
  const { start, end, value, active, reset } = getTimeFilterElements(runKey);
  if (!start || !end || !value || !active || !reset) return;

  const filter = run.timeFilter;
  if (!run.loaded || !filter) {
    start.disabled = true;
    end.disabled = true;
    value.textContent = 'No data';
    reset.disabled = true;
    active.style.left = '0%';
    active.style.width = '100%';
    return;
  }

  start.disabled = false;
  end.disabled = false;

  start.min = String(filter.minTs);
  start.max = String(filter.maxTs);
  start.step = '1000';
  start.value = String(filter.startTs);

  end.min = String(filter.minTs);
  end.max = String(filter.maxTs);
  end.step = '1000';
  end.value = String(filter.endTs);

  const span = Math.max(1, filter.maxTs - filter.minTs);
  const left = ((filter.startTs - filter.minTs) / span) * 100;
  const right = ((filter.endTs - filter.minTs) / span) * 100;
  active.style.left = `${Math.max(0, Math.min(100, left))}%`;
  active.style.width = `${Math.max(0, Math.min(100, right - left))}%`;

  value.textContent = isTimeFilterActive(runKey)
    ? formatDateRangeText(filter.startTs, filter.endTs)
    : 'Full range';
  reset.disabled = !isTimeFilterActive(runKey);
}

function filterSeriesPointsByTime(points, filter) {
  if (!Array.isArray(points)) return [];
  return points.filter((point) => {
    const ts = Number(point.timestamp);
    return Number.isFinite(ts) && ts >= filter.startTs && ts <= filter.endTs;
  });
}

function getFilteredTimeseriesForRun(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.timeseries) return null;

  const filter = run.timeFilter;
  if (!filter || !isTimeFilterActive(runKey)) return run.timeseries;

  const cacheKey = `${filter.startTs}:${filter.endTs}`;
  if (run.filteredTimeseriesCache?.key === cacheKey) {
    return run.filteredTimeseriesCache.value;
  }

  const filtered = {};
  Object.entries(run.timeseries).forEach(([metricKey, metricSeries]) => {
    const byScenario = {};
    Object.entries(metricSeries?.byScenario || {}).forEach(([scenario, points]) => {
      byScenario[scenario] = filterSeriesPointsByTime(points, filter);
    });

    filtered[metricKey] = {
      overall: filterSeriesPointsByTime(metricSeries?.overall || [], filter),
      byScenario
    };
  });

  run.filteredTimeseriesCache = {
    key: cacheKey,
    value: filtered
  };

  return filtered;
}

function sumSeriesValues(points) {
  return (points || []).reduce((sum, point) => sum + (Number(point.value) || 0), 0);
}

function getDisplayedMetricsForRun(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.metrics) return null;

  if (!isTimeFilterActive(runKey)) {
    return run.metrics;
  }

  const filter = run.timeFilter;
  const cacheKey = `${filter.startTs}:${filter.endTs}`;
  if (run.filteredMetricsCache?.key === cacheKey) {
    return run.filteredMetricsCache.value;
  }

  const filteredTimeseries = getFilteredTimeseriesForRun(runKey);
  const allTimeseries = run.timeseries;

  const filteredRequests = sumSeriesValues(filteredTimeseries?.requests?.overall || []);
  const fullRequests = Math.max(sumSeriesValues(allTimeseries?.requests?.overall || []), 1);
  const requestRatio = Math.min(1, filteredRequests / fullRequests);

  const vusValues = (filteredTimeseries?.vus?.overall || []).map((point) => Number(point.value) || 0);
  const responseAvgSeries = filteredTimeseries?.responseTimeAvg?.overall || [];
  const responseAvgValues = responseAvgSeries.map((point) => Number(point.value) || 0);
  const iterationCount = sumSeriesValues(filteredTimeseries?.iterations?.overall || []);

  const weightedResponseSum = responseAvgSeries.reduce((sum, point, idx) => {
    const bucketReqs = Number(filteredTimeseries?.requests?.overall?.[idx]?.value) || 0;
    return sum + (Number(point.value) || 0) * bucketReqs;
  }, 0);
  const responseWeight = sumSeriesValues(filteredTimeseries?.requests?.overall || []);

  const estimated = {
    ...run.metrics,
    httpReqs: Math.round(filteredRequests),
    dataReceived: (Number(run.metrics.dataReceived) || 0) * requestRatio,
    dataSent: (Number(run.metrics.dataSent) || 0) * requestRatio,
    wsSessions: Math.round((Number(run.metrics.wsSessions) || 0) * requestRatio),
    wsMsgsSent: Math.round(sumSeriesValues(filteredTimeseries?.wsMsgsSent?.overall || [])),
    wsMsgsReceived: Math.round(sumSeriesValues(filteredTimeseries?.wsMsgsReceived?.overall || [])),
    checks: {
      passed: Math.round((Number(run.metrics.checks?.passed) || 0) * requestRatio),
      failed: Math.round((Number(run.metrics.checks?.failed) || 0) * requestRatio)
    },
    vus: {
      ...(run.metrics.vus || {}),
      max: vusValues.length > 0 ? Math.max(...vusValues) : 0,
      min: vusValues.length > 0 ? Math.min(...vusValues) : 0,
      value: vusValues.length > 0 ? vusValues[vusValues.length - 1] : 0
    },
    httpReqDuration: {
      ...(run.metrics.httpReqDuration || {}),
      min: responseAvgValues.length > 0 ? Math.min(...responseAvgValues) : 0,
      max: responseAvgValues.length > 0 ? Math.max(...responseAvgValues) : 0,
      avg: responseWeight > 0 ? weightedResponseSum / responseWeight : 0
    },
    iterationDuration: {
      ...(run.metrics.iterationDuration || {}),
      avg: iterationCount > 0 ? Number(run.metrics.iterationDuration?.avg) || 0 : 0
    },
    testDuration: Math.max(0, filter.endTs - filter.startTs)
  };

  run.filteredMetricsCache = {
    key: cacheKey,
    value: estimated
  };

  return estimated;
}

function getRunDateRange(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.timeFilter) return null;
  return formatDateRangeText(run.timeFilter.minTs, run.timeFilter.maxTs);
}

function getRunDisplayedDateRange(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.timeFilter) return null;
  return formatDateRangeText(run.timeFilter.startTs, run.timeFilter.endTs);
}

function updateResultsHeaderText(visibleRunKeys) {
  const rangeByRun = Object.fromEntries(RUN_KEYS.map((runKey) => {
    const fullRange = getRunDateRange(runKey);
    const shownRange = getRunDisplayedDateRange(runKey);
    const displayRange = isTimeFilterActive(runKey) && shownRange && fullRange
      ? `${shownRange} (filtered)`
      : fullRange;

    return [runKey, displayRange || ''];
  }));

  if (visibleRunKeys.length <= 1) {
    const primaryRunKey = getPrimaryRunKey();
    const range = rangeByRun[primaryRunKey];

    if (resultsMainTitle) {
      resultsMainTitle.textContent = range ? `Test Results ${range}` : 'Test Results';
    }

    RUN_KEYS.forEach((runKey) => {
      const title = runHeaderTitles[runKey];
      const rangeEl = runHeaderRanges[runKey];
      if (!title || !rangeEl) return;

      if (runKey === primaryRunKey) {
        title.textContent = range ? `Test Results ${range}` : 'Test Results';
        rangeEl.textContent = '';
        return;
      }

      title.textContent = `Run ${runKey.toUpperCase()}`;
      rangeEl.textContent = rangeByRun[runKey];
    });
    return;
  }

  if (resultsMainTitle) {
    resultsMainTitle.textContent = visibleRunKeys.map((runKey) => `Run ${runKey.toUpperCase()}`).join(' | ');
  }

  RUN_KEYS.forEach((runKey) => {
    const title = runHeaderTitles[runKey];
    const rangeEl = runHeaderRanges[runKey];
    if (!title || !rangeEl) return;

    title.textContent = `Run ${runKey.toUpperCase()}`;
    rangeEl.textContent = rangeByRun[runKey];
  });
}

function getSelectedMetricValues(runKey) {
  const controls = getControlElements(runKey);
  if (!controls.metricSelectors) return [...DEFAULT_METRICS];
  return Array.from(controls.metricSelectors.querySelectorAll('.metric-checkbox:checked')).map((el) => el.value);
}

function syncPresetButtons(runKey) {
  const controls = getControlElements(runKey);
  if (!controls.metricPresets) return;
  const activeSettings = settingsStore[runKey];
  const normalizedSelection = [...activeSettings.selectedMetrics].sort().join('|');

  controls.metricPresets.querySelectorAll('.metric-preset-btn').forEach((button) => {
    const presetMetrics = [...(METRIC_PRESETS[button.dataset.preset] || [])].sort().join('|');
    button.classList.toggle('active', presetMetrics === normalizedSelection);
  });
}

function syncControlsForRun(runKey) {
  const activeSettings = settingsStore[runKey];
  const controls = getControlElements(runKey);

  if (controls.granularityInput) {
    controls.granularityInput.value = activeSettings.granularity;
  }

  if (controls.chartToggle) {
    controls.chartToggle.querySelectorAll('.chart-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === activeSettings.chartView);
    });
  }

  if (controls.metricSelectors) {
    controls.metricSelectors.querySelectorAll('.metric-checkbox').forEach((checkbox) => {
      checkbox.checked = activeSettings.selectedMetrics.includes(checkbox.value);
    });

    controls.metricSelectors.querySelectorAll('.metric-axis-select').forEach((select) => {
      const metricKey = select.dataset.metric;
      select.value = activeSettings.axisAssignments[metricKey] || METRIC_CONFIG[metricKey]?.axis || 'y';
    });
  }

  syncPresetButtons(runKey);
}

function syncControlsFromActiveSettings() {
  RUN_KEYS.forEach((runKey) => syncControlsForRun(runKey));
  updateToolbarState();
}

function updateToolbarState() {
  const compareEnabled = appState.compareRunCount > 1;
  RUN_KEYS.forEach((runKey) => {
    const wrap = coupleSettingsWraps[runKey];
    if (wrap) wrap.classList.toggle('hidden', !compareEnabled || !isRunVisible(runKey));
  });

  if (!compareEnabled) {
    appState.coupledSettings = true;
    RUN_KEYS.forEach((runKey) => {
      const toggle = coupleSettingsToggles[runKey];
      if (toggle) toggle.checked = true;
    });
  } else {
    RUN_KEYS.forEach((runKey) => {
      const toggle = coupleSettingsToggles[runKey];
      if (toggle) toggle.checked = appState.coupledSettings;
    });
  }
}

async function handleFileUpload(file, runKey) {
  if (!file.name.endsWith('.json')) {
    showError('Please upload a JSON file');
    return;
  }

  progressContainer.style.display = 'block';
  progressFill.style.width = '5%';
  progressPercent.textContent = '5%';
  progressText.textContent = `Preparing upload for Run ${runKey.toUpperCase()}...`;

  try {
    await uploadResultsFile(file, (e) => {
      if (!e.lengthComputable) return;
      const percentComplete = (e.loaded / e.total) * 90 + 5;
      progressFill.style.width = `${percentComplete}%`;
      progressPercent.textContent = `${Math.round(percentComplete)}%`;
      progressText.textContent = `Uploading... ${(e.loaded / 1024 / 1024).toFixed(1)}MB`;
    });

    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressText.textContent = 'Processing...';

    await loadResultsForRun(runKey);
    hideError();

    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 250);
  } catch (err) {
    showError(err.message);
    progressContainer.style.display = 'none';
  }
}

async function loadResultsForRun(runKey) {
  const runData = await fetchRunData();

  runStore[runKey] = {
    loaded: true,
    metrics: runData.metrics,
    timeseries: runData.timeseries,
    endpoints: runData.endpoints,
    timeFilter: null,
    filteredTimeseriesCache: null,
    filteredMetricsCache: null
  };

  ensureRunTimeFilter(runKey);
  updateTimeFilterUiForRun(runKey);

  if (!runStore.a.loaded && runKey !== 'a') {
    // Keep controls sensible if a secondary run is uploaded first.
    appState.settingsTarget = runKey;
  }

  if (!resultsSection.classList.contains('visible')) {
    resultsSection.style.display = 'block';
    resultsSection.classList.add('visible');
  }

  setUploadTargetControls(runKey);
  renderAll();
}

function computeAxisMaxValues(runKey, settings) {
  const run = runStore[runKey];
  const timeseries = getFilteredTimeseriesForRun(runKey);
  if (!run.loaded || !timeseries) return { yMax: null, y1Max: null };

  const bucketSizeMs = parseGranularityToMs(settings.granularity);
  if (!bucketSizeMs) return { yMax: null, y1Max: null };

  const metricKeys = settings.selectedMetrics.filter((k) => timeseries[k]);
  let yMax = 0;
  let y1Max = 0;

  metricKeys.forEach((metricKey) => {
    const axis = settings.axisAssignments[metricKey] || METRIC_CONFIG[metricKey]?.axis || 'y';
    const series = aggregateSeries(timeseries[metricKey].overall, bucketSizeMs);
    const max = series.reduce((m, p) => Math.max(m, p.value || 0), 0);
    if (axis === 'y1') {
      y1Max = Math.max(y1Max, max);
    } else {
      yMax = Math.max(yMax, max);
    }
  });

  return { yMax, y1Max };
}

function renderAll() {
  updateCompareVisibility();
  RUN_KEYS.forEach((runKey) => updateTimeFilterUiForRun(runKey));

  const visibleLoadedRunKeys = getVisibleRunKeys().filter((runKey) => runStore[runKey].loaded);
  const coupledCompare = appState.coupledSettings && visibleLoadedRunKeys.length > 1;

  let sharedScales = null;
  if (coupledCompare) {
    const maxima = visibleLoadedRunKeys.map((runKey) => computeAxisMaxValues(runKey, settingsStore[runKey]));
    const pad = (v) => (v ? v * 1.05 : undefined);
    sharedScales = {
      yMax: pad(Math.max(...maxima.map((value) => value.yMax || 0)) || undefined),
      y1Max: pad(Math.max(...maxima.map((value) => value.y1Max || 0)) || undefined)
    };
  }

  RUN_KEYS.forEach((runKey) => renderChartForRun(runKey, sharedScales));
  renderScenarioErrorSummary();
  RUN_KEYS.forEach((runKey) => displayMetricsForRun(runKey));
  RUN_KEYS.forEach((runKey) => renderEndpointSectionForRun(runKey));
}

function updateCompareVisibility() {
  const visibleRunKeys = getVisibleRunKeys();
  const compareClass = visibleRunKeys.length >= 3 ? 'compare-3' : visibleRunKeys.length === 2 ? 'compare-2' : null;

  Object.entries(comparePanelsByRun).forEach(([runKey, sections]) => {
    const shouldShow = isRunVisible(runKey);
    Object.values(sections).forEach((element) => {
      if (element) element.classList.toggle('hidden', !shouldShow);
    });
  });

  [chartsCompareGrid, metricsCompareGrid, endpointCompareGrid].forEach((grid) => {
    if (!grid) return;
    grid.classList.remove('compare-2', 'compare-3');
    if (compareClass) grid.classList.add(compareClass);
  });

  if (rootContainer) rootContainer.classList.toggle('compare-full', visibleRunKeys.length > 1);
  updateResultsHeaderText(visibleRunKeys);
}

function applyGranularity(runKey = 'a') {
  const controls = getControlElements(runKey);
  if (!controls.granularityInput) return;

  const rawValue = controls.granularityInput.value.trim();
  const parsedMs = parseGranularityToMs(rawValue);

  if (!parsedMs) {
    showError('Invalid granularity. Use values like 1s, 30s, 2m, or 1h.');
    return;
  }

  const normalized = normalizeGranularity(rawValue);
  applySettingsToTargets((settings) => {
    settings.granularity = normalized;
  }, runKey);

  if (appState.coupledSettings) {
    if (granularityInput) granularityInput.value = normalized;
    if (granularityInputB) granularityInputB.value = normalized;
    if (granularityInputC) granularityInputC.value = normalized;
  } else {
    controls.granularityInput.value = normalized;
  }
  hideError();
  renderAll();
}

function getAxisTitle(settings, metricKeys, axisId) {
  const labels = metricKeys
    .filter((metricKey) => (settings.axisAssignments[metricKey] || METRIC_CONFIG[metricKey]?.axis || 'y') === axisId)
    .map((metricKey) => METRIC_CONFIG[metricKey]?.label || metricKey);

  return labels.join(', ');
}

function detachChartBrushInteraction(runKey) {
  const interaction = chartBrushInteractions[runKey];
  if (!interaction) return;
  if (typeof interaction.cleanup === 'function') {
    interaction.cleanup();
  }
  chartBrushInteractions[runKey] = null;
}

function attachChartBrushInteraction(runKey, chartInstance, timestamps) {
  detachChartBrushInteraction(runKey);

  if (!chartInstance || !Array.isArray(timestamps) || timestamps.length < 2) {
    return;
  }

  const canvas = chartInstance.canvas;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;

  const brush = document.createElement('div');
  brush.className = 'chart-brush-selection hidden';
  parent.appendChild(brush);

  let isDragging = false;
  let startX = 0;
  let currentX = 0;

  const getCanvasX = (event) => {
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  };

  const updateBrush = () => {
    const left = Math.min(startX, currentX);
    const right = Math.max(startX, currentX);
    brush.style.left = `${left}px`;
    brush.style.width = `${Math.max(0, right - left)}px`;
  };

  const applyBrushSelection = () => {
    const dragDistance = Math.abs(currentX - startX);
    brush.classList.add('hidden');

    if (dragDistance < 8) return;

    const xScale = chartInstance.scales?.x;
    if (!xScale) return;

    const leftPx = Math.min(startX, currentX);
    const rightPx = Math.max(startX, currentX);

    const rawStartIndex = Number(xScale.getValueForPixel(leftPx));
    const rawEndIndex = Number(xScale.getValueForPixel(rightPx));

    if (!Number.isFinite(rawStartIndex) || !Number.isFinite(rawEndIndex)) return;

    const startIndex = Math.max(0, Math.min(timestamps.length - 1, Math.floor(rawStartIndex)));
    const endIndex = Math.max(0, Math.min(timestamps.length - 1, Math.ceil(rawEndIndex)));

    const run = runStore[runKey];
    if (!run?.timeFilter) return;

    run.timeFilter.startTs = timestamps[Math.min(startIndex, endIndex)];
    run.timeFilter.endTs = timestamps[Math.max(startIndex, endIndex)];
    invalidateFilterCache(runKey);
    updateTimeFilterUiForRun(runKey);
    hideError();
    renderAll();
  };

  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    startX = getCanvasX(event);
    currentX = startX;
    brush.classList.remove('hidden');
    updateBrush();
  };

  const onMouseMove = (event) => {
    if (!isDragging) return;
    currentX = getCanvasX(event);
    updateBrush();
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    applyBrushSelection();
  };

  const onWindowBlur = () => {
    isDragging = false;
    brush.classList.add('hidden');
  };

  const onDoubleClick = () => {
    resetTimeFilterForRun(runKey);
  };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onWindowBlur);

  chartBrushInteractions[runKey] = {
    cleanup: () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      brush.remove();
    }
  };
}

function renderChartForRun(runKey, sharedScales = null) {
  const run = runStore[runKey];
  const timeseries = getFilteredTimeseriesForRun(runKey);
  const runUi = getRunUiConfig(runKey);
  const chartId = runUi.chartId;
  const legendId = runUi.legendId;

  if (charts[runKey]) {
    charts[runKey].destroy();
    charts[runKey] = null;
  }
  detachChartBrushInteraction(runKey);

  if (!run.loaded || !timeseries) return;

  const settings = settingsStore[runKey];
  const bucketSizeMs = parseGranularityToMs(settings.granularity);
  if (!bucketSizeMs) return;

  const metricKeys = settings.selectedMetrics.filter((metricKey) => timeseries[metricKey]);
  if (metricKeys.length === 0) return;

  let labels = [];
  let datasets = [];
  let sortedTimestamps = [];
  let usesSecondaryAxis = false;
  let lineIndex = 0;
  const legendContainer = document.getElementById(legendId);

  if (settings.chartView === 'overall') {
    legendContainer.style.display = 'none';

    const allTimestamps = new Set();
    const metricSeriesMap = {};

    metricKeys.forEach((metricKey) => {
      const series = aggregateSeries(timeseries[metricKey].overall, bucketSizeMs);
      metricSeriesMap[metricKey] = series;
      collectSortedTimestampsFromSeries(series).forEach((ts) => allTimestamps.add(ts));
    });

    sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    labels = sortedTimestamps.map((ts) => formatTimeLabel(ts));

    metricKeys.forEach((metricKey) => {
      const valuesByTimestamp = new Map((metricSeriesMap[metricKey] || []).map((item) => [item.timestamp, item.value]));
      const values = sortedTimestamps.map((ts) => valuesByTimestamp.get(ts) || 0);
      const axis = settings.axisAssignments[metricKey] || METRIC_CONFIG[metricKey]?.axis || 'y';
      if (axis === 'y1') usesSecondaryAxis = true;
      datasets.push(createDataset(METRIC_CONFIG[metricKey]?.label || metricKey, values, metricKey, axis, lineIndex));
      lineIndex += 1;
    });
  } else {
    const scenarioSet = new Set();
    const aggregatedByMetric = {};
    const allTimestamps = new Set();

    metricKeys.forEach((metricKey) => {
      const byScenario = aggregateByScenario(timeseries[metricKey].byScenario, bucketSizeMs);
      aggregatedByMetric[metricKey] = byScenario;
      Object.keys(byScenario).forEach((scenario) => scenarioSet.add(scenario));
      collectSortedTimestampsFromByScenario(byScenario).forEach((ts) => allTimestamps.add(ts));
    });

    const scenarios = Array.from(scenarioSet);
    const scenarioColors = generateColors(scenarios.length);
    const scenarioColorByName = new Map(scenarios.map((scenario, index) => [scenario, scenarioColors[index].border]));

    sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    labels = sortedTimestamps.map((ts) => formatTimeLabel(ts));

    metricKeys.forEach((metricKey) => {
      const axis = settings.axisAssignments[metricKey] || METRIC_CONFIG[metricKey]?.axis || 'y';
      if (axis === 'y1') usesSecondaryAxis = true;

      scenarios.forEach((scenario) => {
        const scenarioDataArray = aggregatedByMetric[metricKey][scenario] || [];
        const valuesByTimestamp = new Map(scenarioDataArray.map((item) => [item.timestamp, item.value]));
        const values = sortedTimestamps.map((ts) => valuesByTimestamp.get(ts) || 0);

        const dataset = createDataset(
          `${scenario} - ${METRIC_CONFIG[metricKey]?.label || metricKey}`,
          values,
          metricKey,
          axis,
          lineIndex
        );
        dataset.borderColor = scenarioColorByName.get(scenario) || dataset.borderColor;
        dataset.pointBackgroundColor = dataset.borderColor;
        dataset.backgroundColor = 'rgba(0, 0, 0, 0)';

        datasets.push(dataset);
        lineIndex += 1;
      });
    });

    updateScenarioLegend(legendContainer, scenarios, scenarioColors);
  }

  const canvas = document.getElementById(chartId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const viewTitle = settings.chartView === 'overall' ? 'Overall' : 'By Scenario';
  const metricTitle = metricKeys.map((metricKey) => METRIC_CONFIG[metricKey]?.label || metricKey).join(', ');
  const leftAxisTitle = getAxisTitle(settings, metricKeys, 'y') || 'Primary Axis';
  const rightAxisTitle = getAxisTitle(settings, metricKeys, 'y1') || 'Secondary Axis';

  charts[runKey] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: `${runKey.toUpperCase()} - ${viewTitle}: ${metricTitle} (${settings.granularity})`,
          font: { size: 16, weight: 'bold' }
        },
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ...(sharedScales?.yMax ? { max: sharedScales.yMax } : {}),
          title: {
            display: true,
            text: leftAxisTitle
          }
        },
        y1: {
          type: 'linear',
          display: usesSecondaryAxis,
          position: 'right',
          beginAtZero: true,
          ...(sharedScales?.y1Max && usesSecondaryAxis ? { max: sharedScales.y1Max } : {}),
          title: {
            display: usesSecondaryAxis,
            text: rightAxisTitle
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });

  attachChartBrushInteraction(runKey, charts[runKey], sortedTimestamps);
}

function updateScenarioLegend(container, scenarios, colors) {
  if (!container) return;

  if (scenarios.length <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'grid';
  container.innerHTML = '';

  scenarios.forEach((scenario, index) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const colorBox = document.createElement('span');
    colorBox.className = 'legend-color';
    colorBox.style.backgroundColor = colors[index].border;

    const label = document.createElement('span');
    label.textContent = scenario;

    item.appendChild(colorBox);
    item.appendChild(label);
    container.appendChild(item);
  });
}

function getScenarioFailedTotals(runKey) {
  const run = runStore[runKey];
  const timeseries = getFilteredTimeseriesForRun(runKey);
  const totals = {};
  if (!run.loaded || !timeseries?.failedRequests?.byScenario) return totals;

  Object.entries(timeseries.failedRequests.byScenario).forEach(([scenario, points]) => {
    totals[scenario] = (points || []).reduce((sum, point) => sum + (Number(point.value) || 0), 0);
  });

  return totals;
}

function renderScenarioErrorSummary() {
  RUN_KEYS.forEach((runKey) => renderScenarioErrorListForRun(runKey, scenarioErrorLists[runKey]));
}

function renderScenarioErrorListForRun(runKey, container) {
  if (!container) return;

  const totals = getScenarioFailedTotals(runKey);
  const scenarios = Object.keys(totals).sort((a, b) => (totals[b] || 0) - (totals[a] || 0));

  container.innerHTML = '';

  if (scenarios.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'failed-endpoint-empty';
    empty.textContent = 'No failed HTTP requests by scenario for this run.';
    container.appendChild(empty);
    return;
  }

  scenarios.forEach((scenario) => {
    const row = document.createElement('div');
    row.className = 'scenario-error-row';
    row.style.gridTemplateColumns = 'minmax(180px, 2fr) minmax(80px, 0.8fr)';

    const name = document.createElement('span');
    name.className = 'scenario-error-name';
    name.textContent = scenario;

    const value = document.createElement('span');
    value.className = 'scenario-error-value';
    value.textContent = Math.round(totals[scenario] || 0).toLocaleString();

    row.appendChild(name);
    row.appendChild(value);
    container.appendChild(row);
  });
}

function getSortedEndpoints(endpoints, runKey = 'a') {
  const allEndpoints = [...(endpoints || [])];
  const sortKey = appState.endpointSort[runKey] || 'requests';

  const comparators = {
    requests: (a, b) => (b.count || 0) - (a.count || 0),
    avg: (a, b) => (b.avgDuration || 0) - (a.avgDuration || 0),
    p95: (a, b) => (b.p95 || 0) - (a.p95 || 0),
    failed: (a, b) => (b.failCount || 0) - (a.failCount || 0)
  };

  const comparator = comparators[sortKey] || comparators.requests;
  return allEndpoints.sort((left, right) => {
    const bySort = comparator(left, right);
    if (bySort !== 0) return bySort;
    return (right.count || 0) - (left.count || 0);
  });
}

function renderEndpointSectionForRun(runKey) {
  const runUi = getRunUiConfig(runKey);
  const sectionId = runUi.endpointSectionId;
  const endpointListId = runUi.endpointListId;
  const endpointSection = document.getElementById(sectionId);
  const endpointList = document.getElementById(endpointListId);
  const endpointData = runStore[runKey].endpoints;

  if (!endpointSection || !endpointList) return;

  if (!endpointData || !endpointData.endpoints || endpointData.endpoints.length === 0) {
    endpointSection.style.display = 'none';
    endpointList.innerHTML = '';
    destroyEndpointCharts(runKey);
    return;
  }

  if (isRunVisible(runKey)) {
    endpointSection.style.display = 'block';
  } else {
    endpointSection.style.display = 'none';
    return;
  }

  renderEndpointRequestsChart(runKey);
  renderEndpointDurationChart(runKey);
  renderEndpointList(runKey);
}

function destroyEndpointCharts(runKey) {
  const runUi = getRunUiConfig(runKey);
  const reqKey = runUi.endpointRequestsChartKey;
  const durKey = runUi.endpointDurationChartKey;

  if (charts[reqKey]) {
    charts[reqKey].destroy();
    charts[reqKey] = null;
  }
  if (charts[durKey]) {
    charts[durKey].destroy();
    charts[durKey] = null;
  }
}

function splitEndpointDisplay(endpoint) {
  if (!endpoint) {
    return { host: 'Endpoint', path: 'Unknown', full: 'Unknown' };
  }

  try {
    const parsed = new URL(endpoint);
    const query = parsed.search || '';
    return {
      host: parsed.host,
      path: `${parsed.pathname}${query}` || '/',
      full: endpoint
    };
  } catch (err) {
    const cleaned = String(endpoint);
    const [pathOnly] = cleaned.split('?');
    const pathParts = pathOnly.split('/').filter(Boolean);
    return {
      host: cleaned.startsWith('/') ? 'Relative Path' : 'Endpoint',
      path: pathParts.length > 0 ? `/${pathParts.join('/')}` : cleaned,
      full: cleaned
    };
  }
}

function getEndpointChartLabel(endpoint) {
  const display = splitEndpointDisplay(endpoint);
  return display.path || display.full;
}

function renderEndpointRequestsChart(runKey) {
  const endpointData = runStore[runKey].endpoints;
  if (!endpointData?.endpoints) return;

  const runUi = getRunUiConfig(runKey);
  const chartKey = runUi.endpointRequestsChartKey;
  const canvasId = runUi.endpointRequestsCanvasId;

  if (charts[chartKey]) charts[chartKey].destroy();

  const sortedEndpoints = getSortedEndpoints(endpointData.endpoints, runKey).slice(0, 15);
  const labels = sortedEndpoints.map((ep) => truncateFromFront(getEndpointChartLabel(ep.name), 44));
  const requestCounts = sortedEndpoints.map((ep) => ep.count || 0);

  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `Request Count (Run ${runKey.toUpperCase()})`,
          data: requestCounts,
          borderColor: '#0066cc',
          backgroundColor: 'rgba(0, 102, 204, 0.6)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: {
          display: true,
          text: 'Top Endpoints - Request Count',
          font: { size: 16, weight: 'bold' }
        },
        tooltip: {
          callbacks: {
            title(items) {
              return items.length > 0 ? sortedEndpoints[items[0].dataIndex].name : '';
            },
            label(context) {
              return `Requests: ${Math.round(context.parsed.x).toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            autoSkip: false
          }
        }
      }
    }
  });
}

function renderEndpointDurationChart(runKey) {
  const endpointData = runStore[runKey].endpoints;
  if (!endpointData?.endpoints) return;

  const runUi = getRunUiConfig(runKey);
  const chartKey = runUi.endpointDurationChartKey;
  const canvasId = runUi.endpointDurationCanvasId;

  if (charts[chartKey]) charts[chartKey].destroy();

  const sortedEndpoints = getSortedEndpoints(endpointData.endpoints, runKey).slice(0, 15);
  const labels = sortedEndpoints.map((ep) => truncateFromFront(getEndpointChartLabel(ep.name), 44));

  const metrics = [
    { key: 'avgDuration', label: 'Avg', color: '#0066cc' },
    { key: 'p50', label: 'p50', color: '#059669' },
    { key: 'p75', label: 'p75', color: '#f59e0b' },
    { key: 'p90', label: 'p90', color: '#dc2626' },
    { key: 'p95', label: 'p95', color: '#8b5cf6' },
    { key: 'p99', label: 'p99', color: '#06b6d4' }
  ];

  const datasets = metrics.map((metric) => ({
    label: metric.label,
    data: sortedEndpoints.map((ep) => ep[metric.key] || 0),
    backgroundColor: metric.color,
    borderColor: metric.color,
    borderWidth: 1
  }));

  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[chartKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        title: {
          display: true,
          text: 'Top Endpoints - Response Time Distribution (ms)',
          font: { size: 16, weight: 'bold' }
        },
        tooltip: {
          callbacks: {
            title(items) {
              return items.length > 0 ? sortedEndpoints[items[0].dataIndex].name : '';
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            autoSkip: false
          }
        }
      }
    }
  });
}

function renderEndpointList(runKey) {
  const runUi = getRunUiConfig(runKey);
  const endpointList = document.getElementById(runUi.endpointListId);
  if (!endpointList) return;

  const endpointData = runStore[runKey].endpoints;
  if (!endpointData?.endpoints) return;

  const sortedEndpoints = getSortedEndpoints(endpointData.endpoints, runKey);

  endpointList.innerHTML = '';

  if (sortedEndpoints.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'failed-endpoint-empty';
    emptyState.textContent = 'No endpoint records found for this run.';
    endpointList.appendChild(emptyState);
    return;
  }

  sortedEndpoints.forEach((endpoint) => {
    const display = splitEndpointDisplay(endpoint.name);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'endpoint-list-row endpoint-list-row-expandable';
    row.title = display.full;
    row.setAttribute('aria-expanded', 'false');

    const main = document.createElement('div');
    main.className = 'endpoint-main';

    const host = document.createElement('span');
    host.className = 'endpoint-host';
    host.textContent = display.host;

    const path = document.createElement('div');
    path.className = 'endpoint-path';
    path.textContent = truncateMiddle(display.path || display.full, 72);

    const full = document.createElement('div');
    full.className = 'endpoint-full';
    full.textContent = truncateMiddle(display.full, 96);

    main.appendChild(host);
    main.appendChild(path);
    main.appendChild(full);
    row.appendChild(main);

    const stats = [
      { label: 'Requests', value: formatNumberCompact(endpoint.count) },
      { label: 'Avg', value: formatDurationCompact(endpoint.avgDuration) },
      { label: 'p95', value: formatDurationCompact(endpoint.p95) },
      { label: 'Failed', value: formatNumberCompact(endpoint.failCount) }
    ];

    stats.forEach((stat) => {
      const statEl = document.createElement('div');
      statEl.className = 'endpoint-stat';

      const statLabel = document.createElement('span');
      statLabel.className = 'endpoint-stat-label';
      statLabel.textContent = stat.label;

      const statValue = document.createElement('span');
      statValue.className = 'endpoint-stat-value';
      statValue.textContent = stat.value;

      statEl.appendChild(statLabel);
      statEl.appendChild(statValue);
      row.appendChild(statEl);
    });

    const detail = document.createElement('div');
    detail.className = 'endpoint-detail';
    detail.hidden = true;

    const detailHeader = document.createElement('div');
    detailHeader.className = 'endpoint-detail-header';
    detailHeader.textContent = `Run ${runKey.toUpperCase()} failed HTTPS requests by status`;
    detail.appendChild(detailHeader);

    const failedStatuses = endpoint.failedStatusCodes || [];
    if (failedStatuses.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'failed-endpoint-empty';
      emptyState.textContent = 'No failed HTTPS requests recorded for this endpoint.';
      detail.appendChild(emptyState);
    } else {
      const statusList = document.createElement('div');
      statusList.className = 'failed-status-list';

      failedStatuses.forEach((statusEntry) => {
        const badge = document.createElement('span');
        badge.className = 'failed-status-badge';
        badge.textContent = `${statusEntry.statusCode} x${formatNumberCompact(statusEntry.count)}`;
        statusList.appendChild(badge);
      });

      detail.appendChild(statusList);
    }

    row.appendChild(detail);
    row.addEventListener('click', () => {
      const isExpanded = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!isExpanded));
      detail.hidden = isExpanded;
    });

    endpointList.appendChild(row);
  });
}

function displayMetricsForRun(runKey) {
  const metrics = getDisplayedMetricsForRun(runKey);
  if (!metrics) return;

  const formatNumber = (num) => {
    if (num === null || num === undefined || num === '-') return '-';
    if (typeof num !== 'number') return num;
    return Math.round(num).toLocaleString();
  };

  const formatDuration = (ms) => {
    if (ms === null || ms === undefined || ms === '-') return '-';
    return Math.round(ms).toLocaleString();
  };

  const formatTestDuration = (ms) => {
    if (ms === null || ms === undefined || ms === 0) return '-';
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const formatRate = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const suffix = getRunUiConfig(runKey).suffix;
  const durationSeconds = (Number(metrics.testDuration) || 0) / 1000;
  const requestsPerSecond = durationSeconds > 0 ? (Number(metrics.httpReqs) || 0) / durationSeconds : null;

  document.getElementById(`metricTestDuration${suffix}`).textContent = formatTestDuration(metrics.testDuration);
  document.getElementById(`metricRequestsPerSecond${suffix}`).textContent = formatRate(requestsPerSecond);
  document.getElementById(`metricTotalVUsers${suffix}`).textContent = formatNumber(metrics.vus?.max || 0);
  document.getElementById(`metricWsSessions${suffix}`).textContent = formatNumber(metrics.wsSessions);
  document.getElementById(`metricWsMsgsSent${suffix}`).textContent = formatNumber(metrics.wsMsgsSent);
  document.getElementById(`metricWsMsgsReceived${suffix}`).textContent = formatNumber(metrics.wsMsgsReceived);
  document.getElementById(`metricRequests${suffix}`).textContent = formatNumber(metrics.httpReqs);
  document.getElementById(`metricMinDuration${suffix}`).textContent = formatDuration(metrics.httpReqDuration.min);
  document.getElementById(`metricMaxDuration${suffix}`).textContent = formatDuration(metrics.httpReqDuration.max);
  document.getElementById(`metricDataReceived${suffix}`).textContent = formatBytes(metrics.dataReceived);
  document.getElementById(`metricDataSent${suffix}`).textContent = formatBytes(metrics.dataSent);
  document.getElementById(`metricIterationAvg${suffix}`).textContent = formatDuration(metrics.iterationDuration.avg);
}

function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
}

function showError(message) {
  errorText.textContent = message;
  error.style.display = 'block';
}

function hideError() {
  error.style.display = 'none';
}

function resetApplicationState() {
  RUN_KEYS.forEach((runKey) => {
    runStore[runKey] = createEmptyRun();
    settingsStore[runKey] = createDefaultSettings();
  });

  appState.compareRunCount = 1;
  appState.coupledSettings = true;
  appState.settingsTarget = 'a';
  appState.endpointSort = Object.fromEntries(RUN_KEYS.map((runKey) => [runKey, 'requests']));

  if (compareModeSelect) compareModeSelect.value = '1';
  RUN_KEYS.forEach((runKey) => {
    const coupleToggle = coupleSettingsToggles[runKey];
    const sortSelect = endpointSortSelects[runKey];
    if (coupleToggle) coupleToggle.checked = true;
    if (sortSelect) sortSelect.value = 'requests';
  });

  setUploadTargetControls('a');

  Object.keys(charts).forEach((key) => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
  RUN_KEYS.forEach((runKey) => detachChartBrushInteraction(runKey));

  RUN_KEYS.forEach((runKey) => {
    const scenarioList = scenarioErrorLists[runKey];
    if (scenarioList) scenarioList.innerHTML = '';
    updateTimeFilterUiForRun(runKey);
  });

  resultsSection.style.display = 'block';
  resultsSection.classList.add('visible');
  if (rootContainer) rootContainer.classList.remove('compare-full');
  progressContainer.style.display = 'none';
  hideError();

  syncControlsFromActiveSettings();
  updateToolbarState();
}

async function initializeApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;

  bindUploadEvents();
  bindControlEvents();
  syncControlsFromActiveSettings();
  updateToolbarState();

  try {
    const response = await fetch('/api/metrics');
    if (response.ok) {
      await loadResultsForRun('a');
    }
  } catch (err) {
    // Keep empty dashboard visible when no previous results exist.
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

export { initializeApp };
