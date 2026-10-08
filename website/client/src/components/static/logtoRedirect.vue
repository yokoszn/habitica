<template>
  <div class="static-view">
    <p v-if="!errorMessage">
      {{ $t('logtoRedirecting') }}
    </p>
    <template v-else>
      <p>{{ errorMessage }}</p>
      <router-link :to="{ name: 'login' }">
        {{ $t('login') }}
      </router-link>
    </template>
  </div>
</template>

<style lang='scss'>
@import '@/assets/scss/static.scss';
</style>

<style lang='scss' scoped>
.static-view {
  height: 400px;
  text-align: center;
}

.static-view p {
  padding-top: 100px;
  font-size: 2em;
}
</style>

<script>
import sanitizeRedirect from '@/mixins/sanitizeRedirect';
import { LOGTO_REDIRECT_TO_KEY } from '@/libs/auth';

export default {
  mixins: [sanitizeRedirect],
  data () {
    return {
      errorMessage: null,
    };
  },
  async mounted () {
    const redirectTo = this.sanitizeRedirect(window.sessionStorage.getItem(LOGTO_REDIRECT_TO_KEY));
    window.sessionStorage.removeItem(LOGTO_REDIRECT_TO_KEY);

    if (this.$route.query.error) {
      this.errorMessage = this.$t('logtoSignInFailed');
      return;
    }

    const response = await this.$store.dispatch('auth:logtoAuth');
    if (response.error) {
      this.errorMessage = typeof response.error === 'string'
        ? response.error
        : this.$t('logtoSignInFailed');
      return;
    }

    window.location.href = redirectTo;
  },
};
</script>
