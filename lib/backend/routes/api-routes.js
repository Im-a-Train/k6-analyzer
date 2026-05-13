const express = require('express');
const fs = require('fs');
const { analyzeUploadedFile } = require('../../analyzer');

function sendMissingAnalysis(res) {
  return res.status(404).json({ error: 'No results loaded' });
}

function createApiRouter(options) {
  const {
    analysisStore,
    uploadMiddleware,
    maxFullJsonParseBytes,
    maxDurationSamplesPerEndpoint
  } = options;

  const router = express.Router();

  router.post('/upload', uploadMiddleware, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
      const analysis = await analyzeUploadedFile(filePath, {
        maxFullJsonParseBytes,
        maxDurationSamplesPerEndpoint
      });

      analysisStore.set(analysis);

      return res.json({
        success: true,
        message: 'Results analyzed successfully',
        summary: analysis.summary
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });

  router.get('/results', (req, res) => {
    res.status(410).json({
      error: 'Raw results endpoint disabled for memory safety. Use /api/metrics, /api/timeseries, and /api/endpoints.'
    });
  });

  router.get('/metrics', (req, res) => {
    if (!analysisStore.has()) return sendMissingAnalysis(res);
    return res.json(analysisStore.get().metrics);
  });

  router.get('/timeseries', (req, res) => {
    if (!analysisStore.has()) return sendMissingAnalysis(res);
    return res.json(analysisStore.get().timeseries);
  });

  router.get('/endpoints', (req, res) => {
    if (!analysisStore.has()) return sendMissingAnalysis(res);
    return res.json(analysisStore.get().endpoints);
  });

  return router;
}

module.exports = {
  createApiRouter
};
