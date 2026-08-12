// Vercel Serverless Function entry point
module.exports = async (req, res) => {
  const app = await require('../dist/server.cjs').default;
  return app(req, res);
};
