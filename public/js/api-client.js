async function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function uploadResultsFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (onProgress) onProgress(event);
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      const data = await parseJsonSafe(xhr.responseText);
      const fallbackMessage = xhr.status === 413
        ? 'File too large for current server upload limit.'
        : `Upload failed (HTTP ${xhr.status})`;
      reject(new Error((data && data.error) || fallbackMessage));
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}

export async function fetchRunData() {
  const [metricsResponse, timeseriesResponse, endpointsResponse] = await Promise.all([
    fetch('/api/metrics'),
    fetch('/api/timeseries'),
    fetch('/api/endpoints')
  ]);

  if (!metricsResponse.ok) throw new Error('Failed to load metrics');
  if (!timeseriesResponse.ok) throw new Error('Failed to load timeseries data');
  if (!endpointsResponse.ok) throw new Error('Failed to load endpoint data');

  const [metrics, timeseries, endpoints] = await Promise.all([
    metricsResponse.json(),
    timeseriesResponse.json(),
    endpointsResponse.json()
  ]);

  return { metrics, timeseries, endpoints };
}
