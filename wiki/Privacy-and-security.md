# Privacy and security

Atelier is two text files you can read before running them. This page lists what they do.

## No account, no key, no telemetry

- Atelier has no account system and no key of its own.
- It sends no usage data anywhere.
- It does not know or contact your hosting provider. Deployment is not its business.

## What it reads from GitHub

Atelier clones and fetches your site's repository with the Git access already set up on your computer. It does not store or handle GitHub credentials itself.

Atelier never writes to GitHub: it does not commit, push or open pull requests. Pushing is done by Claude Code, in the cloud session, only when you ask for it.

## What it contacts

| Address | When | Why |
| --- | --- | --- |
| `github.com` | Start, and while following a branch | Clone and fetch the repository (read only) |
| `registry.npmjs.org` | First run per repository, and when the lockfile changes | The package manager and the site's dependencies |
| `nodejs.org` | Windows launcher, only if Node.js is missing | The official portable Node.js build |

The site itself may contact its own services while it runs, exactly as it does on a developer's machine.

## What it writes on your computer

Only inside its own folder: `inbox/` and `data/`. It adds nothing to the system and changes no system setting. Delete the folder to remove everything.

Claude, for its part, writes only into the Atelier folder, using the access you approved for that folder.

## The preview is local

The preview listens on `127.0.0.1` only. It is not reachable from other devices on your network or from the internet. Actions triggered from the badge are protected by a random value generated at each start.

## The transfer file

The transfer file holds your uncommitted changes. It travels from the cloud session to your computer through the Claude desktop app. It is not uploaded to GitHub or to any third party.

## Secrets your site needs

If the site needs values to run, you put them in a `.env.local` file in the Atelier folder. Atelier copies that file into its local copy of the site and does nothing else with it.

- Keep that file out of every repository.
- This repository contains no site-specific value, key or account, and it should stay that way: do not include yours in issues or pull requests.

## Running code from the repository

Atelier installs your site's dependencies and runs its development server, as any developer would. Use it with repositories you trust.
