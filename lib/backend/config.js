function toBytesFromMb(mb) {
  return Number(mb || 0) * 1024 * 1024;
}

function toBytesFromGb(gb) {
  return Number(gb || 0) * 1024 * 1024 * 1024;
}

function loadServerConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    maxUploadBytes: Math.floor(toBytesFromGb(env.MAX_UPLOAD_GB || 5)),
    maxFullJsonParseBytes: toBytesFromMb(env.MAX_FULL_JSON_PARSE_MB || 128),
    maxDurationSamplesPerEndpoint: Number(env.MAX_DURATION_SAMPLES_PER_ENDPOINT || 5000)
  };
}

module.exports = {
  loadServerConfig
};
