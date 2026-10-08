import { validatePasswordResetCodeAndFindUser } from '../../libs/password';
import { NotFound } from '../../libs/errors';
import logger from '../../libs/logger';
import {
  isLogtoEnabled,
  logtoSignIn,
  logtoSignInCallback,
  logtoSignInFailed,
  LOGTO_SIGN_IN_PATH,
  LOGTO_CALLBACK_PATH,
} from '../../libs/auth/logto';

const api = {};

// Internal authentication routes

// Set a new password after having requested a password reset (GET route to input password)
api.resetPasswordSetNewOne = {
  method: 'GET',
  url: '/static/user/auth/local/reset-password-set-new-one',
  runCron: false,
  async handler (req, res) {
    const { code } = req.query;
    const user = await validatePasswordResetCodeAndFindUser(code);
    const isValidCode = Boolean(user);

    const hasError = !isValidCode;
    const message = !isValidCode ? res.t('invalidPasswordResetCode') : null;

    return res.redirect(`/reset-password?hasError=${hasError}&message=${message}&code=${code}`);
  },
};

// Redirect the user to Logto for signing in (or connecting Logto to the current account)
api.logtoSignIn = {
  method: 'GET',
  url: LOGTO_SIGN_IN_PATH,
  runCron: false,
  async handler (req, res) {
    if (!isLogtoEnabled()) throw new NotFound();
    await logtoSignIn(req, res);
  },
};

// Called by Logto after the user signed in
api.logtoSignInCallback = {
  method: 'GET',
  url: LOGTO_CALLBACK_PATH,
  runCron: false,
  async handler (req, res) {
    if (!isLogtoEnabled()) throw new NotFound();
    try {
      await logtoSignInCallback(req, res);
    } catch (err) {
      logger.error(err, 'Logto sign-in callback failed');
      logtoSignInFailed(res);
    }
  },
};

// Logout the user from the website.
api.logout = {
  method: 'GET',
  url: '/logout-server',
  async handler (req, res) {
    if (req.logout) req.logout(); // passportjs method
    req.session = null;

    const redirectUrl = req.query.redirectToLogin === 'true' ? '/login' : '/';
    res.redirect(redirectUrl);
  },
};

export default api;
