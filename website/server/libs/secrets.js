import crypto from 'crypto';
import nconf from 'nconf';

// Values from config.json.example, the documentation and older container images (which had
// them baked into config.json). They are public, so an instance using them can be attacked
// with forged session cookies, password reset codes and invitation links.
const README_PLACEHOLDER = 'replace-with-output-of-openssl-rand-hex-32';
export const PUBLIC_SECRET_VALUES = Object.freeze({
  SESSION_SECRET: ['YOUR SECRET HERE', README_PLACEHOLDER],
  SESSION_SECRET_KEY: ['1234567891234567891234567891234567891234567891234567891234567891', README_PLACEHOLDER],
});

const SESSION_SECRET_KEY_FORMAT = /^[0-9a-fA-F]{64}$/;

function generateSecret () {
  return crypto.randomBytes(32).toString('hex');
}

function useSecret (name, value) {
  // Cluster workers and child processes inherit the environment, so they all use the same value
  process.env[name] = value;
  if (nconf.stores.env) {
    // The env store takes precedence over config.json, but only reads process.env when loaded
    nconf.stores.env.loadSync();
  } else {
    nconf.set(name, value);
  }
}

// Makes sure that the session and encryption secrets are set and not publicly known.
// In production, missing or public values are replaced with random ones; they are only valid
// until the next restart, so the operator is asked to configure their own.
// Has to run before any module that reads the secrets (middlewares, libs/encryption) is loaded.
export function ensureSecrets ({ isProd = nconf.get('IS_PROD') } = {}) {
  const warnings = [];

  Object.keys(PUBLIC_SECRET_VALUES).forEach(name => {
    const value = nconf.get(name);
    const isPublic = PUBLIC_SECRET_VALUES[name].includes(value);

    if (value && !isPublic) return;
    if (!value || isProd) {
      useSecret(name, generateSecret());
      warnings.push(`${name} is ${value ? 'set to a publicly known example value' : 'not set'}, using a random value until the next restart. `
        + `Set ${name} to your own secret (for example the output of "openssl rand -hex 32") to keep sessions and emailed links valid across restarts.`);
    } else {
      warnings.push(`${name} is set to a publicly known example value. Never use it for an instance that is reachable by others.`);
    }
  });

  if (!SESSION_SECRET_KEY_FORMAT.test(nconf.get('SESSION_SECRET_KEY'))) {
    throw new Error('SESSION_SECRET_KEY must be 64 hexadecimal characters (32 bytes), for example the output of "openssl rand -hex 32".');
  }

  return warnings;
}
