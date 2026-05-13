const multer = require('multer');

function createUploadMiddleware(maxUploadBytes) {
  const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: maxUploadBytes }
  });

  return (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        const maxGb = (maxUploadBytes / (1024 * 1024 * 1024)).toFixed(1);
        return res.status(413).json({
          error: `File too large. Maximum upload size is ${maxGb} GB.`,
          code: err.code
        });
      }

      return res.status(400).json({ error: err.message, code: err.code || 'UPLOAD_ERROR' });
    });
  };
}

module.exports = {
  createUploadMiddleware
};
