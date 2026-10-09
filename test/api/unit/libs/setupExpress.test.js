import express from 'express';
import nconf from 'nconf';
import requireAgain from 'require-again';

describe('setupExpress', () => {
  const pathToSetupExpress = '../../../../website/server/libs/setupExpress';

  let nconfGetStub;

  beforeEach(() => {
    nconfGetStub = sandbox.stub(nconf, 'get');
  });

  afterEach(() => {
    sandbox.restore();
  });

  function setupApp () {
    const app = express();
    requireAgain(pathToSetupExpress).default(app);
    return app;
  }

  function clientIp (app, remoteAddress, forwardedFor) {
    const req = Object.create(app.request);
    req.app = app;
    req.headers = { 'x-forwarded-for': forwardedFor };
    req.connection = { remoteAddress };
    req.socket = req.connection;
    return req.ip;
  }

  describe('parseTrustProxy', () => {
    let parseTrustProxy;

    beforeEach(() => {
      ({ parseTrustProxy } = requireAgain(pathToSetupExpress));
    });

    it('returns undefined when the value is not set', () => {
      expect(parseTrustProxy(undefined)).to.be.undefined;
      expect(parseTrustProxy(null)).to.be.undefined;
      expect(parseTrustProxy('')).to.be.undefined;
      expect(parseTrustProxy('  ')).to.be.undefined;
    });

    it('parses booleans', () => {
      expect(parseTrustProxy('true')).to.equal(true);
      expect(parseTrustProxy('false')).to.equal(false);
      expect(parseTrustProxy(true)).to.equal(true);
      expect(parseTrustProxy(false)).to.equal(false);
    });

    it('parses numbers of hops', () => {
      expect(parseTrustProxy('2')).to.equal(2);
      expect(parseTrustProxy(1)).to.equal(1);
    });

    it('returns lists of addresses as they are', () => {
      expect(parseTrustProxy(' 10.0.0.1, 172.16.0.0/12 ')).to.equal('10.0.0.1, 172.16.0.0/12');
    });
  });

  it('only trusts proxies on local and private addresses in production by default', () => {
    nconfGetStub.withArgs('IS_PROD').returns(true);
    const app = setupApp();

    expect(app.get('trust proxy')).to.equal('loopback, linklocal, uniquelocal');
    expect(clientIp(app, '8.8.8.8', '6.6.6.6')).to.equal('8.8.8.8');
    expect(clientIp(app, '127.0.0.1', '6.6.6.6')).to.equal('6.6.6.6');
    expect(clientIp(app, '172.18.0.2', '6.6.6.6')).to.equal('6.6.6.6');
    // a spoofed address in front of the real one is ignored
    expect(clientIp(app, '172.18.0.2', '6.6.6.6, 8.8.8.8')).to.equal('8.8.8.8');
  });

  it('does not trust proxies outside of production by default', () => {
    nconfGetStub.withArgs('IS_PROD').returns(false);
    const app = setupApp();

    expect(clientIp(app, '127.0.0.1', '6.6.6.6')).to.equal('127.0.0.1');
  });

  it('uses TRUST_PROXY when it is set', () => {
    nconfGetStub.withArgs('IS_PROD').returns(true);
    nconfGetStub.withArgs('TRUST_PROXY').returns('true');
    let app = setupApp();
    expect(app.get('trust proxy')).to.equal(true);
    expect(clientIp(app, '8.8.8.8', '6.6.6.6')).to.equal('6.6.6.6');

    nconfGetStub.withArgs('TRUST_PROXY').returns('false');
    app = setupApp();
    expect(app.get('trust proxy')).to.equal(false);
    expect(clientIp(app, '127.0.0.1', '6.6.6.6')).to.equal('127.0.0.1');

    nconfGetStub.withArgs('TRUST_PROXY').returns('1');
    app = setupApp();
    expect(app.get('trust proxy')).to.equal(1);
    expect(clientIp(app, '8.8.8.8', '6.6.6.6, 7.7.7.7')).to.equal('7.7.7.7');

    nconfGetStub.withArgs('TRUST_PROXY').returns('8.8.8.8');
    app = setupApp();
    expect(clientIp(app, '8.8.8.8', '6.6.6.6')).to.equal('6.6.6.6');
    expect(clientIp(app, '127.0.0.1', '6.6.6.6')).to.equal('127.0.0.1');
  });

  it('uses TRUST_PROXY outside of production', () => {
    nconfGetStub.withArgs('IS_PROD').returns(false);
    nconfGetStub.withArgs('TRUST_PROXY').returns('loopback');
    const app = setupApp();

    expect(clientIp(app, '127.0.0.1', '6.6.6.6')).to.equal('6.6.6.6');
  });
});
