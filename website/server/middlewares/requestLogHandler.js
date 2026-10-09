import nconf from 'nconf';
import { v4 as uuid } from 'uuid';
import logger, { redactSensitiveData } from '../libs/logger';

const SLOW_REQUEST_THRESHOLD = nconf.get('SLOW_REQUEST_THRESHOLD');

function buildBaseLogData (req) {
  return {
    requestId: req.requestIdentifier,
    method: req.method,
    url: req.originalUrl,

    headers: redactSensitiveData(req.headers),
    body: redactSensitiveData(req.body),
    query: redactSensitiveData(req.query),
  };
}

export const logRequestEnd = (req, res) => {
  const now = Date.now();
  const requestTime = now - req.requestStartTime;
  const data = buildBaseLogData(req);
  data.duration = requestTime;
  data.endTime = now;
  data.statusCode = res.statusCode;
  logger.info('Request completed', data);
};

export const logRequestData = (req, res, next) => {
  req.requestStartTime = Date.now();
  req.requestIdentifier = uuid();
  const data = buildBaseLogData(req);
  data.startTime = req.requestStartTime;
  logger.info('Request started', data);
  req.on('close', () => {
    logRequestEnd(req, res);
  });
  next();
};

export const logSlowRequests = (req, res, next) => {
  req.requestStartTime = Date.now();
  req.once('close', () => {
    const requestTime = Date.now() - req.requestStartTime;
    if (requestTime > SLOW_REQUEST_THRESHOLD) {
      const data = buildBaseLogData(req);
      data.duration = requestTime;
      data.endTime = Date.now();
      data.statusCode = res.statusCode;
      logger.error(Error('Slow request'), data);
    }
  });
  next();
};
