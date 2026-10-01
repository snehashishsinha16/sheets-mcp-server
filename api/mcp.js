const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { google } = require('googleapis');
const { getAuthedClient } = require('../lib/google');
const { verifyToken } = require('../lib/token');

function buildServer() {
  const server = new McpServer({ name: 'sheets-mcp-server', version: '1.0.0' });

  const auth = getAuthedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  server.tool(
    'list_spreadsheets',
    "List spreadsheet-like files in the user's Drive (native Google Sheets, plus Excel .xlsx/.xls and CSV files as reference), optionally filtered by name. Content of non-native files can't be read directly \u2014 only their names/metadata.",
    { query: z.string().optional().describe('Optional text to search for in the file name') },
    async ({ query }) => {
      let q =
        "(mimeType='application/vnd.google-apps.spreadsheet' or " +
        "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or " +
        "mimeType='application/vnd.ms-excel' or " +
        "mimeType='text/csv') and trashed=false";
      if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
      const resp = await drive.files.list({ q, fields: 'files(id,name,mimeType,modifiedTime)', pageSize: 50 });
      return { content: [{ type: 'text', text: JSON.stringify(resp.data.files, null, 2) }] };
    }
  );

  server.tool(
    'list_sheet_tabs',
    'List the tab (sheet) names and IDs inside a spreadsheet.',
    { spreadsheetId: z.string() },
    async ({ spreadsheetId }) => {
      const resp = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
      const tabs = resp.data.sheets.map((s) => s.properties);
      return { content: [{ type: 'text', text: JSON.stringify(tabs, null, 2) }] };
    }
  );

  server.tool(
    'get_sheet_data',
    "Read values from a range, e.g. 'Sheet1!A1:D20'.",
    { spreadsheetId: z.string(), range: z.string() },
    async ({ spreadsheetId, range }) => {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return { content: [{ type: 'text', text: JSON.stringify(resp.data.values || [], null, 2) }] };
    }
  );

  server.tool(
    'update_cells',
    'Write values into a range, overwriting existing content. To write a formula, start the cell value with =.',
    {
      spreadsheetId: z.string(),
      range: z.string(),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
        .describe('2D array of rows of cell values')
    },
    async ({ spreadsheetId, range, values }) => {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values }
      });
      return { content: [{ type: 'text', text: `Updated ${range}` }] };
    }
  );

  server.tool(
    'append_rows',
    'Append rows of data after the last row of the table found within the given range.',
    {
      spreadsheetId: z.string(),
      range: z.string(),
      values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    },
    async ({ spreadsheetId, range, values }) => {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values }
      });
      return { content: [{ type: 'text', text: `Appended ${values.length} row(s) to ${range}` }] };
    }
  );

  server.tool(
    'create_spreadsheet',
    'Create a brand new Google Sheet and return its ID and URL.',
    { title: z.string() },
    async ({ title }) => {
      const resp = await sheets.spreadsheets.create({ requestBody: { properties: { title } } });
      return {
        content: [
          {
            type: 'text',
            text: `Created spreadsheet "${title}" with ID ${resp.data.spreadsheetId}. URL: ${resp.data.spreadsheetUrl}`
          }
        ]
      };
    }
  );

  server.tool(
    'add_sheet_tab',
    'Add a new tab to an existing spreadsheet.',
    { spreadsheetId: z.string(), title: z.string() },
    async ({ spreadsheetId, title }) => {
      const resp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] }
      });
      return { content: [{ type: 'text', text: JSON.stringify(resp.data.replies, null, 2) }] };
    }
  );

  server.tool(
    'advanced_batch_update',
    'Run a raw Google Sheets API batchUpdate call for anything not covered by the other tools — cell formatting, merging cells, conditional formatting, freezing rows/columns, deleting rows or columns, resizing, etc. Pass an array of request objects exactly as documented in the Google Sheets API v4 batchUpdate reference.',
    {
      spreadsheetId: z.string(),
      requests: z.array(z.record(z.any())).describe('Array of Sheets API request objects, e.g. [{"repeatCell": {...}}]')
    },
    async ({ spreadsheetId, requests }) => {
      const resp = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      return { content: [{ type: 'text', text: JSON.stringify(resp.data, null, 2) }] };
    }
  );

  return server;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed. This endpoint expects MCP JSON-RPC POST requests.');
    return;
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verifyToken(token, process.env.SESSION_SECRET) : null;

  if (!payload) {
    const base = `https://${req.headers.host}`;
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
  }
};
