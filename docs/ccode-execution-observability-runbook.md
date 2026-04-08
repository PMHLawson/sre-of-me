# CCode Execution Observability Runbook

> **Deliberation:** 202604040004
> **Epic:** OP-1 (SOMC-91)
> **Last updated:** 2026-04-08

---

## 1. Audit Trail Layers

The observability system produces a four-layer audit trail. Each layer answers a different question:

| Layer | Storage | Answers |
|-------|---------|---------|
| **Jira** | Atlassian Cloud | Which ticket was this session bound to? (via `--ticket` flag) |
| **Event Store (D1 + .943)** | Cloudflare D1 `sre-of-me-db` + Notion mirror `.943` | What happened during the session? Hash-chained event log with session lifecycle, workspace changes, semantic mutations, and watcher dispatch events. |
| **Git** | GitHub `PMHLawson/sre-of-me` | What code changed? Commit history scoped to the project repo. |
| **R2** | Cloudflare R2 `ccode-audit-prod` | What was the raw session transcript? Gzipped JSONL archives of CCode session files and global history. |

The `session_id` (UUID v4) is the canonical join key across all layers for wrapped sessions.

---

## 2. Wrapper-Supported Entry Point

`claude-dispatch.sh` at `/home/administrator/orchestration/claude-dispatch.sh` is the **only supported entry point** for CCode execution on the VM.

- **Interactive sessions:** The `.bashrc` shell function `claude()` routes all interactive `claude` invocations through the wrapper automatically.
- **Non-interactive sessions:** Use `claude -p "prompt"` or `claude --ticket SOMC-XXX -p "prompt"`.
- **Break-glass direct access:** Use `claude-direct` to bypass the wrapper entirely. This is for diagnostics only — sessions run via `claude-direct` produce no bookend events, no R2 archives, and no ticket binding. The ETL safety net may still detect tool_use activity and flag it with `missing_bookends: true`.

**Do NOT use `export -f claude` in `.bashrc`.** Exporting the shell function causes infinite recursion: the exported function propagates to `claude-dispatch.sh`'s child process, where it shadows the `claude` binary. The wrapper uses `type -P claude` (not `command -v`) to find the binary for this reason.

---

## 3. Watcher Target Model vs Interim Permission Reality

The watcher (`claude-orchestration.service`) is approved for **read-only and dispatch-safe operations only**. It polls the Event Store for `instruction` events and dispatches them through the wrapper in non-interactive (`-p`) mode.

**Current limitation:** CCode's non-interactive mode does not have permission parity with interactive mode. State-changing work (file edits, git operations, deployment) should be performed via interactive wrapped sessions, not watcher-dispatched sessions, until non-interactive permission parity is resolved.

The watcher passes dispatch metadata to the wrapper via environment variables:

- `DISPATCH_ID` — the watcher's instruction event_id
- `SOMC_TICKET` — extracted ticket reference from instruction content (if present)

---

## 4. Event Ownership Model

Each actor owns specific event types. There is **no overlapping ownership**:

| Actor | Owns | Event Types |
|-------|------|-------------|
| `ccode-wrapper` | Session lifecycle | `session_start`, `session_end`, `workspace_change_summary` |
| `ccode-etl` | Semantic mutations | `file_change`, `external_side_effect`, `execution_error`, `permission_block` |
| `claude-code` / watcher | Dispatch lifecycle | `instruction`, `response`, `error` |

If an event type appears under the wrong actor, it indicates a bug in the ownership boundary.

---

## 5. Project-Root Scoping Rule

The `compute_workspace_change_summary` function in `ccode-observability.sh` must be scoped to `PROJECT_ROOT`:

```
/home/administrator/projects/sre-of-me
```

The workspace summary captures `git status` and `git diff --stat` within this directory only. It must never scan parent directories or unrelated paths. The `project_root` field in the workspace_change_summary event content should always match this path.

---

## 6. Checkpoint / Partial-Read Behavior

The ETL shipper (`ccode-session-shipper.sh`) uses a checkpoint system to avoid re-reading processed data:

- **Checkpoint files:** Stored in `/home/administrator/orchestration/state/<md5_hash>.checkpoint`
- **Format:** `<inode> <offset> <mtime>` (three space-separated integers)
- **Skip logic:** If the file's inode, mtime, and size match the checkpoint, the file is skipped entirely
- **Inode change (file rotation):** If the inode changes, the offset resets to 0 (full re-read)
- **Partial reads:** New data is read from `saved_offset` to current file size using `tail -c+`

To force a full re-scan of all session files:

```bash
rm -f /home/administrator/orchestration/state/*.checkpoint
/home/administrator/orchestration/ccode-session-shipper.sh
```

---

## 7. Graceful Degradation

The wrapper follows a strict graceful degradation policy:

1. `session_end` and R2 archive upload are **always attempted**, even if earlier steps (Jira comment, workspace summary) fail.
2. Non-critical failures produce `[obs] WARNING` messages to stderr but do not abort the session.
3. The `|| true` pattern is used on all non-critical `emit_event_store_event` calls.
4. CCode's exit code is always passed through to the caller, regardless of observability failures.

**Known issue:** The `post_jira_metadata_comment` function returns HTTP 404 when calling the Jira REST API from the VM. Graceful degradation handles this correctly (warning logged, session continues), but Jira comments are not currently posted. This requires separate investigation.

---

