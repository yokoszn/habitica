import nconf from 'nconf';

const IS_PROD = nconf.get('IS_PROD');
// By default only proxies on local and private addresses may set X-Forwarded-For, so that
// clients connecting directly cannot choose their own IP address (used for rate limiting).
const DEFAULT_PROD_TRUST_PROXY = 'loopback, linklocal, uniquelocal';

// Turns the TRUST_PROXY setting into a value for Express' 'trust proxy' setting:
// true / false, a number of hops, or a comma-separated list of addresses and subnets.
export function parseTrustProxy (value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;

  const trimmedValue = value.trim();
  if (trimmedValue === '') return undefined;
  if (trimmedValue === 'true') return true;
  if (trimmedValue === 'false') return false;
  if (/^\d+$/.test(trimmedValue)) return Number(trimmedValue);
  return trimmedValue;
}

const TRUST_PROXY = parseTrustProxy(nconf.get('TRUST_PROXY'));

export default function setupExpress (app) {
  app.set('view engine', 'pug');
  app.set('views', `${__dirname}/../../views`);
  // The production build of Habitica runs behind a proxy
  // See https://expressjs.com/it/guide/behind-proxies.html
  if (TRUST_PROXY !== undefined) {
    app.set('trust proxy', TRUST_PROXY);
  } else if (IS_PROD) {
    app.set('trust proxy', DEFAULT_PROD_TRUST_PROXY);
  }
}
