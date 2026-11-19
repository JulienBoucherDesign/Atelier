# Privacy and security

Atelier is a few text files you can read before installing. This page lists what they do.

## No account, no key, no telemetry

- Atelier has no account system and no key of its own.
- It sends no usage data anywhere.
- It never contacts GitHub, and it does not know or contact your hosting provider. Deployment is not its business.

## Where your site's files travel

Your uncommitted changes go from the cloud session to your computer through the Claude desktop app, as transfer files. They are not uploaded to GitHub or to any third party.

Pushing to GitHub is done by Claude Code, in the cloud session, only when you ask for it.

## What it contacts

| Address | When | Why |
| --- | --- | --- |
| `registry.npmjs.org` | First run per site, and when the lockfile changes | The package manager and the site's dependencies |

The site itself may contact its own services while it runs, exactly as it does on a developer's machine.

## What it writes on your computer

Only in its two folders: the inbox, in the system's temporary folder, and its data folder, inside Claude's own folder. See [Settings](Settings). It adds nothing to the system and changes no system setting.

Claude, for its part, writes only into the inbox, using the access you approved for that folder. Atelier is never driven through your mouse, keyboard or screen.

## What it runs

Atelier runs while the Claude desktop app is open and stops by itself within two minutes after Claude closes. It installs your site's dependencies and runs its development server, as any developer would. Use it with repositories you trust.

When it unpacks a transfer, Atelier refuses any path that would land outside its copy of the site.

## The preview is local

The preview listens on `127.0.0.1` only. It is not reachable from other devices on your network or from the internet. The request that stops the preview is protected by a random value generated at each start.

## Secrets your site needs

If the site needs values to run, you put them in a `.env.local` file next to the inbox. Atelier copies that file into its local copy of the site and does nothing else with it.

- Keep that file out of every repository, and do not paste its content into a conversation.
- This repository contains no site-specific value, key or account, and it should stay that way: do not include yours in issues or pull requests.
