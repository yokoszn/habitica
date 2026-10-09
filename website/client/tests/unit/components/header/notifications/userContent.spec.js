import {
  describe, expect, test, beforeAll, afterAll,
} from 'vitest';
import { mount, createLocalVue } from '@vue/test-utils';
import i18n from '@/../../common/script/i18n';
import genericStrings from '@/../../common/locales/en/generic.json';
import groupsStrings from '@/../../common/locales/en/groups.json';
import Store from '@/libs/store';

import GroupTaskAssigned from '@/components/header/notifications/groupTaskAssigned.vue';
import GroupTaskClaimed from '@/components/header/notifications/groupTaskClaimed.vue';
import GroupTaskNeedsWork from '@/components/header/notifications/groupTaskNeedsWork.vue';
import GuildInvitation from '@/components/header/notifications/guildInvitation.vue';
import NewChatMessage from '@/components/header/notifications/newChatMessage.vue';
import NewPrivateMessage from '@/components/header/notifications/newPrivateMessage.vue';
import PartyInvitation from '@/components/header/notifications/partyInvitation.vue';

const localVue = createLocalVue();
localVue.use(Store);

const PAYLOAD = '<img src=x id=pwn onerror=alert(1)>';

// User content is inserted into HTML templates that are rendered with v-html
describe('header notifications with user content', () => {
  let originalStrings;

  beforeAll(() => {
    originalStrings = i18n.strings;
    i18n.strings = { ...genericStrings, ...groupsStrings };
  });

  afterAll(() => {
    i18n.strings = originalStrings;
  });

  function mountNotification (component, data, actions = {}) {
    return mount(component, {
      propsData: {
        notification: { id: 'notification-id', type: 'TEST', data },
        canRemove: true,
      },
      store: new Store({
        state: {
          user: { data: { _id: 'user-id', party: { _id: 'party-id' } } },
        },
        getters: {},
        actions,
      }),
      localVue,
      mocks: {
        $t: (...args) => i18n.t(...args),
        $router: { push: () => {} },
      },
    });
  }

  function expectEscaped (wrapper, selector) {
    expect(wrapper.find('#pwn').exists()).to.equal(false);
    expect(wrapper.find('img').exists()).to.equal(false);
    expect(wrapper.find(selector).text()).to.equal(PAYLOAD);
  }

  test('guild invitation escapes the group name', () => {
    const wrapper = mountNotification(GuildInvitation, { id: 'group-id', name: PAYLOAD });
    expectEscaped(wrapper, '.notification-bold');
  });

  test('public guild invitation escapes the group name', () => {
    const wrapper = mountNotification(GuildInvitation, {
      id: 'group-id', name: PAYLOAD, publicGuild: true,
    });
    expectEscaped(wrapper, '.notification-bold-blue');
  });

  test('party invitation escapes the party name, the inviter name and the profile link', async () => {
    const inviter = '"><img src=x id=pwn>';
    const wrapper = mountNotification(PartyInvitation, {
      id: 'party-id', name: PAYLOAD, inviter,
    }, {
      'members:fetchMember': () => ({ auth: { local: { username: PAYLOAD } } }),
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expectEscaped(wrapper, '.notification-bold');
    const link = wrapper.find('a');
    expect(link.text()).to.equal(`@${PAYLOAD}`);
    expect(link.attributes('href')).to.equal(`/profile/${encodeURIComponent(inviter)}`);
  });

  test('new chat message escapes the guild name', () => {
    const wrapper = mountNotification(NewChatMessage, {
      group: { id: 'group-id', name: PAYLOAD },
    });
    expectEscaped(wrapper, '.notification-bold-blue');
  });

  test('new chat message escapes the party name', () => {
    const wrapper = mountNotification(NewChatMessage, {
      group: { id: 'party-id', name: PAYLOAD },
    });
    expectEscaped(wrapper, '.notification-bold-blue');
  });

  test('new private message escapes the sender name', () => {
    const wrapper = mountNotification(NewPrivateMessage, {
      sender: { id: 'sender-id', name: PAYLOAD },
      excerpt: 'Hello',
    });
    expectEscaped(wrapper, '.notification-bold');
  });

  [
    ['assigned', GroupTaskAssigned, 'youHaveBeenAssignedTask'],
    ['claimed', GroupTaskClaimed, 'taskClaimed'],
    ['needs work', GroupTaskNeedsWork, 'taskNeedsWork'],
  ].forEach(([name, component, stringKey]) => {
    const data = { groupId: 'group-id', group: { id: 'group-id' } };

    test(`group task ${name} escapes a raw task text stored by older servers`, () => {
      const message = i18n.t(stringKey, {
        taskText: PAYLOAD, managerName: 'manager', userName: '@user',
      });
      const wrapper = mountNotification(component, { ...data, message });
      expectEscaped(wrapper, '.notification-bold');
    });

    test(`group task ${name} does not double escape a message escaped by the server`, () => {
      const message = i18n.t(stringKey, {
        taskText: 'Fish &amp; &lt;Chips&gt;', managerName: 'manager', userName: '@user',
      });
      const wrapper = mountNotification(component, { ...data, message });
      expect(wrapper.find('.notification-bold').text()).to.equal('Fish & <Chips>');
    });
  });
});
