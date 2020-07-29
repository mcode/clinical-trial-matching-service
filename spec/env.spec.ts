import { configFromEnv } from '../src/env';

describe('configFromEnv', () => {
  it('parses a port', () => {
    const config = configFromEnv({ 'port': '8080' });
    expect(config.port).toEqual(8080);
  });

  it('lowercases environment variables', () => {
    const config = configFromEnv({ 'HOST': '127.0.0.1' });
    expect(config.host).toEqual('127.0.0.1');
  });
});
