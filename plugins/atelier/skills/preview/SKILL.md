---
name: preview
description: Live, interactive preview of a website on the user's own computer while Claude Code edits it in a cloud session, before anything is pushed to GitHub. Use when the user asks for changes to a site and wants to see them, or mentions Atelier or a local preview.
---

# Atelier: the real site on the user's computer, before any push

Use this in a cloud session when the user asks for changes to a website and wants to see them for real before anything goes to GitHub.

Atelier is part of this plugin. The Claude desktop app starts it on the user's computer; there is nothing for the user to launch. It keeps its own copy of the site, runs it, and serves it at `http://localhost:3210`. After each change you pack the state of your working copy into one transfer file and drop it into Atelier's inbox folder on that computer. Atelier applies it within a second and the open page updates by itself. Atelier never contacts GitHub or a hosting provider: the site's files only come from your transfer files.

## Rules

- **No `git commit`, `git push` or pull request** until the user explicitly asks for it, in whatever language they use. The pack script touches neither the index nor the history; it only keeps a local ref, `refs/atelier/sent`, which is never pushed.
- After **every** requested change, send the changes before you answer.
- Do not start a development server in the session for the preview: the site runs on the user's computer.
- On the user's computer, write only into Atelier's inbox folder. Never use computer use (mouse, keyboard, screenshots) for Atelier.

## Setup (once per session)

1. **Find Atelier's tools on the user's computer.** Search your tools for `atelier` (with ToolSearch if tools are deferred). The ones to use have a name that starts with `mcp__remote-devices__` and ends with `__status` and `__stop`. An Atelier tool *without* `remote-devices` in its name is a copy running inside the cloud session: it stays idle and answers `"where": "cloud session"`. Ignore it.
   If there is no Atelier tool on the computer, say so plainly: the Claude desktop app must be open on the user's computer with this conversation opened in it, and the Atelier plugin must be installed (Customize > Plugins). After installing, the app may need a restart. Stop there.
