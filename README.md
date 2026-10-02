# TOOLSTORM

A terminal arcade shooter for the minutes you spend watching Claude Code work.

It is not a distraction bolted onto your terminal — **Claude's actual tool calls
are the game**. Every file Claude edits spawns a bug to shoot. Every test that
passes drops a power-up. Every failing command costs you a heart. When Claude
needs your permission, the game pauses itself and says so.

```
TOOLSTORM │ live: 7f3a9c21                        ┌─ what Claude is doing
┌──────────────────────────────────────────────┐  │ CLAUDE'S WORK
│            ▾           ◆                     │  │ npm test passed
│                  ◆                           │  │ edit auth.ts -> bug
│        ●                        ▾            │  │ Bash needs approval
│                   │                          │  │ WebFetch -> probe
│             ▾          W                     │  │ you asked Claude to work
│                                              │  │
│                     ▲                        │  │
└──────────────────────────────────────────────┘  │
SCORE 014250  BEST 19100  WAVE 4  LIVES ♥♥♡  COMBO x7 (1.5x)
move ←/→  fire SPACE  pause P  quit Q
```

## Why it is built this way

Two constraints in Claude Code shape the whole design:

1. **Hooks cannot touch a terminal.** They run with no controlling terminal, so
   a hook can never draw a game or read a key.
2. **Claude Code's TUI owns stdin in its own pane.** No hook can see your
   keypresses there.

So the game runs as a **separate process in its own pane**, where it owns a real
keyboard. Hooks are only the event feed: each one appends a line to a per-session
JSONL log, and the game tails it. A small state file flows back the other way so
the **status line** can show a live scoreboard inside Claude's pane.

```
Claude Code ──hooks──> ~/.claude-arcade/sessions/<id>.jsonl ──tail──> game pane
                                      ▲                                   │
                  status line <───────┴──── <id>.state.json <─────────────┘
```

Every hook is registered `async: true`, so the game can never add latency to
real work, and a crash in the game is invisible to your session. When no game
is attached to the session, the hooks write nothing at all.

## Install

Requires Node 18+ (uses nothing outside the standard library).

```bash
# 1. add this repo as a marketplace and install the plugin
/plugin marketplace add ItsRohith-A/claude-code-game
/plugin install toolstorm

# 2. add the live score HUD to your status line
/toolstorm install

# 3. restart Claude Code, then play
/toolstorm
```

Step 2 is separate because a plugin **cannot** register a status line — Claude
Code only honours `agent` and `subagentStatusLine` from a plugin's settings. The
command writes a `statusLine` entry into your own `~/.claude/settings.json`:

- It points at a small shim in `~/.claude-arcade/`, not into the plugin's
  versioned install directory, so plugin updates do not break it.
- Any status line you already had is saved, **keeps running** as the first row,
  and comes back on `/toolstorm remove`.
- A copy of the whole file is kept in `~/.claude-arcade/settings-backup.json`.
- If `settings.json` is not valid JSON, nothing is written: the command tells
  you, and prints the entry to add by hand.

If Claude's sandbox blocks the write, run it yourself with
`! node <plugin-root>/dist/cli.js install-statusline`.

### Running from a clone instead

```bash
git clone <this repo> && cd claude-code-game
npm install && npm run build
claude --plugin-dir .
```

## How your work becomes the game

| What Claude does | Hook | In the game |
| --- | --- | --- |
| You submit a prompt | `UserPromptSubmit` | A new wave begins |
| `Edit`, `Write`, `NotebookEdit` | `PostToolUse` | **◆ bug** ×2 — 2 hp, 120 pts |
| `Read`, `Grep`, `Glob`, `LSP` | `PostToolUse` | **▾ scout** — fast, 1 hp, 50 pts |
| `WebFetch`, `WebSearch`, `Agent` | `PostToolUse` | **● probe** — 3 hp, shoots back, 240 pts |
| A test/build/lint command passes | `PostToolUse` | A **power-up** drops |
| Any other `Bash` command | `PostToolUse` | A scout |
| A tool fails | `PostToolUseFailure` | **You take a hit** (not when you pressed Esc) |
| Claude needs permission | `PermissionRequest` | **Game pauses:** "CLAUDE NEEDS YOU" |
| Claude is idle or asks a question | `Notification` | **Game pauses** |
| Claude finishes the turn | `Stop` | **Wave clear**, +250 × wave bonus |

