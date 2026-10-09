import nconf from 'nconf';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import requireAgain from 'require-again';
import * as redis from '../../../../website/server/libs/redis';
import {
  generateRes,
  generateReq,
  generateNext,
} from '../../../helpers/api-unit.helper';
import { TooManyRequests } from '../../../../website/server/libs/errors';
import { apiError } from '../../../../website/server/libs/apiError';
import logger from '../../../../website/server/libs/logger';

describe('rateLimiter middleware', () => {
  const pathToRateLimiter = '../../../../website/server/middlewares/rateLimiter';

  let res; let req; let next; let nconfGetStub;

  beforeEach(() => {
    nconfGetStub = sandbox.stub(nconf, 'get');

    nconfGetStub.withArgs('NODE_ENV').returns('test');
    nconfGetStub.withArgs('IS_TEST').returns(true);

    res = generateRes();
    req = generateReq();
    next = generateNext();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('is disabled when the env var is not defined', () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns(undefined);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    const calledWith = next.getCall(0).args;
    expect(typeof calledWith[0] === 'undefined').to.equal(true);
    expect(res.set).to.not.have.been.called;
  });

  it('is disabled when the env var is an not "true"', () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('false');
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    const calledWith = next.getCall(0).args;
    expect(typeof calledWith[0] === 'undefined').to.equal(true);
    expect(res.set).to.not.have.been.called;
  });

  it('does not throw when there are available points', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    const calledWith = next.getCall(0).args;
    expect(typeof calledWith[0] === 'undefined').to.equal(true);

    expect(res.set).to.have.been.calledOnce;
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 29,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('does not throw when an unknown error is thrown by the rate limiter', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    sandbox.stub(logger, 'error');
    sandbox.stub(RateLimiterMemory.prototype, 'consume')
      .returns(Promise.reject(new Error('Unknown error.')));

    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    const calledWith = next.getCall(0).args;
    expect(typeof calledWith[0] === 'undefined').to.equal(true);
    expect(res.set).to.not.have.been.called;

    expect(logger.error).to.be.calledOnce;
    expect(logger.error).to.have.been.calledWithMatch(Error, 'Rate Limiter Error');
  });

  it('does not throw when LIVELINESS_PROBE_KEY is correct', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('LIVELINESS_PROBE_KEY').returns('abc');
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    req.query.liveliness = 'abc';
    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    const calledWith = next.getCall(0).args;
    expect(typeof calledWith[0] === 'undefined').to.equal(true);
    expect(res.set).to.not.have.been.called;
  });

  it('limits when LIVELINESS_PROBE_KEY is incorrect', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('LIVELINESS_PROBE_KEY').returns('abc');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    req.query.liveliness = 'das';
    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 29,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('limits when LIVELINESS_PROBE_KEY is not set', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('LIVELINESS_PROBE_KEY').returns(undefined);
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 29,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('throws when LIVELINESS_PROBE_KEY is blank', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('LIVELINESS_PROBE_KEY').returns('');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    req.query.liveliness = '';
    await attachRateLimiter(req, res, next);

    expect(next).to.have.been.calledOnce;
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 29,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('throws when there are no available points remaining', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    // call for 31 times
    for (let i = 0; i < 31; i += 1) {
      await attachRateLimiter(req, res, next); // eslint-disable-line no-await-in-loop
    }

    expect(next).to.have.been.callCount(31);
    const calledWith = next.getCall(30).args;
    expect(calledWith[0].message).to.equal(apiError('clientRateLimited'));
    expect(calledWith[0] instanceof TooManyRequests).to.equal(true);

    expect(res.set).to.have.been.callCount(31);
    expect(res.set).to.have.been.calledWithMatch({
      'Retry-After': sinon.match(Number),
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('uses the user id if supplied or the ip address', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    req.ip = 1;
    await attachRateLimiter(req, res, next);

    req.headers['x-api-user'] = 'user-1';
    await attachRateLimiter(req, res, next);
    await attachRateLimiter(req, res, next);

    // user id an ip are counted as separate sources
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 28, // 2 calls with user id
      'X-RateLimit-Reset': sinon.match(Date),
    });

    req.headers['x-api-user'] = undefined;
    await attachRateLimiter(req, res, next);
    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 27, // 3 calls with only ip
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('applies increased cost for registration calls with and without user id', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_REGISTRATION_COST').returns(3);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.path = '/api/v4/user/auth/local/register';

    req.ip = 1;
    await attachRateLimiter(req, res, next);

    req.headers['x-api-user'] = 'user-1';
    await attachRateLimiter(req, res, next);
    await attachRateLimiter(req, res, next);

    // the user id is ignored, all calls are counted for the ip
    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 21,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });

  it('applies the registration cost to paths relative to the mount point', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_REGISTRATION_COST').returns(3);
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.path = '/user/auth/local/register';
    req.ip = 1;

    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 27,
    });
  });

  it('applies the login cost to paths relative to the mount point', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_LOGIN_COST').returns(4);
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.path = '/user/auth/local/login';
    req.ip = 1;

    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 26,
    });
  });

  it('applies the costs passed as options', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter({
      points: 100,
      loginCost: 7,
      registrationCost: 9,
    });
    req.ip = 1;

    req.path = '/user/auth/local/login';
    await attachRateLimiter(req, res, next);
    expect(res.set).to.have.been.calledWithMatch({ 'X-RateLimit-Remaining': 93 });

    req.path = '/user/auth/local/register';
    await attachRateLimiter(req, res, next);
    expect(res.set).to.have.been.calledWithMatch({ 'X-RateLimit-Remaining': 84 });
  });

  it('matches the login path regardless of case and trailing slashes', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_LOGIN_COST').returns(4);
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.path = '/User/Auth/Local/Login/';
    req.ip = 1;
    req.headers['x-api-user'] = 'random-1';

    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 26,
    });
  });

  it('limits login calls by ip even when the user id header changes', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.path = '/user/auth/local/login';
    req.ip = 1;

    // the default login cost of 10 allows 3 calls per minute
    for (let i = 0; i < 4; i += 1) {
      req.headers['x-api-user'] = `random-${i}`;
      await attachRateLimiter(req, res, next); // eslint-disable-line no-await-in-loop
    }

    expect(next).to.have.been.callCount(4);
    expect(next.getCall(2).args[0]).to.be.undefined;
    expect(next.getCall(3).args[0] instanceof TooManyRequests).to.equal(true);
  });

  it('ignores the user id header on all unauthenticated auth paths', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(2);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter({ points: 100 });
    req.ip = 1;
    req.headers['x-api-user'] = 'user-1';

    const paths = [
      '/user/auth/social',
      '/user/auth/apple',
      '/user/auth/check-email',
      '/user/reset-password',
      '/user/auth/reset-password-set-new-one',
    ];
    for (const path of paths) { // eslint-disable-line no-restricted-syntax
      req.path = path;
      await attachRateLimiter(req, res, next); // eslint-disable-line no-await-in-loop
    }

    // ip cost for every call, all counted for the ip
    expect(res.set).to.have.been.calledWithMatch({ 'X-RateLimit-Remaining': 90 });

    req.path = '/user/auth/verify-username';
    await attachRateLimiter(req, res, next);
    expect(res.set).to.have.been.calledWithMatch({ 'X-RateLimit-Remaining': 89 });
  });

  it('uses the user id on authenticated auth paths', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(5);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();
    req.ip = 1;
    req.headers['x-api-user'] = 'user-1';

    req.path = '/user/auth/social/facebook';
    await attachRateLimiter(req, res, next);
    req.path = '/user/auth/update-password';
    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({ 'X-RateLimit-Remaining': 28 });
  });

  describe('store', () => {
    let setupRedisStub;

    beforeEach(() => {
      nconfGetStub.withArgs('IS_TEST').returns(false);
      nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
      nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(1);
      setupRedisStub = sandbox.stub(redis, 'default').returns({ on: sandbox.stub() });
    });

    it('keeps the limits in memory when Redis is not configured', async () => {
      const setupRateLimiter = requireAgain(pathToRateLimiter).default;
      const attachRateLimiter = setupRateLimiter();
      await attachRateLimiter(req, res, next);

      expect(setupRedisStub).to.not.have.been.called;
      expect(next).to.have.been.calledOnce;
      expect(next.getCall(0).args[0]).to.be.undefined;
      expect(res.set).to.have.been.calledWithMatch({
        'X-RateLimit-Limit': 30,
        'X-RateLimit-Remaining': 29,
      });
    });

    it('uses Redis when REDIS_HOST is configured', async () => {
      nconfGetStub.withArgs('REDIS_HOST').returns('redis');
      nconfGetStub.withArgs('REDIS_PORT').returns('6379');
      nconfGetStub.withArgs('REDIS_PASSWORD').returns('secret');
      const redisConsumeStub = sandbox.stub(RateLimiterRedis.prototype, 'consume')
        .resolves(new RateLimiterRes(29, 1000, 1, true));
      const memoryConsumeSpy = sandbox.spy(RateLimiterMemory.prototype, 'consume');

      const setupRateLimiter = requireAgain(pathToRateLimiter).default;
      const attachRateLimiter = setupRateLimiter();
      await attachRateLimiter(req, res, next);

      expect(setupRedisStub).to.have.been.calledOnce;
      expect(setupRedisStub).to.have.been.calledWithMatch({
        host: 'redis',
        port: '6379',
        password: 'secret',
      });
      expect(redisConsumeStub).to.have.been.calledOnce;
      expect(memoryConsumeSpy).to.not.have.been.called;
    });

    it('uses Redis when REDIS_URL is configured', async () => {
      nconfGetStub.withArgs('REDIS_URL').returns('redis://redis:6379');
      const redisConsumeStub = sandbox.stub(RateLimiterRedis.prototype, 'consume')
        .resolves(new RateLimiterRes(29, 1000, 1, true));

      const setupRateLimiter = requireAgain(pathToRateLimiter).default;
      const attachRateLimiter = setupRateLimiter();
      await attachRateLimiter(req, res, next);

      expect(setupRedisStub).to.have.been.calledWithMatch({ url: 'redis://redis:6379' });
      expect(redisConsumeStub).to.have.been.calledOnce;
    });
  });

  it('applies increased cost for unauthenticated API calls', async () => {
    nconfGetStub.withArgs('RATE_LIMITER_ENABLED').returns('true');
    nconfGetStub.withArgs('RATE_LIMITER_IP_COST').returns(10);
    const setupRateLimiter = requireAgain(pathToRateLimiter).default;
    const attachRateLimiter = setupRateLimiter();

    req.ip = 1;
    await attachRateLimiter(req, res, next);
    await attachRateLimiter(req, res, next);

    expect(res.set).to.have.been.calledWithMatch({
      'X-RateLimit-Limit': 30,
      'X-RateLimit-Remaining': 10,
      'X-RateLimit-Reset': sinon.match(Date),
    });
  });
});
