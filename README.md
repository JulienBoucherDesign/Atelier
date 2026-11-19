# Atelier

See every change Claude Code makes to your site, live on your own computer, before anything is pushed to GitHub. A Claude plugin: Claude starts the preview itself, there is nothing to launch.

Full documentation: [wiki](../../wiki) (source in [`wiki/`](wiki)).

## What it does

When Claude Code works in a cloud session, your uncommitted changes live on a remote machine: you cannot open the site until something is pushed and built.

Atelier closes that loop on your own computer:

1. Claude Code edits the site in its cloud session.
2. After each edit, it packs the changed files into one small file and drops it on your computer through the Claude desktop app. GitHub is not involved.
3. Atelier, started on your computer by the Claude desktop app, applies the file to its own copy of the site and runs the real site at `http://localhost:3210`.
4. The open page updates by itself. You click, navigate and test the real thing.
5. Nothing is pushed to GitHub until you tell Claude to push.

One install serves all your repositories: each transfer says which site it belongs to.

## Install (once)

In the Claude desktop app:

1. Open **Customize > Plugins**.
2. Choose **Add > Add marketplace** and enter `JulienBoucherDesign/Atelier`.
3. Install the **atelier** plugin.
4. Restart the Claude desktop app if Atelier's tools do not show up.

From the Claude Code command line, the equivalent is:

```
/plugin install atelier --marketplace JulienBoucherDesign/Atelier
```

## Requirements

- The Claude desktop app, open on your computer, with your Claude Code cloud session opened in it. The app starts Atelier and carries the changes to your computer.
- Node.js 20 or later on that computer. Atelier is plain Node.js scripts with no dependencies.

Git is not needed on your computer, and Atelier needs no account of any kind.

## Use

1. Open your Claude Code cloud session in the Claude desktop app.
2. Ask for a change to your site. The first time in a session, Claude asks for access to Atelier's inbox folder (a subfolder of your system's temporary folder).
3. The site appears at `http://localhost:3210`, next to the conversation, and updates after each change without a reload. The first time Atelier sees a site, it receives a full copy and installs its dependencies, which takes a few minutes.
4. When you are happy, tell Claude to push, and ask for a pull request if you want one.

A badge at the bottom right of the page reads `cloud session (not pushed)` and shows when the last change arrived.

## What is in the plugin

Everything is readable text: there is no installer and no compiled binary.

| File | Role |
| --- | --- |
| [`plugins/atelier/server/mcp.mjs`](plugins/atelier/server/mcp.mjs) | The part Claude starts on your computer. Keeps the preview running while Claude is open and gives Claude two tools: `status` and `stop` |
| [`plugins/atelier/server/engine.mjs`](plugins/atelier/server/engine.mjs) | The preview: unpacks transfers, runs the site, serves it locally with the badge |
| [`plugins/atelier/skills/preview/SKILL.md`](plugins/atelier/skills/preview/SKILL.md) | The skill: tells Claude Code what to do after each edit |
| [`plugins/atelier/skills/preview/pack.sh`](plugins/atelier/skills/preview/pack.sh) | Runs in the cloud session: packs the changed files into one transfer file |

## Supported sites

- Next.js projects are started with `next dev`.
- Other projects with a `dev` script in `package.json` are started with that script.
- Folders without a `dev` script are served as static files, with automatic reload.

## Status

Early version.

- Tested: the full chain on Linux with a Next.js 16 site and with a static site: first full copy, live updates, added and deleted files, undo, switching between two sites, recovery when the computer lost its copy, stop and restart, automatic stop when Claude closes.
- Tested: dropping files onto a Windows computer through the Claude desktop app.
- Not verified yet: the plugin installed in the Claude desktop app on Windows, end to end.

Please open an issue if something fails. Remove anything private from what you paste.

## Privacy

- Atelier needs no account and no key, and it has no telemetry.
- It never contacts GitHub or your hosting provider. Your site's files reach your computer only through the Claude desktop app.
- The only download it makes is your site's dependencies, from the npm registry, as any developer's machine does.
- The preview listens on `127.0.0.1` only: it is not reachable from the network.
- It stops by itself when Claude is closed.

Details: [Privacy and security](../../wiki/Privacy-and-security).

## License

MIT. See [`LICENSE`](LICENSE).
