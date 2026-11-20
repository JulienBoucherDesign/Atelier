# Daily use

## The loop

1. Open your Claude Code cloud session in the Claude desktop app, on the computer where the plugin is installed.
2. Ask Claude for a change.
3. Look at `http://localhost:3210`. The page updates by itself, without a reload, about a second after Claude sends the change.
4. Repeat until you are happy.
5. Tell Claude to push. Ask for a pull request if you want one.

Until step 5, nothing reaches GitHub: no commit, no branch, no pull request.

## Starter prompt

To start a new cloud session on any repository, paste this at the start of the conversation:

```
Use the atelier:preview skill to show this site as a live preview on my computer, without pushing anything to GitHub.

1. Call the Atelier "status" tool that runs on my computer (its name starts with mcp__remote-devices__ and ends with __status), then ask for access to the inbox folder if it is not connected yet.
2. Send a full copy of the site with pack.sh. Wait 5 seconds between the end of pack.sh and sending the file. Then call status with wait_for: if "seen" is not the id you just sent, send the same file again once.
3. Tell me while the dependencies install (a few minutes the first time for a new site), and call status again until it is "ready".
4. Open the address returned by status in the app's built-in browser, next to the conversation.
5. From then on, after every change I ask for, send the changes the same way, check they are applied and confirm it in one sentence.

Rules: no commit, push or pull request until I ask for it. Never use my computer's mouse, keyboard or screen. Never write a key or account details in a file or a message.
```

Good to know:

- **The session must be open in the Claude desktop app on the computer where Atelier is installed.** Otherwise Claude cannot see Atelier's tools.
- **If you do not see the preview**, press **Ctrl + Shift + B** (Cmd + Shift + B on macOS) to show the app's browser panel, or open `http://localhost:3210` in your usual browser.
- **The 5-second wait and the resend** work around a transfer that can arrive with the previous file's content when it is sent right after being written.

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
