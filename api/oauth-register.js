const crypto = require('crypto');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const clientId = 'client_' + crypto.randomBytes(12).toString('hex');
  res.statusCode = 201;
  res.end(
    JSON.stringify({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris || [],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: body.client_name || 'MCP Client'
    })
  );
};
