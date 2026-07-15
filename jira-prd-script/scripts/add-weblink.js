#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const [issueKey, url, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(' ').trim();

function printUsage() {
  console.error('Usage: node scripts/add-weblink.js <ISSUE-KEY> "<url>" "<title>"');
}

function missingEnv() {
  const missing = [];
  if (!process.env.JIRA_DOMAIN) missing.push('JIRA_DOMAIN');
  if (!process.env.JIRA_EMAIL) missing.push('JIRA_EMAIL');
  if (!process.env.JIRA_API_TOKEN) missing.push('JIRA_API_TOKEN');
  return missing;
}

function addWebLink(issueKeyValue, urlValue, titleValue) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ object: { url: urlValue, title: titleValue } });
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');

    const options = {
      hostname: process.env.JIRA_DOMAIN,
      path: `/rest/api/3/issue/${encodeURIComponent(issueKeyValue)}/remotelink`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timed out after 10s')));
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!issueKey || !url || !title) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const missing = missingEnv();
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}. Set them in a local .env file or export them in your shell.`);
    process.exitCode = 1;
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    console.error(`Invalid URL (must start with http:// or https://): ${url}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Adding web link to ${issueKey}...`);

  try {
    const result = await addWebLink(issueKey, url, title);
    console.log(`✅ Web link added! (id: ${result.id})`);
    console.log(`   ${title} → ${url}`);
    console.log(`   View it: https://${process.env.JIRA_DOMAIN}/browse/${issueKey}`);
  } catch (err) {
    let hint = '';
    if (/HTTP 401/.test(err.message)) hint = ' — the Jira API token is wrong or expired; regenerate it at id.atlassian.com.';
    else if (/HTTP 404/.test(err.message)) hint = ' — that issue key does not exist or you lack access.';
    else if (/HTTP 400/.test(err.message)) hint = ' — Jira rejected the request; check the URL is valid.';
    console.error(`❌ Failed to add web link${hint}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});