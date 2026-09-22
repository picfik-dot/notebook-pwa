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

async function sessionToken(request, env) {
  const id = cookie(request, 'mindfold_session');
  return id ? env.SESSIONS.get(`session:${id}`) : null;
}

async function auth(request, env) {
  if (!(await sessionToken(request, env))) return response({ error: 'unauthorized' }, 401);
}

function decodeBase64(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, '')), character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)));
}

async function hexDigest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hex(bytes) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function objectUrl(env, file) { return `${env.B2_ENDPOINT.replace(/\/$/, '')}/${encodeURIComponent(env.B2_BUCKET)}/${file.split('/').map(encodeURIComponent).join('/')}`; }

async function b2Request(env, method, file, body = new Uint8Array(), query = '') {
  const endpoint = new URL(objectUrl(env, file) + query);
  const payloadHash = await hexDigest(body);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const host = endpoint.host;
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (body.length) headers['content-type'] = 'application/octet-stream';
  const canonicalHeaders = Object.keys(headers).sort().map(key => `${key}:${headers[key].trim()}\n`).join('');
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalQuery = [...endpoint.searchParams.entries()].sort().map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  const canonicalRequest = [method, endpoint.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${env.B2_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await hexDigest(new TextEncoder().encode(canonicalRequest))}`;
  const kDate = await hmac(`AWS4${env.B2_APPLICATION_KEY}`, date);
  const kRegion = await hmac(kDate, env.B2_REGION);
  const kService = await hmac(kRegion, 's3');
  const signingKey = await hmac(kService, 'aws4_request');
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hex(await hmac(signingKey, stringToSign))}`;
  return fetch(endpoint, { method, headers, body: body.length ? body : undefined });
}

async function readObject(env, file) {
  const result = await b2Request(env, 'GET', file);
  if (!result.ok) throw new Error(`B2 GET ${result.status}`);
  return { content: new Uint8Array(await result.arrayBuffer()), etag: result.headers.get('etag') };
}

async function writeObject(env, file, body) {
  const result = await b2Request(env, 'PUT', file, body);
  if (!result.ok) throw new Error(`B2 PUT ${result.status}`);
  return result.headers.get('etag');
}

function base64(bytes) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }

async function listObjects(env) {
  const result = await b2Request(env, 'GET', '', new Uint8Array(), `?list-type=2&prefix=${encodeURIComponent('attachments/')}`);
  if (!result.ok) throw new Error(`B2 LIST ${result.status}`);
  const xml = await result.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>\s*<Size>(\d+)<\/Size>\s*<ETag>([^<]+)<\/ETag>/g)].map(match => ({ path: match[1], name: match[1].split('/').pop(), size: Number(match[2]), sha: match[3].replaceAll('"', '') }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), env);
    if (url.pathname === '/auth/login') {
      const state = crypto.randomUUID();
      await env.SESSIONS.put(`oauth:${state}`, 'pending', { expirationTtl: 600 });
      const callback = `${url.origin}/auth/callback`;
      return Response.redirect(`https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callback)}&scope=read:user&state=${state}`, 302);
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
        try { const file = await readObject(env, 'mindfold-state.json'); return withCors(response(JSON.parse(new TextDecoder().decode(file.content))), env); } catch { return withCors(response({}), env); }
      }
      if (url.pathname === '/api/state' && request.method === 'PUT') {
        const content = JSON.stringify(await request.json(), null, 2);
        await writeObject(env, 'mindfold-state.json', new TextEncoder().encode(content)); return withCors(response({ ok: true }), env);
      }
      if (url.pathname === '/api/files' && request.method === 'GET') {
        return withCors(response(await listObjects(env)), env);
      }
      if (url.pathname === '/api/file' && request.method === 'GET') {
        const path = safePath(url.searchParams.get('path')); const file = await readObject(env, path); return withCors(response({ path, name: path.split('/').pop(), sha: file.etag, content: base64(file.content) }), env);
      }
      if (url.pathname === '/api/file' && request.method === 'PUT') {
        const payload = await request.json(); const filePath = safePath(payload.path); await writeObject(env, filePath, Uint8Array.from(atob(payload.content), character => character.charCodeAt(0))); return withCors(response({ ok: true }), env);
      }
      if (url.pathname === '/api/file' && request.method === 'POST') {
        const payload = await request.json(); const filePath = safePath(payload.path); await writeObject(env, filePath, Uint8Array.from(atob(payload.content), character => character.charCodeAt(0))); return withCors(response({ ok: true }), env);
      }
      return withCors(response({ error: 'not_found' }, 404), env);
    } catch (error) { return withCors(response({ error: error.message }, 500), env); }
  }
};
