import passport from 'passport';
import nconf from 'nconf';
import common from '../../../common';
import { verifyUsername } from '../user/validation';
import { BadRequest, NotAuthorized, NotFound } from '../errors';
import logger from '../logger';
import {
  generateUsername,
  loginRes,
} from './utils';
import { appleProfile } from './apple';
import { isLogtoEnabled, logtoProfile } from './logto';
import { model as User } from '../../models/user';
import { model as EmailUnsubscription } from '../../models/emailUnsubscription';
import { sendTxn as sendTxnEmail } from '../email';
import { apiError } from '../apiError';
import { trackRegistrationEvent } from '../localAnalytics';

const INVITE_ONLY = nconf.get('INVITE_ONLY') === 'true';

function _passportProfile (network, accessToken) {
  return new Promise((resolve, reject) => {
    passport._strategies[network].userProfile(accessToken, (err, profile) => {
      if (err) {
        reject(err);
      } else {
        resolve(profile);
      }
    });
  });
}

export async function socialEmailToLocal (user) {
  const socialEmail = (user.auth.google && user.auth.google.emails
    && user.auth.google.emails[0].value)
    || (user.auth.facebook && user.auth.facebook.emails && user.auth.facebook.emails[0].value)
    || (user.auth.apple && user.auth.apple.emails && user.auth.apple.emails[0].value)
    || (user.auth.logto && user.auth.logto.emails && user.auth.logto.emails[0]
      && user.auth.logto.emails[0].value);
  if (socialEmail) {
    const conflictingUser = await User.findOne(
      { 'auth.local.email': socialEmail },
      { _id: 1 },
    ).exec();
    if (!conflictingUser) return socialEmail.toLowerCase();
  }
  return undefined;
}

// Defaults for newly registered users of this self-hosted instance: everyone gets the
// subscription features and the first registered user becomes an admin.
export async function newUserDefaults () {
  return {
    'purchased.plan': {
      planId: 'basic',
      customerId: 'habitrpg',
      dateCreated: new Date(),
      dateUpdated: new Date(),
      gemsBought: 0,
    },
    'permissions.fullAccess': !await User.findOne().exec(),
  };
}

export async function loginSocial (req, res) {
  let existingUser = res.locals.user;
  const { network, allowRegister = true } = req.body;

  const isSupportedNetwork = common.constants.SUPPORTED_SOCIAL_NETWORKS
    .find(supportedNetwork => supportedNetwork.key === network);
  if (!isSupportedNetwork) throw new BadRequest(res.t('unsupportedNetwork'));
  if (network === 'logto' && !isLogtoEnabled()) throw new BadRequest(res.t('unsupportedNetwork'));

  let profile = {};
  if (network === 'apple') {
    profile = await appleProfile(req);
  } else if (network === 'logto') {
    profile = logtoProfile(req);
  } else {
    const accessToken = req.body.authResponse.access_token;
    profile = await _passportProfile(network, accessToken);
  }

  if (!profile.id) throw new BadRequest(res.t(network === 'logto' ? 'logtoSignInFailed' : 'invalidData'));

  let user = await User.findOne({
    [`auth.${network}.id`]: profile.id,
  }, { _id: 1, apiToken: 1, auth: 1 }).exec();

  // User already signed up
  if (user) {
    if (existingUser) {
      throw new NotAuthorized(res.t('socialAlreadyExists'));
    }
    if (!user.auth.local.email) {
      user.auth.local.email = await socialEmailToLocal(user);
    }
    // Force the updated timestamp to save, so that we know they logged in
    user.auth.timestamps.updated = new Date();
    await user.save();
    return loginRes(user, req, res);
  }

  let email;
  if (profile.emails && profile.emails[0] && profile.emails[0].value) {
    email = profile.emails[0].value.toLowerCase();
  }

  if (!existingUser && email) {
    // TODO we load the whole user object here. Is that necessary?
    existingUser = await User.findOne({ 'auth.local.email': email }).exec();
    // Habitica does not verify email addresses, so the existing account may have been registered
    // by someone else with the victim's address in advance. Linking it automatically would give
    // them access, so users have to log in and connect Logto in the settings instead.
    if (existingUser && network === 'logto') {
      throw new NotAuthorized(res.t('logtoAccountExists'));
    }
  }

  if (!allowRegister && !existingUser) {
    if (network === 'apple') {
      return res.status(200).send({
        message: res.t('userNotFound'),
        email,
        id_token: profile.idToken,
      });
    }
    if (email) {
      throw new NotFound(`${apiError('socialFlowUserNotFound')} ${email}`);
    }
    throw new NotFound(res.t('userNotFound'));
  }

  // New accounts can only be created via an invitation (handled by the local registration)
  if (!existingUser && INVITE_ONLY) throw new NotAuthorized(res.t('inviteOnly'));

  const username = req.body.username || profile.username || generateUsername();
  let sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '');
  const issues = verifyUsername(sanitizedUsername, res, true);
  if (issues.length > 0) {
    sanitizedUsername = generateUsername();
  } else {
    const conflictingUser = await User.findOne({
      'auth.local.lowerCaseUsername': sanitizedUsername.toLowerCase(),
    }, { _id: 1 });
    if (conflictingUser) {
      sanitizedUsername = generateUsername();
    }
  }

  if (existingUser) {
    existingUser.auth[network] = {
      id: profile.id,
      emails: profile.emails,
    };
    user = existingUser;
  } else {
    user = {
      auth: {
        [network]: {
          id: profile.id,
          emails: profile.emails,
        },
        local: {
          username: sanitizedUsername,
          lowerCaseUsername: sanitizedUsername.toLowerCase(),
          email,
        },
      },
      profile: {
        name: profile.displayName || profile.name || profile.username,
      },
      preferences: {
        language: req.language,
      },
      flags: {
        verifiedUsername: true,
      },
      ...await newUserDefaults(),
    };
    user = new User(user);
    user.registeredThrough = req.headers['x-client']; // Not saved, used to create the correct tasks based on the device used
    trackRegistrationEvent({ user, method: network, ipAddress: req.ip });
  }

  const savedUser = await user.save();

  if (!existingUser) {
    savedUser.newUser = true;
  }

  const response = loginRes(savedUser, req, res);

  // Clean previous email preferences
  if (email) {
    EmailUnsubscription
      .deleteOne({ email })
      .exec()
      .then(() => {
        if (!existingUser) {
          if (savedUser._ABtests && savedUser._ABtests.welcomeEmailSplit) {
            sendTxnEmail(savedUser, savedUser._ABtests.welcomeEmailSplit);
          } else {
            sendTxnEmail(savedUser, 'welcome');
          }
        }
      })
      .catch(err => logger.error(err)); // eslint-disable-line max-nested-callbacks
  }

  return response;
}
