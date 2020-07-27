// FIXME: This won't actually work as-is (because it will be looking for env.local somewhere inside of node_modules)

import fs from 'fs';
import path from 'path';

const defaults: { [key: string]: string | undefined } = {
  PORT: '3000'
};

try {
  // Sadly there is no good way to *synchronously* read lines from a file and
  // Node provides no way to make a module load wait on a Promise.
  const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), { encoding: 'utf8' });
  // Note that the following will collapse \r\r into a single line, but it
  // doesn't matter, empty lines are ignored anyway.
  for (const line of envLocal.split(/\r?[\r\n]/)) {
    const m = /^\s*(\w+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) {
      const k = m[1],
        value = m[2];
      if (k in defaults) {
        defaults[k] = value;
      }
    }
  }
} catch (ex) {
  const e: NodeJS.ErrnoException = ex as NodeJS.ErrnoException;
  // Ignore ENOENT, it means the file doesn't exist, which is fine
  if (e.code !== 'ENOENT') {
    console.error('Unexpected error loading .env.local:');
    console.error(ex);
  }
}

// Override defaults with environment variables if they exist
for (const k in defaults) {
  if (k in process.env) {
    defaults[k] = process.env[k];
  }
}

/**
 * Creates a new Configuration object with defaults loaded.
 */
export default class Configuration {
  private _port: number;
  constructor() {
    // Default to defaults
    this._port = defaults.PORT ? parseInt(defaults.PORT) : 3000;
  }

  get port(): number {
    return this._port;
  }
}

if (module.parent === null) {
  console.log('Environment as loaded:');
  for (const k of Object.entries(defaults)) {
    console.log(`  ${k[0]} = ${k[1]}`);
  }
}
