import { v4 as generateUUID } from 'uuid';
import * as logtoLib from '../../../../../website/server/libs/auth/logto';
import { loginSocial } from '../../../../../website/server/libs/auth/social';
import { model as User } from '../../../../../website/server/models/user';
import {
  generateReq,
  generateRes,
  generateUser,
} from '../../../../helpers/api-unit.helper';

const { logtoProfile } = logtoLib;

describe('Logto auth', () => {
  describe('logtoProfile', () => {
    let req;

    beforeEach(() => {
      req = {
        session: {
          logtoProfile: {
            id: 'logto-id',
            email: 'user@example.com',
            name: 'Logto User',
            username: 'logtouser',
            createdAt: Date.now(),
          },
        },
      };
    });

    it('returns the profile stored after the sign-in callback', () => {
      expect(logtoProfile(req)).to.eql({
        id: 'logto-id',
        emails: [{ value: 'user@example.com' }],
        name: 'Logto User',
        username: 'logtouser',
      });
    });

    it('can only be used once', () => {
      logtoProfile(req);

      expect(req.session.logtoProfile).to.not.exist;
      expect(logtoProfile(req)).to.eql({});
    });

    it('returns no emails if there is no (verified) email', () => {
      req.session.logtoProfile.email = undefined;

      expect(logtoProfile(req).emails).to.eql([]);
    });

    it('ignores expired profiles', () => {
      req.session.logtoProfile.createdAt = Date.now() - 11 * 60 * 1000;

      expect(logtoProfile(req)).to.eql({});
      expect(req.session.logtoProfile).to.not.exist;
    });

    it('returns an empty profile without a session', () => {
      expect(logtoProfile({})).to.eql({});
    });
  });
});

describe('loginSocial with Logto', () => {
  let req;
  let res;

  beforeEach(() => {
    sandbox.stub(logtoLib, 'isLogtoEnabled').returns(true);
    req = generateReq({
      body: { network: 'logto' },
      url: '/api/v4/user/auth/social',
      language: 'en',
      session: {
        logtoProfile: {
          id: `logto-${generateUUID()}`,
          email: 'logto-user@example.com',
          username: 'logtouser',
          createdAt: Date.now(),
        },
      },
    });
    res = generateRes({ respond: sandbox.stub() });
    res.locals.user = undefined;
  });

  it('registers a new user', async () => {
    await loginSocial(req, res);

    expect(res.respond).to.have.been.calledOnce;
    const [status, data] = res.respond.firstCall.args;
    expect(status).to.equal(200);
    expect(data.newUser).to.equal(true);
    const user = await User.findById(data.id).exec();
    expect(user.auth.logto.id).to.match(/^logto-/);
    expect(user.auth.local.email).to.equal('logto-user@example.com');
  });

  it('does not link to an existing account with the same email address', async () => {
    const existing = generateUser({ 'auth.local.email': 'logto-user@example.com' });
    await existing.save();

    await expect(loginSocial(req, res)).to.eventually.be.rejected.and.have.property('name', 'NotAuthorized');

    const reloaded = await User.findById(existing._id).exec();
    expect(reloaded.auth.logto.id).to.not.exist;
    expect(res.respond).to.not.have.been.called;
  });

  it('connects Logto to the logged in user', async () => {
    const existing = generateUser({ 'auth.local.email': 'logto-user@example.com' });
    await existing.save();
    res.locals.user = existing;
    const logtoId = req.session.logtoProfile.id;

    await loginSocial(req, res);

    const reloaded = await User.findById(existing._id).exec();
    expect(reloaded.auth.logto.id).to.equal(logtoId);
  });
});
