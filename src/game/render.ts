import { ENEMY_SPECS, POWERUP_SPECS, RAINBOW, TIMED_POWERUPS, type SkinSpec } from "./content";
import { MAX_BOMBS, type Engine, type Enemy } from "./engine";
import { clip, makeGrid, put, putBar, putCentered, putText, serialize, textWidth, type Grid } from "./grid";

export { colorCode, paint } from "./grid";

/** Turns engine state into one ANSI string per frame. */

export interface Theme {
  player: string;
  wingman: string;
  bullet: string;
  laser: string;
  enemyBullet: string;
  star: string;
  hLine: string;
  vLine: string;
  tl: string;
  tr: string;
  bl: string;
  br: string;
  heart: string;
  emptyHeart: string;
  bomb: string;
  barFull: string;
  barEmpty: string;
  left: string;
  right: string;
}

const UNICODE: Theme = {
  player: "▲",
  wingman: "◇",
  bullet: "│",
  laser: "┃",
  enemyBullet: "•",
  star: "·",
  hLine: "─",
  vLine: "│",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  heart: "♥",
  emptyHeart: "♡",
  bomb: "✹",
  barFull: "█",
  barEmpty: "░",
  left: "←",
  right: "→",
};

const ASCII: Theme = {
  player: "A",
  wingman: "o",
  bullet: "|",
  laser: "!",
  enemyBullet: "*",
  star: ".",
  hLine: "-",
  vLine: "|",
  tl: "+",
  tr: "+",
  bl: "+",
  br: "+",
  heart: "*",
  emptyHeart: "-",
  bomb: "@",
  barFull: "#",
  barEmpty: ".",
  left: "A",
  right: "D",
};

export function themeFor(ascii: boolean): Theme {
  return ascii ? ASCII : UNICODE;
}

const PANEL_WIDTH = 28;
/** Below this terminal width the work log moves under the field. */
const PANEL_MIN_TERMINAL = 76;

/** What the game-over screen reports, filled in once the run is recorded. */
export interface RunSummary {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  accuracy: number;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  rank: number;
  newDailyBest: boolean;
  achievements: string[];
}

export interface RenderOptions {
  columns: number;
  rows: number;
  ascii: boolean;
  sessionLabel: string;
  attached: boolean;
  /** Best score on this mode's board before the run. */
  highScore: number;
  mouse: boolean;
  level: number;
  skin: SkinSpec;
  summary: RunSummary | null;
}

