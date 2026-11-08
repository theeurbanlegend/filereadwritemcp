import { toCallToolResult, unsupportedFeature } from './tool-result';

const imageRead = {
  success: true,
  encoding: 'base64',
  content: 'iVBORw0KGgo=',
  mimeType: 'image/png',
  hash: 'abc',
  bytes: 8,
};

describe('toCallToolResult', () => {
  it('shows an image read as an image plus its details', () => {
    const result = toCallToolResult('readFile', { path: '/a.png' }, imageRead);
    expect(result.content).toEqual([
      { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          encoding: 'base64',
          mimeType: 'image/png',
          hash: 'abc',
          bytes: 8,
        }),
      },
    ]);
  });

  it('returns raw base64 when the caller asked for base64', () => {
    const result = toCallToolResult(
      'readFile',
      { path: '/a.png', encoding: 'base64' },
      imageRead,
    );
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(imageRead) },
    ]);
  });

  it('keeps non-image binary and text reads as JSON text', () => {
    const pdf = { ...imageRead, mimeType: 'application/pdf' };
    expect(toCallToolResult('readFile', {}, pdf).content).toEqual([
      { type: 'text', text: JSON.stringify(pdf) },
    ]);
    const svg = { ...imageRead, mimeType: 'image/svg+xml' };
    expect(toCallToolResult('readFile', {}, svg).content[0].type).toBe('text');
    const text = { success: true, encoding: 'utf8', content: 'hi' };
    expect(toCallToolResult('readFile', {}, text).content).toEqual([
      { type: 'text', text: JSON.stringify(text) },
    ]);
  });

  it('only turns readFile results into images', () => {
    expect(toCallToolResult('getFileInfo', {}, imageRead).content).toEqual([
      { type: 'text', text: JSON.stringify(imageRead) },
    ]);
  });
});

describe('unsupportedFeature', () => {
  const current = [
    'readFile',
    'writeFile',
    'getFileInfo',
    'editFile',
    'moveFile',
    'copyFile',
  ].map((name) => ({ name }));
  const binaryOnly = ['readFile', 'writeFile', 'getFileInfo'].map((name) => ({
    name,
  }));
  const old = [{ name: 'readFile' }, { name: 'writeFile' }];

  it('allows everything on a current agent', () => {
    expect(unsupportedFeature('editFile', {}, current)).toBeNull();
    expect(
      unsupportedFeature('writeFile', { encoding: 'base64' }, current),
    ).toBeNull();
  });

  it('names tools the agent does not advertise', () => {
    expect(unsupportedFeature('moveFile', {}, binaryOnly)).toBe('moveFile');
    expect(unsupportedFeature('getFileInfo', {}, old)).toBe('getFileInfo');
    expect(unsupportedFeature('readFile', {}, old)).toBeNull();
  });

  it('refuses base64 without binary support', () => {
    expect(unsupportedFeature('readFile', { encoding: 'base64' }, old)).toBe(
      'binary files',
    );
    expect(
      unsupportedFeature('readFile', { encoding: 'utf8' }, old),
    ).toBeNull();
  });

  it('only blocks new tools when the agent sent no tool list', () => {
    expect(unsupportedFeature('readFile', {}, [])).toBeNull();
    expect(unsupportedFeature('copyFile', {}, [])).toBe('copyFile');
  });
});
