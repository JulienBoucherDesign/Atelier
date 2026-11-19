# Daily use

## The loop

1. Start Atelier and leave its console window open.
2. Open your Claude Code cloud session in the Claude desktop app, on the same computer.
3. Ask Claude for a change.
4. Look at `http://localhost:3210`. The page updates by itself, without a reload, a couple of seconds after Claude finishes.
5. Repeat until you are happy.
6. Tell Claude to push. Ask for a pull request if you want one.

Until step 6, nothing reaches GitHub: no commit, no branch, no pull request.

## Approve or undo

| You say | Claude does |
| --- | --- |
| Push it | Commits with a clear message and pushes the working branch |
| Open a pull request | Does the above, then opens the pull request |
| Undo that | Sets the changes aside (recoverable) and sends the previous state to Atelier, so the preview goes back |

## The badge

A badge at the bottom right of the previewed page shows what you are looking at.

| Badge | Meaning |
| --- | --- |
| `cloud session (not pushed)` | The current, unpushed state of the cloud session |
| A branch name | The state of that branch on GitHub |

Click the badge to switch to a GitHub branch for comparison, and back. The badge is added by Atelier in the preview only. It is not part of your site.

## Several sites

One copy of Atelier serves all your repositories. The name of each transfer file tells Atelier which repository it belongs to; when a file for another site arrives, Atelier switches to it. The first time it sees a repository, it clones it and installs its dependencies.

To keep Atelier on one site only, pin it in [`atelier.txt`](Settings).

## Without a cloud session

Started with a repository and no transfer, Atelier follows GitHub: it shows the most recently updated branch whose name starts with `claude/` (or the default branch if there is none), and updates when that branch changes. It checks every 2 seconds while there is activity and every 5 seconds when idle.

## Stopping

Close the console window, or press `Ctrl + C` in it. Atelier stops the site and leaves nothing running.
