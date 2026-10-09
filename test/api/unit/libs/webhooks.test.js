import dns from 'dns';
import http from 'http';
import got from 'got';
import moment from 'moment';
import nconf from 'nconf';
import {
  WebhookSender,
  taskScoredWebhook,
  groupChatReceivedWebhook,
  taskActivityWebhook,
  questActivityWebhook,
  userActivityWebhook,
  isBlockedAddress,
  lookupPublicAddress,
} from '../../../../website/server/libs/webhook';
import {
  model as User,
} from '../../../../website/server/models/user';
import {
  generateUser,
  defer,
  sleep,
} from '../../../helpers/api-unit.helper';
import logger from '../../../../website/server/libs/logger';

describe('webhooks', () => {
  let webhooks; let
    user;

  beforeEach(() => {
    sandbox.stub(got, 'post').returns(defer().promise);

    webhooks = [{
      id: 'taskActivity',
      url: 'http://task-scored.com',
      enabled: true,
      type: 'taskActivity',
      options: {
        created: true,
        updated: true,
        deleted: true,
        scored: true,
        checklistScored: true,
      },
    }, {
      id: 'questActivity',
      url: 'http://quest-activity.com',
      enabled: true,
      type: 'questActivity',
      options: {
        questStarted: true,
        questFinised: true,
        questInvited: true,
      },
    }, {
      id: 'userActivity',
      url: 'http://user-activity.com',
      enabled: true,
      type: 'userActivity',
      options: {
        petHatched: true,
        mountRaised: true,
        leveledUp: true,
      },
    }, {
      id: 'groupChatReceived',
      url: 'http://group-chat-received.com',
      enabled: true,
      type: 'groupChatReceived',
      options: {
        groupId: 'group-id',
      },
    }];

    user = generateUser();
    user.webhooks = webhooks;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('WebhookSender', () => {
    it('creates a new WebhookSender object', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      expect(sendWebhook.type).to.equal('custom');
      expect(sendWebhook).to.respondTo('send');
    });

    it('provides default function for data transformation', () => {
      sandbox.spy(WebhookSender, 'defaultTransformData');
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(WebhookSender.defaultTransformData).to.be.calledOnce;
      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });
    });

    it('adds default data (user and webhookType) to the body', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });
      sandbox.spy(sendWebhook, 'attachDefaultData');

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(sendWebhook.attachDefaultData).to.be.calledOnce;
      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });

      expect(body).to.eql({
        foo: 'bar',
        user: { _id: user._id },
        webhookType: 'custom',
      });
    });

    it('can pass in a data transformation function', () => {
      sandbox.spy(WebhookSender, 'defaultTransformData');
      const sendWebhook = new WebhookSender({
        type: 'custom',
        transformData (data) {
          const dataToSend = { baz: 'biz', ...data };

          return dataToSend;
        },
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(WebhookSender.defaultTransformData).to.not.be.called;
      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: {
          foo: 'bar',
          baz: 'biz',
        },
      });
    });

    it('provides a default filter function', () => {
      sandbox.spy(WebhookSender, 'defaultWebhookFilter');
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(WebhookSender.defaultWebhookFilter).to.be.calledOnce;
    });

    it('can pass in a webhook filter function', () => {
      sandbox.spy(WebhookSender, 'defaultWebhookFilter');
      const sendWebhook = new WebhookSender({
        type: 'custom',
        webhookFilter (hook) {
          return hook.url !== 'http://custom-url.com';
        },
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(WebhookSender.defaultWebhookFilter).to.not.be.called;
      expect(got.post).to.not.be.called;
    });

    it('can pass in a webhook filter function that filters on data', () => {
      sandbox.spy(WebhookSender, 'defaultWebhookFilter');
      const sendWebhook = new WebhookSender({
        type: 'custom',
        webhookFilter (hook, data) {
          return hook.options.foo === data.foo;
        },
      });

      const body = { foo: 'bar' };

      user.webhooks = [
        {
          id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom', options: { foo: 'bar' },
        },
        {
          id: 'other-custom-webhook', url: 'http://other-custom-url.com', enabled: true, type: 'custom', options: { foo: 'foo' },
        },
      ];
      sendWebhook.send(user, body);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com');
    });

    it('ignores disabled webhooks', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: false, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(got.post).to.not.be.called;
    });

    it('ignores webhooks with invalid urls', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [{
        id: 'custom-webhook', url: 'httxp://custom-url!!!', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, body);

      expect(got.post).to.not.be.called;
    });

    it('ignores webhooks of other types', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [
        {
          id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
        },
        {
          id: 'other-webhook', url: 'http://other-url.com', enabled: true, type: 'other',
        },
      ];
      sendWebhook.send(user, body);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });
    });

    it('sends every type of activity to global webhooks', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [
        {
          id: 'global-webhook', url: 'http://custom-url.com', enabled: true, type: 'globalActivity',
        },
      ];
      sendWebhook.send(user, body);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });
    });

    it('sends multiple webhooks of the same type', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [
        {
          id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
        },
        {
          id: 'other-custom-webhook', url: 'http://other-url.com', enabled: true, type: 'custom',
        },
      ];
      sendWebhook.send(user, body);

      expect(got.post).to.be.calledTwice;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });
      expect(got.post).to.be.calledWithMatch('http://other-url.com', {
        json: body,
      });
    });

    it('sends a webhook only once per url', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      const body = { foo: 'bar' };

      user.webhooks = [
        {
          id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
        },
        {
          id: 'global-webhook', url: 'http://custom-url.com', enabled: true, type: 'globalActivity',
        },
        {
          id: 'global-webhook-2', url: 'http://custom-url.com', enabled: true, type: 'globalActivity',
        },
        {
          id: 'other-custom-webhook', url: 'http://other-url.com', enabled: true, type: 'custom',
        },
      ];
      sendWebhook.send(user, body);

      expect(got.post).to.be.calledTwice;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        json: body,
      });
      expect(got.post).to.be.calledWithMatch('http://other-url.com', {
        json: body,
      });
    });

    it('sends a webhook with a short timeout and no retries', () => {
      const sendWebhook = new WebhookSender({
        type: 'custom',
      });

      user.webhooks = [{
        id: 'custom-webhook', url: 'http://custom-url.com', enabled: true, type: 'custom',
      }];
      sendWebhook.send(user, { foo: 'bar' });

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
        timeout: 10000,
        retry: 0,
      });
    });

    describe('failures', () => {
      let sendWebhook;

      beforeEach(async () => {
        sandbox.restore();
        sandbox.stub(got, 'post').returns(Promise.reject());

        sendWebhook = new WebhookSender({ type: 'taskActivity' });
        user.webhooks = [{
          url: 'http://custom-url.com', enabled: true, type: 'taskActivity',
        }];
        await user.save();

        expect(user.webhooks[0].failures).to.equal(0);
        expect(user.webhooks[0].lastFailureAt).to.equal(undefined);
      });

      it('does not increase failures counter if request is successfull', async () => {
        sandbox.restore();
        sandbox.stub(got, 'post').returns(Promise.resolve());

        const body = {};
        sendWebhook.send(user, body);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
          json: body,
        });

        await sleep(0.1);
        user = await User.findById(user._id).exec();

        expect(user.webhooks[0].failures).to.equal(0);
        expect(user.webhooks[0].lastFailureAt).to.equal(undefined);
      });

      it('records failures', async () => {
        sinon.stub(logger, 'error');
        const body = {};
        sendWebhook.send(user, body);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch('http://custom-url.com', {
          json: body,
        });

        await sleep(0.1);
        user = await User.findById(user._id).exec();

        expect(user.webhooks[0].failures).to.equal(1);
        expect((Date.now() - user.webhooks[0].lastFailureAt.getTime()) < 10000).to.be.true;

        expect(logger.error).to.be.calledOnce;
        logger.error.restore();
      });

      it('disables a webhook after 10 failures', async () => {
        const times = 10;
        for (let i = 0; i < times; i += 1) {
          sendWebhook.send(user, {});
          await sleep(0.1); // eslint-disable-line no-await-in-loop
          user = await User.findById(user._id).exec(); // eslint-disable-line no-await-in-loop
        }

        expect(got.post).to.be.callCount(10);
        expect(got.post).to.be.calledWithMatch('http://custom-url.com');

        await sleep(0.1);
        user = await User.findById(user._id).exec();

        expect(user.webhooks[0].enabled).to.equal(false);
        expect(user.webhooks[0].failures).to.equal(0);
      });

      it('resets failures after a month ', async () => {
        const oneMonthAgo = moment().subtract(1, 'months').subtract(1, 'days').toDate();
        user.webhooks[0].lastFailureAt = oneMonthAgo;
        user.webhooks[0].failures = 9;

        await user.save();

        sendWebhook.send(user, []);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch('http://custom-url.com');

        await sleep(0.1);
        user = await User.findById(user._id).exec();

        expect(user.webhooks[0].failures).to.equal(1);
        // Check that the stored date is whitin 10s from now
        expect((Date.now() - user.webhooks[0].lastFailureAt.getTime()) < 10000).to.be.true;
      });
    });

    describe('target addresses', () => {
      const SETTING = 'WEBHOOK_ALLOW_PRIVATE_TARGETS';
      let originalSetting;
      let sendWebhook;

      const blockedUrls = [
        'http://127.0.0.1/',
        'http://127.0.0.1:27017/',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/',
        'http://172.16.5.4/',
        'http://192.168.1.1/admin',
        'http://100.64.0.1/',
        'http://0.0.0.0/',
        'http://224.0.0.1/',
        'http://0x7f000001/',
        'http://[::1]:3000/',
        'http://[fc00::1]/',
        'http://[fd12:3456::1]/',
        'http://[fe80::1]/',
        'http://[ff02::1]/',
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:10.0.0.1]/',
      ];

      function sendTo (url) {
        user.webhooks = [{
          id: 'custom-webhook', url, enabled: true, type: 'custom',
        }];
        sendWebhook.send(user, { foo: 'bar' });
      }

      // Resolves once the failure handler logged the error
      function stubLoggerError () {
        const logged = defer();
        sandbox.stub(logger, 'error').callsFake(err => logged.resolve(err));
        return logged.promise;
      }

      before(() => {
        originalSetting = nconf.get(SETTING);
      });

      beforeEach(() => {
        nconf.set(SETTING, 'false');
        sendWebhook = new WebhookSender({ type: 'custom' });
      });

      after(() => {
        nconf.set(SETTING, originalSetting);
      });

      blockedUrls.forEach(url => {
        it(`refuses to send to ${url}`, async () => {
          const logged = stubLoggerError();

          sendTo(url);

          expect(got.post).to.not.be.called;
          expect((await logged).code).to.equal('EWEBHOOKTARGET');
        });
      });

      it('refuses to send to a UNIX socket', async () => {
        const logged = stubLoggerError();

        sendTo('http://unix:/var/run/docker.sock:/info');

        expect(got.post).to.not.be.called;
        expect((await logged).code).to.equal('EWEBHOOKTARGET');
      });

      it('counts a refused target as a failure', async () => {
        sandbox.stub(logger, 'error');
        user.webhooks = [{
          url: 'http://169.254.169.254/', enabled: true, type: 'taskActivity',
        }];
        await user.save();

        new WebhookSender({ type: 'taskActivity' }).send(user, {});

        await sleep(0.1);
        user = await User.findById(user._id).exec();

        expect(got.post).to.not.be.called;
        expect(user.webhooks[0].failures).to.equal(1);
      });

      it('does not follow redirects and counts them as failures', async () => {
        got.post.returns(Promise.resolve({ statusCode: 302 }));
        const logged = stubLoggerError();

        sendTo('http://custom-url.com/');

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch('http://custom-url.com/', {
          followRedirect: false,
        });
        expect((await logged).message).to.contain('302');
      });

      ['http://custom-url.com/', 'http://93.184.216.34/', 'http://[2606:4700:4700::1111]/'].forEach(url => {
        it(`sends to the public target ${url} with the guarded DNS lookup`, () => {
          sendTo(url);

          expect(got.post).to.be.calledOnce;
          expect(got.post).to.be.calledWithMatch(url, {
            json: { foo: 'bar' },
            followRedirect: false,
            lookup: lookupPublicAddress,
          });
        });
      });

      ['yes', '1', 'TRUE', undefined].forEach(value => {
        it(`does not allow private targets when ${SETTING} is ${value}`, async () => {
          nconf.set(SETTING, value);
          const logged = stubLoggerError();

          sendTo('http://192.168.1.1/');

          expect(got.post).to.not.be.called;
          expect((await logged).code).to.equal('EWEBHOOKTARGET');
        });
      });

      [true, 'true'].forEach(value => {
        it(`sends to private targets when ${SETTING} is ${JSON.stringify(value)}`, () => {
          nconf.set(SETTING, value);

          sendTo('http://192.168.1.1/');
          sendTo('http://[::1]:3000/');

          expect(got.post).to.be.calledTwice;
          expect(got.post).to.be.calledWithMatch('http://192.168.1.1/', { followRedirect: false });
          expect(got.post).to.be.calledWithMatch('http://[::1]:3000/', { followRedirect: false });
          expect(got.post.firstCall.args[1]).to.not.have.property('lookup');
        });
      });

      it('refuses to send to a UNIX socket even when private targets are allowed', async () => {
        nconf.set(SETTING, 'true');
        const logged = stubLoggerError();

        sendTo('http://unix:/var/run/docker.sock:/info');

        expect(got.post).to.not.be.called;
        expect((await logged).code).to.equal('EWEBHOOKTARGET');
      });

      it('does not connect to a host name that resolves to a private address', async () => {
        const requests = [];
        const server = http.createServer((req, res) => {
          requests.push(req.url);
          res.end('ok');
        });
        await new Promise(resolve => {
          server.listen(0, '127.0.0.1', resolve);
        });

        try {
          got.post.restore(); // use the real HTTP client, only the DNS answer is stubbed
          sandbox.stub(dns, 'lookup').callThrough()
            .withArgs('webhook-rebind.example.com')
            .yields(null, [{ address: '127.0.0.1', family: 4 }]);
          const logged = stubLoggerError();

          sendTo(`http://webhook-rebind.example.com:${server.address().port}/`);

          expect((await logged).code).to.equal('EWEBHOOKTARGET');
          expect(dns.lookup).to.be.calledWith('webhook-rebind.example.com');
          expect(requests).to.eql([]);
        } finally {
          server.close();
        }
      });
    });
  });

  describe('isBlockedAddress', () => {
    it('blocks private, loopback, link-local and reserved addresses', () => {
      [
        '127.0.0.1', '10.1.2.3', '172.31.255.255', '192.168.0.1', '169.254.169.254',
        '100.64.0.1', '0.0.0.0', '224.0.0.251', '255.255.255.255', '::', '::1', 'fc00::1',
        'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:192.168.0.1',
        'not-an-ip',
      ].forEach(address => {
        expect(isBlockedAddress(address), address).to.equal(true);
      });
    });

    it('allows public addresses', () => {
      [
        '93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111',
        '::ffff:8.8.8.8',
      ].forEach(address => {
        expect(isBlockedAddress(address), address).to.equal(false);
      });
    });
  });

  describe('lookupPublicAddress', () => {
    const publicAddresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ];

    function lookup (...args) {
      return new Promise(resolve => {
        lookupPublicAddress('example.com', ...args, (...result) => resolve(result));
      });
    }

    it('returns all addresses when called with all: true', async () => {
      sandbox.stub(dns, 'lookup').yields(null, publicAddresses);

      const [err, addresses] = await lookup({ all: true, hints: 0 });

      expect(err).to.equal(null);
      expect(addresses).to.eql(publicAddresses);
      expect(dns.lookup).to.be.calledWithMatch('example.com', { all: true, hints: 0 });
    });

    it('returns the first address when called without all', async () => {
      sandbox.stub(dns, 'lookup').yields(null, publicAddresses);

      const [err, address, family] = await lookup({ family: 4 });

      expect(err).to.equal(null);
      expect(address).to.equal('93.184.216.34');
      expect(family).to.equal(4);
      expect(dns.lookup).to.be.calledWithMatch('example.com', { family: 4, all: true });
    });

    it('supports the family number and callback-only forms', async () => {
      sandbox.stub(dns, 'lookup').yields(null, publicAddresses);

      const [, address] = await lookup(6);
      expect(dns.lookup).to.be.calledWithMatch('example.com', { family: 6, all: true });
      expect(address).to.equal('93.184.216.34');

      const [err, addressNoOptions] = await lookup();
      expect(err).to.equal(null);
      expect(addressNoOptions).to.equal('93.184.216.34');
    });

    it('fails if any resolved address is private', async () => {
      sandbox.stub(dns, 'lookup').yields(null, [
        publicAddresses[0],
        { address: '10.0.0.5', family: 4 },
      ]);

      const [err, addresses] = await lookup({ all: true });

      expect(err.code).to.equal('EWEBHOOKTARGET');
      expect(err.message).to.contain('10.0.0.5');
      expect(addresses).to.equal(undefined);
    });

    it('passes DNS errors through', async () => {
      const dnsError = new Error('not found');
      sandbox.stub(dns, 'lookup').yields(dnsError);

      const [err] = await lookup({ all: true });

      expect(err).to.equal(dnsError);
    });
  });

  describe('taskScoredWebhook', () => {
    let data;

    beforeEach(() => {
      data = {
        user: {
          _tmp: { foo: 'bar' },
          stats: {
            lvl: 5,
            int: 10,
            str: 5,
            exp: 423,
            toJSON () {
              return this;
            },
          },
        },
        task: {
          text: 'text',
        },
        direction: 'up',
        delta: 176,
      };

      const mockStats = {
        maxHealth: 50,
        maxMP: 103,
        toNextLevel: 40,
        ...data.user.stats,
      };
      delete mockStats.toJSON;

      sandbox.stub(User, 'addComputedStatsToJSONObj').returns(mockStats);
    });

    it('sends task and stats data', () => {
      taskScoredWebhook.send(user, data);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch(webhooks[0].url, {
        json: {
          type: 'scored',
          webhookType: 'taskActivity',
          user: {
            _id: user._id,
            _tmp: { foo: 'bar' },
            stats: {
              lvl: 5,
              int: 10,
              str: 5,
              exp: 423,
              toNextLevel: 40,
              maxHealth: 50,
              maxMP: 103,
            },
          },
          task: {
            text: 'text',
          },
          direction: 'up',
          delta: 176,
        },
      });
    });

    it('sends task and stats data to globalActivity webhookd', () => {
      user.webhooks = [{
        id: 'globalActivity',
        url: 'http://global-activity.com',
        enabled: true,
        type: 'globalActivity',
      }];

      taskScoredWebhook.send(user, data);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch('http://global-activity.com', {
        json: {
          type: 'scored',
          webhookType: 'taskActivity',
          user: {
            _id: user._id,
            _tmp: { foo: 'bar' },
            stats: {
              lvl: 5,
              int: 10,
              str: 5,
              exp: 423,
              toNextLevel: 40,
              maxHealth: 50,
              maxMP: 103,
            },
          },
          task: {
            text: 'text',
          },
          direction: 'up',
          delta: 176,
        },
      });
    });

    it('does not send task scored data if scored option is not true', () => {
      webhooks[0].options.scored = false;

      taskScoredWebhook.send(user, data);

      expect(got.post).to.not.be.called;
    });
  });

  describe('taskActivityWebhook', () => {
    let data;

    beforeEach(() => {
      data = {
        task: {
          text: 'text',
        },
      };
    });

    ['created', 'updated', 'deleted'].forEach(type => {
      it(`sends ${type} tasks`, () => {
        data.type = type;

        taskActivityWebhook.send(user, data);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch(webhooks[0].url, {
          json: {
            type,
            webhookType: 'taskActivity',
            user: {
              _id: user._id,
            },
            task: data.task,
          },
        });
      });

      it(`does not send task ${type} data if ${type} option is not true`, () => {
        data.type = type;
        webhooks[0].options[type] = false;

        taskActivityWebhook.send(user, data);

        expect(got.post).to.not.be.called;
      });
    });

    describe('checklistScored', () => {
      beforeEach(() => {
        data = {
          task: {
            text: 'text',
          },
          item: {
            text: 'item-text',
          },
        };
      });

      it('sends \'checklistScored\' tasks', () => {
        data.type = 'checklistScored';

        taskActivityWebhook.send(user, data);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch(webhooks[0].url, {
          json: {
            webhookType: 'taskActivity',
            user: {
              _id: user._id,
            },
            type: data.type,
            task: data.task,
            item: data.item,
          },
        });
      });

      it('does not send task \'checklistScored\' data if \'checklistScored\' option is not true', () => {
        data.type = 'checklistScored';
        webhooks[0].options.checklistScored = false;

        taskActivityWebhook.send(user, data);

        expect(got.post).to.not.be.called;
      });
    });
  });

  describe('userActivityWebhook', () => {
    let data;

    beforeEach(() => {
      data = {
        something: true,
      };
    });

    ['petHatched', 'mountRaised', 'leveledUp'].forEach(type => {
      it(`sends ${type} webhooks`, () => {
        data.type = type;

        userActivityWebhook.send(user, data);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch(webhooks[2].url, {
          json: {
            type,
            webhookType: 'userActivity',
            user: {
              _id: user._id,
            },
            something: true,
          },
        });
      });

      it(`does not send webhook ${type} data if ${type} option is not true`, () => {
        data.type = type;
        webhooks[2].options[type] = false;

        userActivityWebhook.send(user, data);

        expect(got.post).to.not.be.called;
      });
    });
  });

  describe('questActivityWebhook', () => {
    let data;

    beforeEach(() => {
      data = {
        group: {
          id: 'group-id',
          name: 'some group',
          otherData: 'foo',
          quest: {},
        },
        quest: {
          key: 'some-key',
          questOwner: 'user-id',
        },
      };
    });

    ['questStarted', 'questFinised', 'questInvited'].forEach(type => {
      it(`sends ${type} webhooks`, () => {
        data.type = type;

        questActivityWebhook.send(user, data);

        expect(got.post).to.be.calledOnce;
        expect(got.post).to.be.calledWithMatch(webhooks[1].url, {
          json: {
            type,
            webhookType: 'questActivity',
            user: {
              _id: user._id,
            },
            group: {
              id: 'group-id',
              name: 'some group',
            },
            quest: {
              key: 'some-key',
            },
          },
        });
      });

      it(`does not send webhook ${type} data if ${type} option is not true`, () => {
        data.type = type;
        webhooks[1].options[type] = false;

        userActivityWebhook.send(user, data);

        expect(got.post).to.not.be.called;
      });
    });
  });

  describe('groupChatReceivedWebhook', () => {
    it('sends chat data', () => {
      const data = {
        group: {
          id: 'group-id',
          name: 'some group',
          otherData: 'foo',
        },
        chat: {
          id: 'some-id',
          text: 'message',
        },
      };

      groupChatReceivedWebhook.send(user, data);

      expect(got.post).to.be.calledOnce;
      expect(got.post).to.be.calledWithMatch(webhooks[webhooks.length - 1].url, {
        json: {
          webhookType: 'groupChatReceived',
          user: {
            _id: user._id,
          },
          group: {
            id: 'group-id',
            name: 'some group',
          },
          chat: {
            id: 'some-id',
            text: 'message',
          },
        },
      });
    });

    it('does not send chat data for group if not selected', () => {
      const data = {
        group: {
          id: 'not-group-id',
          name: 'some group',
          otherData: 'foo',
        },
        chat: {
          id: 'some-id',
          text: 'message',
        },
      };

      groupChatReceivedWebhook.send(user, data);

      expect(got.post).to.not.be.called;
    });
  });
});
