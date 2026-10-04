/**
 * Everything drawn outside a run: the title menu, the hangar of ship skins,
 * the trophy cabinet and the leaderboards.
 */
import { ACHIEVEMENTS } from "./achievements";
import { DIFFICULTIES, MODES, RAINBOW, SKINS, difficultySpec, type ModeId, type MutatorSpec } from "./content";
import type { Star } from "./engine";
import { clip, makeGrid, put, putBar, putCentered, putText, serialize, type Grid } from "./grid";
import { themeFor } from "./render";
import { bestScore, levelFor, type Profile } from "../profile";

export type Screen = "title" | "game" | "hangar" | "trophies" | "scores";

export type TitleItem = ModeId | "difficulty" | "hangar" | "trophies" | "scores" | "quit";
export const TITLE_ITEMS: TitleItem[] = [
  "storm",
  "endless",
  "zen",
  "daily",
  "difficulty",
  "hangar",
  "trophies",
  "scores",
  "quit",
];

export interface MenuView {
  screen: Exclude<Screen, "game">;
  columns: number;
  rows: number;
  ascii: boolean;
  mouse: boolean;
  clock: number;
  stars: Star[];
  attached: boolean;
  sessionLabel: string;
  profile: Profile;
  cursor: number;
  listCursor: number;
  daily: MutatorSpec;
  dailyBest: number;
  notice: string;
}

/** The terminal row (0-based) of the first ship in the hangar. */
export const HANGAR_TOP = 4;

const LOGO_FONT: Record<string, string[]> = {
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  O: [" ### ", "#   #", "#   #", "#   #", " ### "],
  L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  S: [" ####", "#    ", " ### ", "    #", "#### "],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
};
const LOGO_WORD = "TOOLSTORM";
const LOGO_WIDTH = LOGO_WORD.length * 6 - 1;
const LOGO_ROWS = 5;

function useBigLogo(columns: number, rows: number): boolean {
  return columns >= LOGO_WIDTH + 4 && rows >= 24;
}

/** The terminal row (0-based) of the first title menu item, for mouse hover. */
export function titleMenuTop(columns: number, rows: number): number {
  return useBigLogo(columns, rows) ? 2 + LOGO_ROWS + 3 : 5;
}

function drawStars(grid: Grid, view: MenuView): void {
  const glyph = themeFor(view.ascii).star;
  for (const s of view.stars) {
    put(grid, Math.round(s.x), Math.round(s.y), s.speed > 4 ? "." : glyph, "dim");
  }
}

function footer(grid: Grid, view: MenuView, text: string): void {
  putCentered(grid, view.rows - 1, text, "dim");
}

export function renderMenu(view: MenuView): string {
  const grid = makeGrid(view.columns, view.rows);
  drawStars(grid, view);
  switch (view.screen) {
    case "title":
      drawTitle(grid, view);
      break;
    case "hangar":
      drawHangar(grid, view);
      break;
    case "trophies":
      drawTrophies(grid, view);
      break;
    case "scores":
      drawScores(grid, view);
      break;
  }
  return serialize(grid, view.columns, view.rows);
}

function drawLogo(grid: Grid, view: MenuView): number {
  if (!useBigLogo(view.columns, view.rows)) {
    putCentered(grid, 1, "T O O L S T O R M", "bold");
    putCentered(grid, 2, "an arcade shooter fueled by Claude's tool calls", "dim");
    return 3;
  }
  const left = Math.floor((view.columns - LOGO_WIDTH) / 2);
  const block = view.ascii ? "#" : "█";
  for (let row = 0; row < LOGO_ROWS; row++) {
    for (let i = 0; i < LOGO_WORD.length; i++) {
      const letter = LOGO_FONT[LOGO_WORD[i] ?? "T"] ?? [];
      const bits = letter[row] ?? "";
      // A colour wave rolls across the letters.
      const color = RAINBOW[Math.floor(view.clock * 4 + i * 0.6 + row * 0.2) % RAINBOW.length] ?? "cyan";
      for (let b = 0; b < bits.length; b++) {
        if (bits[b] === "#") put(grid, left + i * 6 + b, 2 + row, block, color);
      }
    }
  }
  putCentered(grid, 2 + LOGO_ROWS + 1, "an arcade shooter fueled by Claude's tool calls", "dim");
  return 2 + LOGO_ROWS + 2;
}

