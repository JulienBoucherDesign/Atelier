# Atelier

See every change Claude Code makes to your site, live on your own computer, before anything is pushed to GitHub. Two small scripts, nothing to install.

Full documentation: [wiki](../../wiki) (source in [`wiki/`](wiki)).

## What it does

When Claude Code works in a cloud session, your uncommitted changes live on a remote machine: you cannot open the site until something is pushed and built.

Atelier closes that loop on your own computer:

1. Claude Code edits the site in its cloud session.
2. After each edit, it packs the working copy changes (modified, added and deleted files, local commits) into one small file and drops it on your computer through the Claude desktop app. GitHub is not involved.
3. Atelier applies the file on top of its own copy of the repository and runs the real site at `http://localhost:3210`.
4. The open page updates by itself. You click, navigate and test the real thing.
5. Nothing is pushed to GitHub until you tell Claude to push.

Atelier follows whatever repository the cloud session works on: the first file it receives tells it which site to show. One copy serves all your repositories.

## What it is

Two small text files you can read before running them:

| File | Role |
| --- | --- |
| `atelier.mjs` | The program, a single Node.js script with no dependencies |
| `Atelier.cmd` | Windows launcher: finds Node.js, then starts `atelier.mjs` |

There is no installer and no compiled binary. Atelier keeps everything it creates in its own folder and adds nothing to the system. Delete the folder to remove everything.

## Status

Early version.

- Tested: the full chain (pack, apply, live update, repository switch) on Linux with a Next.js 16 site.
- Tested: dropping the files onto a Windows computer through the Claude desktop app.
- Not verified yet: the Windows launcher and running the site on Windows, end to end.

Please open an issue with the console output if something fails.

## Requirements

- The Claude desktop app, with the Claude Code cloud session opened in it: the app carries the changes to your computer.
- Git, signed in to GitHub if the site lives in a private repository. Atelier only reads from GitHub. On Windows: [Git for Windows](https://git-scm.com/downloads/win).
- Node.js 20 or later. On Windows, if it is missing, the launcher downloads the official portable build from nodejs.org into the Atelier folder.

## Setup

### 1. Add the skill to Claude (once per account)

The skill tells Claude Code what to do after each edit.

1. Download [`atelier-direct-skill.zip`](atelier-direct-skill.zip).
2. In Claude, open **Customize > Skills**, click **+**, then **Create skill**, then **Upload a skill**, and pick the ZIP.

Skills need code execution enabled in your Claude settings. The skill source is in [`skill/atelier-direct/SKILL.md`](skill/atelier-direct/SKILL.md).

### 2. Get Atelier on your computer (once per computer)

Either:

- ask Claude in a cloud session to **use atelier-direct**. Claude fetches the two files from this repository, asks which folder to put them in, and drops them there; or
- download `Atelier.cmd` and `atelier.mjs` yourself and put them together in a folder of your choice, for example `Documents\Atelier`.

Any folder works. If you do not want Atelier among your own files, name the system temporary folder (on Windows: `%TEMP%\atelier`). The system may empty that folder from time to time; Claude then drops the files again.

## Daily use

1. Start Atelier and leave its console window open.
   - Windows: double-click `Atelier.cmd`. Windows may ask for confirmation the first time.
   - macOS or Linux: run `node atelier.mjs` in a terminal.
2. Open your Claude Code cloud session in the Claude desktop app on the same computer.
3. Ask for a change. The first time in a session, Claude asks where the Atelier folder is and requests access to it.
4. The site appears at `http://localhost:3210` and updates after each change, without a reload. The first time Atelier sees a repository, it clones it and installs its dependencies, which takes a few minutes.
5. When you are happy, tell Claude to push, and ask for a pull request if you want one.

A badge at the bottom right of the page shows what you are looking at: `cloud session (not pushed)` means the unpushed state of the cloud session. The badge can switch back to a GitHub branch for comparison.

## What is in the Atelier folder

| Item | Purpose |
| --- | --- |
| `Atelier.cmd`, `atelier.mjs` | The launcher and the program |
| `inbox/` | Files received from the cloud session, and `status.json` (Atelier's current state) |
| `data/` | Copies of the sites, their dependencies, and portable Node.js if it was downloaded |
| `.env.local` | Optional, created by you: secrets the site needs. Copied into the site at each start, never sent anywhere |
| `atelier.txt` | Optional settings, one per line: `port=3210`, or `repo=https://github.com/you/site` to pin one repository |

## Supported sites

- Next.js projects are started with `next dev`.
- Other projects with a `dev` script in `package.json` are started with that script.
- Folders without a `dev` script are served as static files, with automatic reload.

## Troubleshooting

- **Nothing changes in the page.** Check the Atelier console and the badge. Claude can read `inbox/status.json` to see whether the last file was applied.
- **Claude cannot reach the computer.** The desktop app must be open and online. As a fallback, Claude can send the `preview@owner@repo.bundle` file in the conversation: save it to your Downloads folder and Atelier picks it up.
- **"Changes received from the cloud session could not be applied".** The starting point of the cloud session is not on GitHub, or this computer cannot read the repository.
- **Missing images or data.** The site probably needs a `.env.local` file in the Atelier folder.

## How it works

- Cloud side: [`sync.sh`](sync.sh) builds a tree of the working copy in a temporary index, wraps it in a commit that is never pushed (`refs/atelier/wip`), and writes a git bundle named `preview@owner@repo.bundle`. The index and the history of the session are left untouched. The skill carries a copy of this script.
- Computer side: `atelier.mjs` keeps a clone of the repository, fetches the bundle, checks out the result (only changed files are rewritten), and proxies the development server so it can add its badge. If the lockfile changed, dependencies are reinstalled and the site restarts.

## Privacy

- Atelier needs no account and no key of its own, and it has no telemetry.
- It only reads from GitHub, with the Git access already set up on your computer. It never pushes.
- It does not know or contact your hosting provider. Deployment is not its business.
- The preview listens on `127.0.0.1` only: it is not reachable from the network.
- A `.env.local` file you add stays on your computer.

Details: [Privacy and security](../../wiki/Privacy-and-security).

## License

MIT. See [`LICENSE`](LICENSE).