2. **Call `status`.** It starts the preview if needed and returns `inbox` (an absolute folder path on the user's computer), `separator` and `url`.
3. **Get access to the inbox.** If `mcp__remote-devices__get_device_info` does not list a connected folder that contains `inbox`, call `mcp__remote-devices__device_request_folder_access` with the parent folder of `inbox` and the reason "drop site changes for the Atelier preview". Ask once.
4. **Locate the pack script.** `pack.sh` sits next to this file. If you cannot read it there, write the copy at the end of this file, unchanged, to `/tmp/atelier-pack.sh`.

## After every change

1. Run `bash <path to>/pack.sh` from the repository. It prints `file=`, `name=`, `id=` and `kind=` (`full` the first time, then `delta`).
2. Call `mcp__remote-devices__device_commit_files` with `files: [{ "stagedPath": <file>, "devicePath": <inbox><separator><name> }]` and `force: true`. Keep the name as it is.
3. Call `status` with `wait_for: <id>`. Read the answer:
   - `applied_requested: true` and `status: "ready"`: the preview shows your changes.
   - `need_full: true`: the computer does not have the state your changes start from. Run `bash pack.sh full`, send that file the same way, and call `status` again.
   - `status` is `install` or `start`: the site is being prepared. The first time, installing its dependencies takes a few minutes. Tell the user, then call `status` with `wait_for` again until it is `ready`.
   - `status: "error"`: read `error` and `log`. If the code is at fault, fix it and send again. Otherwise explain what the computer is missing.
4. The first time, open `url` with the desktop app's built-in browser (`mcp__remote-devices__Claude_Browser__preview_start`) if you have it, so the page sits next to the conversation.
5. Answer in one or two sentences: what changed, and that the preview is up to date.

## When the user approves or rejects

- Push: commit with a clear message, then push the working branch. Open a pull request only if they ask for one.
- Undo: `git stash push -u` (recoverable), then pack and send again so the preview goes back.
- Stop the preview: call `stop`.

## When something fails

- The computer does not answer (app closed, computer asleep): say so plainly and keep working; send the changes when it is back.
- `device_commit_files` is refused: the inbox folder is not connected for this session. Ask for access as in the setup.
- Secrets the site needs to run (keys for its own services) are never in the repository. The user can put them in a file named `.env.local` in the parent folder of `inbox`; Atelier copies it into its copy of the site at each start. Never ask the user to paste a secret into the conversation.

## Script `pack.sh`

```bash
#!/usr/bin/env bash
# Packs the current state of the working copy into one transfer file for Atelier, without pushing anything
# to GitHub and without touching the index or the history.
#   bash pack.sh          the files changed since the last transfer (a full snapshot the first time)
#   bash pack.sh full     every file of the site
# Drop the resulting file, under the same name, into Atelier's inbox folder on the user's computer.
# Output folder: $ATELIER_OUT, or /mnt/user-data/outputs.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
top=$(pwd)
out="${ATELIER_OUT:-/mnt/user-data/outputs}"
mkdir -p "$out"

# The file name and the description tell Atelier which site this is: atelier@owner@repo.tgz
slug=$(git remote get-url origin | sed -E 's#\.git$##; s#/+$##' | awk -F'[/:]' '{print $(NF-1)"/"$NF}')
name="atelier@${slug%%/*}@${slug##*/}.tgz"

# Full state of the working copy (modified, added and deleted files, local commits), computed in a
# temporary index so the real one is left alone. Ignored files stay ignored.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$(git rev-parse --git-path index)" "$work/index" 2>/dev/null || true
GIT_INDEX_FILE="$work/index" git add -A
tree=$(GIT_INDEX_FILE="$work/index" git write-tree)

# What Atelier already has: the state of the previous transfer, kept under a local ref that is never pushed.
base=$(git rev-parse -q --verify 'refs/atelier/sent^{tree}' 2>/dev/null || true)
kind=delta
if [ "${1:-}" = full ] || [ -z "$base" ]; then kind=full; base=; fi

mkdir -p "$work/meta/.atelier"
: > "$work/files"; : > "$work/meta/.atelier/deleted"
if [ "$kind" = full ]; then
  git ls-tree -r -z "$tree" | while IFS= read -r -d '' entry; do
    case "$entry" in 160000*) continue ;; esac            # submodules are not followed
    printf '%s\0' "${entry#*$'\t'}"
  done > "$work/files"
else
  git diff --no-renames --name-only -z --diff-filter=ACMT "$base" "$tree" > "$work/files"
  git diff --no-renames --name-only -z --diff-filter=D "$base" "$tree" > "$work/meta/.atelier/deleted"
fi
changed=$(tr -cd '\0' < "$work/files" | wc -c | tr -d ' ')
removed=$(tr -cd '\0' < "$work/meta/.atelier/deleted" | wc -c | tr -d ' ')
if [ "$kind" = full ]; then label="full snapshot, $changed file(s)"
else label="$changed file(s) changed, $removed removed"; fi
printf 'repo=%s\nid=%s\nbase=%s\nkind=%s\nlabel=%s\n' "$slug" "$tree" "$base" "$kind" "$label" > "$work/meta/.atelier/transfer"

file="$out/$name"
tar --format=posix -czf "$file" -C "$work/meta" .atelier -C "$top" --no-recursion --null -T "$work/files"

# Remember what was sent (a commit object wrapping the tree, under refs/atelier/sent; local, never pushed).
export GIT_AUTHOR_NAME=atelier GIT_AUTHOR_EMAIL=atelier@local GIT_COMMITTER_NAME=atelier GIT_COMMITTER_EMAIL=atelier@local
git update-ref refs/atelier/sent "$(git commit-tree "$tree" -m "$label")"

echo "file=$file"
echo "name=$name"
echo "id=$tree"
echo "kind=$kind"
echo "changed_files=$changed"
echo "removed_files=$removed"
echo "bytes=$(wc -c < "$file" | tr -d ' ')"
```
