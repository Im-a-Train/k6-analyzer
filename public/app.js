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

const uploadRunBtnA = document.getElementById('uploadRunBtnA');
const uploadRunBtnB = document.getElementById('uploadRunBtnB');
const compareModeToggle = document.getElementById('compareModeToggle');
const coupleSettingsToggleA = document.getElementById('coupleSettingsToggleA');
const coupleSettingsToggleB = document.getElementById('coupleSettingsToggleB');
const coupleSettingsWrapA = document.getElementById('coupleSettingsWrapA');
const coupleSettingsWrapB = document.getElementById('coupleSettingsWrapB');
const resetResultsBtn = document.getElementById('resetResultsBtn');
const resultsMainTitle = document.getElementById('resultsMainTitle');
const runHeaderTitleA = document.getElementById('runHeaderTitleA');
const runHeaderTitleB = document.getElementById('runHeaderTitleB');
const runHeaderRangeA = document.getElementById('runHeaderRangeA');
const runHeaderRangeB = document.getElementById('runHeaderRangeB');

const granularityInput = document.getElementById('granularityInput');
const applyGranularityBtn = document.getElementById('applyGranularityBtn');
const metricSelectors = document.getElementById('metricSelectors');
const metricPresets = document.getElementById('metricPresets');
const granularityInputB = document.getElementById('granularityInputB');
const applyGranularityBtnB = document.getElementById('applyGranularityBtnB');
const metricSelectorsB = document.getElementById('metricSelectorsB');
const metricPresetsB = document.getElementById('metricPresetsB');
const chartToggleA = document.getElementById('chartToggleA');
const chartToggleB = document.getElementById('chartToggleB');
const endpointSortSelect = document.getElementById('endpointSortSelect');
const endpointSortSelectB = document.getElementById('endpointSortSelectB');
const scenarioErrorListA = document.getElementById('scenarioErrorListA');
const scenarioErrorListB = document.getElementById('scenarioErrorListB');

const chartsCompareGrid = document.getElementById('chartsCompareGrid');
const chartsSectionB = document.getElementById('chartsSectionB');
const metricsPanelB = document.getElementById('metricsPanelB');
const endpointSectionB = document.getElementById('endpointSectionB');
const metricsCompareGrid = document.getElementById('metricsCompareGrid');
const endpointCompareGrid = document.getElementById('endpointCompareGrid');

const METRIC_CONFIG = {
  vus: { label: 'Virtual Users', axis: 'y' },
  requests: { label: 'Requests', axis: 'y' },
  failedRequests: { label: 'Failed Requests', axis: 'y' },
  iterations: { label: 'Iterations', axis: 'y' },
  responseTimeAvg: { label: 'Response Time (avg ms)', axis: 'y1' }
};

const METRIC_PRESETS = {
  load: ['vus', 'requests', 'failedRequests'],
  errors: ['requests', 'failedRequests'],
  latency: ['responseTimeAvg', 'requests'],
  all: ['vus', 'requests', 'failedRequests', 'iterations', 'responseTimeAvg']
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
    endpoints: null
  };
}

const runStore = {
  a: createEmptyRun(),
  b: createEmptyRun()
};

const settingsStore = {
  a: createDefaultSettings(),
  b: createDefaultSettings()
};

const appState = {
  compareEnabled: false,
  coupledSettings: true,
  settingsTarget: 'a',
  endpointSort: {
    a: 'requests',
    b: 'requests'
  }
};

