function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const results = await env.DB
      .prepare('SELECT key, value, updated_at FROM settings ORDER BY key')
      .run();

    return json({ settings: results.results ?? [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
