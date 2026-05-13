const { loadServerConfig } = require('./lib/backend/config');
const { createApp } = require('./lib/backend/app');
const { startServerWithRetry } = require('./lib/backend/server');

const config = loadServerConfig();
const app = createApp(config);

startServerWithRetry(app, config.port);
