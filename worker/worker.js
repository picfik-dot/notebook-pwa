const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...headers } });
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS'
  };
}

function withCors(result, env) {
  const headers = new Headers(result.headers);
  Object.entries(cors(env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(result.body, { status: result.status, headers });
}

function cookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function safePath(value) {
  const path = String(value || '').replace(/^\/+/, '');
  if (!path || path.includes('..') || path.startsWith('.')) throw new Error('Invalid path');
  return path;
}

async function github(env, token, path, options = {}) {
  const result = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.headers || {}) }
  });
  if (!result.ok) throw new Error(`GitHub API ${result.status}`);
  return result;
}

async function sessionToken(request, env) {
  const id = cookie(request, 'mindfold_session');
  return id ? env.SESSIONS.get(`session:${id}`) : null;
}

async function auth(request, env) {
  if (!(await sessionToken(request, env))) return response({ error: 'unauthorized' }, 401);
}

function repoPath(env, file) {
  return `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${file}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
}

async function readFile(env, token, file) {
  const result = await github(env, token, repoPath(env, file));
  const data = await result.json();
  return { ...data, rawContent: data.content.replace(/\n/g, ''), decoded: decodeBase64(data.content) };
}

function decodeBase64(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, '')), character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function writeFile(env, token, file, content, message, sha, encoded = false) {
  const body = { message: message || `Update ${file}`, content: btoa(unescape(encodeURIComponent(content))), branch: env.GITHUB_BRANCH };
  if (encoded) body.content = content;
  if (sha) body.sha = sha;
  return github(env, token, repoPath(env, file), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), env);
    if (url.pathname === '/auth/login') {
      const state = crypto.randomUUID();
      await env.SESSIONS.put(`oauth:${state}`, 'pending', { expirationTtl: 600 });
      const callback = `${url.origin}/auth/callback`;
      return Response.redirect(`https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callback)}&scope=repo&state=${state}`, 302);
    }
    if (url.pathname === '/auth/callback') {
      const state = url.searchParams.get('state');
      if (!state || !(await env.SESSIONS.get(`oauth:${state}`))) return new Response('Invalid OAuth state', { status: 400 });
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') }) });
      const token = (await tokenResponse.json()).access_token;
      const session = crypto.randomUUID();
      await env.SESSIONS.put(`session:${session}`, token, { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response(null, { status: 302, headers: { Location: env.APP_URL, 'Set-Cookie': `mindfold_session=${session}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000` } });
    }
    if (url.pathname === '/auth/logout') return new Response(null, { status: 302, headers: { Location: env.APP_URL, 'Set-Cookie': 'mindfold_session=; Max-Age=0; Path=/' } });
    const token = await sessionToken(request, env);
    if (!token) return withCors(response({ error: 'unauthorized' }, 401), env);
    try {
      if (url.pathname === '/api/state' && request.method === 'GET') {
        try { const file = await readFile(env, token, 'mindfold-state.json'); return withCors(response(JSON.parse(file.decoded)), env); } catch { return withCors(response({}), env); }
      }
      if (url.pathname === '/api/state' && request.method === 'PUT') {
        const content = JSON.stringify(await request.json(), null, 2);
        let sha; try { sha = (await readFile(env, token, 'mindfold-state.json')).sha; } catch {}
        await writeFile(env, token, 'mindfold-state.json', content, 'Update Mindfold state', sha); return withCors(response({ ok: true }), env);
      }
      if (url.pathname === '/api/files' && request.method === 'GET') {
        const result = await github(env, token, `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/attachments?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
        const files = (await result.json()).filter(item => item.type === 'file').map(item => ({ name: item.name, path: item.path, size: item.size, sha: item.sha, download_url: item.download_url }));
        return withCors(response(files), env);
      }
      if (url.pathname === '/api/file' && request.method === 'GET') {
        const file = await readFile(env, token, safePath(url.searchParams.get('path'))); return withCors(response({ path: file.path, name: file.name, sha: file.sha, content: file.rawContent }), env);
      }
      if (url.pathname === '/api/file' && request.method === 'PUT') {
        const payload = await request.json(); const filePath = safePath(payload.path); let sha = payload.sha; if (!sha) { try { sha = (await readFile(env, token, filePath)).sha; } catch {} } await writeFile(env, token, filePath, decodeBase64(payload.content), `Update ${filePath}`, sha); return withCors(response({ ok: true }), env);
      }
      if (url.pathname === '/api/file' && request.method === 'POST') {
        const payload = await request.json(); const filePath = safePath(payload.path); await writeFile(env, token, filePath, payload.content, `Upload ${filePath}`, undefined, true); return withCors(response({ ok: true }), env);
      }
      return withCors(response({ error: 'not_found' }, 404), env);
    } catch (error) { return withCors(response({ error: error.message }, 500), env); }
  }
};
