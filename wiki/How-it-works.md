# How it works

Three parts: a short script in the cloud session, the Claude desktop app in between, and Atelier on your computer.

## Cloud side: packing the changes

After each change, Claude runs [`pack.sh`](https://github.com/JulienBoucherDesign/Atelier/blob/main/plugins/atelier/skills/preview/pack.sh). The script:

1. records the full state of the working copy (modified, added and deleted files, local commits) in a temporary index. Ignored files stay ignored;
2. compares it with the state of the previous transfer, which it remembers under a local name, `refs/atelier/sent`, that is never pushed;
3. writes one compressed file holding the files that changed and the list of files that were removed.

The first transfer for a site, and any transfer made with `pack.sh full`, holds every file of the site instead.

The session's own index and history are left untouched. The file is named `atelier@owner@repo.tgz`, and a short description inside it says which site it belongs to, which state it produces and which state it starts from.

## Transport: the Claude desktop app

Claude drops the file into Atelier's inbox folder on your computer, using the access to that folder you approved. No server, no tunnel and no account are involved, and GitHub does not see the file.

## Computer side: Atelier

Atelier is two scripts in the plugin.

**`mcp.mjs`** is the part the Claude desktop app starts, as a local connector. It starts the preview, restarts it if it stops, and gives Claude the `status` and `stop` tools. While it runs it refreshes a small heartbeat file.

**`engine.mjs`** is the preview. It:

- **keeps a copy of the site**, built only from the transfer files it receives;
- **applies each transfer**: it watches the inbox, waits until a file is complete, checks that it starts from the state it has, writes the changed files and removes the deleted ones. If it does not have the starting state, it says so and Claude sends a full copy;
- **runs the site**, as shown below;
- **serves the preview** at `http://localhost:3210` and passes requests to the site. In passing, it adds its badge to HTML pages and keeps the site's own live-reload connection working, which is why the page updates without a reload;
- **stops by itself** when the heartbeat file is no longer refreshed, that is, when Claude is closed.

| Project | Started with |
| --- | --- |
| Next.js | `next dev` |
| Any project with a `dev` script in `package.json` | That script |
| A folder without a `dev` script | Served as static files, with automatic reload |

Dependencies are installed with pnpm when the project uses it (a matching version is placed in Atelier's own folder), otherwise with npm. If the lockfile changes, they are installed again and the site restarts.

## Why not just push

Hosting providers build a preview for every push, and that works well for reviewing finished work. For the back-and-forth of design work it is slow: each look costs a commit, a push and a build, and the repository fills with half-finished states. Atelier keeps that loop off GitHub. You push once, when the result is right.
