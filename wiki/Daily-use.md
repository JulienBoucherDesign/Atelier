# Daily use

## The loop

1. Open your Claude Code cloud session in the Claude desktop app, on the computer where the plugin is installed.
2. Ask Claude for a change.
3. Look at `http://localhost:3210`. The page updates by itself, without a reload, about a second after Claude sends the change.
4. Repeat until you are happy.
5. Tell Claude to push. Ask for a pull request if you want one.

Until step 5, nothing reaches GitHub: no commit, no branch, no pull request.

## Approve, undo, stop

| You say | Claude does |
| --- | --- |
| Push it | Commits with a clear message and pushes the working branch |
| Open a pull request | Does the above, then opens the pull request |
| Undo that | Sets the changes aside (recoverable) and sends the previous state to Atelier, so the preview goes back |
| Stop the preview | Stops Atelier. It starts again the next time Claude needs it |

## The badge

A badge at the bottom right of the previewed page reads `cloud session (not pushed)` and shows when the last change arrived. Click it to see what the last transfer contained and to reload the page.

The badge is added by Atelier in the preview only. It is not part of your site.

## Several sites

One install serves all your repositories. Each transfer says which repository it belongs to; when a transfer for another site arrives, Atelier switches to it. The first time it sees a site, it receives a full copy and installs its dependencies.

## When Claude is closed

Atelier runs only while the Claude desktop app is open. It stops by itself within two minutes after Claude closes. When Claude starts again, Atelier brings back the last site on display without a new transfer.
