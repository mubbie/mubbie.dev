// ─── Cloudflare Access: verify the signed-in admin's JWT ───
//
// Access sits in front of /admin/* and /api/guestbook/admin*, and forwards a signed JWT in
// Cf-Access-Jwt-Assertion. We still verify it here (RS256 against the team's public keys,
// plus audience, issuer, and time claims), so a request that somehow skips Access
// (e.g. a different hostname for the same Worker) is refused.

const CERTS_TTL_MS = 60 * 60 * 1000;
const CERTS_MIN_REFETCH_MS = 60 * 1000; // an unknown key id triggers at most one refetch a minute
const CLOCK_SKEW_SECONDS = 60;

let certs = { keys: [], fetchedAt: 0 };

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const decodePart = (part) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));

// Only a good response with keys replaces the cache, so an outage never caches "no keys"
async function refreshCerts(teamDomain) {
  try {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
    const keys = res.ok ? (await res.json()).keys : null;
    if (Array.isArray(keys) && keys.length) certs = { keys, fetchedAt: Date.now() };
  } catch (err) {
    console.error('access certs fetch failed:', err);
  }
}

async function keyFor(kid, teamDomain) {
  const age = Date.now() - certs.fetchedAt;
  let jwk = certs.keys.find((k) => k.kid === kid);
  // Refetch when stale, or when the key is unknown (Access rotated its keys)
  if (age > CERTS_TTL_MS || (!jwk && age > CERTS_MIN_REFETCH_MS)) {
    await refreshCerts(teamDomain);
    jwk = certs.keys.find((k) => k.kid === kid);
  }
  return jwk;
}

export async function verifyAccessJwt(token, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  try {
    const [h, p, sig] = token.split('.');
    const header = decodePart(h);
    const payload = decodePart(p);
    if (header.alg !== 'RS256') return false;

    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return false;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
    if (typeof payload.exp !== 'number' || payload.exp < now - CLOCK_SKEW_SECONDS) return false;
    if (typeof payload.nbf === 'number' && payload.nbf > now + CLOCK_SKEW_SECONDS) return false;

    const jwk = await keyFor(header.kid, env.ACCESS_TEAM_DOMAIN);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

// For tests: forget cached keys between cases
export function resetAccessCache() {
  certs = { keys: [], fetchedAt: 0 };
}
