# Atelier

See every change Claude Code makes to your site, live on your own computer, before anything is pushed to GitHub.

## The problem

When Claude Code works in a cloud session, the changes it makes live on a remote machine. You cannot open the site until something is pushed to GitHub and built somewhere. Every look at the result costs a commit, a push and a wait.

## What Atelier does

Atelier runs the real site on your computer and receives the cloud session's uncommitted changes directly, through the Claude desktop app. GitHub is not involved until you decide to push.

```
Claude Code (cloud session)             Your computer
---------------------------             ------------------------------
edits the site
packs the changes into one file  --->   Claude desktop app drops the file
                                        into the Atelier "inbox" folder
                                        Atelier applies it to its copy
                                        of the site
                                        http://localhost:3210 updates
```

You click, navigate and test the real site. When you are happy, you tell Claude to push.

## Pages

| Page | Content |
| --- | --- |
| [Getting started](Getting-started) | Requirements, the skill, getting Atelier on your computer, first run |
| [Daily use](Daily-use) | The loop: ask, look, push or undo. The badge |
| [Settings](Settings) | The Atelier folder, `atelier.txt`, options, `.env.local`, `status.json` |
| [How it works](How-it-works) | The transfer file, what Atelier does with it, supported sites |
| [Privacy and security](Privacy-and-security) | What Atelier reads, writes and contacts |
| [Troubleshooting](Troubleshooting) | Common problems and what to check |

## Status

Early version.

- Tested: the full chain (pack, apply, live update, repository switch) on Linux with a Next.js 16 site.
- Tested: dropping the files onto a Windows computer through the Claude desktop app.
- Not verified yet: the Windows launcher and running the site on Windows, end to end.

Please open an issue with the console output if something fails.
