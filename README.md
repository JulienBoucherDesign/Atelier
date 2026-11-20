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

## Starter prompt

Paste this at the start of a Claude Code cloud session, whatever repository it is on:

```
Use the atelier:preview skill to show this site as a live preview on my computer, without pushing anything to GitHub.

1. Call the Atelier "status" tool that runs on my computer (its name starts with mcp__remote-devices__ and ends with __status), then ask for access to the inbox folder if it is not connected yet.
2. Send a full copy of the site with pack.sh. Wait 5 seconds between the end of pack.sh and sending the file. Then call status with wait_for: if "seen" is not the id you just sent, send the same file again once.
3. Tell me while the dependencies install (a few minutes the first time for a new site), and call status again until it is "ready".
4. Open the address returned by status in the app's built-in browser, next to the conversation.
5. From then on, after every change I ask for, send the changes the same way, check they are applied and confirm it in one sentence.

Rules: no commit, push or pull request until I ask for it. Never use my computer's mouse, keyboard or screen. Never write a key or account details in a file or a message.
```

Good to know:

- **The session must be open in the Claude desktop app on the computer where Atelier is installed.** Otherwise Claude cannot see Atelier's tools.
- **If you do not see the preview**, press **Ctrl + Shift + B** (Cmd + Shift + B on macOS) to show the app's browser panel, or open `http://localhost:3210` in your usual browser.
- **The 5-second wait and the resend** work around a transfer that can arrive with the previous file's content when it is sent right after being written.

More in the wiki: [Daily use](../../wiki/Daily-use#starter-prompt).

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

- Tested on Windows: the plugin installed in the Claude desktop app, driven from a Claude Code cloud session, with a Next.js 16 site. First full copy, dependency install, preview next to the conversation, live update of a single changed file without a page reload.
- Tested on Linux: the same chain with a Next.js 16 site and a static site, plus added and deleted files, undo, switching between two sites, recovery when the computer lost its copy, stop and restart, and automatic stop when Claude closes.
- Not tested yet: macOS.

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
