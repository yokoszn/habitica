/* eslint-disable global-require */
import requireAgain from 'require-again';
import {
  generateRes,
  generateReq,
  generateNext,
} from '../../../helpers/api-unit.helper';
import logger from '../../../../website/server/libs/logger';

describe('requestLogHandler middleware', () => {
  let res; let req; let
    next;
  const pathToMiddleWare = '../../../../website/server/middlewares/requestLogHandler';

  beforeEach(() => {
    res = generateRes();
    req = generateReq();
    next = generateNext();
  });

  it('attaches start time and request ID object to req', () => {
    const middleware = requireAgain(pathToMiddleWare);

    middleware.logRequestData(req, res, next);

    expect(req.requestStartTime).to.exist;
    expect(req.requestStartTime).to.be.a('number');
    expect(req.requestIdentifier).to.exist;
    expect(req.requestIdentifier).to.be.a('string');
  });

  it('calls next', () => {
    const middleware = requireAgain(pathToMiddleWare);
    const spy = sinon.spy();
    middleware.logRequestData(req, res, spy);
    expect(spy.calledOnce).to.be.true;
  });

  it('redacts passwords, reset codes and credentials in the logged request data', () => {
    const middleware = requireAgain(pathToMiddleWare);
    sandbox.stub(logger, 'info');
    req.headers = { 'x-api-user': 'user-id', 'x-api-key': 'api-key' };
    req.body = { newPassword: 'new-password', code: 'reset-code', username: 'username' };
    req.query = { lang: 'en' };

    middleware.logRequestData(req, res, next);

    expect(logger.info).to.be.calledOnce;
    expect(logger.info).to.be.calledWithMatch('Request started', {
      headers: { 'x-api-user': 'user-id', 'x-api-key': '[REDACTED]' },
      body: { newPassword: '[REDACTED]', code: '[REDACTED]', username: 'username' },
      query: { lang: 'en' },
    });
  });
});
