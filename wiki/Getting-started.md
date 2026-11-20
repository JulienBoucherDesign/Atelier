# Getting started

One thing to set up, once: the Atelier plugin in Claude.

## Requirements

| What | Why |
| --- | --- |
| Claude desktop app, open on your computer | It starts Atelier and carries the changes from the cloud session to your computer |
| A Claude Code cloud session on your site's repository, opened in that app | That is where Claude edits the site |
| Node.js 20 or later on your computer | Atelier is plain Node.js scripts, and your site's development server needs it too |

Git is not needed on your computer. Atelier needs no account.

## 1. Install the plugin

In the Claude desktop app:

1. Open **Customize > Plugins**.
2. Choose **Add > Add marketplace** and enter `JulienBoucherDesign/Atelier`.
3. Install the **atelier** plugin.
4. Restart the Claude desktop app if Atelier's tools do not show up in your next session.

The plugin is saved to your Claude account. It brings two things:

- a **skill**, which tells Claude Code what to do after each edit;
- a **local program**, which the Claude desktop app starts on your computer. On the plugin's page it is the connector marked **Runs in each session**.

From the Claude Code command line, the equivalent is `/plugin install atelier --marketplace JulienBoucherDesign/Atelier`.

A plugin from a marketplace you add yourself is not reviewed by Anthropic. Atelier is a few readable text files; read them before installing if you wish.

## 2. First run

1. Open your Claude Code cloud session in the Claude desktop app.
2. Ask for a change to your site, ask Claude to *use Atelier*, or paste the [starter prompt](Daily-use#starter-prompt).
3. Claude asks once for access to Atelier's inbox folder, a subfolder of your system's temporary folder. Approve it.
4. Claude sends a full copy of the site. Atelier installs the site's dependencies, which takes a few minutes, once per site.
5. The site appears at `http://localhost:3210`, in the browser panel next to the conversation.

You never launch anything yourself.

## Updating

Atelier updates from this repository. In **Customize > Plugins**, select **Check for updates** on the marketplace, or turn on **Sync automatically**.

## Removing

Remove the plugin from **Customize > Plugins**. Atelier's site copies live in Claude's own plugin data folder and in a temporary folder; see [Settings](Settings) for where.

Next: [Daily use](Daily-use).