const charts = {
  a: null,
  b: null,
  endpointRequestsA: null,
  endpointRequestsB: null,
  endpointDurationA: null,
  endpointDurationB: null
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

function getControlElements(runKey) {
  if (runKey === 'b') {
    return {
      granularityInput: granularityInputB,
      applyGranularityBtn: applyGranularityBtnB,
      metricSelectors: metricSelectorsB,
      metricPresets: metricPresetsB,
      chartToggle: chartToggleB
    };
  }

  return {
    granularityInput,
    applyGranularityBtn,
    metricSelectors,
    metricPresets,
    chartToggle: chartToggleA
  };
}

function getUploadTarget() {
  return pendingUploadTarget;
}

function getPrimaryRunKey() {
  if (runStore.a.loaded) return 'a';
  if (runStore.b.loaded) return 'b';
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

  if (uploadRunBtnA) {
    uploadRunBtnA.addEventListener('click', () => {
      pendingUploadTarget = 'a';
      fileInput.click();
    });
  }

  if (uploadRunBtnB) {
    uploadRunBtnB.addEventListener('click', () => {
      pendingUploadTarget = 'b';
      fileInput.click();
    });
  }

  if (resetResultsBtn) {
    resetResultsBtn.addEventListener('click', resetApplicationState);
  }
}

function applySettingsToTargets(mutator, sourceRunKey = 'a') {
  const targets = appState.coupledSettings ? ['a', 'b'] : [sourceRunKey];
  targets.forEach((runKey) => mutator(settingsStore[runKey]));

  if (appState.coupledSettings) {
    settingsStore.b = cloneSettings(settingsStore.a);
  }
}

function bindControlEvents() {
  ['a', 'b'].forEach((runKey) => {
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

  if (compareModeToggle) {
    compareModeToggle.addEventListener('change', () => {
      appState.compareEnabled = compareModeToggle.checked;
      renderAll();
    });
  }

  const onCoupleToggleChange = (checked) => {
    appState.coupledSettings = checked;
    if (appState.coupledSettings) {
      settingsStore.b = cloneSettings(settingsStore.a);
    }
    syncControlsFromActiveSettings();
    updateToolbarState();
    renderAll();
  };

  if (coupleSettingsToggleA) {
    coupleSettingsToggleA.addEventListener('change', () => {
      onCoupleToggleChange(coupleSettingsToggleA.checked);
    });
  }

  if (coupleSettingsToggleB) {
    coupleSettingsToggleB.addEventListener('change', () => {
      onCoupleToggleChange(coupleSettingsToggleB.checked);
    });
  }

  if (endpointSortSelect) {
    endpointSortSelect.addEventListener('change', () => {
      appState.endpointSort.a = endpointSortSelect.value;
      renderEndpointSectionForRun('a');
    });
  }

  if (endpointSortSelectB) {
    endpointSortSelectB.addEventListener('change', () => {
      appState.endpointSort.b = endpointSortSelectB.value;
      renderEndpointSectionForRun('b');
    });
  }
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

function getRunDateRange(runKey) {
  const run = runStore[runKey];
  if (!run.loaded || !run.timeseries) return null;

  let minTs = Infinity;
  let maxTs = -Infinity;

  Object.values(run.timeseries).forEach((metricSeries) => {
    (metricSeries?.overall || []).forEach((point) => {
      const ts = Number(point.timestamp);
      if (!Number.isFinite(ts)) return;
      minTs = Math.min(minTs, ts);
      maxTs = Math.max(maxTs, ts);
    });
  });

  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) return null;
  return `${formatHeaderDateTime(minTs)} - ${formatHeaderDateTime(maxTs)}`;
}

function updateResultsHeaderText(showB) {
  const rangeA = getRunDateRange('a');
  const rangeB = getRunDateRange('b');

  if (!showB) {
    if (resultsMainTitle) {
      resultsMainTitle.textContent = rangeA ? `Test Results ${rangeA}` : 'Test Results';
    }
    if (runHeaderTitleA) runHeaderTitleA.textContent = rangeA ? `Test Results ${rangeA}` : 'Test Results';
    if (runHeaderRangeA) runHeaderRangeA.textContent = '';
    if (runHeaderTitleB) runHeaderTitleB.textContent = 'Run B';
    if (runHeaderRangeB) runHeaderRangeB.textContent = rangeB || '';
    return;
  }

  if (resultsMainTitle) resultsMainTitle.textContent = 'Run A | Run B';
  if (runHeaderTitleA) runHeaderTitleA.textContent = 'Run A';
  if (runHeaderTitleB) runHeaderTitleB.textContent = 'Run B';
  if (runHeaderRangeA) runHeaderRangeA.textContent = rangeA || '';
  if (runHeaderRangeB) runHeaderRangeB.textContent = rangeB || '';
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
  syncControlsForRun('a');
  syncControlsForRun('b');
  updateToolbarState();
}

function updateToolbarState() {
  if (coupleSettingsWrapA) coupleSettingsWrapA.classList.toggle('hidden', !appState.compareEnabled);
  if (coupleSettingsWrapB) coupleSettingsWrapB.classList.toggle('hidden', !appState.compareEnabled);

  if (!appState.compareEnabled) {
    appState.coupledSettings = true;
    if (coupleSettingsToggleA) coupleSettingsToggleA.checked = true;
    if (coupleSettingsToggleB) coupleSettingsToggleB.checked = true;
  } else {
    if (coupleSettingsToggleA) coupleSettingsToggleA.checked = appState.coupledSettings;
    if (coupleSettingsToggleB) coupleSettingsToggleB.checked = appState.coupledSettings;
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
    endpoints: runData.endpoints
  };

  if (!runStore.a.loaded && runStore.b.loaded) {
    // Keep controls sensible if B is uploaded first.
    appState.settingsTarget = 'b';
  }

  if (!resultsSection.classList.contains('visible')) {
    resultsSection.style.display = 'block';
    resultsSection.classList.add('visible');
  }

  setUploadTargetControls(runKey);
  renderAll();
}

function renderAll() {
  updateCompareVisibility();
  renderChartForRun('a');
  renderChartForRun('b');
  renderScenarioErrorSummary();
  displayMetricsForRun('a');
  displayMetricsForRun('b');
  renderEndpointSectionForRun('a');
  renderEndpointSectionForRun('b');
}

function updateCompareVisibility() {
  const showB = appState.compareEnabled;

  if (chartsSectionB) chartsSectionB.classList.toggle('hidden', !showB);
  if (metricsPanelB) metricsPanelB.classList.toggle('hidden', !showB);
  if (endpointSectionB) endpointSectionB.classList.toggle('hidden', !showB);
  if (chartsCompareGrid) chartsCompareGrid.classList.toggle('compare-enabled', showB);
  if (metricsCompareGrid) metricsCompareGrid.classList.toggle('compare-enabled', showB);
  if (endpointCompareGrid) endpointCompareGrid.classList.toggle('compare-enabled', showB);
  if (rootContainer) rootContainer.classList.toggle('compare-full', showB);
  updateResultsHeaderText(showB);
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

function renderChartForRun(runKey) {
  const run = runStore[runKey];
  const runUi = getRunUiConfig(runKey);
  const chartId = runUi.chartId;
  const legendId = runUi.legendId;

  if (charts[runKey]) {
    charts[runKey].destroy();
    charts[runKey] = null;
  }

  if (!run.loaded || !run.timeseries) return;

  const settings = settingsStore[runKey];
  const bucketSizeMs = parseGranularityToMs(settings.granularity);
  if (!bucketSizeMs) return;

  const metricKeys = settings.selectedMetrics.filter((metricKey) => run.timeseries[metricKey]);
  if (metricKeys.length === 0) return;

  let labels = [];
  let datasets = [];
  let usesSecondaryAxis = false;
  let lineIndex = 0;
  const legendContainer = document.getElementById(legendId);

  if (settings.chartView === 'overall') {
    legendContainer.style.display = 'none';

    const allTimestamps = new Set();
    const metricSeriesMap = {};

    metricKeys.forEach((metricKey) => {
      const series = aggregateSeries(run.timeseries[metricKey].overall, bucketSizeMs);
      metricSeriesMap[metricKey] = series;
      collectSortedTimestampsFromSeries(series).forEach((ts) => allTimestamps.add(ts));
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
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
      const byScenario = aggregateByScenario(run.timeseries[metricKey].byScenario, bucketSizeMs);
      aggregatedByMetric[metricKey] = byScenario;
      Object.keys(byScenario).forEach((scenario) => scenarioSet.add(scenario));
      collectSortedTimestampsFromByScenario(byScenario).forEach((ts) => allTimestamps.add(ts));
    });

    const scenarios = Array.from(scenarioSet);
    const scenarioColors = generateColors(scenarios.length);
    const scenarioColorByName = new Map(scenarios.map((scenario, index) => [scenario, scenarioColors[index].border]));

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
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
  const totals = {};
  if (!run.loaded || !run.timeseries?.failedRequests?.byScenario) return totals;

  Object.entries(run.timeseries.failedRequests.byScenario).forEach(([scenario, points]) => {
    totals[scenario] = (points || []).reduce((sum, point) => sum + (Number(point.value) || 0), 0);
  });

  return totals;
}

function renderScenarioErrorSummary() {
  renderScenarioErrorListForRun('a', scenarioErrorListA);
  renderScenarioErrorListForRun('b', scenarioErrorListB);
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
    endpointSection.style.display = runKey === 'a' ? 'none' : endpointSection.style.display;
    endpointList.innerHTML = '';
    destroyEndpointCharts(runKey);
    return;
  }

  if (runKey === 'a' || (appState.compareEnabled && runStore.b.loaded)) {
    endpointSection.style.display = 'block';
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
  const metrics = runStore[runKey].metrics;
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

  const suffix = getRunUiConfig(runKey).suffix;
  document.getElementById(`metricTestDuration${suffix}`).textContent = formatTestDuration(metrics.testDuration);
  document.getElementById(`metricRequests${suffix}`).textContent = formatNumber(metrics.httpReqs);
  document.getElementById(`checksPassed${suffix}`).textContent = formatNumber(metrics.checks.passed);
  document.getElementById(`checksTotal${suffix}`).textContent = formatNumber(metrics.checks.passed + metrics.checks.failed);
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
  runStore.a = createEmptyRun();
  runStore.b = createEmptyRun();

  settingsStore.a = createDefaultSettings();
  settingsStore.b = createDefaultSettings();

  appState.compareEnabled = false;
  appState.coupledSettings = true;
  appState.settingsTarget = 'a';
  appState.endpointSort = { a: 'requests', b: 'requests' };

  if (compareModeToggle) compareModeToggle.checked = false;
  if (coupleSettingsToggleA) coupleSettingsToggleA.checked = true;
  if (coupleSettingsToggleB) coupleSettingsToggleB.checked = true;
  if (endpointSortSelect) endpointSortSelect.value = 'requests';
  if (endpointSortSelectB) endpointSortSelectB.value = 'requests';

  setUploadTargetControls('a');

  Object.keys(charts).forEach((key) => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });

  if (scenarioErrorListA) scenarioErrorListA.innerHTML = '';
  if (scenarioErrorListB) scenarioErrorListB.innerHTML = '';

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
