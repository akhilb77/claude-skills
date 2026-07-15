# jira-prd-script

Turn a PRD into a Jira ticket, with Figma/PRD links attached — from Claude Code.

Same flow as the `jira-prd` skill, but web links are added by a bundled Node
script instead of a separate MCP server. **Claude Code only** — the link step
runs a terminal command, so it does not work in the Claude Desktop app.

## One-time setup

```bash
cd ~/.claude/skills/jira-prd-script
npm install
cp .env.example .env      # then fill in the 3 values below
```

Edit `.env`:

| Variable | Value |
|---|---|
| `JIRA_DOMAIN` | `blackbuck.atlassian.net` |
| `JIRA_EMAIL` | your Jira login email |
| `JIRA_API_TOKEN` | create at https://id.atlassian.com/manage-profile/security/api-tokens |

Enable these connectors in Claude Code (Settings → Connectors):

- **Atlassian** — required, creates the ticket. You also need access to the **FRON** project.
- **Google Drive** — needed if you give the PRD as a Google Doc link (Claude
  fetches the doc + its embedded Figma links). Skip if you paste the PRD text.

## Using it

Just tell Claude the **assignee** and **issue type**, and paste (or link) the
**PRD**. Claude creates the ticket and adds the links itself — you don't run any
commands.

## Notes

- `.env` and `node_modules` are gitignored — never commit `.env` (it holds your token).
- Lives alongside the original `jira-prd` skill without touching it.
