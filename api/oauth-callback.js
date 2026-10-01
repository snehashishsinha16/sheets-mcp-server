const { getOAuthClient } = require('../lib/google');
const { escapeHtml } = require('../lib/html');

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');

  res.setHeader('Content-Type', 'text/html');

  if (errorParam) {
    res.statusCode = 400;
    res.end(`<p>Google returned an error: ${escapeHtml(errorParam)}</p>`);
    return;
  }
  if (!code) {
    res.statusCode = 400;
    res.end('<p>Missing authorization code in the callback URL.</p>');
    return;
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    res.end(`
      <html><body style="font-family:sans-serif;max-width:640px;margin:60px auto;line-height:1.6;">
      <h1>Authorization successful</h1>
      ${tokens.refresh_token ? `
        <p>Copy the value below and save it as a new environment variable in your Vercel project:</p>
        <p><strong>Name:</strong> GOOGLE_REFRESH_TOKEN</p>
        <p><strong>Value:</strong></p>
        <pre style="background:#eee;padding:12px;white-space:pre-wrap;word-break:break-all;">${tokens.refresh_token}</pre>
        <p>After saving it and redeploying, the assistant will have access to your Sheets and Drive. You can close this tab now.</p>
      ` : `
        <p style="color:#b00;">No refresh token was returned. This usually happens if you already authorized this app before, and Google only issues a fresh refresh token the first time.</p>
        <p>Fix: go to <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>, find and remove access for this app, then visit <a href="/login">/login</a> again to restart.</p>
      `}
      </body></html>
    `);
  } catch (e) {
    res.statusCode = 500;
    res.end(`<p>Error exchanging code for tokens: ${e.message}</p>`);
  }
};
