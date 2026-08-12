// Vercel Serverless Function entry point
const path = require('path');
module.exports = async (req, res) => {
  const app = await require(path.join(__dirname, '../dist/server.cjs')).default;
  return app(req, res);
};
