# Settings

Atelier works without any setting. This page is a reference.

## The Atelier folder

Atelier keeps everything it creates inside its own folder. Delete the folder to remove everything.

| Item | Created by | Purpose |
| --- | --- | --- |
| `Atelier.cmd` | You or Claude | Windows launcher: finds Node.js, then starts `atelier.mjs` |
| `atelier.mjs` | You or Claude | The program, a single Node.js script with no dependencies |
| `inbox/` | Atelier | Transfer files received from the cloud session, and `status.json` |
| `data/` | Atelier | Copies of the sites, their dependencies, the package manager, and portable Node.js if it was downloaded |
| `.env.local` | You, optional | Values the site needs to run. See below |
| `atelier.txt` | You, optional | Settings. See below |

## `atelier.txt`

A plain text file next to `atelier.mjs`, one setting per line. Lines starting with `#` are ignored.

| Setting | Default | Meaning |
| --- | --- | --- |
| `repo=` | none | Pin one repository, as `owner/name` or a GitHub address. Atelier then ignores transfers for other repositories |
| `branch=` | automatic | Follow this GitHub branch when no cloud session is sending changes |
| `prefix=` | `claude/` | In automatic mode, follow the most recently updated branch starting with this prefix |
| `port=` | `3210` | Port of the preview |

Example:

```
port=4000
repo=you/your-site
```

## Command-line options

The same settings can be given when starting Atelier by hand:

```
node atelier.mjs [repo] [--branch name] [--prefix claude/] [--port 3210] [--no-open]
```

`--no-open` keeps Atelier from opening the browser at start.

## `.env.local`

If the site needs values to run (addresses, keys for its own services), put them in a `.env.local` file in the Atelier folder. Atelier copies it into its copy of the site at each start.

This file stays on your computer. Atelier does not read its content, and never sends it anywhere. Do not commit it to any repository.

## `inbox/status.json`

Atelier writes its current state to this file. Claude reads it to check that a transfer was applied.

| Field | Meaning |
| --- | --- |
| `url` | Address of the preview |
| `repo` | Repository on display |
| `status` | `waiting`, `clone`, `install`, `start`, `ready` or `error` |
| `error` | The error text, when `status` is `error` |
| `showing` | What is displayed: the cloud session or a branch name |
| `commit` | Identifier of the state on display |
| `message` | Its description, for example the number of changed files |
| `notice` | A message for the user, for example when a transfer could not be applied |
| `time` | When the file was written |
| `version` | Atelier version |

## Environment variables

For unusual setups only.

| Variable | Meaning |
| --- | --- |
| `ATELIER_HOME` | Use another folder instead of `data/` |
| `ATELIER_INBOX` | Use another folder instead of `inbox/` |
| `ATELIER_REPO_BASE` | Clone from another base address instead of `https://github.com/` |
