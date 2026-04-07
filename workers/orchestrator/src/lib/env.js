/**
 * Validates that all required bindings and secrets are present.
 * Call at the start of each request handler.
 */

const REQUIRED_SECRETS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'JIRA_API_TOKEN',
  'JIRA_EMAIL',
  'WEBHOOK_SHARED_SECRET',
  'NOTION_API_KEY'
];

const REQUIRED_VARS = [
  'JIRA_BASE_URL',
  'JIRA_PROJECT_KEY',
  'NOTION_DELIBERATION_DATABASE_ID'
];

export function validateEnv(env) {
  const missing = [];
  for (const key of [...REQUIRED_SECRETS, ...REQUIRED_VARS]) {
    if (!env[key]) missing.push(key);
  }
  if (!env.ORCHESTRATION_STATE) missing.push('ORCHESTRATION_STATE (KV)');
  return { valid: missing.length === 0, missing };
}
