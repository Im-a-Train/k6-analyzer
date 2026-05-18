const METRIC_CARD_DEFINITIONS = [
  { key: 'TestDuration', title: 'Test Duration', unit: 'seconds' },
  { key: 'RequestsPerSecond', title: 'Overall Requests / s', unit: 'req/s' },
  { key: 'TotalVUsers', title: 'Total vUsers', unit: 'vusers' },
  { key: 'WsSessions', title: 'WebSocket Sessions', unit: 'sessions' },
  { key: 'WsMsgsSent', title: 'WS Messages Sent', unit: 'messages' },
  { key: 'WsMsgsReceived', title: 'WS Messages Received', unit: 'messages' },
  { key: 'Requests', title: 'Total Requests', unit: 'requests' },
  { key: 'MinDuration', title: 'Response Time (min)', unit: 'milliseconds' },
  { key: 'MaxDuration', title: 'Response Time (max)', unit: 'milliseconds' },
  { key: 'DataReceived', title: 'Data Received', unit: 'bytes' },
  { key: 'DataSent', title: 'Data Sent', unit: 'bytes' },
  { key: 'IterationAvg', title: 'Iteration Duration (avg)', unit: 'milliseconds' }
];

const METRIC_PRESETS = [
  { key: 'load', label: 'Load', active: true },
  { key: 'errors', label: 'Errors' },
  { key: 'latency', label: 'Latency' },
  { key: 'all', label: 'All' }
];

const METRIC_SELECTOR_DEFINITIONS = [
  { key: 'vus', label: 'Virtual Users', checked: true, defaultAxis: 'y' },
  { key: 'requests', label: 'Requests', checked: true, defaultAxis: 'y' },
  { key: 'failedRequests', label: 'Failed Requests', checked: true, defaultAxis: 'y' },
  { key: 'iterations', label: 'Iterations', checked: false, defaultAxis: 'y' },
  { key: 'wsMsgsSent', label: 'WS Messages Sent', checked: false, defaultAxis: 'y' },
  { key: 'wsMsgsReceived', label: 'WS Messages Received', checked: false, defaultAxis: 'y' },
  { key: 'responseTimeAvg', label: 'Response Time (avg ms)', checked: false, defaultAxis: 'y1' }
];

