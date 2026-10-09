import nconf from 'nconf';
import { ensureSecrets, PUBLIC_SECRET_VALUES } from '../../../../website/server/libs/secrets';

const NAMES = ['SESSION_SECRET', 'SESSION_SECRET_KEY'];

describe('ensureSecrets', () => {
  let originalValues;
  let originalEnv;

  beforeEach(() => {
    originalValues = NAMES.map(name => nconf.get(name));
    originalEnv = NAMES.map(name => process.env[name]);
  });

  afterEach(() => {
    NAMES.forEach((name, i) => {
      if (originalEnv[i] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalEnv[i];
      }
    });
    // Remove what ensureSecrets loaded into the (read-only) env store
    const { env } = nconf.stores;
    env.readOnly = false;
    NAMES.forEach(name => env.clear(name));
    env.readOnly = true;
    env.loadSync();
    NAMES.forEach((name, i) => nconf.set(name, originalValues[i]));
  });

  function setSecrets (sessionSecret, sessionSecretKey) {
    nconf.set('SESSION_SECRET', sessionSecret);
    nconf.set('SESSION_SECRET_KEY', sessionSecretKey);
  }

  const ownKey = 'a'.repeat(64);

  it('keeps secrets that are configured by the operator', () => {
    setSecrets('my own secret', ownKey);

    expect(ensureSecrets({ isProd: true })).to.eql([]);
    expect(nconf.get('SESSION_SECRET')).to.equal('my own secret');
    expect(nconf.get('SESSION_SECRET_KEY')).to.equal(ownKey);
  });

  it('replaces publicly known values with random ones in production', () => {
    setSecrets(PUBLIC_SECRET_VALUES.SESSION_SECRET[0], PUBLIC_SECRET_VALUES.SESSION_SECRET_KEY[0]);

    const warnings = ensureSecrets({ isProd: true });

    expect(warnings).to.have.length(2);
    NAMES.forEach(name => {
      expect(PUBLIC_SECRET_VALUES[name]).to.not.include(nconf.get(name));
      expect(nconf.get(name)).to.match(/^[0-9a-f]{64}$/);
      expect(process.env[name]).to.equal(nconf.get(name));
    });
  });

  it('only warns about publicly known values outside of production', () => {
    setSecrets(PUBLIC_SECRET_VALUES.SESSION_SECRET[0], PUBLIC_SECRET_VALUES.SESSION_SECRET_KEY[0]);

    const warnings = ensureSecrets({ isProd: false });

    expect(warnings).to.have.length(2);
    expect(nconf.get('SESSION_SECRET')).to.equal(PUBLIC_SECRET_VALUES.SESSION_SECRET[0]);
  });

  it('generates missing secrets', () => {
    setSecrets(undefined, undefined);

    const warnings = ensureSecrets({ isProd: false });

    expect(warnings).to.have.length(2);
    expect(nconf.get('SESSION_SECRET')).to.match(/^[0-9a-f]{64}$/);
    expect(nconf.get('SESSION_SECRET_KEY')).to.match(/^[0-9a-f]{64}$/);
  });

  it('rejects an encryption key with the wrong format', () => {
    setSecrets('my own secret', 'not-a-hex-key');

    expect(() => ensureSecrets({ isProd: true })).to.throw(/SESSION_SECRET_KEY must be 64 hexadecimal/);
  });
});
