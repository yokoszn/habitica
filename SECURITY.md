# Security Policy

This repository contains the self-hosting adaptations of [Habitica](https://github.com/HabitRPG/habitica)
(Dockerfiles, configuration, fork-specific features such as SMTP email, invite-only registration and Logto
single sign-on) on top of the upstream source code.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub:
**Security → Advisories → Report a vulnerability** in this repository
(GitHub private vulnerability reporting).

Please include:

- the affected version, commit or container image tag
- the configuration that is needed to reproduce it (for example `INVITE_ONLY`, Logto, SMTP)
- steps to reproduce and the impact you observed

You will get an acknowledgement as soon as possible. Fixes are released as new container images and
the advisory is published once a fix is available.

If the problem is in Habitica itself and not in the self-hosting changes, please also report it to the
upstream project as described in its [security policy](https://github.com/HabitRPG/habitica/security/policy).

## Supported versions

Only the latest release and the current `self-host` branch receive security fixes.
Please keep your instance up to date by pulling the latest container images.

## Hardening your instance

- Set your own `SESSION_SECRET`, `SESSION_SECRET_KEY` and `SESSION_SECRET_IV` values. Never use the
  example values from the documentation or from `config.json.example`.
- Do not expose MongoDB to the network, and enable authentication for it.
- Put the server behind a TLS-terminating reverse proxy.
- Enable `INVITE_ONLY` after the initial users registered, if the instance is not meant to be public.
