export default {
  methods: {
    sanitizeRedirect (redirect) {
      if (!redirect || typeof redirect !== 'string') {
        return '/';
      }
      if (import.meta.env.TRUSTED_DOMAINS.split(',').includes(redirect)) {
        return redirect;
      }
      if (!redirect.startsWith('/')) {
        return '/';
      }
      // Resolve the path like the browser does, so that "//host", "/\host" and paths with
      // tabs or newlines (which browsers remove) cannot point to another site
      let url;
      try {
        url = new URL(redirect, window.location.origin);
      } catch (e) {
        return '/';
      }
      if (url.origin !== window.location.origin) {
        return '/';
      }
      return `${url.pathname}${url.search}${url.hash}`;
    },
  },
};
