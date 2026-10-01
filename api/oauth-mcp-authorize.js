const crypto = require('crypto');
const { signToken } = require('../lib/token');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state') || '';
    const codeChallenge = url.searchParams.get('code_challenge') || '';
    const clientId = url.searchParams.get('client_id') || '';

    if (!redirectUri) {
      res.statusCode = 400;
      res.end('Missing redirect_uri');
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <html><body style="font-family:sans-serif;max-width:400px;margin:80px auto;line-height:1.6;">
      <h2>Authorize access</h2>
      <p>Enter your passcode to let this app connect to your Sheets assistant.</p>
      <form method="POST" action="/authorize">
        <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
        <input type="hidden" name="state" value="${escapeHtml(state)}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
        <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
        <input type="password" name="passcode" placeholder="Passcode" autofocus
          style="padding:10px;width:100%;box-sizing:border-box;margin-bottom:12px;font-size:16px;" />
        <button type="submit" style="padding:10px 20px;font-size:16px;">Authorize</button>
      </form>
      </body></html>
    `);
    return;
  }

  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(body));
      }
    }
    const redirectUri = body.redirect_uri;
    const state = body.state || '';
    const codeChallenge = body.code_challenge || '';
    const clientId = body.client_id || '';
    const passcode = body.passcode || '';

    if (!redirectUri) {
      res.statusCode = 400;
      res.end('Missing redirect_uri');
      return;
    }

    const expected = process.env.OWNER_PASSCODE || '';
    const providedBuf = Buffer.from(String(passcode));
    const expectedBuf = Buffer.from(String(expected));
    const match =
      expected.length > 0 &&
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!match) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'text/html');
      res.end(`
        <html><body style="font-family:sans-serif;max-width:400px;margin:80px auto;line-height:1.6;">
        <h2>Incorrect passcode</h2>
        <p><a href="javascript:history.back()">Go back and try again</a></p>
        </body></html>
      `);
      return;
    }

    const code = signToken({ redirectUri, codeChallenge, clientId }, process.env.SESSION_SECRET, 300);
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);

    res.writeHead(302, { Location: redirect.toString() });
    res.end();
    return;
  }

  res.statusCode = 405;
  res.end('Method not allowed');
};
