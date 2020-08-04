import { configFromEnv } from '../src/env';

describe('configFromEnv', () => {
  it('defaults to process.env', () => {
    process.env['TEST_PREFIX_VALUE'] = 'a value';
    const config = configFromEnv('TEST_PREFIX_');
    expect(config['value']).toEqual('a value');
  });

  it('handles a prefix', () => {
    const config = configFromEnv('CLINICAL_TRIAL_MATCHING_SERVICE_', { 'CLINICAL_TRIAL_MATCHING_SERVICE_PORT': '8080' });
    expect(config.port).toEqual(8080);
  });

  it('handles keys with a value of undefined', () => {
    const config = configFromEnv({ 'foo': undefined });
    // This doesn't really prove anything, but the key should be ignored
    expect('foo' in config).toBeFalse();
  });

  it('parses a port', () => {
    const config = configFromEnv({ 'port': '8080' });
    expect(config.port).toEqual(8080);
  });

  it('lowercases environment variables', () => {
    const config = configFromEnv({ 'HOST': '127.0.0.1' });
    expect(config.host).toEqual('127.0.0.1');
  });
});
