# TOOLSTORM

A terminal arcade shooter for the minutes you spend watching Claude Code work.

It is not a distraction bolted onto your terminal — **Claude's actual tool calls
are the game**. Every file Claude edits spawns a bug to shoot. Every test that
passes drops a power-up. Every failing command costs you a heart. Every fifth
turn brings a boss. When Claude needs your permission, the game pauses itself
and tells you.

```
TOOLSTORM │ STORM │ live: 7f3a9c21         LVL 4
┌── MERGE CONFLICT ███████████████████████░ ───┐ CLAUDE'S WORK
│                                              │ subagent joined as wingman
│   .              · ┃  ┃ · ┃          <<<|>>> │ npm test passed
│                       . .             \=|=/  │ edit auth.ts -> bug
│ <◉>                               ·          │ subagent -> CARRIER
│              ◆         ·    ·                │ BOSS: MERGE CONFLICT
│                     ┃ ┃  ┃                   │ you asked Claude to work
│  ▾                                    S      │ wave 4 clear +1000
│                       ▲  ◇                   │
└───────── ★ TROPHY: Warmed Up +75xp ──────────┘
SCORE 013740  BEST 19100  WAVE 5  LIVES ♥♥♡  BOMBS ✹··
FEVER ████░░  x13 4.0x  W██░░░  L█░░░░  D████░
move ←/→/mouse  fire SPACE/click  bomb B/middle  pause P  quit Q
```

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How to play](#how-to-play)
- [Modes](#modes)
- [Difficulty](#difficulty)
- [Progress, trophies and ships](#progress-trophies-and-ships)
- [The status-line scoreboard](#the-status-line-scoreboard)
- [Commands and options](#commands-and-options)
- [Try it without Claude](#try-it-without-claude)
- [Supported terminals](#supported-terminals)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)
- [Privacy and performance](#privacy-and-performance)
- [How it works](#how-it-works)
- [Development](#development)

## Features

- **Fed by real work.** Edits, new files, searches, commands, web fetches,
  subagents, tests and failures in your Claude Code session each become their
  own kind of enemy, power-up or hit.
- **Bosses.** Every fifth wave a named boss (MERGE CONFLICT, HEISENBUG, NULL
  POINTER and friends) sweeps in with its own attack patterns and an enraged
  second phase.
- **Four modes.** STORM (Claude-fed), ENDLESS (pure arcade waves), ZEN (no
  lives, just flow) and DAILY (one seed and one mutator per day for everyone).
- **Nine power-ups and bombs.** Shield, spread, rapid fire, piercing laser,
  magnet, time warp, a wingman drone, extra lives, and screen-clearing bombs.
- **Combos and fever.** Chain kills for up to a 5× multiplier; every 25 in a
  row sets off a fever that doubles your points.
- **Progress that sticks.** Earn XP and levels, unlock 7 ship designs, chase
  30 trophies and climb a top-ten board for each mode.
- **Plays beside Claude.** Opens in a split pane next to your session, so you
  can watch Claude's transcript and play at the same time.
- **Never in the way.** Every hook runs in the background: the game cannot slow
  Claude down, and if it crashes your session does not notice.
- **Pauses when you are needed.** A permission prompt or a question from Claude
  pauses the game with a "CLAUDE NEEDS YOU" banner.
- **Live scoreboard in Claude's pane.** An optional second status-line row
  shows score, wave, lives, bombs, boss alerts and your level, and keeps your
  existing status line.
- **Mouse and keyboard.** The ship follows your pointer and holding the button
  fires; arrow keys and WASD work too. Menus take the mouse and wheel as well.
- **No dependencies.** Plain Node.js, nothing to install beyond the plugin.

## Requirements

- **Claude Code** with plugin support.
- **Node.js 18 or newer** on your `PATH`. Check with `node --version`.
- **A terminal that can split panes or open windows.** See
  [Supported terminals](#supported-terminals). Any terminal works if you open a
  second pane yourself.
- Windows, macOS or Linux.

## Installation

### From the marketplace (recommended)

Run these inside Claude Code:

```
/plugin marketplace add ItsRohith-A/claude-code-game
/plugin install toolstorm@toolstorm
```

Or from your shell:

```bash
claude plugin marketplace add ItsRohith-A/claude-code-game
claude plugin install toolstorm@toolstorm
```

Then **restart Claude Code** so the plugin's hooks load.

### Add the scoreboard (optional)

```
/toolstorm install
```

This adds a scoreboard row under Claude's prompt. It edits your
`~/.claude/settings.json`, so it is a separate step you choose to take; see
[The status-line scoreboard](#the-status-line-scoreboard) for exactly what
changes. Restart Claude Code (or run `/statusline`) to see it.

### From a clone (for trying changes)

```bash
git clone https://github.com/ItsRohith-A/claude-code-game.git
cd claude-code-game
claude --plugin-dir .
```

`dist/` is committed, so no build step is needed. If you change anything in
`src/`, run `npm install && npm run build` first.

### Check that it worked

1. Start Claude Code and send any prompt.
2. Run `/toolstorm`. A pane opens with `TOOLSTORM │ live: <session>` in green at
   the top.
3. Ask Claude to read or edit a file. Enemies appear and the right-hand panel
   logs what Claude did.

If the title says `standalone (no Claude session attached)`, see
[Troubleshooting](#troubleshooting).

## Quick start

```
/toolstorm
```

That is all. The game opens beside Claude on its title menu, attached to this
session. Press `ENTER` to play **STORM**, keep working with Claude as usual,
and shoot what its work spawns. Press `Q` to quit; your progress is saved.

To skip the menu, name a mode: `/toolstorm endless`, `/toolstorm zen` or
`/toolstorm daily`. To set the difficulty, add `easy`, `medium` or `hard`,
e.g. `/toolstorm endless hard`.

> **Tip:** the game only reacts to tool calls made *after* it starts. It never
> replays what Claude did earlier in the session.

## How to play

### Controls

| Input | Action |
| --- | --- |
| Move the mouse, or `←` `→`, `A` `D`, `h` `l` | Move. The ship follows the pointer. |
| Hold left click, or `SPACE`, `↑`, `W` | Fire. Holding the button keeps firing. |
| `B` or middle click | Drop a bomb |
| Right click or `P` | Pause / resume, and dismiss the "Claude needs you" banner |
| `M` | Back to the menu, from the pause or game-over screen |
| `R` | Play again after a game over |
| `Q` or `Ctrl+C` | Quit |

In menus: `↑` `↓` (or `W` `S`, the mouse, the wheel) to choose, `ENTER`,
`SPACE` or a click to select, `M` or `Backspace` to go back.

The game pane must have focus for input: click it, or switch to it with your
terminal's pane shortcut.

### What Claude's work turns into

| When Claude… | In the game |
| --- | --- |
| starts work on your prompt | A new wave begins; every fifth one brings a **boss** |
| edits a file (`Edit`, `NotebookEdit`) | **◆ bug** ×2 — weaves as it falls, 2 hits, 120 pts |
| writes a new file (`Write`) | **✚ splitter** — 2 hits, breaks into two scouts, 150 pts |
| reads or searches (`Read`, `Grep`, `Glob`, `LSP`) | **▾ scout** — fast, 1 hit, 50 pts |
| runs a command that is not a test | **◣ diver** — banks toward your ship, 90 pts |
| fetches or searches the web, or calls an MCP tool | **● probe** — 3 hits, shoots back, 240 pts |
| launches a subagent (`Agent`) | **<◉> carrier** — 10 hits, launches scouts, 600 pts |
| runs a test, build or lint command that passes | A **power-up** drops |
| hears back from a subagent | A **wingman drone** flies with you for 15 s |
| compacts its context | A **supply drop**: one free bomb |
| hits an error in a tool | **You take a hit** |
| needs your permission or asks you something | **Game pauses:** "CLAUDE NEEDS YOU" |
| finishes the turn | **Wave clear**: 250 × the wave number, plus a bonus if you were not hit |

Some details:

- **What counts as a test.** A command earns a power-up when one of its steps
  *starts with* a test, build or lint runner: `npm test`, `pnpm run build`,
  `yarn lint`, `pytest`, `cargo test`, `go test`, `tsc`, `make`, `gradle`,
  `mvn`, `dotnet test` and similar. `cd web && npm test` counts.
  `git commit -m "make it build"` does not.
- **Pressing Esc on Claude costs nothing.** Interrupting a tool is not a
  failure.
- **The pause banner clears by itself** once Claude continues after your
  answer. You can also dismiss it with `P` or a right click.
- **When Claude is idle**, enemies keep trickling in, and after a quiet spell
  whole formations fly in, so the game is never empty.

### Bosses

Every fifth wave a boss drops in from the top and sweeps side to side. Its
health bar sits in the top border. Each boss mixes two attacks (bullet fans,
aimed bursts, bullet rain, or summoning scouts) and gets faster and angrier
under half health. Bombs take 15% of a boss's health. A beaten boss drops two
power-ups and a bomb.

The bosses, in order: MERGE CONFLICT, HEISENBUG, NULL POINTER, INFINITE LOOP,
DEPENDENCY HELL and LEGACY MONOLITH. Each one is tougher than the last.

### Power-ups

Catch a power-up by being under it when it reaches the floor. Passing tests
drop them, any kill has a small chance to, and carriers and bosses are
generous.

| Pickup | Effect |
| --- | --- |
| **S** shield | Absorbs the next hit (10 s) |
| **W** spread | Fires three shots in a fan (12 s) |
| **R** rapid | Fires much faster (12 s) |
| **L** laser | Shots pierce through every enemy in their path (8 s) |
| **M** magnet | Pulls power-ups to you, and faster (15 s) |
| **T** time warp | Enemies and their bullets slow to under half speed (6 s) |
| **D** wingman | A drone beside you fires on its own (15 s) |
| **B** bomb | One more bomb, up to 3 |
| **+** life | One extra heart, or 500 points if you are full |

### Bombs

You start each run with one bomb and can carry three. A bomb destroys every
enemy and enemy bullet on screen, scoring each kill, and hits a boss hard.

### Scoring and losing

- You have **3 hearts**. You lose one when you are shot, rammed, when an enemy
  reaches the floor, or when one of Claude's tools fails.
- After a hit you blink and are briefly invulnerable.
- **Combo:** kills in quick succession build a combo. Every 5 kills in a combo
  add ×0.5 to the points per kill, up to ×5. Getting hit resets it.
- **Fever:** every 25 kills in a combo set off fever: double points and rapid
  fire for 8 seconds, and the screen goes rainbow.
- **Perfect waves** (no hits taken) earn a bonus on top of the wave bonus.
- Each wave makes enemies a little faster, up to a cap, so long sessions stay
  playable.
- At game over the run is saved to your profile; press `R` to go again or `M`
  for the menu.

## Modes

| Mode | What it is |
| --- | --- |
| **STORM** | The original. Claude's tool calls spawn the enemies and its turns are the waves. |
| **ENDLESS** | Pure arcade: the game builds its own waves, with a boss every fifth. Claude's work still adds enemies on top. |
| **ZEN** | No lives to lose: a hit only breaks your combo. Claude-fed, for relaxed play. |
| **DAILY** | One seed and one **mutator** per day, the same for everyone, with its own board. Claude's work does not touch it, so runs are fair. |

Today's mutator is on the title menu. The six are HYPERDRIVE (40% faster),
GLASS CANNON (one life, double points), SWARM (more enemies), BULLET HELL
(enemies fire twice as often), POWER SURGE (power-ups everywhere) and TITANS
(enemies take twice the hits). Riskier mutators pay more points.

## Difficulty

Pick **EASY**, **MEDIUM** or **HARD** on the title menu (the DIFFICULTY row;
`←` `→`, `ENTER` or a click switch it). It is saved, and applies to STORM,
ENDLESS and ZEN. DAILY is always MEDIUM, so everyone's daily scores compare.

| | Hearts | Enemies | Enemy fire | Power-ups | Points |
| --- | --- | --- | --- | --- | --- |
| **EASY** | 5 | 25% slower, fewer | about half as often | 60% more | ×0.6 |
| **MEDIUM** | 3 | standard | standard | standard | ×1 |
| **HARD** | 2 | 30% faster, more, tougher | 60% more often | 30% fewer | ×1.6 |

The points multiplier keeps one high-score board fair across all three; the
board shows which difficulty each run was played on.

## Progress, trophies and ships

Every run earns **XP**: from your score, kills, bosses beaten and waves
cleared, plus a bonus for each trophy. XP raises your **level**, shown on the
title screen, in the game's top bar and on the scoreboard.

- **Trophies.** 30 achievements, from *First Blood* to *Hall of Fame*
  (150,000 points in one run). Some depend on Claude: *Green Build* (three
  passing test runs in one game), *Pair Programming* (a subagent's wingman),
  *Compact Delivery* (a bomb from context compaction) and *Watchful Eye*
  (250 of Claude's tool calls watched). They pop up in the bottom border as you
  earn them. See them all under **TROPHIES**.
- **Ships.** Levels unlock new ship designs in the **HANGAR**: Pioneer,
  Trident, Comet, Omega, Phantom, the colour-cycling Prism and Spark.
- **Boards.** Each mode keeps its top ten runs under **SCORES**, and the game
  over screen tells you where a run placed.

## The status-line scoreboard

`/toolstorm install` adds a row under Claude's prompt:

```
[Opus] │ my-project │ main │ ████░░░░░░ 42% │ $1.23
TOOLSTORM │ STORM │ 014250 │ wave 5 │ ♥♥♡ │ ✹✹ │ BOSS MERGE CONFLICT │ combo x7 │ lvl 4
```

- **Row 1** is your existing status line if you had one; it keeps running
  unchanged. If you had none, it shows model, folder, git branch, context use
  and cost.
- **Row 2** is the live game: mode, score, wave, hearts, bombs, the boss on
  screen, combo or fever, your level, and alerts such as
  `PAUSED - you are needed here`. With no game open it shows your best score
  and a hint to play.
- It refreshes every 2 seconds.

**What install changes.** It sets one key, `statusLine`, in
`~/.claude/settings.json`, pointing at `~/.claude-arcade/toolstorm-statusline.js`.
Before writing it:

- saves your previous status line, so `/toolstorm remove` can restore it;
- saves a copy of the whole file to `~/.claude-arcade/settings-backup.json`;
- refuses to write anything if your `settings.json` is not valid JSON, and
  prints the entry so you can add it by hand.

**To undo it:** `/toolstorm remove`, then restart Claude Code. Your previous
status line comes back exactly as it was.

## Commands and options

### Inside Claude Code

| Command | What it does |
| --- | --- |
| `/toolstorm` | Open the game beside Claude, attached to this session |
| `/toolstorm endless` | The same, straight into a mode: `storm`, `endless`, `zen` or `daily` |
| `/toolstorm hard` | Set the difficulty (`easy`, `medium`, `hard`) and launch; combine as `/toolstorm endless hard` |
| `/toolstorm install` | Add the scoreboard to your status line |
| `/toolstorm remove` | Remove the scoreboard and restore your old status line |
| `/toolstorm status` | Print the live game state |

Only you can run these: Claude does not open the game or change your settings
on its own. If another plugin also has a `toolstorm` command, use the full name
`/toolstorm:toolstorm`.

### From a shell

The CLI is `dist/cli.js` inside the plugin. For a marketplace install it lives
under `~/.claude/plugins/cache/toolstorm/toolstorm/<version>/`.

```bash
node dist/cli.js launch   [--session <id>] [--mode <m>] [--difficulty <d>] [--ascii] [--no-mouse] [--bell]   # open beside you
node dist/cli.js play     [--session <id>] [--mode <m>] [--difficulty <d>] [--ascii] [--no-mouse] [--bell]   # play in this terminal
node dist/cli.js install-statusline                                  # add the scoreboard
node dist/cli.js remove-statusline                                   # remove it
node dist/cli.js status   [--session <id>]                           # print game state
node dist/cli.js simulate [--session <id>]                           # fake tool calls
```

Without `--session`, the CLI uses the Claude session that most recently
received a prompt.

| Flag | Effect |
| --- | --- |
| `--session <id>` | Attach to this Claude Code session |
| `--mode <m>` | Skip the menu: `storm`, `endless`, `zen` or `daily` |
| `--difficulty <d>` | `easy`, `medium` or `hard`; saved for later runs |
| `--bell` | Ring the terminal bell when you are hit or a boss arrives |
| `--ascii` | Plain ASCII art, for terminals that draw box characters badly |
| `--no-mouse` | Keyboard only; clicks in the pane select text as usual |

### Environment variables

| Variable | Effect |
| --- | --- |
| `CLAUDE_ARCADE_ASCII=1` | Same as `--ascii` |
| `CLAUDE_ARCADE_MOUSE=0` | Same as `--no-mouse` |
| `CLAUDE_ARCADE_BELL=1` | Same as `--bell` |
| `CLAUDE_ARCADE_HOME=<dir>` | Keep game data somewhere other than `~/.claude-arcade` |

## Try it without Claude

You can play with fake tool calls, without using any tokens. Open two terminal
panes in the plugin folder:

```bash
# pane 1: pretend to be Claude
node dist/cli.js simulate

# pane 2: play
node dist/cli.js play --session simulated-session
```

## Supported terminals

`/toolstorm` puts the game next to Claude in the best way it can find:

| Where Claude is running | What happens |
| --- | --- |
| tmux | Splits the current window |
| zellij | Opens a pane to the right |
| WezTerm | Splits the current pane |
| kitty | Splits the window (needs `allow_remote_control yes` in `kitty.conf`) |
| Windows Terminal | Splits the current tab |
| iTerm2 (macOS) | Splits the current session |
| Terminal.app (macOS) | Opens a new window |
| Other Windows consoles, e.g. the VS Code terminal | Opens a new console window |
| Linux desktops | Opens a new terminal window (`x-terminal-emulator`, GNOME Terminal, Konsole, Alacritty, xterm) |

If none of these apply, open a second pane yourself and run
`node dist/cli.js play` there; it attaches to your most recent session.

The game sizes its field for each run. If you resize its pane, the next run
(after a game over, or from the menu) uses the new size.

## Updating

```bash
claude plugin update toolstorm@toolstorm
```

Then restart Claude Code. Automatic updates are off by default for this
marketplace; to turn them on, open `/plugin`, go to the marketplaces list and
enable auto-update for `toolstorm`. If you installed the scoreboard, it keeps working
across updates; there is nothing to reinstall.

## Uninstalling

1. Remove the scoreboard first, so your old status line is restored:
   ```
   /toolstorm remove
   ```
2. Uninstall the plugin:
   ```
   /plugin uninstall toolstorm@toolstorm
   ```
3. Optionally delete the game's data folder, which holds your scores and progress:
   `~/.claude-arcade` (on Windows, `%USERPROFILE%\.claude-arcade`).

## Troubleshooting

**The title says "standalone (no Claude session attached)".**
The game could not tell which session to follow. Send Claude a prompt first,
then run `/toolstorm` again. From a shell, pass the id with
`--session <id>`.

**Nothing happens in the game when Claude works.**
- Restart Claude Code after installing: hooks only load at startup.
- Check the plugin is enabled in `/plugin`.
- Make sure `node` works from the shell Claude Code starts in.
- The game only sees tool calls made after it opened.

**`/toolstorm` says it could not find a terminal.**
Open a second pane or window yourself and run the command it printed.

**Windows Terminal opened the game in a different window.**
The split is only used when Claude runs inside Windows Terminal itself. From
other terminals, such as VS Code's, you get a separate console window.

**kitty opened a new window instead of a split.**
Add `allow_remote_control yes` to `kitty.conf` and restart kitty.

**The game shows boxes or question marks instead of shapes.**
Use `--ascii`, or set `CLAUDE_ARCADE_ASCII=1`.

**I can't select text in the game pane.**
Mouse control takes over clicks in that pane. Hold `Shift` while selecting
(most terminals), or start the game with `--no-mouse`.

**The terminal prints odd characters when I click after the game exits.**
The game turns mouse reporting off on exit, but a forced kill can skip that.
Run `reset` (macOS/Linux) or open a new tab.

**`/toolstorm install` failed.**
- *"Left your settings untouched"*: your `~/.claude/settings.json` is not valid
  JSON. Fix it (often a trailing comma), or add the printed entry by hand.
  Nothing was changed.
- A permission or sandbox error: run it from Claude's prompt with `!` so it
  runs as you:
  `! node ~/.claude/plugins/cache/toolstorm/toolstorm/<version>/dist/cli.js install-statusline`

**The scoreboard row doesn't appear.**
Restart Claude Code or run `/statusline`. Check that `statusLine` in
`~/.claude/settings.json` points at `toolstorm-statusline.js`.

**The scoreboard says "paused — /toolstorm to resume".**
The game pane was closed or frozen. Run `/toolstorm` to open it again.

## Privacy and performance

**What is stored.** Everything stays on your machine in `~/.claude-arcade`:

| File | Contents |
| --- | --- |
| `sessions/<id>.jsonl` | Game events for a session: the tool name, a file name, the program a command ran (`npm test`, never its arguments) or a web host. Never query strings, search terms or patterns, file contents or command arguments. |
| `sessions/<id>.state.json` | Score, wave and lives, for the scoreboard |
| `profile.json` | Your level and XP, run totals, trophies, top-ten boards, daily bests, chosen ship and difficulty |
| `highscore.json` | Your best score (from before 0.3, still kept up to date) |
| `current-session`, `plugin-dist` | Which session and plugin version are current |
| `toolstorm-statusline.js`, `statusline-backup.json`, `settings-backup.json` | Only if you installed the scoreboard |

Files are readable only by your user. Session files untouched for 7 days are
deleted automatically, and an event log over 1 MB starts over. Nothing is sent
over the network.

The full policy is in [PRIVACY.md](PRIVACY.md).

**What it costs.** Each tool call starts one short background Node process,
about 100 ms of CPU. When no game is open it reads one small file and exits
without writing. The scoreboard adds about 70 ms every 2 seconds. None of it
runs on Claude's critical path, so your session never waits on the game.

## How it works

Two facts about Claude Code shape the design:

1. **Hooks have no terminal.** They run in the background, so a hook can never
   draw a game or read a key.
2. **Claude Code's interface owns the keyboard in its own pane.** A hook never
   sees your keypresses there.

So the game runs as a **separate process in its own pane**, where it owns a real
keyboard and mouse. Hooks are only the event feed: each one appends a line to a
per-session log, and the game reads new lines 30 times a second. A small state
file flows back the other way, so the status line can show the score inside
Claude's pane.

```
Claude Code ──hooks──> ~/.claude-arcade/sessions/<id>.jsonl ──tail──> game pane
                                      ▲                                   │
                  status line <───────┴──── <id>.state.json <─────────────┘
```

| Hook | Becomes |
| --- | --- |
| `SessionStart` | New run; clean up old sessions |
| `UserPromptSubmit` | Wave starts |
| `PostToolUse` | Enemy or power-up, by tool |
| `PostToolUseFailure` | Hit (unless you interrupted) |
| `PermissionRequest` | Pause until that tool call finishes |
| `Notification` | Pause when Claude is idle or asks a question |
| `Stop` | Wave clear |
| `SubagentStop` | Wingman drone |
| `PreCompact` | Supply drop: a free bomb |
| `SessionEnd` | Run ends |

## Development

```bash
npm install        # TypeScript and Node types; the plugin itself has no dependencies
npm run build      # compile src/ to dist/
npm test           # build, then run the test suites
npm run watch      # rebuild on save
claude --plugin-dir .   # load your working copy in Claude Code
```

```
src/
├── events.ts        the hook -> game contract, tool and command classification
├── paths.ts         where state lives (~/.claude-arcade, or $CLAUDE_ARCADE_HOME)
├── bus.ts           append-only event log, incremental tailing reader
├── profile.ts       XP, levels, boards and trophies, kept in profile.json
├── hook.ts          hook entrypoint: tool call -> game event
├── statusline.ts    the two-row in-pane scoreboard
├── cli.ts           launch / install / simulate
└── game/
    ├── content.ts   enemies, power-ups, bosses, modes, mutators, ships
    ├── engine.ts    the simulation, with no I/O in it
    ├── achievements.ts  the 30 trophies, as pure rules
    ├── app.ts       screens, runs and the profile, frame by frame
    ├── grid.ts      the character grid every frame is drawn into
    ├── render.ts    a run -> one ANSI frame
    ├── screens.ts   title menu, hangar, trophies, high scores
    ├── input.ts     raw-mode keyboard and SGR mouse decoding
    └── main.ts      the 30 fps loop that ties them together
hooks/hooks.json     the ten async hooks that feed the game
skills/toolstorm/    the /toolstorm command
test/                node:test suites, run against dist/
```

- **Commit `dist/`.** Plugins install straight from the repository with no
  build step. CI fails if `dist/` does not match `src/`.
- **Bump `version`** in `.claude-plugin/plugin.json` (and `package.json`) for
  every release. Installed copies stay on the old version until it changes.
- Validate the manifests with `claude plugin validate --strict .`.

## License

MIT — see [LICENSE](LICENSE). Free to use, copy and change, as long as the
copyright notice stays with the code.
