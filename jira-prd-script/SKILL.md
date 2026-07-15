---
name: jira-prd-script
description: >
  Use this skill whenever the user wants to create a Jira ticket from a PRD,
  feature spec, or product document. Triggers include: "create a Jira ticket",
  "make a Jira issue", "push this to Jira", "turn this PRD into a ticket",
  "create a ticket for this feature", or when the user pastes a PRD/spec and
  mentions Jira in any way. Also trigger when the user says "make a ticket"
  even without mentioning Jira explicitly — they probably mean Jira.
  Use this skill proactively whenever a PRD or feature description is shared
  and there's any hint the user wants it tracked in Jira.
compatibility: "Requires the Atlassian connector (mcp.atlassian.com) for creating the ticket, and Claude Code (a terminal) to run the bundled add-weblink.js script for attaching Web Links. Google Drive connector recommended so PRDs given as Google Doc links can be fetched with their embedded hyperlinks."
---

# Jira PRD Skill

Creates a structured Jira ticket from a PRD. Extracts summary, builds a
**clean** ADF description (no links inside), looks up the assignee by name,
shows a preview, creates the ticket, and then attaches Figma / PRD links as
**real Jira Web Links** in the ticket's Links panel.

## CRITICAL RULES — Read first

- **Links do NOT go inside the description.** The description stays clean.
  Figma and PRD links are attached as real **Web Links** (the ticket's Links
  panel) after creation — see Step 9.
- **Two tools, two jobs:**
  - The **Atlassian MCP** connector creates the ticket (`createJiraIssue`,
    `lookupJiraAccountId`, `getJiraProjectIssueTypesMetadata`, …). It
    **cannot** create web/remote links — known platform limitation.
  - The **bundled `scripts/add-weblink.js`** script attaches web links via the
    Jira REST API. Run it once per Figma / PRD link (see Step 9).
- **NEVER use an artifact, widget, or web app** to make Atlassian API calls.
  Artifacts are sandboxed and always fail with "Failed to fetch".
- Call the Atlassian MCP tools directly inline in the conversation; run the
  web-link script from the terminal.
- If the Atlassian tools are missing: "The Atlassian MCP tools are not
  available here. Please start a new conversation with the connector enabled."
- This skill needs **Claude Code** (a terminal) for Step 9 — it will not work in
  the Claude Desktop chat app, which can't run the local script.

## Setup

- Site: `blackbuck.atlassian.net`
- Project key: `FRON`
- Board ID: `177` (used to add the ticket to the active sprint — see Step 8b)
- Web links are added by running the bundled `scripts/add-weblink.js` script,
  which reads credentials from `JIRA_DOMAIN` / `JIRA_EMAIL` / `JIRA_API_TOKEN`
  in the environment or a local `.env` in this skill folder (never committed).

---

## Steps

Follow these steps in order every time. Do not skip steps.

### Step 1 — Gather required inputs

Ask for both in a single message if not already provided:
1. **Assignee name** — who to assign the ticket to
2. **Issue type** — what kind of ticket (validated against the board in Step 4)

If the PRD hasn't been pasted yet, ask for it now.

### Step 3 — Get the full PRD content, THEN parse

**First: make sure you actually have the PRD's text — not just a link to it.**
A design/Figma link is usually a *hyperlink embedded inside the doc*, invisible
from the URL alone. If the PRD was given as a link (or references a doc), fetch
the real content before parsing, in this order:

1. **Google Doc / Drive URL** → use the **Google Drive connector** to fetch the
   document content (export as markdown/text so hyperlinks are preserved).
