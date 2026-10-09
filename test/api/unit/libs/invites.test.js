import find from 'lodash/find';
import * as emailLib from '../../../../website/server/libs/email';
import { inviteByEmail } from '../../../../website/server/libs/invites';
import i18n from '../../../../website/common/script/i18n';
import {
  generateGroup,
  generateReq,
  generateRes,
  generateUser,
} from '../../../helpers/api-unit.helper';

describe('invites', () => {
  describe('inviteByEmail', () => {
    const email = 'new-friend@example.com';
    let inviter;
    let group;
    let req;
    let res;

    beforeEach(() => {
      sandbox.stub(emailLib, 'sendTxn');
      inviter = generateUser({ profile: { name: 'Real Inviter' } });
      group = generateGroup({
        name: 'Test Party',
        type: 'party',
        privacy: 'private',
        leader: inviter._id,
      });
      req = generateReq();
      res = generateRes();
    });

    it('sends the invite email to an address that is not registered', async () => {
      const result = await inviteByEmail({ email, name: 'Friend' }, group, inviter, req, res);

      expect(result).to.equal(email);
      expect(emailLib.sendTxn).to.be.calledOnce;
      expect(emailLib.sendTxn).to.be.calledWith({ email, name: 'Friend' }, 'invite-friend');
    });

    it('uses the profile name of the inviter and ignores the inviter in the request', async () => {
      req.body.inviter = '<a href="https://evil.example/login">Sign in again</a>';

      await inviteByEmail({ email }, group, inviter, req, res);

      const variables = emailLib.sendTxn.firstCall.args[2];
      expect(find(variables, { name: 'INVITER' }).content).to.equal('Real Inviter');
    });

    it('caps the recipient name and passes on only the email and the name', async () => {
      const invite = {
        email,
        name: 'a'.repeat(1000),
        _id: 'not-a-user',
        auth: { local: { email: 'someone-else@example.com' } },
      };

      await inviteByEmail(invite, group, inviter, req, res);

      expect(emailLib.sendTxn.firstCall.args[0]).to.eql({ email, name: 'a'.repeat(100) });
    });

    it('drops a recipient name that is not a string', async () => {
      await inviteByEmail({ email, name: ['a', 'b'] }, group, inviter, req, res);

      expect(emailLib.sendTxn.firstCall.args[0]).to.eql({ email, name: undefined });
    });

    it('rejects an invalid email address', async () => {
      await expect(inviteByEmail({ email: 'a@evil1.example, b@evil2.example' }, group, inviter, req, res))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 400,
          name: 'BadRequest',
          message: i18n.t('notAnEmail'),
        });
      expect(emailLib.sendTxn).to.not.be.called;
    });

    it('rejects an email that is not a string', async () => {
      await expect(inviteByEmail({ email: { $ne: null } }, group, inviter, req, res))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 400,
          name: 'BadRequest',
          message: i18n.t('notAnEmail'),
        });
      expect(emailLib.sendTxn).to.not.be.called;
    });
  });
});
