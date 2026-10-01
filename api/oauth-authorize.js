const { getOAuthClient } = require('../lib/google');

module.exports = (req, res) => {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ]
  });
  res.writeHead(302, { Location: url });
  res.end();
};
