import { compose, fromAtom, LIMITS, NEEDS_MEDIA, pickChannels, postInput } from './compose.js';
import { PAGE, PRIVACY } from './page.js';

const AUTH = 'https://auth.buffer.com';
const API = 'https://api.buffer.com';
const SCOPE = 'account:read posts:read posts:write offline_access';

// ---- encrypted cookie session (AES-GCM, key from SESSION_KEY secret) ----
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function key(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(JSON.stringify(obj)));
  return b64u(iv) + '.' + b64u(ct);
}
async function open(env, s) {
  try {
    const [iv, ct] = s.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await key(env), unb64u(ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return null; }
}
const cookies = (req) => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map((c) => [c.split('=')[0], c.slice(c.indexOf('=') + 1)]));
const setCookie = (name, val, maxAge) => `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const redirect = (to, headers = {}) => new Response(null, { status: 302, headers: { location: to, ...headers } });

// ---- Buffer OAuth ----
function redirectUri(req) { return new URL('/callback', req.url).toString(); }

async function tokenRequest(env, params) {
  const body = new URLSearchParams({ client_id: env.BUFFER_CLIENT_ID, ...params });
  if (env.BUFFER_CLIENT_SECRET) body.set('client_secret', env.BUFFER_CLIENT_SECRET);
  const r = await fetch(AUTH + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error('Buffer token exchange failed: ' + (t.error_description || t.error || r.status));
  return { access: t.access_token, refresh: t.refresh_token || null, exp: Date.now() + (t.expires_in || 3600) * 1000 - 60_000 };
}

// A Buffer personal API key (Settings → API) as a Bearer header is a session too: no cookie, nothing to refresh. CI uses it.
const bearer = (req) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();

// Returns a valid session (refreshing if needed) and the Set-Cookie to send back, or null.
async function session(req, env) {
  if (bearer(req)) return { s: { access: bearer(req) } };
  const s = await open(env, cookies(req).rts || '');
  if (!s) return null;
  if (s.exp > Date.now()) return { s };
  if (!s.refresh) return null;
  const fresh = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: s.refresh });
  fresh.refresh ||= s.refresh;
  return { s: fresh, cookie: setCookie('rts', await seal(env, fresh), 60 * 60 * 24 * 30) };
}

async function gql(s, query, variables) {
  const r = await fetch(API, { method: 'POST', headers: { authorization: 'Bearer ' + s.access, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '));
  if (!r.ok) throw new Error('Buffer API ' + r.status);
  return j.data;
}

const CHANNELS = `query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name displayName service avatar isQueuePaused } }`;
const CREATE = `mutation($input: CreatePostInput!) { createPost(input: $input) {
  ... on PostActionSuccess { post { id text } }
  ... on MutationError { message } } }`;

async function createPosts(s, posts, mode) {
  const results = [];
  for (const { text, ...p } of posts.slice(0, 20)) {
    const input = postInput(p.channelId, text, mode);
    try {
      const r = (await gql(s, CREATE, { input })).createPost;
      results.push(r.post ? { ...p, ok: true, postId: r.post.id } : { ...p, ok: false, error: r.message });
    } catch (e) { results.push({ ...p, ok: false, error: e.message }); }
  }
  return results;
}

// ---- GitHub (public data only) ----
async function gh(path, env) {
  const headers = { 'user-agent': 'release-to-social', accept: 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) headers.authorization = 'Bearer ' + env.GITHUB_TOKEN;
  const r = await fetch('https://api.github.com' + path, { headers });
  if (r.status === 404) throw new Error('Not found on GitHub (public repos only): ' + path);
  if (!r.ok) throw Object.assign(new Error('GitHub ' + r.status), { status: r.status });
  return r.json();
}

async function release(env, repo, tag) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('Use the form owner/repo');
  let info, rel;
  try {
    [info, rel] = await Promise.all([
      gh(`/repos/${repo}`, env),
      gh(tag ? `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}` : `/repos/${repo}/releases/latest`, env),
    ]);
  } catch (e) {
    if (e.status !== 403 && e.status !== 429) throw e;
    // Workers share egress IPs, so the anonymous REST quota runs out; the Atom feed has no such limit.
    const r = await fetch(`https://github.com/${repo}/releases.atom`, { headers: { 'user-agent': 'release-to-social' } });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return fromAtom(await r.text(), repo, tag);
  }
  return { repoName: info.full_name, description: info.description || '', tag: rel.tag_name, name: rel.name, url: rel.html_url, body: rel.body || '', publishedAt: rel.published_at };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });

      if (url.pathname === '/login') {
        const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
        const state = b64u(crypto.getRandomValues(new Uint8Array(16)));
        const q = new URLSearchParams({ client_id: env.BUFFER_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'consent' });
        return redirect(AUTH + '/auth?' + q, { 'set-cookie': setCookie('rts_oauth', await seal(env, { verifier, state }), 600) });
      }

      if (url.pathname === '/callback') {
        const pending = await open(env, cookies(req).rts_oauth || '');
        if (!pending || pending.state !== url.searchParams.get('state')) return new Response('Invalid OAuth state, start again from the home page.', { status: 403 });
        if (url.searchParams.get('error')) return redirect('/?denied=1');
        const t = await tokenRequest(env, { grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri(req), code_verifier: pending.verifier });
        const h = new Headers({ location: '/' });
        h.append('set-cookie', setCookie('rts', await seal(env, t), 60 * 60 * 24 * 30));
        h.append('set-cookie', setCookie('rts_oauth', '', 0));
        return new Response(null, { status: 302, headers: h });
      }

      if (url.pathname === '/privacy') return new Response(PRIVACY, { headers: { 'content-type': 'text/html; charset=utf-8' } });

      if (url.pathname === '/logout') return redirect('/', { 'set-cookie': setCookie('rts', '', 0) });

      if (url.pathname === '/api/demo-release') {
        const rel = await release(env, url.searchParams.get('repo'), url.searchParams.get('tag'));
        const posts = Object.fromEntries(['twitter', 'bluesky', 'threads', 'mastodon', 'linkedin', 'facebook'].map((s) => [s, { text: compose(rel, s), limit: LIMITS[s] }]));
        return json({ release: rel, posts });
      }

      const sess = await session(req, env);
      if (!sess) return json({ error: 'not_connected', hint: 'Connect Buffer in the browser, or send a Buffer API key (Settings → API) as "Authorization: Bearer <key>".' }, 401);
      const extra = sess.cookie ? { 'set-cookie': sess.cookie } : {};

      if (url.pathname === '/api/me') {
        const d = await gql(sess.s, `{ account { email organizations { id name } } }`);
        const orgs = d.account.organizations || [];
        const channels = orgs.length ? (await gql(sess.s, CHANNELS, { org: orgs[0].id })).channels : [];
        return json({ email: d.account.email, organization: orgs[0] || null, channels }, 200, extra);
      }

      if (url.pathname === '/api/preview') {
        const rel = await release(env, url.searchParams.get('repo'), url.searchParams.get('tag'));
        const services = (url.searchParams.get('services') || '').split(',').filter(Boolean);
        const posts = Object.fromEntries(services.map((s) => [s, { text: compose(rel, s), limit: LIMITS[s] || 500, needsMedia: NEEDS_MEDIA.has(s) }]));
        return json({ release: rel, posts }, 200, extra);
      }

      if (url.pathname === '/api/drafts' && req.method === 'POST') {
        const { posts = [], mode = 'draft' } = await req.json();
        return json({ results: await createPosts(sess.s, posts.map(({ channelId, text }) => ({ channelId, text })), mode) }, 200, extra);
      }

      // One call does the whole flow for CI: release -> one post per text channel -> Buffer drafts (mode: draft | queue | now).
      if (url.pathname === '/api/ci' && req.method === 'POST') {
        const { repo, tag, services, mode = 'draft' } = await req.json();
        const rel = await release(env, repo, tag);
        const org = (await gql(sess.s, `{ account { organizations { id } } }`)).account.organizations?.[0];
        const channels = org ? (await gql(sess.s, CHANNELS, { org: org.id })).channels : [];
        const posts = pickChannels(channels, services).map((c) => ({ channelId: c.id, channel: c.displayName || c.name, service: c.service, text: compose(rel, c.service) }));
        return json({ release: { repo: rel.repoName, tag: rel.tag, url: rel.url }, results: await createPosts(sess.s, posts, mode) }, 200, extra);
      }

      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  },
};
