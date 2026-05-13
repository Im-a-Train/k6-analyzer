const express = require('express');
const cors = require('cors');
const { createAnalysisStore } = require('./analysis-store');
const { createUploadMiddleware } = require('./middleware/upload-handler');
const { createApiRouter } = require('./routes/api-routes');

function createApp(config) {
  const app = express();
  const analysisStore = createAnalysisStore();

  app.use(cors());
  app.use(express.json({ limit: '500mb' }));
  app.use(express.static('public'));

  app.use('/api', createApiRouter({
    analysisStore,
    uploadMiddleware: createUploadMiddleware(config.maxUploadBytes),
    maxFullJsonParseBytes: config.maxFullJsonParseBytes,
    maxDurationSamplesPerEndpoint: config.maxDurationSamplesPerEndpoint
  }));

  return app;
}

module.exports = {
  createApp
};
