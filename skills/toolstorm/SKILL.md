---
name: toolstorm
description: Launch TOOLSTORM, the arcade game fed by this session's tool calls, or install/remove its status-line HUD. Use for "play the game", "launch toolstorm", "install the game HUD".
argument-hint: "[install | remove | status]"
allowed-tools: [Bash]
---

# TOOLSTORM

A terminal arcade shooter that runs in its own pane and is fed by this
session's real tool calls. Run the single command that matches the argument,
report what it printed, and stop. Do not explain the game at length unless
asked.

The plugin's CLI lives at `${CLAUDE_PLUGIN_ROOT}/dist/cli.js`.

## No argument — launch the game

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" launch
```

This splits the current pane (tmux or Windows Terminal) or opens a new window.
Pass the session id explicitly if the CLI reports it found none:
`launch --session <session_id>`.

If the launcher cannot find a terminal, tell the user to run this themselves in
a spare pane:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" play
```

## `install` — add the score HUD to the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" install-statusline
```

A plugin cannot register a status line itself, so this writes a `statusLine`
entry into the user's `~/.claude/settings.json`. It saves any existing status
line first. Tell the user the change takes effect after a restart.

## `remove` — undo the HUD

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" remove-statusline
```

## `status` — show the live game state

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status
```

## Controls to pass on

Arrows or `A`/`D` move, `SPACE` fires, `P` pauses, `Q` quits, `R` restarts
after a game over.
