/**
 * Provides a method of converting environment configuration to server
 * configuration.
 */

import { Configuration } from './server';

export function configFromEnv(prefix: string): Configuration;
export function configFromEnv(env: Record<string, string | undefined>): Configuration;
/**
 * Creates configuration based on the given environment or the process
 * environment if none is given.
 *
 * @param prefix a prefix to require for configuration keys
 * @param env the environment to load configuration from
 */
export function configFromEnv(prefix: string, env: Record<string, string | undefined>): Configuration;
/**
 * Creates configuration based on environment variables in process.env with no
 * prefix. (Meaning the configuration will contain every environment variable.)
 */
export function configFromEnv(): Configuration;
export function configFromEnv(prefixOrEnv?: string | Record<string, string | undefined>, envOrNothing?: Record<string, string | undefined>): Configuration {
  // Unwind the overloads
  const prefix: string = typeof prefixOrEnv === 'string' ? prefixOrEnv : '';
  const env: Record<string, string | undefined> = typeof envOrNothing === 'object' ?
    envOrNothing :
    (typeof prefixOrEnv === 'object' && prefixOrEnv ? prefixOrEnv : process.env);
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
