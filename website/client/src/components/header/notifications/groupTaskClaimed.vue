<template>
  <base-notification
    :can-remove="canRemove"
    :has-icon="false"
    :notification="notification"
    :read-after-click="true"
    @click="action"
  >
    <div
      slot="content"
      v-html="message"
    ></div>
  </base-notification>
</template>

<script>
import BaseNotification from './base';
import { sanitizeTaskMessage } from '@/libs/notifications';

export default {
  components: {
    BaseNotification,
  },
  props: ['notification', 'canRemove'],
  computed: {
    message () {
      return sanitizeTaskMessage(this.notification.data.message);
    },
  },
  methods: {
    action () {
      const { groupId } = this.notification.data;
      this.$router.push({ name: 'groupPlanDetailTaskInformation', params: { groupId } });
    },
  },
};
</script>
