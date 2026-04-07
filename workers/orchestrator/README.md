# SRE-of-Me Orchestration Worker

Cloudflare Worker providing three orchestration modes for the SOMC project.

## Modes

- **Mode 1 - Deliberation:** Polls .945 deliberation log, runs AI settlement rounds
- **Mode 2 - Ticket Creation:** Creates Jira stories/sub-tasks from approved plans
- **Mode 3 - Verification:** Receives Jira webhooks, runs dual-AI verification

## Routes

- GET /health - Health check
- POST /webhook/jira - Mode 3 trigger
- POST /deliberate - Mode 1 manual trigger
- POST /tickets/create - Mode 2 trigger

## Deploy

    cd /home/administrator/projects/sre-of-me/workers/orchestrator
    npx wrangler deploy

## Secrets (via wrangler secret put)

- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- JIRA_API_TOKEN
- JIRA_EMAIL
- WEBHOOK_SHARED_SECRET
- NOTION_API_KEY

## Vars (in wrangler.toml [vars])

- JIRA_BASE_URL
- JIRA_PROJECT_KEY
- NOTION_DELIBERATION_DATABASE_ID
