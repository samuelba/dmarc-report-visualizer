// oauth_get_refresh_token.js
const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:53682/oauth2callback'; // loopback

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Set CLIENT_ID and CLIENT_SECRET env vars from your OAuth client JSON.');
    process.exit(1);
  }
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
  });
  console.log('Open this URL in your browser:', url);

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) {
      res.writeHead(404); res.end(); return;
    }
    const code = new URL(req.url, REDIRECT_URI).searchParams.get('code');
    try {
      const { tokens } = await oauth2.getToken(code);
      res.end('Refresh token captured. You can close this tab.');
      console.log('REFRESH_TOKEN=', tokens.refresh_token);
    } catch (e) {
      res.end('Failed to exchange code. Check console.');
      console.error(e);
    } finally {
      server.close(() => process.exit(0));
    }
  });
  server.listen(53682, '127.0.0.1', () => console.log('Listening on 127.0.0.1:53682'));
}

main().catch(console.error);

