/**
 * Shared HTTP helpers for external API calls.
 */

export async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} from ${url}: ${body}`);
  }
  return response.json();
}

export function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

export function errorResponse(message, status = 500) {
  return Response.json({ error: message }, { status });
}
