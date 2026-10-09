import dns from 'dns';
import net from 'net';
import got from 'got';
import uniqBy from 'lodash/uniqBy';
import { isURL } from 'validator';
import nconf from 'nconf';
import moment from 'moment';
import logger from './logger';
import { // eslint-disable-line import/no-cycle
  model as User,
} from '../models/user';

const IS_PRODUCTION = nconf.get('IS_PROD');

// Addresses that webhooks must not reach unless WEBHOOK_ALLOW_PRIVATE_TARGETS is enabled:
// loopback, private, link-local (incl. cloud metadata), CGNAT, unspecified, multicast, reserved.
// BlockList also matches IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) against the IPv4 rules.
const BLOCKED_ADDRESSES = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 96], // unspecified, loopback and IPv4-compatible addresses
  ['64:ff9b::', 96], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => BLOCKED_ADDRESSES.addSubnet(address, prefix, 'ipv6'));

function privateTargetsAllowed () {
  return [true, 'true'].includes(nconf.get('WEBHOOK_ALLOW_PRIVATE_TARGETS'));
}

export function isBlockedAddress (address) {
  const family = net.isIP(address);
  if (family === 0) return true;
  return BLOCKED_ADDRESSES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

function forbiddenTargetError (target) {
  const err = new Error(`Webhook target ${target} is a private or reserved address.`);
  err.code = 'EWEBHOOKTARGET';
  return err;
}

// DNS lookup for got/net that refuses private addresses. The connection is made to the
// address checked here, so a DNS answer that changes between check and connect cannot
// bypass it. Node does not call it for IP literals, see assertAllowedTarget.
export function lookupPublicAddress (hostname, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof options === 'function') {
    cb = options;
    opts = {};
  } else if (typeof options === 'number') {
    opts = { family: options };
  }

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);

    const blocked = addresses.find(({ address }) => isBlockedAddress(address));
    if (blocked) return cb(forbiddenTargetError(`${hostname} (${blocked.address})`));

    if (opts.all) return cb(null, addresses);
    return cb(null, addresses[0].address, addresses[0].family);
  });
}

function assertAllowedTarget (url, allowPrivate) {
  const { protocol, hostname } = new URL(url);

  if (!['http:', 'https:'].includes(protocol)) {
    throw new Error(`Webhook URL protocol ${protocol} is not supported.`);
  }

  // got sends requests for the host "unix" to a local UNIX domain socket
  if (hostname === 'unix') throw forbiddenTargetError(hostname);

  const address = hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && net.isIP(address) && isBlockedAddress(address)) {
    throw forbiddenTargetError(address);
  }
}

function postWebhook (url, body) {
  const allowPrivate = privateTargetsAllowed();
  assertAllowedTarget(url, allowPrivate);

  return got.post(url, {
    json: body,
    timeout: 10000, // wait up to 10s before timing out
    retry: 0, // do not retry (got skips retries for POST by default anyway)
    // A redirect could point to an internal address
    followRedirect: false,
    ...(allowPrivate ? {} : { lookup: lookupPublicAddress }),
  // Not calling .json() to parse the response because we simply ignore it
  }).then(response => {
    // got treats 3xx as success when redirects are not followed, but nothing was delivered
    if (response && response.statusCode >= 300 && response.statusCode < 400) {
      throw new Error(`Webhook target responded with a redirect (${response.statusCode}).`);
    }
    return response;
  });
}