function itemBlurb(item: TitleItem, view: MenuView): string {
  const p = view.profile;
  switch (item) {
    case "storm":
      return view.attached ? `fed live by session ${view.sessionLabel}` : "no session attached: it runs on its own";
    case "daily":
      return `today: ${view.daily.name} - ${view.daily.blurb}${view.dailyBest ? ` (best ${view.dailyBest})` : ""}`;
    case "difficulty":
      return difficultySpec(p.difficulty).blurb;
    case "hangar":
      return `ship: ${SKINS.find((s) => s.id === p.skin)?.name ?? "Pioneer"}`;
    case "trophies":
      return `${Object.keys(p.achievements).length}/${ACHIEVEMENTS.length} unlocked`;
    case "scores":
      return `best ${bestScore(p)}`;
    case "quit":
      return "back to work";
    default:
      return MODES.find((m) => m.id === item)?.blurb ?? "";
  }
}

function drawTitle(grid: Grid, view: MenuView): void {
  drawLogo(grid, view);
  const top = titleMenuTop(view.columns, view.rows);
  const blockWidth = Math.min(view.columns - 2, 64);
  const left = Math.max(1, Math.floor((view.columns - blockWidth) / 2));
  const pointer = view.ascii ? ">" : "▸";

  TITLE_ITEMS.forEach((item, i) => {
    const y = top + i;
    const selected = i === view.cursor;
    putText(grid, left, y, selected ? pointer : " ", "yellow");
    if (item === "difficulty") {
      drawDifficulty(grid, view, left + 2, y, selected);
      putText(grid, left + 25, y, clip(itemBlurb(item, view), blockWidth - 25), selected ? "white" : "dim");
      return;
    }
    putText(grid, left + 2, y, item.toUpperCase(), selected ? "yellow" : i < 4 ? "white" : "cyan");
    putText(grid, left + 12, y, clip(itemBlurb(item, view), blockWidth - 12), selected ? "white" : "dim");
  });

  // The player's progress, under the menu.
  const p = view.profile;
  const lvl = levelFor(p.xp);
  const y = top + TITLE_ITEMS.length + 1;
  if (y < view.rows - 1) {
    const theme = themeFor(view.ascii);
    const label = `LVL ${lvl.level}`;
    putText(grid, left + 2, y, label, "cyan");
    putBar(grid, left + 3 + label.length, y, 12, lvl.into / lvl.needed, "cyan", theme.barFull, theme.barEmpty);
    putText(grid, left + 16 + label.length, y, `${lvl.into}/${lvl.needed} XP   runs ${p.totals.runs}   kills ${p.totals.kills}`, "dim");
  }
  footer(
    grid,
    view,
    view.mouse
      ? "↑/↓ or mouse choose   ←/→ difficulty   ENTER/SPACE/click select   Q quit"
      : "↑/↓ choose   ←/→ difficulty   ENTER/SPACE select   Q quit",
  );
}

/** `EASY MEDIUM HARD` with the chosen one lit, like a switch. */
function drawDifficulty(grid: Grid, view: MenuView, x: number, y: number, selected: boolean): void {
  const colors: Record<string, string> = { easy: "green", medium: "yellow", hard: "red" };
  let cx = x;
  for (const d of DIFFICULTIES) {
    const on = d.id === view.profile.difficulty;
    const color = on ? (colors[d.id] ?? "white") : selected ? "white" : "dim";
    putText(grid, cx, y, on ? `[${d.name}]` : ` ${d.name} `, color);
    cx += d.name.length + 2;
  }
}

