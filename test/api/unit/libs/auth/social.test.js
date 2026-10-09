import mongoose from 'mongoose';
import { saveNewUser } from '../../../../../website/server/libs/auth/social';
import { model as User } from '../../../../../website/server/models/user';
import { generateUser } from '../../../../helpers/api-unit.helper';

describe('saveNewUser', () => {
  const instanceCollection = () => mongoose.connection.collection('instance');

  beforeEach(async () => {
    await instanceCollection().deleteMany({});
  });

  afterEach(async () => {
    await instanceCollection().deleteMany({});
  });

  it('does not make the user an admin if there are users already', async () => {
    await generateUser().save();

    const user = await saveNewUser(generateUser());

    expect(user.permissions.fullAccess).to.not.equal(true);
  });

  context('on an instance without users', () => {
    beforeEach(() => {
      sandbox.stub(User, 'exists').resolves(null);
    });

    it('makes the first user an admin', async () => {
      const user = await saveNewUser(generateUser());

      expect(user.permissions.fullAccess).to.equal(true);
      const saved = await User.findById(user._id).exec();
      expect(saved.permissions.fullAccess).to.equal(true);
    });

    it('makes only one of several simultaneous registrations an admin', async () => {
      const users = await Promise.all([1, 2, 3, 4, 5].map(() => saveNewUser(generateUser())));

      expect(users.filter(user => user.permissions.fullAccess)).to.have.length(1);
    });

    it('does not make another user an admin after all users were deleted', async () => {
      // User.exists stays stubbed to report no users, like an instance whose users were deleted
      await saveNewUser(generateUser());

      const user = await saveNewUser(generateUser());

      expect(user.permissions.fullAccess).to.not.equal(true);
    });

    it('lets the next user become the admin if the first one could not be saved', async () => {
      const failingUser = generateUser();
      sandbox.stub(failingUser, 'save').rejects(new Error('could not save'));

      await expect(saveNewUser(failingUser)).to.eventually.be.rejectedWith('could not save');
      const user = await saveNewUser(generateUser());

      expect(user.permissions.fullAccess).to.equal(true);
    });
  });
});
