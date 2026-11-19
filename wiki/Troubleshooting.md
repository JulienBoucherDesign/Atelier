# Troubleshooting

Claude can see what Atelier is doing: ask it to check Atelier's status. The answer includes the last lines of Atelier's log when something is not ready.

## Claude says it has no Atelier tool on the computer

- The Claude desktop app must be open on the computer, and the conversation must be opened in it.
- The plugin must be installed and turned on in **Customize > Plugins**.
- Restart the Claude desktop app after installing the plugin.
- Node.js 20 or later must be installed on the computer. Without it, the app cannot start Atelier. Install the LTS version from nodejs.org, then restart Claude.

## First transfer

**Claude asks for access to a folder.** Expected, once per session: it is Atelier's inbox, a subfolder of the system's temporary folder.

**The waiting page stays for minutes.** Normal the first time for a site: Atelier installs its dependencies.

**The install fails.** Ask Claude for the status and read the error. Projects that need a specific Node.js version or system tools need them on this computer too.

## While working

**Nothing changes in the page.** Ask Claude to check the status. The transfer on display must be the last one it sent.

**Claude says a full snapshot is needed.** Atelier's copy of the site is missing or older than expected, for example after the system emptied a folder. Claude sends a full copy; nothing is lost.

**Claude cannot reach the computer.** The Claude desktop app must be open and online.

**The site shows an error.** The code no longer compiles, or it fails at run time. The error appears in the page. Tell Claude: it reads the error from the status, fixes the code and sends again.

**Missing images or data.** The site probably needs a `.env.local` file. See [Settings](Settings).

**The address is not `localhost:3210`.** Another program uses that port, so Atelier took the next free one. Claude knows the address from the status.

## Starting over

Close the Claude desktop app, delete Atelier's inbox folder (and its data folder if you want to free the space), and open Claude again. See [Settings](Settings) for the locations.

## Reporting a problem

Open an issue with the status Claude reported. Remove anything private first: repository names, addresses, and any value from `.env.local`.
