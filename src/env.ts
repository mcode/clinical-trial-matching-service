/**
 * Provides a method of converting environment configuration to server
 * configuration.
 */

import { Configuration } from './server';

/**
 * Creates configuration based on the given environment or the process
 * environment if none is given.
 *
 * @param env the environment to load configuration from
 * @param prefix a prefix to require for configuration keys
 */
export function configFromEnv(env: Record<string, string | undefined> = process.env, prefix = ''): Configuration {
  const config: Configuration = { };
  // This basically copies everything that's defined over.
  for (const k in env) {
    const v = env[k];
    if (k.startsWith(prefix)) {
      // Environment keys should be in ALL CAPS but our config keys are lower case
      const configKey = k.substring(prefix.length).toLowerCase();
      if (typeof v !== 'undefined') {
        if (configKey === 'port') {
          // Special-case: needs to be a number
          config.port = parseInt(v);
        } else {
          config[configKey] = v;
        }
      }
    }
  }
  return config;
}
