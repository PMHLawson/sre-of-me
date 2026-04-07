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
      .prepare('SELECT * FROM services WHERE active = 1 ORDER BY display_order')
      .run();

    return json({ services: results.results ?? [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
