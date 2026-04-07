// functions/api/ccode/archive/history.js
// SRE-of-Me / SOMC-139 — Global history archive endpoint
// Receives gzipped ~/.claude/history.jsonl from the VM daily shipper,
// writes to R2 under global-history/ prefix.

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Auth: Bearer token
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== env.CCODE_INGEST_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { source_host, archive_key, sha256, bytes, payload_base64_gzip } = body;

  if (!source_host) {
    return json({ error: "source_host is required" }, 400);
  }
  if (!payload_base64_gzip) {
    return json({ error: "payload_base64_gzip is required" }, 400);
  }

  try {
    // Decode base64 to binary
    const binaryString = atob(payload_base64_gzip);
    const payloadBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      payloadBytes[i] = binaryString.charCodeAt(i);
    }

    // Build R2 key
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const historyKey = archive_key ||
      `global-history/${source_host}/${yyyy}/${mm}/history-${yyyy}-${mm}.jsonl.gz`;

    // Write to R2
    await env.CCODE_AUDIT.put(historyKey, payloadBytes, {
      customMetadata: {
        source_host,
        sha256: sha256 || "",
        uploaded_at: now.toISOString(),
      },
    });

    return json({ status: "archived", archive_key: historyKey }, 201);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