2. **Confluence URL** → use `getConfluencePage` / `searchConfluenceUsingCql`.
3. **Other URL, no connector** → if the Claude-in-Chrome browser is available,
   open the URL and read the page (its DOM includes every link's `href`).
4. **Cannot fetch by any means** → **STOP. Do not create a half-complete ticket.**
   Tell the user: "I can only see the link to the doc, not its contents — so I
   can't extract the embedded design/Figma links. Enable the Google Drive
   connector, open the doc in Chrome, or paste the doc's contents (not the link)."

Only once you have the actual text/content, extract the following:

**Summary (ticket title)**
- Find the most concise action-oriented title for what needs to be built
- Check for: top-level heading, "Goal", "Feature", "Title" sections first
- If none found, generate one from the PRD content
- Max 255 characters, no filler phrases like "This document describes..."
- Make it imperative: "Implement X" not "Implementation of X"

**Description sections** — extract and restructure into:
- **Overview**: 1–2 sentence summary of what needs to be built
- **Background / Problem**: Why this is being built
- **Scope**: What's in and out of scope (if mentioned)
- **Acceptance Criteria**: Bullet list of done conditions (if mentioned)

> Links are NOT part of the description. Collect them separately below for Step 9.

**Links to attach as Web Links** — scan the entire PRD and collect a list of
`{ url, title }` pairs. **Capture hyperlink targets (`href`s), not just visible
URL text** — Figma links are often hidden behind display text like "Designs" or
"Figma", so a plain text scan misses them.
- Figma URLs (`figma.com/file/...`, `figma.com/proto/...`, `figma.com/design/...`)
  → title `"Figma Design"`
- PRD source URL — if the PRD itself came from a URL (Confluence, Google Doc,
  etc.) → title `"PRD"`

Collect all matches regardless of where they appear. Before the preview, if you
fetched the doc but found **zero** Figma/design links, say so explicitly rather
than silently omitting them.

**Edge cases:**
- PRD is very long → summarize each section, don't dump everything
- Multiple features detected → ask: "I see multiple features — one ticket or separate tickets for each?"
- No clear title → generate one and show it before proceeding
- PRD is a Confluence URL → fetch it via `searchConfluenceUsingCql` /
  `getConfluencePage` first, and keep that URL as the PRD web link
- No Figma links found → ask: "No Figma links found — add one manually or skip?"

### Step 4 — Validate board metadata

Call `getJiraProjectIssueTypesMetadata` with the project key to:
- Confirm the requested issue type exists on the board
- If not, show available types and ask the user to pick

Call `getJiraIssueTypeMetaWithFields` to:
- Check for required custom fields beyond the standard ones
- If any exist, ask the user for values before proceeding
- **FRON requires a `Components` value** — always ask (unless obvious). Options:
  Finserv, Fullfilment, Growth, Marketplace, Payments, Platform, Tech,
  Telematics. Credit-line / KYC / loan work → Finserv. Pass it on create via
  `additional_fields`, e.g. `{"components": [{"id": "11528"}]}` (Finserv).

### Step 5 — Look up assignee

Call `lookupJiraAccountId` with the name provided.

**Edge cases:**
- Not found → "Couldn't find [name] in Jira. Try their full name or work email."
- Multiple matches → show the list, ask user to pick
- "assign to me" → call `atlassianUserInfo` to get their own account ID

### Step 6 — Build ADF description (NO links)

Convert the extracted content into valid ADF JSON. **Do not include a Figma
Links section and do not embed any link marks** — links are attached in Step 9.

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Overview" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "<overview text>" }] },

    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Background / Problem" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "<background text>" }] },

    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Scope" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "<scope text>" }] },

    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Acceptance Criteria" }] },
    { "type": "bulletList", "content": [
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "<criterion>" }] }] }
    ]}
  ]
}
```

Omit sections that have no content (e.g. skip the Scope heading if no scope).

### Step 7 — Show preview

Before creating anything, show this preview:

```
────────────────────────────────────
📋 TICKET PREVIEW
────────────────────────────────────
Project:      FRON
Type:         [issue type]
Summary:      [extracted title]
Assignee:     [name]
Web Links:    [count] link(s) → will be added to the Links panel
Description:
  • Overview: [first sentence]
  • Sections: Background, Scope, Acceptance Criteria
────────────────────────────────────
Create this ticket? (yes / edit / cancel)
```

- **yes** → Step 8
- **edit** → ask what to change, update, re-show preview
- **cancel** → stop, confirm cancellation

### Step 8 — Create the ticket

Call `createJiraIssue` with:
```json
{
  "fields": {
    "project": { "key": "FRON" },
    "summary": "<extracted summary>",
    "issuetype": { "name": "<issue type>" },
    "assignee": { "accountId": "<looked up account ID>" },
    "description": <ADF object from Step 6>
  }
}
```

Capture the returned ticket key (e.g. `FRON-123`).

### Step 8b — Add to the active sprint

New tickets land in the backlog and won't show on the sprint board. Add it to
the board's current active sprint (looked up live, so it always picks the
sprint running that day — nothing to update when sprints roll over):

node "<skill-base-dir>/scripts/add-to-sprint.js" <ticket> 177

If there is no active sprint, the script says so and leaves the ticket in the
backlog — report that, don't treat it as a failure.

### Step 9 — Attach Web Links

Always attempt to run, once per link, from this skill's base directory
(the "Base directory for this skill" path given when the skill loads):

node "<skill-base-dir>/scripts/add-weblink.js" <ticket> "<url>" "<title>"

If the command succeeds, report success.

If the command fails because of missing credentials,
tell the user to configure JIRA_DOMAIN/JIRA_EMAIL/JIRA_API_TOKEN.

If the command fails because node is missing,
tell the user to install Node.js.

If the command fails because the environment cannot reach
blackbuck.atlassian.net, explain that the current execution
environment is sandboxed and print the exact command for the
user to run locally.

### Step 10 — Report success

```
✅ Ticket created!
🔗 [FRON-XXX] <summary>
   https://blackbuck.atlassian.net/browse/FRON-XXX

Web Links attached:
  ✅ Figma Design → <figma url>
  ✅ PRD → <prd url>
```

---

## Error Handling

| Error | What to tell the user |
|---|---|
| Assignee not found | "Couldn't find [name] in Jira. Try their full name or work email." |
| Invalid issue type | "Your board doesn't support [type]. Available types: [list them]." |
| Missing required field | "Your board requires [field name] — what value should I use?" |
| 400 Bad Request (createIssue) | "Jira rejected the request — likely a malformed field. I'll check which one and fix it." |
| 403 Forbidden | "You don't have permission to create tickets in [project]. Check your Jira access." |
| 401 Unauthorized (MCP) | "The Atlassian connector needs re-authentication. Claude Settings → Connectors → Atlassian → reconnect." |
| add-weblink.js: HTTP 401 | "The Jira API token in your .env (or env vars) is wrong or expired — regenerate it at id.atlassian.com." |
| add-weblink.js: HTTP 404 | "That issue key doesn't exist or you don't have access to it." |
| add-weblink.js: missing credentials | "Set JIRA_DOMAIN / JIRA_EMAIL / JIRA_API_TOKEN in the environment or a local .env — see README.md." |
| No Figma links | "No Figma links found in the PRD. Add one manually or skip?" |
| PRD too vague | "I couldn't extract a clear title. Best guess: [generated title]. Use this?" |
| Confluence URL given | "I'll fetch that Confluence page first, then extract the ticket details." |