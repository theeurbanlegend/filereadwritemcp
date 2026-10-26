// test-mcp.mjs — end-to-end check of the MCP OAuth + PKCE flow.
// Run with Node 18+:  node test-mcp.mjs
//
// IMPORTANT: set these to match your server's .env. The REDIRECT_URI must be one of
// the values in OAUTH_REDIRECT_URI (the script reads the auth code from the 302
// Location header — it never has to actually receive the redirect).
import { createHash, randomBytes } from 'node:crypto';

const BASE = 'https://bitin-102-206-97-2.run.pinggy-free.link';
const CLIENT_ID = 'hyperagent-local';
const CLIENT_SECRET =
  'af9b515899968e9c967b55a6772352c741f2050ae8e6601cb3c4a3c28ea8b82f'; // set if you configured one
const REDIRECT_URI = 'https://hyperagent.com/api/mcp-servers/callback';
const SCOPE = 'mcp:tools';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function main() {
  // 0) Discovery sanity
  const prm = await fetch(`${BASE}/.well-known/oauth-protected-resource`).then(
    (r) => r.json(),
  );
  console.log(
    '✓ protected-resource:',
    prm.resource,
    '| AS:',
    prm.authorization_servers?.[0],
  );

  // 1) PKCE pair
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());

  // 2) /authorize — capture the 302 Location WITHOUT following it
  const authUrl =
    `${BASE}/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}&code_challenge_method=S256` +
    `&scope=${encodeURIComponent(SCOPE)}&state=xyz`;
  console.log('authUrl:', authUrl);
  const authRes = await fetch(authUrl, { redirect: 'manual' });
  const location = authRes.headers.get('location');
  if (!location)
    throw new Error(
      `/authorize didn't redirect (status ${authRes.status}): ${await authRes.text()}`,
    );
  const returned = new URL(location);
  if (returned.searchParams.get('error'))
    throw new Error(`/authorize error: ${returned.search}`);
  const code = returned.searchParams.get('code');
  if (!code) throw new Error(`no code in redirect: ${location}`);
  console.log('✓ auth code received');

  // 3) /token — exchange code + verifier (+ client_secret if set)
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  if (CLIENT_SECRET) form.set('client_secret', CLIENT_SECRET);
  const tokenJson = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  }).then((r) => r.json());
  if (!tokenJson.access_token)
    throw new Error(`token exchange failed: ${JSON.stringify(tokenJson)}`);
  const token = tokenJson.access_token;
  console.log(
    `✓ access token (expires_in ${tokenJson.expires_in}, refresh_token ${tokenJson.refresh_token ? 'yes' : 'no'})`,
  );

  // helper: /mcp requires Accept to include BOTH json and event-stream
  const headers = (sid) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(sid ? { 'mcp-session-id': sid } : {}),
  });

  // 4) initialize
  const initRes = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-mcp', version: '1.0.0' },
      },
    }),
  });
  const sessionId = initRes.headers.get('mcp-session-id');
  const init = await readMcp(initRes);
  if (!sessionId)
    throw new Error(`no Mcp-Session-Id header. body: ${JSON.stringify(init)}`);
  console.log('✓ initialize:', init.result?.serverInfo ?? init.result ?? init);

  // 5) initialized notification (required before further requests)
  await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: headers(sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });

  // 6) tools/list
  const list = await readMcp(
    await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: headers(sessionId),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    }),
  );
  const tools = list.result?.tools ?? [];
  console.log(`✓ tools/list (${tools.length}):`);
  for (const t of tools) console.log(`   • ${t.name} — ${t.description ?? ''}`);

  // 7) call echo if present
  if (tools.some((t) => t.name === 'echo')) {
    const call = await readMcp(
      await fetch(`${BASE}/mcp`, {
        method: 'POST',
        headers: headers(sessionId),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'echo', arguments: { message: 'hello mcp' } },
        }),
      }),
    );
    console.log('✓ tools/call echo →', JSON.stringify(call.result));
  }

  console.log('\n🎉 Full flow passed — your server is Hyperagent-ready.');
}

// Streamable HTTP answers as JSON (enableJsonResponse) or as an SSE stream — handle both.
async function readMcp(res) {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json();
  const text = await res.text();
  const data = text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .join('');
  if (!data)
    throw new Error(
      `unexpected /mcp response (${res.status}, ${ct}): ${text.slice(0, 300)}`,
    );
  return JSON.parse(data);
}

main().catch((e) => {
  console.error('\n✗ FAILED:', e.message);
  process.exit(1);
});
