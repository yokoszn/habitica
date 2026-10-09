<template>
  <base-notification
    :can-remove="canRemove"
    :has-icon="false"
    :notification="notification"
    :read-after-click="true"
    @click="action"
  >
    <div slot="content">
      <span v-html="$t('userSentMessage', {user: senderName})"></span>
      <div class="notification-small notification-ellipses">
        {{ notification.data.excerpt }}
      </div>
    </div>
  </base-notification>
</template>

<script>
import escape from 'lodash/escape';
import BaseNotification from './base';
import { PAGES } from '@/libs/consts';

export default {
  components: {
    BaseNotification,
  },
  props: ['notification', 'canRemove'],
  computed: {
    senderName () {
      return escape(this.notification.data.sender.name);
    },
  },
  methods: {
    action () {
      this.$router.push(PAGES.PRIVATE_MESSAGES);
    },
  },
};
</script>
