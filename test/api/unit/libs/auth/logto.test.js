import {
  logtoProfile,
} from '../../../../../website/server/libs/auth/logto';

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
