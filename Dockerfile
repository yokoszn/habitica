# Container stage for building server and web component of Habitica
# Base images are pinned by digest (updated by Dependabot)
FROM node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8 AS build

ARG CI=true
ARG NODE_ENV=production

RUN git config --global url."https://".insteadOf git://

WORKDIR /usr/src/habitica

# Install main packages
COPY ["package.json", "package-lock.json", "./"]
RUN npm pkg set scripts.postinstall="echo \"Skipping postinstall\"" && npm ci

# Install client packages
COPY ["website/client/package.json", "website/client/package-lock.json", "./website/client/"]
WORKDIR /usr/src/habitica/website/client
RUN npm pkg set scripts.postinstall="echo \"Skipping postinstall\"" && npm ci
WORKDIR /usr/src/habitica

# Make the source code available in the container
COPY --exclude=.git --exclude=Dockerfile . /usr/src/habitica

# Copy assets into the public directory for being included in the release
RUN mkdir -p /usr/src/habitica/website/client/public/static/mobileApp/images/
RUN find /usr/src/habitica/habitica-images \( -iname "*.gif" -o -iname "*.png" \) -exec cp -t /usr/src/habitica/website/client/public/static/mobileApp/images/ {} \;

# Replace media URLs to AWS with relative paths
RUN grep "https://habitica-assets.s3.amazonaws.com/" /usr/src/habitica/ -lr | xargs sed -i 's#https://habitica-assets.s3.amazonaws.com/#/static/#g'

# Create configuration file (some values are needed for the client build already).
# It must not contain secrets: the image is public. SESSION_SECRET and SESSION_SECRET_KEY are
# passed as environment variables at runtime (see docker/entrypoint.sh).
RUN echo '{\n\
    "BASE_URL": "http://localhost:3000",\n\
    "CRON_SAFE_MODE": "false",\n\
    "CRON_SEMI_SAFE_MODE": "false",\n\
    "DISABLE_REQUEST_LOGGING": "true",\n\
    "EMAIL_SERVER_AUTH_PASSWORD": "",\n\
    "EMAIL_SERVER_AUTH_USER": "",\n\
    "EMAIL_SERVER_URL": null,\n\
    "ENABLE_CONSOLE_LOGS_IN_PROD": "true",\n\
    "ENABLE_CONSOLE_LOGS_IN_TEST": "false",\n\
    "FLAG_REPORT_EMAIL": "",\n\
    "IGNORE_REDIRECT": "true",\n\
    "INVITE_ONLY": "false",\n\
    "MAINTENANCE_MODE": "false",\n\
    "MONGODB_POOL_SIZE": "10",\n\
    "NODE_ENV": "production",\n\
    "PATH": "bin:node_modules/.bin:/usr/local/bin:/usr/bin:/bin",\n\
    "PORT": 3000,\n\
    "PUSH_CONFIGS_APN_ENABLED": "false",\n\
    "TRUSTED_DOMAINS": "",\n\
    "WEB_CONCURRENCY": 1,\n\
    "ENABLE_STACKDRIVER_TRACING": "false",\n\
    "BLOCKED_IPS": "",\n\
    "LOG_AMPLITUDE_EVENTS": "false",\n\
    "RATE_LIMITER_ENABLED": "true",\n\
    "CONTENT_SWITCHOVER_TIME_OFFSET": 8\n\
}' > /usr/src/habitica/config.json

# Build the server and web components
RUN ./node_modules/.bin/gulp build:prod
RUN npm run client:build



# Container for providing the build server component of Habitica
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS server

ENV NODE_ENV=production

COPY --from=build /usr/src/habitica/node_modules /var/lib/habitica/node_modules

COPY --from=build /usr/src/habitica/i18n_cache/ /var/lib/habitica/i18n_cache/
# The server writes cached content responses here at runtime
COPY --from=build --chown=node:node /usr/src/habitica/content_cache/ /var/lib/habitica/content_cache/

# Only what the server and the team cron use at runtime: the client's sources and build
# tooling (website/client/node_modules) stay in the build stage
COPY --from=build /usr/src/habitica/website/common/ /var/lib/habitica/website/common/
COPY --from=build /usr/src/habitica/website/server/ /var/lib/habitica/website/server/
COPY --from=build /usr/src/habitica/website/transpiled-babel/ /var/lib/habitica/website/transpiled-babel/
COPY --from=build /usr/src/habitica/website/client/dist/ /var/lib/habitica/website/client/dist/

COPY --from=build /usr/src/habitica/package.json /var/lib/habitica/package.json
COPY --from=build /usr/src/habitica/config.json /var/lib/habitica/config.json


# Copy the scripts for resetting group dailies (run every hour by the entrypoint)
RUN mkdir -p /var/lib/habitica/scripts/
COPY --from=build /usr/src/habitica/scripts/team-cron.js /var/lib/habitica/scripts/team-cron.js
COPY --from=build /usr/src/habitica/scripts/team-cron/run-team-cron.js /var/lib/habitica/
COPY --from=build --chmod=0755 /usr/src/habitica/docker/entrypoint.sh /usr/local/bin/habitica-entrypoint

WORKDIR /var/lib/habitica

# The application files stay owned by root and read-only for the server process
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v4/status').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["habitica-entrypoint"]


# Container for providing the build web component of Habitica
FROM caddy:2@sha256:f2a1290d0463aad60660d4ec134943f183ee2a5f6c3eb7bf32dd984f2f020772 AS client

COPY --from=build /usr/src/habitica/website/client/dist /var/www

ENV BACKEND_SERVER=server:3000

RUN echo -e ":80 {\n\
	@backend not {\n\
		path /static/audio/\n\
		path /static/css/\n\
		path /static/emails/\n\
		path /static/icons/\n\
		path /static/img/\n\
		path /static/js/\n\
		path /static/merch/\n\
		path /static/npc/\n\
		path /static/presskit/\n\
		path /index.html\n\
	}\n\
\n\
	header {\n\
		X-Content-Type-Options nosniff\n\
		X-Frame-Options SAMEORIGIN\n\
		Referrer-Policy strict-origin-when-cross-origin\n\
		-Server\n\
	}\n\
\n\
	root * /var/www\n\
	reverse_proxy @backend {\$BACKEND_SERVER:server:3000}\n\
	file_server\n\
}" > /etc/caddy/Caddyfile
