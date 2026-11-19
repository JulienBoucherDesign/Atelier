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
