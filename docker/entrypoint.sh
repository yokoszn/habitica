#!/bin/sh
# Entrypoint of the Habitica server container
set -eu

generate_secret () {
  node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))'
}

# Prints a value from config.json (which may be mounted into the container)
config_value () {
  node -e 'const c = require("./config.json"); process.stdout.write(String(c[process.argv[1]] || ""))' "$1" 2>/dev/null || true
}

# Secrets that are configured neither as environment variable nor in config.json are generated
# here, so that the server and the team cron use the same values. They change with every restart,
# which ends the session based parts (data export, single sign-on) and invalidates emailed links
# (password reset, invitations).
for name in SESSION_SECRET SESSION_SECRET_KEY; do
  if [ -z "$(printenv "$name" || true)" ] && [ -z "$(config_value "$name")" ]; then
    export "$name=$(generate_secret)"
    echo "WARNING: $name is not set, using a random value until the next restart." \
      "Set it to your own secret, for example the output of \"openssl rand -hex 32\"." >&2
  fi
done

# Reset the dailies of group plans every hour. This replaces the cron daemon, which would
# require running the container as root.
(
  while true; do
    sleep 3600
    node ./run-team-cron.js || echo "Team cron failed" >&2
  done
) &

exec node ./website/transpiled-babel/index.js
