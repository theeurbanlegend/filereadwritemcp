import { safeNext } from './cookies';

describe('safeNext', () => {
  it.each([
    ['/', '/'],
    ['/settings', '/settings'],
    ['/authorize?client_id=a&state=b', '/authorize?client_id=a&state=b'],
    ['/consent?x=1#top', '/consent?x=1#top'],
  ])('keeps same-site path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    '//evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    '\\\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '',
    undefined,
    42,
  ])('rejects %p', (input) => {
    expect(safeNext(input)).toBe('/');
  });
});
