function createAnalysisStore() {
  let currentAnalysis = null;

  return {
    get() {
      return currentAnalysis;
    },
    set(nextAnalysis) {
      currentAnalysis = nextAnalysis;
    },
    has() {
      return !!currentAnalysis;
    },
    clear() {
      currentAnalysis = null;
    }
  };
}

module.exports = {
  createAnalysisStore
};
