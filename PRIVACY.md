# TOOLSTORM privacy policy

_Last updated: 3 October 2026_

TOOLSTORM is a game that runs on your own computer, inside your terminal, next
to Claude Code. This page explains what it reads, what it writes, and what it
sends.

## The short version

- **Nothing leaves your computer.** TOOLSTORM makes no network requests.
- **No personal data.** It does not collect names, email addresses, contact
  details, file contents, prompts or Claude's replies.
- **No accounts, no tracking, no analytics, no ads.**

## What it reads

- **Claude Code hook events** for your session: the name of each tool Claude
  uses (such as `Read` or `Edit`), whether it succeeded, and the tool's input,
  from which it keeps only a short label (see below).
- **Your status line input**, if you install the scoreboard: the model name,
  folder name, git branch, context usage and session cost, which Claude Code
  passes to every status line. It is shown on screen and not stored.
- **`~/.claude/settings.json`**, only when you run `/toolstorm install` or
  `/toolstorm remove`, to add or remove its `statusLine` entry.
- **Your keyboard and mouse input**, only in the game's own pane.

## What it stores, and where

Everything is kept on your computer in `~/.claude-arcade`
(`%USERPROFILE%\.claude-arcade` on Windows), readable only by your user
account:

| File | Contents |
| --- | --- |
| Session event logs | Game events: the tool name, plus a short label — a file name (`auth.ts`), the program a command ran (`npm test`, never its arguments), or a website's host name. Never file contents, query strings, search terms or patterns, or command arguments. |
| Game state | Score, wave, lives, bombs, mode and level, for the scoreboard. |
| Profile | Your level and experience points, totals such as runs played and enemies destroyed, unlocked trophies, your top ten scores per mode with their dates, daily bests and your chosen ship. |
| High score | Your best score. |
| Scoreboard backups | Only if you install the scoreboard: your previous status line, and a copy of your settings file from before the change, so it can be restored. |

Session files that have not been used for **7 days are deleted
automatically**, and an event log that grows past 1 MB starts over.

## What it sends

**Nothing.** TOOLSTORM does not connect to the internet or to any server. The
author receives no data of any kind.

## Removing your data

Run `/toolstorm remove` to remove the scoreboard, uninstall the plugin, then
delete the `~/.claude-arcade` folder. Nothing is kept anywhere else.

## Children

TOOLSTORM is a tool for Claude Code users and is not directed at children
under 18.

## Changes

Any change to this policy will be made in this file, in the project's public
repository, with the date above updated.

## Contact

Questions: open an issue at
<https://github.com/ItsRohith-A/claude-code-game/issues>.