function drawHangar(grid: Grid, view: MenuView): void {
  putCentered(grid, 1, "HANGAR", "bold");
  const level = levelFor(view.profile.xp).level;
  putCentered(grid, 2, `level ${level} - new ships unlock as you level up`, "dim");
  const left = Math.max(1, Math.floor((view.columns - 46) / 2));
  SKINS.forEach((skin, i) => {
    const y = HANGAR_TOP + i;
    const selected = i === view.listCursor;
    const unlocked = level >= skin.level;
    const equipped = view.profile.skin === skin.id;
    const color = skin.color === "rainbow" ? (RAINBOW[Math.floor(view.clock * 8) % RAINBOW.length] ?? "green") : skin.color;
    putText(grid, left, y, selected ? (view.ascii ? ">" : "▸") : " ", "yellow");
    putText(grid, left + 2, y, unlocked ? (view.ascii ? skin.ascii : skin.glyph) : "?", unlocked ? color : "dim");
    putText(grid, left + 5, y, skin.name.padEnd(10), unlocked ? (selected ? "yellow" : "white") : "dim");
    const status = equipped ? "equipped" : unlocked ? "ready" : `unlocks at level ${skin.level}`;
    putText(grid, left + 17, y, status, equipped ? "green" : unlocked ? "cyan" : "dim");
  });
  if (view.notice) putCentered(grid, HANGAR_TOP + SKINS.length + 1, view.notice, "yellow");
  footer(grid, view, "↑/↓ choose   ENTER equip   M or BACKSPACE back");
}

/** How many trophy rows fit on screen. */
export function trophyRows(rows: number): number {
  return Math.max(3, rows - 5);
}

function drawTrophies(grid: Grid, view: MenuView): void {
  const unlocked = view.profile.achievements;
  putCentered(grid, 1, `TROPHIES  ${Object.keys(unlocked).length}/${ACHIEVEMENTS.length}`, "bold");
  const visible = trophyRows(view.rows);
  const start = Math.max(0, Math.min(view.listCursor, ACHIEVEMENTS.length - visible));
  const width = Math.min(view.columns - 2, 70);
  const left = Math.max(1, Math.floor((view.columns - width) / 2));
  ACHIEVEMENTS.slice(start, start + visible).forEach((a, i) => {
    const y = 3 + i;
    const got = !!unlocked[a.id];
    putText(grid, left, y, got ? (view.ascii ? "*" : "★") : view.ascii ? "." : "·", got ? "yellow" : "dim");
    putText(grid, left + 2, y, a.name.padEnd(18), got ? "white" : "dim");
    putText(grid, left + 21, y, clip(a.text, width - 31), got ? "white" : "dim");
    putText(grid, left + width - 8, y, `+${a.xp}xp`, got ? "green" : "dim");
  });
  if (start + visible < ACHIEVEMENTS.length) putCentered(grid, 3 + visible, "more below", "dim");
  footer(grid, view, "↑/↓ scroll   M or BACKSPACE back");
}

function drawScores(grid: Grid, view: MenuView): void {
  putCentered(grid, 1, "HIGH SCORES", "bold");
  const mode = MODES[view.listCursor % MODES.length] ?? MODES[0];
  if (!mode) return;
  const tabs = MODES.map((m) => (m.id === mode.id ? `[${m.name}]` : ` ${m.name} `)).join("  ");
  putCentered(grid, 2, tabs, "cyan");
  const width = 58;
  const left = Math.max(1, Math.floor((view.columns - width) / 2));
  putText(grid, left, 4, "  #     SCORE   WAVE   KILLS   COMBO   DATE   LEVEL", "dim");
  const board = view.profile.boards[mode.id];
  if (board.length === 0) putCentered(grid, 6, "no runs yet - go set one", "dim");
  board.forEach((r, i) => {
    const date = r.at ? new Date(r.at).toISOString().slice(5, 10) : "";
    const row =
      `${String(i + 1).padStart(3)}  ${String(r.score).padStart(8)}  ${String(r.wave).padStart(5)}  ` +
      `${String(r.kills).padStart(6)}  ${String(r.maxCombo).padStart(6)}   ${date.padEnd(5)}  ` +
      (r.difficulty ? difficultySpec(r.difficulty).name : "");
    putText(grid, left, 5 + i, row, i === 0 ? "yellow" : "white");
  });
  if (mode.id === "daily") {
    putCentered(grid, 16, `today: ${view.daily.name}   your best today: ${view.dailyBest}`, "magenta");
  }
  footer(grid, view, "←/→ mode   M or BACKSPACE back");
}
