# Claude Code <-> Jira MCP on CCode VM

## Endpoint
https://mcp.atlassian.com/v1/mcp

## Transport
mcp-remote with --transport http-first

## Auth model
Preferred: API token via Authorization Basic header
Fallback: OAuth browser flow if API token auth is disabled

## Secret source
~/.config/sre-of-me/atlassian-mcp.env

## Shared credential note
The Jira API token created for SOMC-99 is also the planned shared credential
source for the Worker orchestration story. Reuse must happen via secret store /
environment injection, not by copying secrets into repo files.

## MCP server name
atlassian-rovo

## Verification checklist
- DNS resolution works
- outbound 443 reachability works
- Claude Code can read SOMC-99
- Claude Code can post a comment
- Claude Code can transition a disposable test issue

## Security notes
- Never store token values in repo files
- Rotate the token if the env file is exposed
- Review token expiry before Worker implementation begins