function getSuffix(runKey) {
  return runKey === 'a' ? '' : 'B';
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendSortOptions(select) {
  const options = [
    { value: 'requests', label: 'Requests', selected: true },
    { value: 'avg', label: 'AVG' },
    { value: 'p95', label: 'P95' },
    { value: 'failed', label: 'Failed' }
  ];

  options.forEach((optionDef) => {
    const option = createElement('option', '', optionDef.label);
    option.value = optionDef.value;
    if (optionDef.selected) option.selected = true;
    select.appendChild(option);
  });
}

function buildEndpointPanel(runKey) {
  const suffix = getSuffix(runKey);
  const contentId = runKey === 'a' ? 'endpointPanelContentA' : 'endpointPanelContentB';
  const content = document.getElementById(contentId);
  if (!content) return;

  content.innerHTML = '';

  const header = createElement('div', 'endpoint-section-header');
  const title = createElement('h2', '', `Endpoint Breakdown (Run ${runKey.toUpperCase()})`);
  const subtitle = createElement('p', '', 'Requests and duration percentiles are shown separately per endpoint.');
  header.appendChild(title);
  header.appendChild(subtitle);
  content.appendChild(header);

  const chartGrid = createElement('div', 'endpoint-chart-grid');

  const requestsCard = createElement('article', 'endpoint-chart-card');
  requestsCard.appendChild(createElement('h3', '', 'Requests by Endpoint'));
  const requestsContainer = createElement('div', 'endpoint-chart-container');
  const requestsCanvas = createElement('canvas');
  requestsCanvas.id = `endpointRequestsChart${suffix}`;
  requestsContainer.appendChild(requestsCanvas);
  requestsCard.appendChild(requestsContainer);

  const durationCard = createElement('article', 'endpoint-chart-card');
  durationCard.appendChild(createElement('h3', '', 'Response Time by Endpoint'));
  const durationContainer = createElement('div', 'endpoint-chart-container');
  const durationCanvas = createElement('canvas');
  durationCanvas.id = `endpointDurationChart${suffix}`;
  durationContainer.appendChild(durationCanvas);
  durationCard.appendChild(durationContainer);

  chartGrid.appendChild(requestsCard);
  chartGrid.appendChild(durationCard);
  content.appendChild(chartGrid);

  const listCard = createElement('article', 'endpoint-list-card');
  const listHeader = createElement('div', 'endpoint-list-header');
  listHeader.appendChild(createElement('h3', '', 'Endpoint Summary'));
  listHeader.appendChild(
    createElement('p', '', 'Compact paths are shown here. Click an endpoint to expand its failed HTTPS status breakdown.')
  );
  listCard.appendChild(listHeader);

  const controls = createElement('div', 'endpoint-summary-controls');
  const label = createElement('label', '', 'Order By');
  const select = createElement('select');
  select.id = `endpointSortSelect${suffix}`;
  select.setAttribute('aria-label', runKey === 'a' ? 'Endpoint summary order' : 'Endpoint summary order for run b');
  label.setAttribute('for', select.id);
  appendSortOptions(select);
  controls.appendChild(label);
  controls.appendChild(select);
  listCard.appendChild(controls);

  const list = createElement('div', 'endpoint-list');
  list.id = `endpointList${suffix}`;
  listCard.appendChild(list);

  content.appendChild(listCard);
}

function createMetricCard(runKey, definition) {
  const suffix = getSuffix(runKey);
  const card = createElement('div', 'metric-card');
  const title = createElement('h3', '', definition.title);
  card.appendChild(title);

  if (definition.key === 'Checks') {
    const checkStats = createElement('div', 'check-stats');

    const passed = createElement('span', 'check-passed', '0');
    passed.id = `checksPassed${suffix}`;

    const separator = createElement('span', 'check-separator', '/');

    const total = createElement('span', 'check-total', '0');
    total.id = `checksTotal${suffix}`;

    checkStats.appendChild(passed);
    checkStats.appendChild(separator);
    checkStats.appendChild(total);
    card.appendChild(checkStats);
  } else {
    const value = createElement('p', 'metric-value', '-');
    value.id = `metric${definition.key}${suffix}`;
    card.appendChild(value);
  }

  const unit = createElement('span', 'metric-unit', definition.unit);
  card.appendChild(unit);

  return card;
}

function renderMetricCards(runKey) {
  const container = document.getElementById(runKey === 'a' ? 'metricsGridA' : 'metricsGridB');
  if (!container) return;

  container.innerHTML = '';
  METRIC_CARD_DEFINITIONS.forEach((definition) => {
    container.appendChild(createMetricCard(runKey, definition));
  });
}

function renderMetricPresets(runKey) {
  const container = document.getElementById(runKey === 'a' ? 'metricPresets' : 'metricPresetsB');
  if (!container) return;

  container.innerHTML = '';
  METRIC_PRESETS.forEach((preset) => {
    const button = createElement('button', `metric-preset-btn${preset.active ? ' active' : ''}`, preset.label);
    button.type = 'button';
    button.dataset.preset = preset.key;
    container.appendChild(button);
  });
}

function createAxisSelector(runKey, metricKey, defaultAxis) {
  const suffixText = runKey === 'a' ? '' : ' B';
  const select = createElement('select', 'metric-axis-select');
  select.dataset.metric = metricKey;
  select.setAttribute('aria-label', `Axis for ${metricKey}${suffixText}`);

  const leftOption = createElement('option', '', 'Left');
  leftOption.value = 'y';
  if (defaultAxis === 'y') leftOption.selected = true;

  const rightOption = createElement('option', '', 'Right');
  rightOption.value = 'y1';
  if (defaultAxis === 'y1') rightOption.selected = true;

  select.appendChild(leftOption);
  select.appendChild(rightOption);

  return select;
}

function renderMetricSelectors(runKey) {
  const container = document.getElementById(runKey === 'a' ? 'metricSelectors' : 'metricSelectorsB');
  if (!container) return;

  container.innerHTML = '';

  METRIC_SELECTOR_DEFINITIONS.forEach((definition) => {
    const label = createElement('label', 'metric-selector-item');

    const checkbox = createElement('input', 'metric-checkbox');
    checkbox.type = 'checkbox';
    checkbox.value = definition.key;
    checkbox.checked = definition.checked;

    const text = createElement('span', '', definition.label);

    const axisSelector = createAxisSelector(runKey, definition.key, definition.defaultAxis);

    label.appendChild(checkbox);
    label.appendChild(text);
    label.appendChild(axisSelector);

    container.appendChild(label);
  });
}

function buildRunSections() {
  ['a', 'b'].forEach((runKey) => {
    renderMetricCards(runKey);
    renderMetricPresets(runKey);
    renderMetricSelectors(runKey);
    buildEndpointPanel(runKey);
  });
}

buildRunSections();