function sendWebhook (webhook, body, user) {
  const { url, lastFailureAt } = webhook;

  // The executor runs synchronously, and a refused target is counted as a failure
  new Promise(resolve => {
    resolve(postWebhook(url, body));
  }).catch(webhookErr => {
    // Log the error
    logger.error(webhookErr, {
      extraMessage: 'Error while sending a webhook request.',
      userId: user._id,
      webhookId: webhook.id,
    });

    let _failuresReset = false;

    // Reset failures if the last one happened more than 1 month ago
    const oneMonthAgo = moment().subtract(1, 'months');
    if (!lastFailureAt || moment(lastFailureAt).isBefore(oneMonthAgo)) {
      webhook.failures = 0;
      _failuresReset = true;
    }

    // Increase the number of failures
    webhook.failures += 1;
    webhook.lastFailureAt = new Date();

    // Disable a webhook with too many failures
    if (webhook.failures >= 10) {
      webhook.enabled = false;
      webhook.failures = 0;
      webhook.lastFailureAt = undefined;
      _failuresReset = true;
    }

    const update = {
      $set: {
        'webhooks.$.lastFailureAt': webhook.lastFailureAt,
        'webhooks.$.enabled': webhook.enabled,
      },
    };

    if (_failuresReset) {
      update.$set['webhooks.$.failures'] = webhook.failures;
    } else {
      update.$inc = {
        'webhooks.$.failures': 1,
      };
    }

    return User.updateOne({
      _id: user._id,
      'webhooks.id': webhook.id,
    }, update).exec();
  }).catch(err => logger.error(err)); // log errors that might have happened in the previous catch
}

function isValidWebhook (hook) {
  return hook.enabled && isURL(hook.url, {
    require_tld: !!IS_PRODUCTION, // eslint-disable-line camelcase
  });
}

export class WebhookSender {
  constructor (options = {}) {
    this.type = options.type;
    this.transformData = options.transformData || WebhookSender.defaultTransformData;
    this.webhookFilter = options.webhookFilter || WebhookSender.defaultWebhookFilter;
  }

  static defaultTransformData (data) {
    return data;
  }

  static defaultWebhookFilter () {
    return true;
  }

  attachDefaultData (user, body) {
    body.webhookType = this.type;
    body.user = body.user || {};
    body.user._id = user._id;
  }

  send (user, data) {
    const { webhooks } = user;

    const matchingHooks = webhooks.filter(hook => {
      if (!isValidWebhook(hook)) return false;
      if (hook.type === 'globalActivity') return true;

      return this.type === hook.type && this.webhookFilter(hook, data);
    });

    // The body is the same for every hook, so send it only once per URL.
    // Otherwise registering one URL many times multiplies the outgoing requests.
    const hooks = uniqBy(matchingHooks, 'url');

    if (hooks.length < 1) {
      return; // prevents running the body creation code if there are no webhooks to send
    }

    const body = this.transformData(data);
    this.attachDefaultData(user, body);

    hooks.forEach(hook => {
      sendWebhook(hook, body, user);
    });
  }
}

export const taskScoredWebhook = new WebhookSender({
  type: 'taskActivity',
  webhookFilter (hook) {
    const scored = hook.options && hook.options.scored;

    return scored;
  },
  transformData (data) {
    const {
      user, task, direction, delta,
    } = data;

    const extendedStats = User.addComputedStatsToJSONObj(user.stats.toJSON(), user);

    const userData = {
      // _id: user._id, added automatically when the webhook is sent
      _tmp: user._tmp,
      stats: extendedStats,
    };

    const dataToSend = {
      type: 'scored',
      direction,
      delta,
      task,
      user: userData,
    };

    return dataToSend;
  },
});

export const taskActivityWebhook = new WebhookSender({
  type: 'taskActivity',
  webhookFilter (hook, data) {
    const { type } = data;
    return hook.options[type];
  },
});

export const userActivityWebhook = new WebhookSender({
  type: 'userActivity',
  webhookFilter (hook, data) {
    const { type } = data;
    return hook.options[type];
  },
});

export const questActivityWebhook = new WebhookSender({
  type: 'questActivity',
  webhookFilter (hook, data) {
    const { type } = data;
    return hook.options[type];
  },
  transformData (data) {
    const { group, quest, type } = data;

    const dataToSend = {
      type,
      group: {
        id: group.id,
        name: group.name,
      },
      quest: {
        key: quest.key,
        questOwner: group.quest.leader,
      },
    };

    return dataToSend;
  },
});

export const groupChatReceivedWebhook = new WebhookSender({
  type: 'groupChatReceived',
  webhookFilter (hook, data) {
    return hook.options.groupId === data.group.id;
  },
  transformData (data) {
    const { group, chat } = data;

    const dataToSend = {
      group: {
        id: group.id,
        name: group.name,
      },
      chat,
    };

    return dataToSend;
  },
});
