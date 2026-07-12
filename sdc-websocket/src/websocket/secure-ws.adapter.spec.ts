import { isWebsocketOriginAllowed } from './secure-ws.adapter';

describe('WebSocket Origin policy', () => {
  it('rechaza origen ausente o ajeno cuando existe una allowlist', () => {
    const allowed = ['https://app.chamanagro.ar'];
    expect(isWebsocketOriginAllowed(undefined, allowed)).toBe(false);
    expect(isWebsocketOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('acepta exclusivamente un origen configurado', () => {
    expect(
      isWebsocketOriginAllowed('https://app.chamanagro.ar', [
        'https://app.chamanagro.ar',
      ]),
    ).toBe(true);
  });
});
