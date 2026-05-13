function startServerWithRetry(app, initialPort) {
  const server = app.listen(initialPort, () => {
    console.log(`K6 Analyzer running at http://localhost:${initialPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = initialPort + 1;
      console.log(`Port ${initialPort} is in use, trying ${nextPort}...`);
      startServerWithRetry(app, nextPort);
      return;
    }

    throw err;
  });

  return server;
}

module.exports = {
  startServerWithRetry
};
