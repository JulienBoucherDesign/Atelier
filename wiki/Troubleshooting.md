# Troubleshooting

Two places tell you what is going on: the Atelier console window, and `inbox/status.json` in the Atelier folder (see [Settings](Settings)). Claude can read the second one for you.

## Starting Atelier

**Windows asks for confirmation.** Expected the first time for a `.cmd` file. You can open `Atelier.cmd` in a text editor to read it first.

**"Node.js 20 or later was not found".** The launcher downloads a portable copy into the Atelier folder. If the download fails, install Node.js (LTS) from nodejs.org and start again.

**Git is missing.** Install [Git for Windows](https://git-scm.com/downloads/win), or Git for your system, and start again.

**The port is busy.** Another program uses port 3210. Set another one with `port=` in `atelier.txt`.

**The Atelier files are gone.** If Atelier lives in the system temporary folder, the system may have emptied it. Ask Claude to use atelier-direct again: it drops the files again.

## First transfer

**The waiting page stays for minutes.** Normal the first time for a repository: Atelier clones it and installs its dependencies. The console shows the progress.

**The clone fails.** The repository is private and Git on this computer is not signed in to GitHub. Clone the repository once by hand to sign in, then start Atelier again.

**The install fails.** Read the error in the console. Projects that need a specific Node.js version or system tools need them on this computer too.

## While working

**Nothing changes in the page.** Check the badge: it must show `cloud session (not pushed)`. Then ask Claude to check `inbox/status.json`: its `commit` field must match the last transfer.

**"Changes received from the cloud session could not be applied".** The starting point of the cloud session is not on GitHub, or this computer cannot read the repository. Make sure the session started from a branch that exists on GitHub.

**Claude cannot reach the computer.** The Claude desktop app must be open and online, and the conversation must be open in it. As a fallback, Claude can send the `preview@owner@repo.bundle` file in the conversation: save it to your Downloads folder and Atelier picks it up.

**The site shows an error.** The code no longer compiles, or it fails at run time. The error appears in the page and in the console. Tell Claude: it can read the error in `status.json`, fix the code and send again.

**Missing images or data.** The site probably needs a `.env.local` file in the Atelier folder. See [Settings](Settings).

## Reporting a problem

Open an issue with the console output and the content of `inbox/status.json`. Remove anything private first: repository names, addresses, and any value from `.env.local`.
