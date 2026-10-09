import cloneDeep from 'lodash/cloneDeep';
import {
  generateRes,
  generateReq,
  generateNext,
} from '../../../helpers/api-unit.helper';

import errorHandler from '../../../../website/server/middlewares/errorHandler';
import responseMiddleware from '../../../../website/server/middlewares/response';
import {
  getUserLanguage,
  attachTranslateFunction,
} from '../../../../website/server/middlewares/language';

import { BadRequest } from '../../../../website/server/libs/errors';
import logger from '../../../../website/server/libs/logger';

describe('errorHandler', () => {
  let res; let req; let
    next;

  beforeEach(() => {
    res = generateRes();
    req = generateReq();
    next = generateNext();
    responseMiddleware(req, res, next);
    getUserLanguage(req, res, next);
    attachTranslateFunction(req, res, next);

    sandbox.stub(logger, 'error');
  });

  it('sends internal server error if error is not a CustomError and is not identified', () => {
    const error = new Error();

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(500);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });
  });

  it('identifies errors with statusCode property and format them correctly', () => {
    const error = new Error('Error message');
    error.statusCode = 400;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'Error',
      message: 'Error message',
    });
  });

  it('doesn\'t leak info about 500 errors', () => {
    const error = new Error('Some secret error message');
    error.statusCode = 500;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(500);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });
  });

  it('sends CustomError', () => {
    const error = new BadRequest();

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'Bad request.',
    });
  });

  it('handle http-errors errors', () => {
    const error = new Error('custom message');
    error.statusCode = 422;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(error.statusCode);
    expect(res.json).to.be.calledWith({
      success: false,
      error: error.name,
      message: error.message,
    });
  });

  it('handle express-validator errors', () => {
    const error = [{ param: 'param', msg: 'invalid param', value: 123 }];

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'Invalid request parameters.',
      errors: [
        { param: error[0].param, value: error[0].value, message: error[0].msg },
      ],
    });
  });

  it('handle Mongoose Validation errors', () => {
    const error = new Error('User validation failed');
    error.name = 'ValidationError';

    error.errors = {
      'auth.local.email': {
        path: 'auth.local.email',
        message: 'Invalid email.',
        value: 'not an email',
      },
    };

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'User validation failed',
      errors: [
        { path: 'auth.local.email', message: 'Invalid email.', value: 'not an email' },
      ],
    });
  });

  it('logs error', () => {
    const error = new BadRequest();

    errorHandler(error, req, res, next);

    expect(logger.error).to.be.calledOnce;
    expect(logger.error).to.be.calledWithExactly(error, {
      method: req.method,
      originalUrl: req.originalUrl,
      headers: req.headers,
      body: req.body,
      query: req.query,
      httpCode: 400,
      isHandledError: true,
    });
  });

  it('redacts passwords, reset codes and credentials in the logged request data', () => {
    req.headers = {
      'x-api-user': 'user-id',
      'x-api-key': 'api-key',
      'x-client': 'habitica-web',
      authorization: 'Basic dXNlcjpwYXNz',
      cookie: 'connect.sid=session',
    };
    req.body = {
      password: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
      oldPassword: 'old-password',
      code: 'reset-code',
      id_token: 'apple-token',
      authResponse: { access_token: 'social-token' },
      ops: [{ type: 'update', apiToken: 'token' }],
      username: 'username',
      email: 'user@example.com',
    };
    req.query = { code: 'unsubscribe-code', lang: 'en' };
    const originalBody = cloneDeep(req.body);

    errorHandler(new BadRequest(), req, res, next);

    expect(logger.error).to.be.calledOnce;
    const [, logData] = logger.error.firstCall.args;
    expect(logData.headers).to.eql({
      'x-api-user': 'user-id',
      'x-api-key': '[REDACTED]',
      'x-client': 'habitica-web',
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
    });
    expect(logData.body).to.eql({
      password: '[REDACTED]',
      newPassword: '[REDACTED]',
      confirmPassword: '[REDACTED]',
      oldPassword: '[REDACTED]',
      code: '[REDACTED]',
      id_token: '[REDACTED]',
      authResponse: { access_token: '[REDACTED]' },
      ops: [{ type: 'update', apiToken: '[REDACTED]' }],
      username: 'username',
      email: 'user@example.com',
    });
    expect(logData.query).to.eql({ code: '[REDACTED]', lang: 'en' });
    // the request itself is not modified
    expect(req.body).to.eql(originalBody);
  });

  it('truncates deeply nested request data in the logs', () => {
    let nested = { newPassword: 'new-password' };
    for (let i = 0; i < 5000; i += 1) nested = { nested };
    req.body = nested;

    errorHandler(new BadRequest(), req, res, next);

    expect(logger.error).to.be.calledOnce;
    expect(JSON.stringify(logger.error.firstCall.args[1].body)).to.not.include('new-password');
    expect(res.status).to.be.calledWith(400);
  });

  it('redacts sensitive values of express-validator errors in the logs only', () => {
    const error = [
      { param: 'username', msg: 'invalid username', value: 'user name' },
      { param: 'password', msg: 'passwords do not match', value: 'secret-password' },
    ];

    errorHandler(error, req, res, next);

    expect(logger.error).to.be.calledOnce;
    expect(logger.error.firstCall.args[0]).to.eql([
      { param: 'username', msg: 'invalid username', value: 'user name' },
      { param: 'password', msg: 'passwords do not match', value: '[REDACTED]' },
    ]);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'Invalid request parameters.',
      errors: [
        { param: 'username', value: 'user name', message: 'invalid username' },
        { param: 'password', value: 'secret-password', message: 'passwords do not match' },
      ],
    });
  });
});