A command counts as verification when one of its steps *starts with* a test,
build or lint runner — `npm test`, `pnpm run build`, `pytest`, `cargo test`,
`go test`, `tsc`, `make`, and similar. `cd web && npm test` counts;
`git commit -m "make it build"` does not. See `VERIFICATION` in `src/events.ts`.

The permission banner clears once the tool it was waiting on finishes, or once
Claude has clearly moved on.

Power-ups: **S** shield (absorbs one hit), **W** spread shot, **R** rapid fire,
**+** extra life. You collect one by standing under it as it reaches the floor.

Enemies that reach the floor break through and cost a heart, so a long burst of
Claude edits genuinely raises the pressure.

## Controls

| Key | Action |
| --- | --- |
| Mouse pointer, or `←` `→`, `A` `D`, `h` `l` | Move — the ship follows the pointer |
| Hold left click, or `SPACE` `↑` `W` | Fire — holding the button keeps firing |
| Right click or `P` | Pause, and dismiss the "Claude needs you" banner |
| `R` | Restart after a game over |
| `Q` or `Ctrl+C` | Quit |

## Commands

```bash
/toolstorm                  # launch the game beside Claude, attached to this session
/toolstorm install          # add the score HUD to your status line
/toolstorm remove           # restore your previous status line
/toolstorm status           # print the live game state
```

Directly, without Claude:

```bash
node dist/cli.js launch --session <id>   # split the pane / open a window
node dist/cli.js play --session <id>     # run in the current terminal
node dist/cli.js simulate   # fake tool calls, to try it with no session
node dist/cli.js play --ascii   # box-drawing-free fallback
node dist/cli.js play --no-mouse   # keyboard only
```

To try it end to end with no Claude session at all, run `simulate` in one pane
and `play --session simulated-session` in another.

## Layout

```
src/
├── events.ts        the hook -> game contract, tool and command classification
├── paths.ts         where state lives (~/.claude-arcade, or $CLAUDE_ARCADE_HOME)
├── bus.ts           append-only event log, incremental tailing reader
├── hook.ts          hook entrypoint: tool call -> game event
├── statusline.ts    the two-row in-pane HUD
├── cli.ts           launch / install / simulate
└── game/
    ├── engine.ts    the simulation, with no I/O in it
    ├── render.ts    engine state -> one ANSI frame
    ├── input.ts     raw-mode keyboard
    └── main.ts      the 24fps loop that ties them together
hooks/hooks.json     the eight async hooks that feed the game
skills/toolstorm/    the /toolstorm slash command
test/                node:test suites, run against dist/
```

`dist/` is committed, because plugins are installed from a repo with no build
step. Run `npm run build` after changing anything in `src/`, and `npm test`
before committing; CI checks that `dist/` matches the source.

## Notes and limits

- **The game pane must be a real terminal pane.** Inside tmux, zellij,
  WezTerm, kitty (with remote control on), iTerm or Windows Terminal the
  launcher splits your current window; elsewhere it opens a new one. If it
  cannot find a terminal, run `node dist/cli.js play` yourself in a spare pane.
- **The status-line HUD updates every 2 seconds** (`refreshInterval`), plus on
  every assistant message. Raise or lower it in `settings.json`.
- **Cost of running it.** Each hook is a short-lived Node process, about 100 ms
  of CPU, and one fires per tool call. With no game attached it reads one small
  file and exits without writing. The HUD adds ~70 ms every 2 s. None of it is
  on the critical path, because every hook sets `async: true`, so your session
  never waits on the game.
- **Resizing the game pane mid-run does not resize the field.** The field is
  sized once at launch and clipped if the pane shrinks; restart the game to
  pick up a new size.
- **What lands on disk.** The event log keeps file names, the program a command
  ran (`npm test`, never its arguments) and URL hosts. Never query strings,
  search terms or command arguments. Files are private to your user, and
  session files untouched for 7 days are deleted.
- **Attaching mid-session does not replay history** — you start from the next
  tool call, not from an hour of backlog.
- Unicode box-drawing and geometric glyphs are the default; pass `--ascii` (or
  set `CLAUDE_ARCADE_ASCII=1`) on terminals that render them badly.
- **Mouse control** uses SGR mouse reporting, which Windows Terminal, iTerm,
  kitty, WezTerm, Alacritty, GNOME Terminal and xterm all support. While the
  game runs, the pane's clicks go to the game instead of selecting text (hold
  `Shift` to select in most terminals). Pass `--no-mouse` or set
  `CLAUDE_ARCADE_MOUSE=0` to turn it off.
- High scores live in `~/.claude-arcade/highscore.json`.
