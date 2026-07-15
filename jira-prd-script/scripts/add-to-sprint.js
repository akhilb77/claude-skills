#!/usr/bin/env node
// Add an issue to the board's currently active sprint.
// Usage: node scripts/add-to-sprint.js <ISSUE-KEY> <BOARD-ID>

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });
else require('dotenv').config();

const [issueKey, boardId] = process.argv.slice(2);

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: process.env.JIRA_DOMAIN,
        path: apiPath,
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          res.statusCode >= 200 && res.statusCode < 300
            ? resolve(data ? JSON.parse(data) : {})
            : reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timed out after 10s')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (!issueKey || !boardId) {
    console.error('Usage: node scripts/add-to-sprint.js <ISSUE-KEY> <BOARD-ID>');
    process.exitCode = 1;
    return;
  }
  for (const v of ['JIRA_DOMAIN', 'JIRA_EMAIL', 'JIRA_API_TOKEN']) {
    if (!process.env[v]) {
      console.error(`Missing env var: ${v}. Set it in a local .env file.`);
      process.exitCode = 1;
      return;
    }
  }

  try {
    const { values } = await api('GET', `/rest/agile/1.0/board/${boardId}/sprint?state=active`);
    if (!values || !values.length) {
      console.error(`No active sprint on board ${boardId} — issue left in backlog.`);
      process.exitCode = 1;
      return;
    }
    const sprint = values[0]; // ponytail: first active sprint; boards rarely run two at once
    await api('POST', `/rest/agile/1.0/sprint/${sprint.id}/issue`, { issues: [issueKey] });
    console.log(`✅ ${issueKey} added to active sprint: ${sprint.name}`);
  } catch (err) {
    let hint = '';
    if (/HTTP 401|HTTP 403/.test(err.message)) hint = ' — token wrong/expired or no board access; regenerate at id.atlassian.com.';
    else if (/HTTP 404/.test(err.message)) hint = ' — board or issue not found, or no access.';
    console.error(`❌ Failed to add to sprint${hint}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
