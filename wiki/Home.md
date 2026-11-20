# Atelier

See every change Claude Code makes to your site, live on your own computer, before anything is pushed to GitHub.

## The problem

When Claude Code works in a cloud session, the changes it makes live on a remote machine. You cannot open the site until something is pushed to GitHub and built somewhere. Every look at the result costs a commit, a push and a wait.

## What Atelier does

Atelier is a Claude plugin. The Claude desktop app starts it on your computer; it runs the real site there and receives the cloud session's uncommitted changes directly. GitHub is not involved until you decide to push.

```
Claude Code (cloud session)             Your computer
---------------------------             ------------------------------
edits the site
packs the changed files          --->   Claude desktop app drops the file
into one small file                     into Atelier's inbox folder
                                        Atelier applies it to its copy
                                        of the site
                                        http://localhost:3210 updates
```

You click, navigate and test the real site. When you are happy, you tell Claude to push.

There is nothing to launch and nothing to place in your own folders.

## Pages

| Page | Content |
| --- | --- |
| [Getting started](Getting-started) | Requirements, installing the plugin, first run |
| [Daily use](Daily-use) | The loop: ask, look, push or undo. The badge |
| [Settings](Settings) | Where Atelier keeps its files, `.env.local`, the port, the `status` tool |
| [How it works](How-it-works) | The transfer file, what Atelier does with it, supported sites |
| [Privacy and security](Privacy-and-security) | What Atelier reads, writes and contacts |
| [Troubleshooting](Troubleshooting) | Common problems and what to check |

## Status

Early version.

- Tested on Windows: the plugin in the Claude desktop app, driven from a cloud session, with a Next.js 16 site, including live updates without a page reload.
- Tested on Linux: the full chain with a Next.js 16 site and with a static site.
- Not tested yet: macOS.

Please open an issue if something fails. Remove anything private from what you paste.
