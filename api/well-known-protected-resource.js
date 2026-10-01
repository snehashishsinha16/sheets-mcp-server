module.exports = (req, res) => {
  const base = `https://${req.headers.host}`;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      resource: `${base}/api/mcp`,
      authorization_servers: [base]
    })
  );
};
