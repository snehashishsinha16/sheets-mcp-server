const crypto = require('crypto');
const { verifyToken, signToken } = require('../lib/token');

function pkceMatches(verifier, challenge) {
  if (!challenge) return true;
  if (!verifier) return false;
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = Object.fromEntries(new URLSearchParams(body));
    }
  }

  const grantType = body.grant_type;

  if (grantType === 'authorization_code') {
    const payload = verifyToken(body.code, process.env.SESSION_SECRET);
    if (!payload) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    if (!pkceMatches(body.code_verifier, payload.codeChallenge)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed' }));
      return;
    }
    const accessToken = signToken({ sub: 'owner' }, process.env.SESSION_SECRET, 60 * 60 * 24 * 30);
    const refreshToken = signToken({ sub: 'owner', kind: 'refresh' }, process.env.SESSION_SECRET, 60 * 60 * 24 * 365);
    res.end(
      JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 60 * 60 * 24 * 30,
        refresh_token: refreshToken
      })
    );
    return;
  }

  if (grantType === 'refresh_token') {
    const payload = verifyToken(body.refresh_token, process.env.SESSION_SECRET);
    if (!payload || payload.kind !== 'refresh') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const accessToken = signToken({ sub: 'owner' }, process.env.SESSION_SECRET, 60 * 60 * 24 * 30);
    res.end(
      JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 60 * 60 * 24 * 30
      })
    );
    return;
  }

  res.statusCode = 400;
  res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
};
