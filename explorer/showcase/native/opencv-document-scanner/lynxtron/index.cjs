const path = require('node:path');

module.exports = require(path.join(
  __dirname,
  'dist',
  process.platform,
  process.arch,
  'OpenCVDocumentScanner.node'
));
