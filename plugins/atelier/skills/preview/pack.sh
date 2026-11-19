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
