const RUN_UI_CONFIG = {
  a: {
    suffix: '',
    chartId: 'chartA',
    legendId: 'scenarioLegendA',
    endpointSectionId: 'endpointSection',
    endpointListId: 'endpointList',
    endpointRequestsCanvasId: 'endpointRequestsChart',
    endpointDurationCanvasId: 'endpointDurationChart',
    endpointRequestsChartKey: 'endpointRequestsA',
    endpointDurationChartKey: 'endpointDurationA'
  },
  b: {
    suffix: 'B',
    chartId: 'chartB',
    legendId: 'scenarioLegendB',
    endpointSectionId: 'endpointSectionB',
    endpointListId: 'endpointListB',
    endpointRequestsCanvasId: 'endpointRequestsChartB',
    endpointDurationCanvasId: 'endpointDurationChartB',
    endpointRequestsChartKey: 'endpointRequestsB',
    endpointDurationChartKey: 'endpointDurationB'
  },
  c: {
    suffix: 'C',
    chartId: 'chartC',
    legendId: 'scenarioLegendC',
    endpointSectionId: 'endpointSectionC',
    endpointListId: 'endpointListC',
    endpointRequestsCanvasId: 'endpointRequestsChartC',
    endpointDurationCanvasId: 'endpointDurationChartC',
    endpointRequestsChartKey: 'endpointRequestsC',
    endpointDurationChartKey: 'endpointDurationC'
  }
};

export function getRunUiConfig(runKey) {
  return RUN_UI_CONFIG[runKey] || RUN_UI_CONFIG.a;
}
