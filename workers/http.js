// ─── Small HTTP helpers shared by every route ───

// A JSON response. Errors are never cacheable; successes default to no-store unless the
// caller sets Cache-Control (only public, idempotent reads should).
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function methodNotAllowed(allow) {
  return json({ error: 'method-not-allowed' }, 405, { Allow: allow });
}

export function text(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// Constant-time check of "Authorization: Bearer <secret>". False when the secret isn't set.
export function bearerMatches(request, secret) {
  if (!secret) return false;
  const enc = new TextEncoder();
  const given = enc.encode(request.headers.get('Authorization') || '');
  const expected = enc.encode(`Bearer ${secret}`);
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}
