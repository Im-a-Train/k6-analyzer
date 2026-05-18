const EXPORT_A4_WIDTH_PX = 794;

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

function getRunDateRange(timeseries) {
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
  return `${formatHeaderDateTime(minTs)} - ${formatHeaderDateTime(maxTs)}`;
}

function buildFileName(runKey) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `k6-report-run-${runKey}-${yyyy}${mm}${dd}-${hh}${min}${ss}.pdf`;
}

function sanitizeExportClone(section) {
  if (!section) return;

  section.classList.remove('hidden');

  const controlsToRemove = [
    '.run-header-actions',
    '.metric-presets',
    '.metric-selectors',
    '.chart-controls',
    '.endpoint-summary-controls',
    '.results-toolbar',
    '.toolbar-toggle'
  ];

  controlsToRemove.forEach((selector) => {
    section.querySelectorAll(selector).forEach((node) => node.remove());
  });
}

function copyCanvasIntoClone(sourceRoot, cloneRoot) {
  const clonedCanvases = Array.from(cloneRoot.querySelectorAll('canvas'));

  clonedCanvases.forEach((clonedCanvas) => {
    const sourceCanvas = clonedCanvas.id ? sourceRoot.querySelector(`#${clonedCanvas.id}`) : null;
    if (!sourceCanvas) return;

    try {
      clonedCanvas.width = sourceCanvas.width;
      clonedCanvas.height = sourceCanvas.height;
      const context = clonedCanvas.getContext('2d');
      if (!context) return;

      context.clearRect(0, 0, clonedCanvas.width, clonedCanvas.height);
      context.drawImage(sourceCanvas, 0, 0, clonedCanvas.width, clonedCanvas.height);
    } catch {
      // Ignore canvas capture failures and continue with remaining content.
    }
  });
}

function buildRunExportSurface(runKey, runStore) {
  const metricsPanelId = runKey === 'a' ? 'metricsPanelA' : 'metricsPanelB';
  const chartsSectionId = runKey === 'a' ? 'chartsSectionA' : 'chartsSectionB';
  const endpointSectionId = runKey === 'a' ? 'endpointSection' : 'endpointSectionB';

  const sourceMetrics = document.getElementById(metricsPanelId);
  const sourceCharts = document.getElementById(chartsSectionId);
  const sourceEndpoints = document.getElementById(endpointSectionId);

  if (!sourceMetrics || !sourceCharts || !sourceEndpoints) {
    throw new Error('Missing report sections in DOM.');
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'export-pdf-surface';
  wrapper.style.width = `${EXPORT_A4_WIDTH_PX}px`;
  wrapper.style.padding = '16px';
  wrapper.style.background = '#ffffff';
  wrapper.style.color = '#0f172a';
  wrapper.style.overflow = 'hidden';

  const runLabel = runKey === 'a' ? 'Run A' : 'Run B';
  const range = getRunDateRange(runStore[runKey]?.timeseries);

  const title = document.createElement('h1');
  title.textContent = range ? `${runLabel} ${range}` : runLabel;
  title.style.margin = '0 0 16px 0';
  title.style.fontSize = '28px';
  title.style.lineHeight = '1.2';
  title.style.color = '#0f172a';
  wrapper.appendChild(title);

  const metricsClone = sourceMetrics.cloneNode(true);
  const chartsClone = sourceCharts.cloneNode(true);
  const endpointsClone = sourceEndpoints.cloneNode(true);

  sanitizeExportClone(metricsClone);
  sanitizeExportClone(chartsClone);
  sanitizeExportClone(endpointsClone);

  copyCanvasIntoClone(sourceMetrics, metricsClone);
  copyCanvasIntoClone(sourceCharts, chartsClone);
  copyCanvasIntoClone(sourceEndpoints, endpointsClone);

  wrapper.appendChild(metricsClone);
  wrapper.appendChild(chartsClone);
  wrapper.appendChild(endpointsClone);

  return wrapper;
}

async function exportRunSurfaceToPdf(surface, fileName) {
  if (!window.html2pdf) {
    throw new Error('html2pdf is not available in the browser.');
  }

  const options = {
    margin: [8, 8, 8, 8],
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait'
    },
    pagebreak: {
      mode: ['css', 'legacy']
    }
  };

  await window.html2pdf().set(options).from(surface).save();
}

export async function exportReportAsPdf(runStore) {
  const runsToExport = ['a', 'b'].filter((runKey) => runStore[runKey]?.loaded);
  if (runsToExport.length === 0) return;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${EXPORT_A4_WIDTH_PX}px`;
  host.style.background = '#ffffff';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  try {
    for (const runKey of runsToExport) {
      const surface = buildRunExportSurface(runKey, runStore);
      host.appendChild(surface);
      await exportRunSurfaceToPdf(surface, buildFileName(runKey));
      surface.remove();
    }
  } catch (error) {
    alert(`PDF export failed: ${error.message}`);
  } finally {
    host.remove();
  }
}
