import nconf from 'nconf';
import {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import {
  TooManyRequests,
} from '../libs/errors';
import logger from '../libs/logger';
import { apiError } from '../libs/apiError';
import SERVER_STATUS from '../libs/serverStatus';
import setupRedis from '../libs/redis';

// Middleware to rate limit requests to the API

// More info on the API rate limits can be found on the wiki at
// https://habitica.fandom.com/wiki/Guidance_for_Comrades#Rules_for_Third-Party_Tools

const IS_TEST = nconf.get('IS_TEST');
const RATE_LIMITER_ENABLED = nconf.get('RATE_LIMITER_ENABLED') === 'true';
const REDIS_HOST = nconf.get('REDIS_HOST');
const REDIS_URL = nconf.get('REDIS_URL');
const REDIS_PASSWORD = nconf.get('REDIS_PASSWORD');
const REDIS_PORT = nconf.get('REDIS_PORT');
const LIVELINESS_PROBE_KEY = nconf.get('LIVELINESS_PROBE_KEY');
const BASE_POINTS = nconf.get('RATE_LIMITER_BASE_POINTS') || 30;
const BASE_DURATION = nconf.get('RATE_LIMITER_BASE_DURATION') || 60;
const REGISTRATION_COST = nconf.get('RATE_LIMITER_REGISTRATION_COST') || 10;
const LOGIN_COST = nconf.get('RATE_LIMITER_LOGIN_COST') || 10;
const IP_RATE_LIMIT_COST = nconf.get('RATE_LIMITER_IP_COST') || 5;

// Unauthenticated authentication routes. On these the x-api-user header is not verified,
// so the limit is applied per IP address only.
const AUTH_PATHS = [
  '/user/auth/local/login',
  '/user/auth/local/register',
  '/user/auth/social',
  '/user/auth/apple',
  '/user/auth/verify-username',
  '/user/auth/check-email',
  '/user/reset-password',
  '/user/auth/reset-password-set-new-one',
];

let redisClient;

// Redis is only needed to share the limits between several server processes,
// without it they are kept in the memory of the process.
if (RATE_LIMITER_ENABLED && !IS_TEST && (REDIS_HOST || REDIS_URL)) {
  redisClient = setupRedis({
    url: REDIS_URL,
    host: REDIS_HOST,
    password: REDIS_PASSWORD,
    port: REDIS_PORT,
  }, {
    enableOfflineQueue: false,
  });

  redisClient.on('ready', () => {
    SERVER_STATUS.RATE_LIMITER = true;
  });

  redisClient.on('reconnecting', () => {
    SERVER_STATUS.RATE_LIMITER = false;
  });

  redisClient.on('error', error => {
    logger.error(error, 'Redis Error');
  });
} else {
  SERVER_STATUS.RATE_LIMITER = true;
}

function setResponseHeaders (res, points, rateLimiterRes) {
  const headers = {
    'X-RateLimit-Limit': points,
    'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
    'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext),
  };

  if (rateLimiterRes.remainingPoints < 1) {
    headers['Retry-After'] = rateLimiterRes.msBeforeNext / 1000;
  }

  res.set(headers);
}

export default function setupRateLimiter (options = {}) {
  const rateLimiterOpts = {
    keyPrefix: options.keyPrefix || 'api',
    points: options.points || BASE_POINTS, // 30 requests
    duration: options.duration || BASE_DURATION, // per 1 minute by User ID or IP
  };
  let rateLimiter;
  if (!RATE_LIMITER_ENABLED) {
    return (req, res, next) => next();
  }
  if (!redisClient) {
    rateLimiter = new RateLimiterMemory({
      ...rateLimiterOpts,
    });
  } else {
    rateLimiter = new RateLimiterRedis({
      ...rateLimiterOpts,
      storeClient: redisClient,
    });
  }
  return function rateLimiterMiddleware (req, res, next) {
    if (!RATE_LIMITER_ENABLED) return next();
    if (LIVELINESS_PROBE_KEY && req.query.liveliness === LIVELINESS_PROBE_KEY) return next();

    // req.path is relative to where the limiter is mounted (e.g. /user/auth/local/login).
    // Routes are matched case-insensitively and with an optional trailing slash.
    const url = (req.path || '').toLowerCase().replace(/\/+$/, '');
    const isAuthPath = AUTH_PATHS.some(authPath => url.endsWith(authPath));
    const userId = isAuthPath ? undefined : req.header('x-api-user');

    let cost = 1;
    if (url.endsWith('/user/auth/local/register')) {
      cost = options.registrationCost || REGISTRATION_COST;
    } else if (url.endsWith('/user/auth/local/login')) {
      cost = options.loginCost || LOGIN_COST;
    } else if (url.endsWith('/user/auth/verify-username')) {
      cost = 1; // Verifying username might happen multiple times during typing
    } else if (!userId) {
      cost = options.ipRateLimitCost || IP_RATE_LIMIT_COST;
    }

    return rateLimiter.consume(userId || req.ip, cost)
      .then(rateLimiterRes => {
        setResponseHeaders(res, rateLimiterOpts.points, rateLimiterRes);
        return next();
      })
      .catch(rateLimiterRes => {
        if (rateLimiterRes instanceof RateLimiterRes) {
          setResponseHeaders(res, rateLimiterOpts.points, rateLimiterRes);
          return next(new TooManyRequests(apiError('clientRateLimited')));
        }

        // In case of an unhandled error we skip the middleware as it could mean
        // , for example, that the connection to the redis database is not working.
        // We do not want to block all requests in these cases.
        logger.error(rateLimiterRes, 'Rate Limiter Error');
        return next();
      });
  };
}