## 8. Approval-Gate Note

Changes to this observability system require formal deliberation under the OCMP governance framework. Reference: `.946` AI Deliberation Protocol (current version). Any future deliberation outcomes that modify event types, ownership boundaries, or archive formats must go through the explicit approval gate before execution.

---

## 9. Services and Timers

| Unit | Type | Schedule | Purpose |
|------|------|----------|---------|
| `ccode-session-shipper.timer` | systemd timer | Every 15 minutes | Runs the project session ETL shipper as a safety net for bare-claude sessions |
| `ccode-session-shipper.service` | systemd oneshot | On-demand (via timer) | Executes `ccode-session-shipper.sh` |
| `ccode-history-shipper.timer` | systemd timer | Daily (midnight UTC) | Runs the global history archiver |
| `ccode-history-shipper.service` | systemd oneshot | On-demand (via timer) | Executes `ccode-history-shipper.sh` |
| `claude-orchestration.service` | systemd service | Continuous (30s poll) | Watcher: polls Event Store for instructions, dispatches through wrapper |

**Management commands:**

```bash
# Check all observability services
systemctl list-timers --all | grep ccode
sudo systemctl status claude-orchestration.service

# Force a manual ETL run
sudo systemctl start ccode-session-shipper.service
sudo journalctl -u ccode-session-shipper.service --no-pager -n 20

# Force a manual history archive
sudo systemctl start ccode-history-shipper.service
sudo journalctl -u ccode-history-shipper.service --no-pager -n 20

# Restart the watcher
sudo systemctl restart claude-orchestration.service
```

---

## 10. R2 Bucket Structure

**Bucket:** `ccode-audit-prod` (ENAM region, Standard storage class, public access disabled)

```
ccode-audit-prod/
├── projects/
│   └── sre-of-me/
│       └── sessions/
│           └── YYYY/MM/DD/
│               └── <session_id>.jsonl.gz
└── global-history/
    └── pve-vm-ccode/
        └── YYYY/MM/
            └── history-YYYY-MM.jsonl.gz
```

- **Session archives** (`projects/` prefix): Gzipped JSONL from CCode's project session directory, uploaded by the wrapper at session end. Registered in D1 `ccode_session_registry` with session_id, archive_key, sha256, and byte count.
- **Global history** (`global-history/` prefix): Monthly snapshot of `~/.claude/history.jsonl`, uploaded daily by the history shipper. Overwrites previous month's archive on each run.
- **Lifecycle rule:** `auto-expire-548d` — all objects auto-deleted after 548 days (18 months). Applies to entire bucket (both prefixes).

---

## 11. Troubleshooting

### 1101 errors (D1 CHECK constraint violation)

**Symptom:** Event POST returns HTTP 1101 or a D1 CHECK constraint error.

**Cause:** The `event_log` table has a CHECK constraint limiting valid `event_type` values. A new event type was added to the wrapper/ETL but not to the D1 schema.

**Fix:** Create a migration that recreates the table with the expanded CHECK constraint (see migration `0004_expand_event_type_check.sql` for the pattern). Apply with:

```bash
npx wrangler d1 migrations apply sre-of-me-db --remote
```

### Missing secrets in preview deployments

**Symptom:** Preview deployment returns 500 or auth errors.

**Cause:** Cloudflare Pages preview deployments have separate secret stores. Secrets must be configured for Preview independently of Production.

**Fix:** Add secrets via Dashboard → Pages → sre-of-me → Settings → Environment variables → Preview. Secrets must exist **before** the deployment that needs them.

### `wrangler r2 object head` doesn't exist

**Symptom:** `wrangler r2 object head` returns "Unknown arguments."

**Cause:** Wrangler does not support the `head` subcommand for R2 objects.

**Workaround:** Use `wrangler r2 object get <path> --file=/tmp/verify.gz` to confirm object existence, or verify via D1 `ccode_session_registry`.

### Jira comment 404

**Symptom:** `[obs] WARNING: Jira comment failed with HTTP 404` during wrapper execution.

**Cause:** The `post_jira_metadata_comment` function in `ccode-observability.sh` calls `${JIRA_BASE_URL}/rest/api/3/issue/${ticket_key}/comment` but receives a 404 response.

**Impact:** Non-blocking — graceful degradation ensures session_end and R2 upload still occur.

**Status:** Under investigation. Likely an auth format or URL path issue with the direct REST API call from the VM.

### Infinite recursion (100+ session_starts)

**Symptom:** Running `claude` produces dozens of `[obs] Session ... started` lines in rapid succession.

**Cause:** The `.bashrc` `claude()` function was exported with `export -f`, propagating to child processes including `claude-dispatch.sh`.

**Fix:** (1) Remove `export -f claude claude-direct` from `.bashrc`. (2) Ensure `claude-dispatch.sh` uses `type -P claude` (not `command -v claude`) to find the binary.

**Recovery:** Ctrl+C immediately, then clean up garbage events from D1.

### ETL `grep -c` produces `0\n0` errors

**Symptom:** `[[ 0\n0 -gt 0 ]]: syntax error in expression` during ETL shipper execution.

**Cause:** `grep -c 'pattern' || echo 0` produces two `0` values (grep outputs `0` to stdout, then exits 1, triggering `|| echo 0` to output another `0`).

**Fix:** Replace `|| echo 0` with `|| true` in the `check_has_bookends` function.
