import { validRedirectUri } from './oauth-client.service';

describe('validRedirectUri', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'http://localhost:6274/oauth/callback',
    'http://127.0.0.1:33418/',
    'http://[::1]:8080/callback',
    'cursor://anysphere.cursor-retrieval/oauth/user-mcp/callback',
    'vscode://vscode.github-authentication/did-authenticate',
  ])('accepts %s', (uri) => {
    expect(validRedirectUri(uri)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'http://evil.example/callback',
    'https://claude.ai/callback#fragment',
    'https://user:pass@example.com/cb',
    'not a url',
    '',
    42,
    `https://example.com/${'a'.repeat(2001)}`,
  ])('rejects %s', (uri) => {
    expect(validRedirectUri(uri)).toBe(false);
  });
});
