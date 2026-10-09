import {
  generateUser,
  generateGroup,
  createAndPopulateGroup,
  generateChallenge,
  translate as t,
} from '../../../../helpers/api-integration/v3';

describe('POST /challenges/:challengeId/clone', () => {
  it('clones a challenge', async () => {
    const user = await generateUser({ balance: 10 });
    const group = await generateGroup(user);

    const name = 'Test Challenge';
    const shortName = 'TC Label';
    const description = 'Test Description';
    const prize = 1;

    const challenge = await user.post('/challenges', {
      group: group._id,
      name,
      shortName,
      description,
      prize,
    });
    const challengeTask = await user.post(`/tasks/challenge/${challenge._id}`, {
      text: 'test habit',
      type: 'habit',
      up: false,
      down: true,
      notes: 1976,
    });

    const cloneChallengeResponse = await user.post(`/challenges/${challenge._id}/clone`, {
      group: group._id,
      name: `${name} cloned`,
      shortName,
      description,
      prize,
    });

    expect(cloneChallengeResponse.clonedTasks[0].text).to.eql(challengeTask.text);
    expect(cloneChallengeResponse.clonedTasks[0]._id).to.not.eql(challengeTask._id);
    expect(cloneChallengeResponse.clonedTasks[0].challenge.id)
      .to.eql(cloneChallengeResponse.clonedChallenge._id);
  });

  context('challenges the user cannot view', () => {
    let challenge;
    let outsider;
    let outsiderGroup;

    beforeEach(async () => {
      const { members, group } = await createAndPopulateGroup({
        groupDetails: { type: 'party', privacy: 'private' },
        members: 1,
      });
      challenge = await generateChallenge(members[0], group);
      await members[0].post(`/tasks/challenge/${challenge._id}`, {
        text: 'private party habit',
        type: 'habit',
      });

      outsider = await generateUser({ balance: 10 });
      outsiderGroup = await generateGroup(outsider);
    });

    it('does not clone a challenge of a party the user is not in', async () => {
      await expect(outsider.post(`/challenges/${challenge._id}/clone`, {
        group: outsiderGroup._id,
        name: 'stolen',
        shortName: 'stolen',
        prize: 0,
      })).to.eventually.be.rejected.and.eql({
        code: 404,
        error: 'NotFound',
        message: t('challengeNotFound'),
      });

      const outsiderChallenges = await outsider.get(`/challenges/groups/${outsiderGroup._id}`);
      expect(outsiderChallenges).to.have.length(0);
    });

    it('lets a challenge admin clone it', async () => {
      await outsider.updateOne({ 'permissions.challengeAdmin': true });

      const response = await outsider.post(`/challenges/${challenge._id}/clone`, {
        group: outsiderGroup._id,
        name: 'cloned by an admin',
        shortName: 'cloned',
        prize: 0,
      });

      expect(response.clonedTasks[0].text).to.eql('private party habit');
    });
  });
});
