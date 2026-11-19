# Getting started

Two things to set up: the skill in Claude (once per account) and Atelier on your computer (once per computer).

## Requirements

| What | Why |
| --- | --- |
| Claude desktop app | It carries the changes from the cloud session to your computer |
| A Claude Code cloud session on your site's repository | That is where Claude edits the site |
| Git | Atelier keeps its own copy of the site. Sign in to GitHub if the repository is private. On Windows: [Git for Windows](https://git-scm.com/downloads/win) |
| Node.js 20 or later | Atelier is a Node.js script. On Windows, if Node.js is missing, the launcher downloads the official portable build from nodejs.org into the Atelier folder |

Nothing is installed system-wide by Atelier itself.

## 1. Add the skill to Claude

The skill tells Claude Code what to do after each edit.

1. Download [`atelier-direct-skill.zip`](https://github.com/JulienBoucherDesign/Atelier/blob/main/atelier-direct-skill.zip) from the repository.
2. In Claude, open **Customize > Skills**, click **+**, then **Create skill**, then **Upload a skill**, and pick the ZIP.

Skills need code execution enabled in your Claude settings. The skill is one readable file: [`skill/atelier-direct/SKILL.md`](https://github.com/JulienBoucherDesign/Atelier/blob/main/skill/atelier-direct/SKILL.md).

## 2. Get Atelier on your computer

Atelier is two files that must sit together in one folder: `Atelier.cmd` and `atelier.mjs`.

**Let Claude do it.** Open your cloud session in the Claude desktop app and ask Claude to *use atelier-direct*. Claude:

1. asks which folder Atelier should live in;
2. asks for access to that folder (you approve the prompt);
3. fetches the two files from this repository and drops them there.

**Or do it yourself.** Download the two files from the repository and put them in a folder of your choice.

### Which folder

Any folder works, for example `Documents\Atelier`.

If you do not want Atelier among your own files, name the system temporary folder: on Windows, `%TEMP%\atelier`. The system may empty that folder from time to time; Claude then drops the files again, and Atelier clones the site again on its next start.

## 3. First run

1. Start Atelier.
   - Windows: double-click `Atelier.cmd`, or press `Windows + R` and enter its path (for example `%TEMP%\atelier\Atelier.cmd`). Windows may ask for confirmation the first time.
   - macOS or Linux: run `node atelier.mjs` in a terminal, from the Atelier folder.
2. Leave the console window open. Your browser opens `http://localhost:3210` on a waiting page.
3. In the cloud session, ask Claude for a change.
4. Atelier receives the first transfer, clones the repository and installs its dependencies. This takes a few minutes, once per repository.
5. The site appears.

Claude cannot start Atelier for you: starting it is the one manual step.

Next: [Daily use](Daily-use).
