(() => {
  const config = {
    endpoint: window.MINDFOLD_B2_ENDPOINT,
    region: window.MINDFOLD_B2_REGION || 'us-east-005',
    bucket: window.MINDFOLD_B2_BUCKET || 'notebook-pwa'
  };
  let credentials = JSON.parse(sessionStorage.getItem('mindfold-b2-credentials') || 'null');

  function askCredentials(interactive = true) {
    if (credentials?.keyId && credentials?.applicationKey) return credentials;
    if (!interactive) throw new Error('B2 credentials required');
    const keyId = prompt('请输入 B2 Key ID（本次浏览器会话使用）');
    if (!keyId) throw new Error('B2 credentials required');
    const applicationKey = prompt('请输入 B2 Application Key（不会保存到项目）');
    if (!applicationKey) throw new Error('B2 credentials required');
    credentials = { keyId: keyId.trim(), applicationKey: applicationKey.trim() };
    sessionStorage.setItem('mindfold-b2-credentials', JSON.stringify(credentials));
    return credentials;
  }

  function bytes(value) { return typeof value === 'string' ? new TextEncoder().encode(value) : value; }
  function hex(value) { return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
  async function digest(value) { return crypto.subtle.digest('SHA-256', bytes(value)); }
  async function hmac(key, value) {
    const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? bytes(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, bytes(value));
  }
  function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  async function request(method, path = '', body = new Uint8Array(), query = '', interactive = true) {
    const auth = askCredentials(interactive);
    const endpoint = new URL(`${config.endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.bucket)}/${encodePath(path)}${query}`);
    const payload = bytes(body);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const shortDate = amzDate.slice(0, 8);
    const payloadHash = hex(await digest(payload));
    const signedHeaders = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    if (payload.length) signedHeaders['content-type'] = 'application/octet-stream';
    const keys = Object.keys(signedHeaders).sort();
    const canonicalHeaders = keys.map(key => `${key}:${signedHeaders[key].trim()}\n`).join('');
    const signedHeaderNames = keys.join(';');
    const canonicalQuery = [...endpoint.searchParams.entries()].sort().map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const canonicalRequest = [method, endpoint.pathname, canonicalQuery, canonicalHeaders, signedHeaderNames, payloadHash].join('\n');
    const scope = `${shortDate}/${config.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hex(await digest(canonicalRequest))}`;
    const dateKey = await hmac(`AWS4${auth.applicationKey}`, shortDate);
    const regionKey = await hmac(dateKey, config.region);
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    const signature = hex(await hmac(signingKey, stringToSign));
    const requestHeaders = { 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    if (payload.length) requestHeaders['content-type'] = 'application/octet-stream';
    requestHeaders.Authorization = `AWS4-HMAC-SHA256 Credential=${auth.keyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;
    const response = await fetch(endpoint, { method, headers: requestHeaders, body: payload.length ? payload : undefined });
    if (!response.ok) {
      const detail = await response.clone().text();
      throw new Error(`B2 ${response.status}: ${detail.slice(0, 180)}`);
    }
    return response;
  }

  async function stateGet() {
    try { return await (await request('GET', 'mindfold-state.json', new Uint8Array(), '', false)).json(); }
    catch (error) { if (error.message.startsWith('B2 404:')) return {}; throw error; }
  }
  async function statePut(value) { await request('PUT', 'mindfold-state.json', JSON.stringify(value, null, 2), '', false); }
  async function files() {
    const response = await request('GET', '', new Uint8Array(), '?list-type=2&prefix=attachments%2F', false);
    const xml = await response.text();
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>\s*<Size>(\d+)<\/Size>\s*<ETag>([^<]+)<\/ETag>/g)].map(match => ({ path: match[1], name: match[1].split('/').pop(), size: Number(match[2]), sha: match[3].replaceAll('"', '') }));
  }
  function base64(value) { let binary = ''; new Uint8Array(value).forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary); }
  function fromBase64(value) { const binary = atob(value); return Uint8Array.from(binary, character => character.charCodeAt(0)); }
  async function fileGet(path) { const response = await request('GET', path); if (!response.ok) throw new Error(`B2 file ${response.status}`); return { path, name: path.split('/').pop(), content: base64(await response.arrayBuffer()) }; }
  async function filePut(path, content) { const response = await request('PUT', path, fromBase64(content)); if (!response.ok) throw new Error(`B2 save ${response.status}`); }
  async function filePost(path, content) { const response = await request('PUT', path, fromBase64(content)); if (!response.ok) throw new Error(`B2 upload ${response.status}`); }
  function clear() { credentials = null; sessionStorage.removeItem('mindfold-b2-credentials'); }
  async function testConnection() { await stateGet(); return true; }
  window.MindfoldB2 = { stateGet, statePut, files, fileGet, filePut, filePost, askCredentials, testConnection, clear };
})();
