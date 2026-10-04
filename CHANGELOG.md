# Changelog

## 0.3.0 — 2026-10-03

The big one: TOOLSTORM grows from a single endless field into a full arcade
game with modes, bosses and progress that carries between sessions.

### New

- **Title menu** with an animated logo, mouse hover and wheel support. A
  click only acts on the row it lands on, so focusing the pane opens nothing.
- **Four modes:** STORM (Claude-fed, as before), ENDLESS (built-in waves),
  ZEN (no lives) and DAILY (one seed and mutator a day, its own board).
  `/toolstorm endless|zen|daily` skips the menu.
- **Six daily mutators:** Hyperdrive, Glass Cannon, Swarm, Bullet Hell, Power
  Surge and Titans.
- **Bosses** every fifth wave, six of them, each with two attack patterns and
  an enraged second phase. The health bar is drawn in the top border.
- **New enemies, each from a different kind of work:** splitters (`Write`),
  divers that hunt the ship (commands that are not tests), carriers that launch
  scouts (`Agent`). MCP tool calls now send probes.
- **Five new power-ups:** piercing laser, magnet, time warp, wingman drone,
  and bombs. Kills now have a small chance to drop one too.
- **Bombs** (`B` or middle click): clear the screen, hurt bosses.
- **Fever:** every 25-kill combo doubles points for 8 seconds.
- **Perfect-wave bonus** for clearing a wave without being hit.
- **Two new hooks:** a finished subagent (`SubagentStop`) sends a wingman, and
  context compaction (`PreCompact`) sends a free bomb.
- **Progress:** XP and levels, 30 trophies with in-game toasts, a top-ten board
  per mode, daily bests and a run summary at game over.
- **Hangar** of seven ship designs, unlocked by level.
- **Difficulty:** EASY (5 hearts, slower, more drops, ×0.6 points), MEDIUM and
  HARD (2 hearts, faster and tougher enemies, ×1.6 points), chosen on the title
  menu or with `/toolstorm easy|medium|hard`, and saved. DAILY is always
  MEDIUM.
- **Look and feel:** a scrolling starfield, score popups, bigger explosions,
  screen shake, bomb flash, rainbow fever and ship exhaust. 30 fps.
- **Status line** shows the mode, bombs, the boss on screen, fever and your
  level, and "on the title screen" while you are in the menu.
- `--bell` (or `CLAUDE_ARCADE_BELL=1`) rings the terminal bell on hits and
  bosses.

### Fixed

- Grep and Glob search patterns were written to the event log as labels, which
  the privacy policy says never happens. They are no longer kept.
- A turn finishing while the game-over screen was up still added a wave bonus
  to the finished run, and that inflated score could be saved as the best.
- Enemy speed grew without limit with every Claude turn, so long sessions
  became unplayable. It is now capped.
- Tool calls during game over queued enemies for nobody.
- Resizing the pane did nothing until a restart; each new run now uses the
  current size.

### Changed

- `Write` now spawns a splitter instead of two bugs, and `Agent` a carrier
  instead of three probes.
- Up arrow and `W` still fire in a run, and move the cursor in menus.
- The old `highscore.json` is carried onto the STORM board the first time the
  new profile is created.

## 0.2.3

- Privacy policy and support link.
