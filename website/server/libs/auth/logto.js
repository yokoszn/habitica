import nconf from 'nconf';

const LOGTO_ENDPOINT = nconf.get('LOGTO_ENDPOINT');
const LOGTO_APP_ID = nconf.get('LOGTO_APP_ID');
const LOGTO_APP_SECRET = nconf.get('LOGTO_APP_SECRET');
const LOGTO_DISPLAY_NAME = nconf.get('LOGTO_DISPLAY_NAME') || 'Logto';
const BASE_URL = (nconf.get('BASE_URL') || '').replace(/\/+$/, '');

export const LOGTO_SIGN_IN_PATH = '/logto/sign-in';
export const LOGTO_CALLBACK_PATH = '/logto/sign-in-callback';
const LOGTO_REDIRECT_PAGE = '/static/logto-redirect';

// Session keys: the Logto SDK's own state (only needed during the sign-in round trip)
// and the verified profile waiting to be exchanged for Habitica credentials.
const STORAGE_SESSION_KEY = 'logto';
const PROFILE_SESSION_KEY = 'logtoProfile';
const PROFILE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

export function isLogtoEnabled () {
  return Boolean(LOGTO_ENDPOINT && LOGTO_APP_ID && LOGTO_APP_SECRET);
}

export function logtoConfig () {
  return {
    enabled: isLogtoEnabled(),
    name: LOGTO_DISPLAY_NAME,
  };
}

let logtoClientClass;

// @logto/node is only published as an ES module, so it has to be loaded with a dynamic import
async function loadLogtoClientClass () {
  if (!logtoClientClass) {
    logtoClientClass = (await import('@logto/node')).default;
  }
  return logtoClientClass;
}

// Persist the SDK state in the (cookie based) session
function sessionStorage (req) {
  return {
    async getItem (key) {
      const data = req.session[STORAGE_SESSION_KEY] || {};
      return data[key] === undefined ? null : data[key];
    },
    async setItem (key, value) {
      req.session[STORAGE_SESSION_KEY] = {
        ...req.session[STORAGE_SESSION_KEY],
        [key]: value,
      };
    },
    async removeItem (key) {
      const data = { ...req.session[STORAGE_SESSION_KEY] };
      delete data[key];
      req.session[STORAGE_SESSION_KEY] = data;
    },
  };
}

async function createLogtoClient (req, res) {
  const LogtoClient = await loadLogtoClientClass();
  return new LogtoClient({
    endpoint: LOGTO_ENDPOINT,
    appId: LOGTO_APP_ID,
    appSecret: LOGTO_APP_SECRET,
    scopes: ['email', 'profile'],
  }, {
    storage: sessionStorage(req),
    navigate: url => res.redirect(url),
  });
}

// Redirects the user to the Logto sign-in page
export async function logtoSignIn (req, res) {
  const client = await createLogtoClient(req, res);
  await client.signIn({ redirectUri: `${BASE_URL}${LOGTO_CALLBACK_PATH}` });
}

// Handles the redirect back from Logto: verifies the response and stores the profile
// in the session, so that the client can exchange it for Habitica credentials
// through the regular social login route.
export async function logtoSignInCallback (req, res) {
  const client = await createLogtoClient(req, res);
  await client.handleSignInCallback(`${BASE_URL}${req.originalUrl}`);
  const claims = await client.getIdTokenClaims();

  req.session[PROFILE_SESSION_KEY] = {
    id: claims.sub,
    // Only trust verified emails, because they are used to match existing accounts
    email: claims.email && claims.email_verified ? claims.email : undefined,
    name: claims.name || undefined,
    username: claims.username || undefined,
    createdAt: Date.now(),
  };
  // The Logto tokens are not needed anymore, keep the session cookie small
  delete req.session[STORAGE_SESSION_KEY];

  res.redirect(LOGTO_REDIRECT_PAGE);
}

export function logtoSignInFailed (res) {
  res.redirect(`${LOGTO_REDIRECT_PAGE}?error=true`);
}

// Returns the profile stored by `logtoSignInCallback`. It can only be used once.
export function logtoProfile (req) {
  const profile = req.session && req.session[PROFILE_SESSION_KEY];
  if (!profile) return {};
  delete req.session[PROFILE_SESSION_KEY];
  if (!(Date.now() - profile.createdAt < PROFILE_MAX_AGE)) return {};

  return {
    id: profile.id,
    emails: profile.email ? [{ value: profile.email }] : [],
    name: profile.name,
    username: profile.username,
  };
}
