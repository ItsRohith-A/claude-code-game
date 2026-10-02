---
name: toolstorm
description: Launch TOOLSTORM, the arcade game fed by this session's tool calls, or install/remove its status-line HUD.
argument-hint: "[install | remove | status]"
disable-model-invocation: true
---

# TOOLSTORM

A terminal arcade shooter that runs in its own pane and is fed by this
session's real tool calls. Run the single command that matches the argument,
report what it printed, and stop. Do not explain the game at length unless
asked.

The plugin's CLI lives at `${CLAUDE_PLUGIN_ROOT}/dist/cli.js`. This session's
id is `${CLAUDE_SESSION_ID}`; always pass it, so the game attaches to this
session and not to another one open on the same machine.

## No argument — launch the game

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" launch --session "${CLAUDE_SESSION_ID}"
```

This splits the current pane (tmux, zellij, WezTerm, kitty, iTerm, Windows
Terminal) or opens a new window.

If the launcher cannot find a terminal, tell the user to run this themselves in
a spare pane:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" play --session "${CLAUDE_SESSION_ID}"
```

## `install` — add the score HUD to the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" install-statusline
```

A plugin cannot register a status line itself, so this writes a `statusLine`
entry into the user's `~/.claude/settings.json`. Any status line they already
had is saved, keeps running as the first row, and comes back on `remove`. Tell
the user the change takes effect after a restart.

If the command fails because the sandbox or a permission blocked the write,
do not retry it another way: tell the user to run it themselves by typing
`! node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" install-statusline`. If it reports
that settings.json could not be parsed, pass that on: nothing was changed.

## `remove` — undo the HUD

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" remove-statusline
```

The same sandbox advice applies.

## `status` — show the live game state

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" status --session "${CLAUDE_SESSION_ID}"
```

## Controls to pass on

The ship follows the mouse, and holding the left button fires; arrows or
`A`/`D` and `SPACE` work too. Right click or `P` pauses, `Q` quits, `R`
restarts after a game over. Add `--no-mouse` to the launch command for
keyboard only.
