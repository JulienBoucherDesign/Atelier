# How it works

Two sides: a short script in the cloud session, and Atelier on your computer. Between them, one small file carried by the Claude desktop app.

## Cloud side: packing the changes

After each change, Claude runs [`sync.sh`](https://github.com/JulienBoucherDesign/Atelier/blob/main/sync.sh) (the skill carries a copy). The script:

1. finds the starting point: the latest commit of the session's history that GitHub already knows;
2. records the full state of the working copy (modified, added and deleted files, local commits) in a temporary index. Ignored files stay ignored;
3. wraps that state in a commit under a local name, `refs/atelier/wip`, which is never pushed;
4. writes a git bundle holding only the difference between the starting point and that commit.

The session's own index and history are left untouched. The file is small: it holds the changes, not the site.

The file is named `preview@owner@repo.bundle`. The name tells Atelier which repository the changes belong to.

## Transport: the Claude desktop app

Claude drops the file into the `inbox` subfolder of the Atelier folder, using the access to that folder you approved. No server, no tunnel and no account are involved, and GitHub does not see the file.

If the desktop app cannot be reached, Claude can send the file in the conversation instead. Saved to your Downloads folder, it is picked up by Atelier just the same.

## Computer side: Atelier

`atelier.mjs` does four things.

**Keeps a copy of the site.** On the first transfer for a repository, it clones the repository from GitHub into `data/`, with the Git access already set up on your computer.

**Applies each transfer.** It watches `inbox`, waits until a file is complete, reads it into its copy of the repository and checks out the result. Only the files that changed are rewritten.

**Runs the site.**

| Project | Started with |
| --- | --- |
| Next.js | `next dev` |
| Any project with a `dev` script in `package.json` | That script |
| A folder without a `dev` script | Served as static files, with automatic reload |

Dependencies are installed with pnpm when the project uses it (a matching version is placed in Atelier's own folder), otherwise with npm. If the lockfile changes, they are installed again and the site restarts.

**Serves the preview.** Atelier listens on `http://localhost:3210` and passes requests to the site. In passing, it adds its badge to HTML pages and keeps the site's own live-reload connection working, which is why the page updates without a reload.

## Why not just push

Hosting providers build a preview for every push, and that works well for reviewing finished work. For the back-and-forth of design work it is slow: each look costs a commit, a push and a build, and the repository fills with half-finished states. Atelier keeps that loop off GitHub. You push once, when the result is right.
