# Settings

Atelier works without any setting. This page is a reference.

## Where Atelier keeps its files

| Folder | Content | Location |
| --- | --- | --- |
| Inbox | The latest transfer file for each site, and `status.json` | `atelier/inbox` inside the system's temporary folder. On Windows: `%TEMP%\atelier\inbox` |
| Data | Copies of the sites, their dependencies, the package manager, the log | The data folder Claude gives the plugin, inside Claude's own folder |

Claude is given access to the inbox only. It never writes into the data folder.

If Claude provides no data folder, Atelier uses `%LOCALAPPDATA%\Atelier` on Windows, `~/Library/Caches/Atelier` on macOS, and `~/.cache/atelier` on Linux.

Both folders can be deleted at any time while Claude is closed. Atelier asks for a full copy of the site again.

## Secrets the site needs: `.env.local`

If the site needs values to run (addresses, keys for its own services), put them in a file named `.env.local` in the `atelier` folder next to the inbox (on Windows: `%TEMP%\atelier\.env.local`). To use different values per site, name the file `owner-repo.env.local`.

Atelier copies the file into its copy of the site each time the site starts. The file stays on your computer: Atelier does not read its content and never sends it anywhere. Do not paste secrets into a conversation, and do not commit this file to any repository.

The system may empty its temporary folder from time to time; keep the original of that file somewhere safe.

## The port

The preview uses port 3210, or the next free one up to 3229. The address is returned by the `status` tool and written in `status.json`. To start from another port, set the environment variable `ATELIER_PORT` before starting Claude.

## The tools Claude uses

| Tool | What it does |
| --- | --- |
| `status` | Starts the preview if needed and returns its state. With `wait_for`, waits until a given transfer is applied |
| `stop` | Stops the preview until the next `status` call |

Fields returned by `status`, also written to `inbox/status.json`:

| Field | Meaning |
| --- | --- |
| `url` | Address of the preview |
| `inbox` | Folder where transfer files must be dropped |
| `repo` | Site on display |
| `status` | `waiting`, `install`, `start`, `ready` or `error` |
| `error` | The error text, when `status` is `error` |
| `id` | Identifier of the transfer on display |
| `label` | What that transfer contained, for example `2 file(s) changed, 1 removed` |
| `need_full` | `true` when Atelier needs a full copy of the site before it can apply changes |
| `notice` | A message for the user |
| `log` | The last lines of Atelier's log, when something is not ready |

## Environment variables

For unusual setups only.

| Variable | Meaning |
| --- | --- |
| `ATELIER_PORT` | First port to try instead of 3210 |
| `ATELIER_DATA` | Use another data folder |
| `ATELIER_INBOX` | Use another inbox folder |
