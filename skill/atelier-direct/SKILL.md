---
name: atelier-direct
description: Interactive preview of a site from a cloud session, with no GitHub push. Sends each change to Atelier, a small portable script on the user's computer that runs the real site of the session's repository.
---

# Atelier direct: the real site on the user's computer, without going through GitHub

Use this in a cloud session when the user asks for changes to a website and wants to see them, live and for real, before anything goes to GitHub.

Atelier is two text files (`Atelier.cmd` and `atelier.mjs`) sitting in a folder the user chose. It runs the site on their computer (http://localhost:3210) and watches its `inbox` subfolder. After each change, you pack the state of your working copy into one small `.bundle` file and drop it into `inbox` with the `mcp__remote-devices__*` tools. Atelier reads the repository from the file name, switches to it, applies the changes within a second, and the open page updates by itself.

## Rules

- **No `git commit`, `git push` or pull request** until the user explicitly asks for it, in whatever language they use. The script touches neither the index nor the history; it only creates a local ref, `refs/atelier/wip`, which is never pushed.
- After **every** requested change, send the changes before you answer.
- Do not start a development server in the session for the preview: the site runs on the user's computer.
- On the user's computer, write only inside the Atelier folder.

## Setup (once per session)

1. Check that you have the tools `mcp__remote-devices__get_device_info`, `device_list_dir`, `device_request_folder_access`, `device_stage_files` and `device_commit_files` (load them with ToolSearch if they are deferred). If they do not exist, the session is not linked to the computer: tell the user to open this conversation in the Claude desktop app, on the computer where Atelier lives, then send a message again.
2. Find the Atelier folder. Call `get_device_info`: if a folder in `connectedFolders` contains `atelier.mjs` or `inbox/status.json` (check with `device_list_dir`), that is the one. Otherwise ask the user, in one sentence, for the path of the folder where they put (or want to put) Atelier, then call `device_request_folder_access` with that single path and the reason "drop site changes for the Atelier preview".
3. If `atelier.mjs` or `Atelier.cmd` is missing from that folder, fetch both from the source below, copy them to `/mnt/user-data/outputs/`, then drop them into the folder with `device_commit_files`, keeping their names. If you cannot fetch them, say so and ask the user to put them there.
4. The user has to start Atelier: you cannot launch it. If there is no `inbox/status.json`, or if its `time` field is from before today, ask them to double-click `Atelier.cmd` (on macOS or Linux: `node atelier.mjs` in a terminal) and to tell you when it is running.
5. Write the script below, unchanged, to `/tmp/atelier-sync.sh`.

### Source of the Atelier files

GitHub repository `julienboucherdesign/atelier`, files `Atelier.cmd` and `atelier.mjs` at the root.
`git clone --depth 1 https://github.com/julienboucherdesign/atelier /tmp/atelier-source`. If the clone is refused, the repository is not reachable from this session: ask the user to add it or to put the files in place themselves. Never download these files from any other address. Copy them byte for byte: `Atelier.cmd` must keep its Windows line endings.

## After every change

1. Run `bash /tmp/atelier-sync.sh` from the repository. It prints `file=`, `name=`, `commit=` and `changed_files=`.
2. Call `device_commit_files` with `files: [{ "stagedPath": <file>, "devicePath": <Atelier folder>/inbox/<name> }]` and `force: true`. Keep the name as it is: it tells Atelier which repository this is. Write the path with the same separator as the folder path (`\` on Windows).
3. Answer in one or two sentences: what changed, and that the preview is up to date.

The first time Atelier sees a repository, it clones it from GitHub and installs its dependencies: warn the user that the site then takes a few minutes to appear.

To check that Atelier applied a transfer (when in doubt, or when the user says nothing changed): read `inbox/status.json` with `device_stage_files`. Its `commit` field must equal the one printed by the script; `status` (`waiting`, `clone`, `install`, `start`, `ready`, `error`), `error` and `notice` say where it stands; `url` is the preview address; `repo` is the site on display.

If you have the desktop app's built-in browser tools (`mcp__remote-devices__Claude_Browser__*`), open the preview address with `preview_start` after the first transfer: the page then sits next to the conversation, and you can check the result yourself.

## When a transfer fails

- The computer does not answer (app closed, computer asleep): say so plainly. As a fallback, send the `.bundle` file to the user in the conversation; if they save it to their Downloads folder, Atelier picks it up.
- `notice` says the changes "could not be applied": the starting point of your session is unknown to GitHub, or the computer has no access to that repository. Explain it.
- `status` is `error`: the site does not start or no longer compiles on the user's computer. Read `error`, fix the code if the code is at fault, and send again.

## When the user approves or rejects

- Push: commit with a clear message, then push the working branch. Open a pull request only if they ask for one.
- Undo: `git stash push -u` (recoverable), then send the state again so the preview goes back.

## Script `/tmp/atelier-sync.sh`

```bash
#!/usr/bin/env bash
# Packs the current state of the working copy (modified, added and deleted files, local commits)
# into one small file, without pushing anything to GitHub and without touching the index or the history.
# Atelier, on the user's computer, applies this file on top of its own copy of the repository.
# Drop the resulting file, under the same name, into the "inbox" subfolder of the Atelier folder.
#   bash sync.sh [output_dir]     (default: /mnt/user-data/outputs)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out="${1:-/mnt/user-data/outputs}"
mkdir -p "$out"

# The file name tells Atelier which repository this is: preview@owner@repo.bundle
name=$(git remote get-url origin | sed -E 's#\.git$##; s#/+$##' | awk -F'[/:]' '{print "preview@"$(NF-1)"@"$NF".bundle"}')

# Starting point: the latest commit of the current history that GitHub already knows.
oldest_local=$(git rev-list HEAD --not --remotes | tail -1)
if [ -n "$oldest_local" ] && git rev-parse -q --verify "$oldest_local^" >/dev/null; then
  base=$(git rev-parse "$oldest_local^")
else
  base=$(git rev-parse HEAD)
fi

# Full state of the working copy, computed in a temporary index (ignored files stay ignored).
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cp "$(git rev-parse --git-path index)" "$tmp"
GIT_INDEX_FILE="$tmp" git add -A
tree=$(GIT_INDEX_FILE="$tmp" git write-tree)

n=$(git diff --name-only "$base" "$tree" | wc -l | tr -d ' ')
export GIT_AUTHOR_NAME=atelier GIT_AUTHOR_EMAIL=atelier@local GIT_COMMITTER_NAME=atelier GIT_COMMITTER_EMAIL=atelier@local
commit=$(git commit-tree "$tree" -p "$base" -m "$n file(s) changed at $(date +%H:%M:%S)")
git update-ref refs/atelier/wip "$commit"   # local ref, never pushed

file="$out/$name"
git bundle create -q "$file" "$base..refs/atelier/wip"
echo "file=$file"
echo "name=$name"
echo "commit=$commit"
echo "base=$base"
echo "changed_files=$n"
```