export function pickFieldSize(columns: number, rows: number): { width: number; height: number } {
  const panel = columns >= PANEL_MIN_TERMINAL ? PANEL_WIDTH + 1 : 0;
  // Reserve: title + 2 border rows + 3 HUD rows.
  const chromeRows = 6;
  const width = clamp(columns - panel - 2, 28, 100);
  const height = clamp(rows - chromeRows, 12, 34);
  return { width, height };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function enemyGlyph(theme: Theme, e: Enemy): string {
  const spec = ENEMY_SPECS[e.type];
  return theme === ASCII ? spec.ascii : spec.glyph;
}

function skinColor(skin: SkinSpec, clock: number): string {
  return skin.color === "rainbow" ? (RAINBOW[Math.floor(clock * 8) % RAINBOW.length] ?? "green") : skin.color;
}

export function renderFrame(engine: Engine, opts: RenderOptions): string {
  const theme = themeFor(opts.ascii);
  const showPanel = opts.columns >= PANEL_MIN_TERMINAL;

  const boxWidth = engine.width + 2;
  const totalWidth = boxWidth + (showPanel ? PANEL_WIDTH + 1 : 0);
  const totalHeight = 1 + engine.height + 2 + 3;
  const grid = makeGrid(totalWidth, totalHeight);
  const fever = engine.feverTime > 0;
  const pulse = RAINBOW[Math.floor(engine.clock * 10) % RAINBOW.length] ?? "magenta";

  // ---- title -------------------------------------------------------------
  const title = "TOOLSTORM";
  putText(grid, 0, 0, title, "bold");
  putText(grid, title.length + 1, 0, theme.vLine, "dim");
  let tx = title.length + 3;
  const modeTag = engine.mutator.name
    ? `${engine.mode.name}: ${engine.mutator.name}`
    : `${engine.mode.name} ${engine.difficulty.name}`;
  putText(grid, tx, 0, modeTag, "yellow");
  tx += textWidth(modeTag) + 1;
  putText(grid, tx, 0, theme.vLine, "dim");
  tx += 2;
  const subtitle = opts.attached ? `live: ${opts.sessionLabel}` : "standalone";
  putText(grid, tx, 0, subtitle, opts.attached ? "green" : "dim");
  const lvl = `LVL ${opts.level}`;
  // On a narrow pane the level gives way rather than overwrite the mode.
  if (tx + textWidth(subtitle) + 1 < boxWidth - lvl.length) putText(grid, boxWidth - lvl.length, 0, lvl, "cyan");

  // ---- field box ---------------------------------------------------------
  const boxTop = 1;
  const fieldTop = boxTop + 1;
  const boxBottom = fieldTop + engine.height;
  const flash = engine.flashTime > 0;
  const borderColor = flash ? "yellow" : engine.shakeTime > 0 ? "red" : fever ? pulse : "dim";
  put(grid, 0, boxTop, theme.tl, borderColor);
  put(grid, boxWidth - 1, boxTop, theme.tr, borderColor);
  put(grid, 0, boxBottom, theme.bl, borderColor);
  put(grid, boxWidth - 1, boxBottom, theme.br, borderColor);
  for (let x = 1; x < boxWidth - 1; x++) {
    put(grid, x, boxTop, theme.hLine, borderColor);
    put(grid, x, boxBottom, theme.hLine, borderColor);
  }
  for (let y = fieldTop; y < boxBottom; y++) {
    put(grid, 0, y, theme.vLine, borderColor);
    put(grid, boxWidth - 1, y, theme.vLine, borderColor);
  }

  // Shake nudges the whole field a cell sideways.
  const shake = engine.shakeTime > 0 ? (Math.floor(engine.clock * 30) % 2 === 0 ? 1 : -1) : 0;
  const fx = (x: number) => 1 + Math.round(x) + shake;
  const fy = (y: number) => fieldTop + Math.round(y);
  /** Draw inside the field only: anything above or beside it is clipped. */
  const field = (x: number, y: number, ch: string, color: string) => {
    const gx = fx(x);
    const gy = fy(y);
    if (gx < 1 || gx > engine.width || gy < fieldTop || gy >= boxBottom) return;
    put(grid, gx, gy, ch, color);
  };
  const fieldText = (x: number, y: number, text: string, color: string) => {
    let i = 0;
    for (const ch of text) field(x + i++, y, ch, color);
  };

  // ---- field contents ----------------------------------------------------
  for (const s of engine.stars) {
    field(s.x, s.y, s.speed > 4 ? "." : theme.star, s.speed > 4.5 && fever ? pulse : "dim");
  }
  if (flash) {
    for (let y = 0; y < engine.height; y++) {
      for (let x = 0; x < engine.width; x++) {
        if ((x * 7 + y * 13 + Math.floor(engine.clock * 20)) % 6 === 0) field(x, y, "*", y % 2 ? "yellow" : "white");
      }
    }
  }
  for (const p of engine.particles) field(p.x, p.y, p.glyph, p.color);
  for (const b of engine.bullets) {
    field(b.x, b.y, b.pierce ? theme.laser : theme.bullet, b.ally ? "cyan" : b.pierce ? "magenta" : fever ? pulse : "white");
  }
  for (const b of engine.enemyBullets) field(b.x, b.y, theme.enemyBullet, "red");
  for (const p of engine.powerups) {
    const spec = POWERUP_SPECS[p.type];
    const blink = Math.floor(engine.clock * 6) % 2 === 0;
    field(p.x, p.y, spec.letter, blink ? spec.color : "white");
  }
  for (const e of engine.enemies) drawEnemy(e, theme, field, fieldText);
  for (const p of engine.popups) fieldText(p.x - Math.floor(p.text.length / 2), p.y, p.text, p.color);

  // Player: blink while invulnerable, show a bracket when shielded.
  const playerRow = engine.height - 2;
  const blinkOff = engine.invulnTime > 0 && Math.floor(engine.invulnTime * 10) % 2 === 0;
  if (!blinkOff) {
    const glyph = opts.ascii ? opts.skin.ascii : opts.skin.glyph;
    field(engine.playerX, playerRow, glyph, fever ? pulse : skinColor(opts.skin, engine.clock));
    if (engine.timers.shield > 0) {
      field(engine.playerX - 1, playerRow, "(", "cyan");
      field(engine.playerX + 1, playerRow, ")", "cyan");
    }
    // A flicker of exhaust under the ship.
    if (Math.floor(engine.clock * 12) % 2 === 0) field(engine.playerX, playerRow + 1, "'", fever ? pulse : "yellow");
  }
  if (engine.timers.wingman > 0) field(engine.wingmanX(), playerRow, theme.wingman, "cyan");

  // ---- boss bar, in the top border ---------------------------------------
  const boss = engine.boss();
  if (boss?.boss) {
    const name = ` ${boss.boss.spec.name} `;
    const barWidth = Math.max(6, Math.min(30, engine.width - name.length - 6));
    const start = 1 + Math.max(1, Math.floor((engine.width - name.length - barWidth - 1) / 2));
    putText(grid, start, boxTop, name, boss.boss.spec.color);
    putBar(grid, start + name.length, boxTop, barWidth, boss.hp / boss.maxHp, "red", theme.barFull, theme.barEmpty);
    put(grid, start + name.length + barWidth, boxTop, " ", "");
  }

  // ---- toast, in the bottom border ---------------------------------------
  const toast = engine.toasts[0];
  if (toast) {
    const text = clip(` ★ ${toast.title}: ${toast.text} `, engine.width - 2);
    putCentered(grid, boxBottom, opts.ascii ? text.replace("★", "*") : text, toast.color, 1, engine.width);
  }

  // ---- overlays ----------------------------------------------------------
  const lines = overlayLines(engine, opts);
  if (lines) {
    overlay(grid, fieldTop, engine.height, boxWidth, lines);
  } else if (engine.bannerTime > 0 && engine.bannerText) {
    const y = fieldTop + Math.floor(engine.height / 2);
    putCentered(grid, y, engine.bannerText, fever ? pulse : "yellow", 1, engine.width);
  }

  // ---- HUD ---------------------------------------------------------------
  const hud1 = boxBottom + 1;
  let cursor = 0;
  cursor = putSeg(grid, cursor, hud1, "SCORE", String(engine.score).padStart(6, "0"), "white");
  cursor = putSeg(grid, cursor, hud1, "BEST", String(Math.max(opts.highScore, engine.score)), "dim");
  cursor = putSeg(grid, cursor, hud1, "WAVE", String(engine.wave), "cyan");

  putText(grid, cursor, hud1, "LIVES", "dim");
  cursor += 6;
  if (engine.mode.invincible) {
    putText(grid, cursor, hud1, "ZEN", "green");
    cursor += 4;
  } else {
    for (let i = 0; i < engine.maxLives; i++) {
      const alive = i < engine.lives;
      put(grid, cursor + i, hud1, alive ? theme.heart : theme.emptyHeart, alive ? "red" : "dim");
    }
    cursor += engine.maxLives + 1;
  }
  putText(grid, cursor + 1, hud1, "BOMBS", "dim");
  cursor += 7;
  for (let i = 0; i < MAX_BOMBS; i++) {
    put(grid, cursor + i, hud1, i < engine.bombs ? theme.bomb : theme.star, i < engine.bombs ? "red" : "dim");
  }

  // Combo, fever and the power-up timers.
  const hud2 = boxBottom + 2;
  let px = 0;
  if (fever) {
    putText(grid, px, hud2, "FEVER", pulse);
    putBar(grid, px + 6, hud2, 6, engine.feverTime / 8, pulse, theme.barFull, theme.barEmpty);
    px += 14;
  }
  if (engine.combo >= 2) {
    const text = `x${engine.combo} ${engine.multiplier().toFixed(1)}x`;
    putText(grid, px, hud2, text, "yellow");
    px += text.length + 2;
  }
  for (const type of TIMED_POWERUPS) {
    const left = engine.timers[type];
    if (left <= 0) continue;
    const spec = POWERUP_SPECS[type];
    putText(grid, px, hud2, spec.letter, spec.color);
    putBar(grid, px + 1, hud2, 5, left / spec.duration, spec.color, theme.barFull, theme.barEmpty);
    px += 8;
  }

  const move = `${theme.left}/${theme.right}`;
  putText(
    grid,
    0,
    boxBottom + 3,
    opts.mouse
      ? `move ${move}/mouse  fire SPACE/click  bomb B/middle  pause P  quit Q`
      : `move ${move}  fire SPACE  bomb B  pause P  quit Q`,
    "dim",
  );

  // ---- side panel: what Claude is actually doing -------------------------
  if (showPanel) {
    const px0 = boxWidth + 1;
    putText(grid, px0, boxTop, "CLAUDE'S WORK", "bold");
    const log = engine.log.slice(-(engine.height - 1)).reverse();
    for (let i = 0; i < log.length; i++) {
      const line = log[i];
      if (!line) continue;
      const y = fieldTop + i;
      if (y >= boxBottom) break;
      putText(grid, px0, y, clip(line.text, PANEL_WIDTH), line.color || "white");
    }
  }

  return serialize(grid, opts.columns, opts.rows);
}

function drawEnemy(
  e: Enemy,
  theme: Theme,
  field: (x: number, y: number, ch: string, color: string) => void,
  fieldText: (x: number, y: number, text: string, color: string) => void,
): void {
  const hurt = e.hitFlash > 0;
  const spec = ENEMY_SPECS[e.type];
  if (e.boss) {
    const color = hurt ? "white" : e.hp < e.maxHp / 2 && Math.floor(e.age * 6) % 2 === 0 ? "yellow" : e.boss.spec.color;
    fieldText(e.x - 3, e.y, e.boss.spec.sprite[0], color);
    fieldText(e.x - 3, e.y + 1, e.boss.spec.sprite[1], color);
    return;
  }
  const glyph = enemyGlyph(theme, e);
  const width = [...glyph].length;
  fieldText(e.x - Math.floor(width / 2), e.y, glyph, hurt ? "white" : spec.color);
  // Damaged multi-hit enemies carry a pip so you can see what is nearly dead.
  if (e.maxHp > 1 && e.hp < e.maxHp) field(e.x + Math.ceil(width / 2), e.y, String(Math.min(9, e.hp)), "dim");
}

function overlayLines(engine: Engine, opts: RenderOptions): Array<{ text: string; color: string }> | null {
  const s = engine.stats;
  if (engine.status === "attention") {
    return [
      { text: "CLAUDE NEEDS YOU", color: "yellow" },
      { text: engine.attentionNote.slice(0, engine.width - 4), color: "white" },
      { text: "", color: "" },
      { text: "switch to Claude, then press P here", color: "dim" },
    ];
  }
  if (engine.status === "paused") {
    return [
      { text: "PAUSED", color: "cyan" },
      { text: `score ${engine.score}  wave ${engine.wave}  kills ${s.kills}`, color: "white" },
      { text: "", color: "" },
      { text: "P resume   M menu   Q quit", color: "dim" },
    ];
  }
  if (engine.status !== "gameover") return null;

  const sum = opts.summary;
  const lines: Array<{ text: string; color: string }> = [{ text: "GAME OVER", color: "red" }];
  const best = engine.score > opts.highScore && engine.score > 0;
  lines.push({ text: `score ${engine.score}`, color: "white" });
  if (best) lines.push({ text: "NEW HIGH SCORE", color: "yellow" });
  else if (sum && sum.rank > 0) lines.push({ text: `#${sum.rank} on the ${engine.mode.name} board`, color: "cyan" });
  else lines.push({ text: `best ${opts.highScore}`, color: "dim" });
  if (sum?.newDailyBest) lines.push({ text: "today's best daily run", color: "magenta" });
  const accuracy = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;
  lines.push({ text: `wave ${engine.wave}  kills ${s.kills}  combo ${s.maxCombo}  aim ${accuracy}%`, color: "dim" });
  if (sum) {
    lines.push({ text: `+${sum.xpGained} XP`, color: "green" });
    if (sum.levelAfter > sum.levelBefore) lines.push({ text: `LEVEL UP! now level ${sum.levelAfter}`, color: "yellow" });
    for (const name of sum.achievements.slice(0, 3)) lines.push({ text: `* ${name}`, color: "yellow" });
    if (sum.achievements.length > 3) lines.push({ text: `and ${sum.achievements.length - 3} more`, color: "yellow" });
  }
  lines.push({ text: "", color: "" });
  lines.push({ text: "R again   M menu   Q quit", color: "dim" });
  return lines;
}

function putSeg(grid: Grid, x: number, y: number, label: string, value: string, color: string): number {
  putText(grid, x, y, label, "dim");
  putText(grid, x + label.length + 1, y, value, color);
  return x + label.length + value.length + 3;
}

function overlay(
  grid: Grid,
  fieldTop: number,
  fieldHeight: number,
  boxWidth: number,
  lines: Array<{ text: string; color: string }>,
): void {
  const innerWidth = boxWidth - 2;
  const startY = fieldTop + Math.max(1, Math.floor((fieldHeight - lines.length) / 2) - 1);

  // Blank the playfield behind the message so the text stays readable.
  for (let i = -1; i <= lines.length; i++) {
    const y = startY + i;
    if (y < fieldTop || y >= fieldTop + fieldHeight) continue;
    for (let x = 1; x <= innerWidth; x++) put(grid, x, y, " ", "");
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.text) continue;
    if (startY + i >= fieldTop + fieldHeight) break;
    putCentered(grid, startY + i, line.text, line.color, 1, innerWidth);
  }
}
