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
│        ●                        ▾            │  │ - Bash npm test
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
2. **Claude Code's TUI owns stdin in its own pane.** No plugin can see your
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
real work, and a crash in the game is invisible to your session.

## Install

Requires Node 18+ (uses nothing outside the standard library).

```bash
# 1. add this repo as a marketplace and install the plugin
/plugin marketplace add <your-github-user>/claude-code-game
/plugin install toolstorm

# 2. add the live score HUD to your status line
/toolstorm install

# 3. restart Claude Code, then play
/toolstorm
```

Step 2 is separate because a plugin **cannot** register a status line — Claude
Code only honours `agent` and `subagentStatusLine` from a plugin's settings. The
command writes a `statusLine` entry into your own `~/.claude/settings.json`, and
saves whatever was there before so `/toolstorm remove` can restore it.

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
| About to run a tool | `PreToolUse` | Telegraphed in the work log |
| `Edit`, `Write`, `NotebookEdit` | `PostToolUse` | **◆ bug** ×2 — 2 hp, 120 pts |
| `Read`, `Grep`, `Glob`, `LSP` | `PostToolUse` | **▾ scout** — fast, 1 hp, 50 pts |
| `WebFetch`, `WebSearch`, `Agent` | `PostToolUse` | **● probe** — 3 hp, shoots back, 240 pts |
| A test/build/lint command passes | `PostToolUse` | A **power-up** drops |
| Any other `Bash` command | `PostToolUse` | A scout |
| A tool fails | `PostToolUseFailure` | **You take a hit** |
| Claude needs permission or input | `Notification` | **Game pauses:** "CLAUDE NEEDS YOU" |
| Claude finishes the turn | `Stop` | **Wave clear**, +250 × wave bonus |

A command counts as verification when it mentions `test`, `build`, `lint`,
`tsc`, `pytest`, `cargo test`, `make`, and similar — see `VERIFICATION` in
`src/hook.ts`.

Power-ups: **S** shield (absorbs one hit), **W** spread shot, **R** rapid fire,
**+** extra life. You collect one by standing under it as it reaches the floor.

Enemies that reach the floor break through and cost a heart, so a long burst of
Claude edits genuinely raises the pressure.

## Controls

| Key | Action |
| --- | --- |
| `←` `→` or `A` `D` or `H` `L` | Move |
| `SPACE` or `↑` or `W` | Fire |
| `P` | Pause, and dismiss the "Claude needs you" banner |
| `R` | Restart after a game over |
| `Q` or `Ctrl+C` | Quit |

## Commands

```bash
/toolstorm                  # launch the game beside Claude
/toolstorm install          # add the score HUD to your status line
/toolstorm remove           # restore your previous status line
/toolstorm status           # print the live game state
```

Directly, without Claude:

```bash
node dist/cli.js launch     # split the pane / open a window
node dist/cli.js play       # run in the current terminal (good for tmux)
node dist/cli.js simulate   # fake tool calls, to try it with no session
node dist/cli.js play --ascii   # box-drawing-free fallback
```

To try it end to end with no Claude session at all, run `simulate` in one pane
and `play --session simulated-session` in another.

## Layout

```
src/
├── events.ts        the hook -> game contract, and tool classification
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
```

`dist/` is committed, because plugins are installed from a repo with no build
step. Run `npm run build` after changing anything in `src/`.

## Notes and limits

- **The game pane must be a real terminal pane.** On tmux and Windows Terminal
  the launcher splits your current window; elsewhere it opens a new one. If it
  cannot find a terminal, run `node dist/cli.js play` yourself in a spare pane.
- **The status-line HUD updates every 2 seconds** (`refreshInterval`), plus on
  every assistant message. Raise or lower it in `settings.json`.
- **Cost of running it.** Each hook is a short-lived Node process: about 100 ms
  of CPU, and two hooks fire per tool call (`PreToolUse` + `PostToolUse`). The
  HUD adds ~70 ms every 2 s. None of it is on the critical path, because every
  hook sets `async: true`, so your session never waits on the game. If you want
  it cheaper, delete the `PreToolUse` block from `hooks/hooks.json` — you lose
  only the "about to run" line in the work log.
- **Resizing the game pane mid-run does not resize the field.** The field is
  sized once at launch; restart the game to pick up a new size.
- **Attaching mid-session does not replay history** — you start from the next
  tool call, not from an hour of backlog.
- Unicode box-drawing and geometric glyphs are the default; pass `--ascii` (or
  set `CLAUDE_ARCADE_ASCII=1`) on terminals that render them badly.
- High scores live in `~/.claude-arcade/highscore.json`.
