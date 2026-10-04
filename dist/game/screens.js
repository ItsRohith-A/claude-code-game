"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANGAR_TOP = exports.TITLE_ITEMS = void 0;
exports.titleMenuTop = titleMenuTop;
exports.renderMenu = renderMenu;
exports.trophyRows = trophyRows;
/**
 * Everything drawn outside a run: the title menu, the hangar of ship skins,
 * the trophy cabinet and the leaderboards.
 */
const achievements_1 = require("./achievements");
const content_1 = require("./content");
const grid_1 = require("./grid");
const render_1 = require("./render");
const profile_1 = require("../profile");
exports.TITLE_ITEMS = [
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
/** The terminal row (0-based) of the first ship in the hangar. */
exports.HANGAR_TOP = 4;
const LOGO_FONT = {
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
function useBigLogo(columns, rows) {
    return columns >= LOGO_WIDTH + 4 && rows >= 24;
}
/** The terminal row (0-based) of the first title menu item, for mouse hover. */
function titleMenuTop(columns, rows) {
    return useBigLogo(columns, rows) ? 2 + LOGO_ROWS + 3 : 5;
}
function drawStars(grid, view) {
    const glyph = (0, render_1.themeFor)(view.ascii).star;
    for (const s of view.stars) {
        (0, grid_1.put)(grid, Math.round(s.x), Math.round(s.y), s.speed > 4 ? "." : glyph, "dim");
    }
}
function footer(grid, view, text) {
    (0, grid_1.putCentered)(grid, view.rows - 1, text, "dim");
}
function renderMenu(view) {
    const grid = (0, grid_1.makeGrid)(view.columns, view.rows);
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
    return (0, grid_1.serialize)(grid, view.columns, view.rows);
}
function drawLogo(grid, view) {
    if (!useBigLogo(view.columns, view.rows)) {
        (0, grid_1.putCentered)(grid, 1, "T O O L S T O R M", "bold");
        (0, grid_1.putCentered)(grid, 2, "an arcade shooter fueled by Claude's tool calls", "dim");
        return 3;
    }
    const left = Math.floor((view.columns - LOGO_WIDTH) / 2);
    const block = view.ascii ? "#" : "█";
    for (let row = 0; row < LOGO_ROWS; row++) {
        for (let i = 0; i < LOGO_WORD.length; i++) {
            const letter = LOGO_FONT[LOGO_WORD[i] ?? "T"] ?? [];
            const bits = letter[row] ?? "";
            // A colour wave rolls across the letters.
            const color = content_1.RAINBOW[Math.floor(view.clock * 4 + i * 0.6 + row * 0.2) % content_1.RAINBOW.length] ?? "cyan";
            for (let b = 0; b < bits.length; b++) {
                if (bits[b] === "#")
                    (0, grid_1.put)(grid, left + i * 6 + b, 2 + row, block, color);
            }
        }
    }
    (0, grid_1.putCentered)(grid, 2 + LOGO_ROWS + 1, "an arcade shooter fueled by Claude's tool calls", "dim");
    return 2 + LOGO_ROWS + 2;
}
function itemBlurb(item, view) {
    const p = view.profile;
    switch (item) {
        case "storm":
            return view.attached ? `fed live by session ${view.sessionLabel}` : "no session attached: it runs on its own";
        case "daily":
            return `today: ${view.daily.name} - ${view.daily.blurb}${view.dailyBest ? ` (best ${view.dailyBest})` : ""}`;
        case "difficulty":
            return (0, content_1.difficultySpec)(p.difficulty).blurb;
        case "hangar":
            return `ship: ${content_1.SKINS.find((s) => s.id === p.skin)?.name ?? "Pioneer"}`;
        case "trophies":
            return `${Object.keys(p.achievements).length}/${achievements_1.ACHIEVEMENTS.length} unlocked`;
        case "scores":
            return `best ${(0, profile_1.bestScore)(p)}`;
        case "quit":
            return "back to work";
        default:
            return content_1.MODES.find((m) => m.id === item)?.blurb ?? "";
    }
}
function drawTitle(grid, view) {
    drawLogo(grid, view);
    const top = titleMenuTop(view.columns, view.rows);
    const blockWidth = Math.min(view.columns - 2, 64);
    const left = Math.max(1, Math.floor((view.columns - blockWidth) / 2));
    const pointer = view.ascii ? ">" : "▸";
    exports.TITLE_ITEMS.forEach((item, i) => {
        const y = top + i;
        const selected = i === view.cursor;
        (0, grid_1.putText)(grid, left, y, selected ? pointer : " ", "yellow");
        if (item === "difficulty") {
            drawDifficulty(grid, view, left + 2, y, selected);
            (0, grid_1.putText)(grid, left + 25, y, (0, grid_1.clip)(itemBlurb(item, view), blockWidth - 25), selected ? "white" : "dim");
            return;
        }
        (0, grid_1.putText)(grid, left + 2, y, item.toUpperCase(), selected ? "yellow" : i < 4 ? "white" : "cyan");
        (0, grid_1.putText)(grid, left + 12, y, (0, grid_1.clip)(itemBlurb(item, view), blockWidth - 12), selected ? "white" : "dim");
    });
    // The player's progress, under the menu.
    const p = view.profile;
    const lvl = (0, profile_1.levelFor)(p.xp);
    const y = top + exports.TITLE_ITEMS.length + 1;
    if (y < view.rows - 1) {
        const theme = (0, render_1.themeFor)(view.ascii);
        const label = `LVL ${lvl.level}`;
        (0, grid_1.putText)(grid, left + 2, y, label, "cyan");
        (0, grid_1.putBar)(grid, left + 3 + label.length, y, 12, lvl.into / lvl.needed, "cyan", theme.barFull, theme.barEmpty);
        (0, grid_1.putText)(grid, left + 16 + label.length, y, `${lvl.into}/${lvl.needed} XP   runs ${p.totals.runs}   kills ${p.totals.kills}`, "dim");
    }
    footer(grid, view, view.mouse
        ? "↑/↓ or mouse choose   ←/→ difficulty   ENTER/SPACE/click select   Q quit"
        : "↑/↓ choose   ←/→ difficulty   ENTER/SPACE select   Q quit");
}
/** `EASY MEDIUM HARD` with the chosen one lit, like a switch. */
function drawDifficulty(grid, view, x, y, selected) {
    const colors = { easy: "green", medium: "yellow", hard: "red" };
    let cx = x;
    for (const d of content_1.DIFFICULTIES) {
        const on = d.id === view.profile.difficulty;
        const color = on ? (colors[d.id] ?? "white") : selected ? "white" : "dim";
        (0, grid_1.putText)(grid, cx, y, on ? `[${d.name}]` : ` ${d.name} `, color);
        cx += d.name.length + 2;
    }
}
function drawHangar(grid, view) {
    (0, grid_1.putCentered)(grid, 1, "HANGAR", "bold");
    const level = (0, profile_1.levelFor)(view.profile.xp).level;
    (0, grid_1.putCentered)(grid, 2, `level ${level} - new ships unlock as you level up`, "dim");
    const left = Math.max(1, Math.floor((view.columns - 46) / 2));
    content_1.SKINS.forEach((skin, i) => {
        const y = exports.HANGAR_TOP + i;
        const selected = i === view.listCursor;
        const unlocked = level >= skin.level;
        const equipped = view.profile.skin === skin.id;
        const color = skin.color === "rainbow" ? (content_1.RAINBOW[Math.floor(view.clock * 8) % content_1.RAINBOW.length] ?? "green") : skin.color;
        (0, grid_1.putText)(grid, left, y, selected ? (view.ascii ? ">" : "▸") : " ", "yellow");
        (0, grid_1.putText)(grid, left + 2, y, unlocked ? (view.ascii ? skin.ascii : skin.glyph) : "?", unlocked ? color : "dim");
        (0, grid_1.putText)(grid, left + 5, y, skin.name.padEnd(10), unlocked ? (selected ? "yellow" : "white") : "dim");
        const status = equipped ? "equipped" : unlocked ? "ready" : `unlocks at level ${skin.level}`;
        (0, grid_1.putText)(grid, left + 17, y, status, equipped ? "green" : unlocked ? "cyan" : "dim");
    });
    if (view.notice)
        (0, grid_1.putCentered)(grid, exports.HANGAR_TOP + content_1.SKINS.length + 1, view.notice, "yellow");
    footer(grid, view, "↑/↓ choose   ENTER equip   M or BACKSPACE back");
}
/** How many trophy rows fit on screen. */
function trophyRows(rows) {
    return Math.max(3, rows - 5);
}
function drawTrophies(grid, view) {
    const unlocked = view.profile.achievements;
    (0, grid_1.putCentered)(grid, 1, `TROPHIES  ${Object.keys(unlocked).length}/${achievements_1.ACHIEVEMENTS.length}`, "bold");
    const visible = trophyRows(view.rows);
    const start = Math.max(0, Math.min(view.listCursor, achievements_1.ACHIEVEMENTS.length - visible));
    const width = Math.min(view.columns - 2, 70);
    const left = Math.max(1, Math.floor((view.columns - width) / 2));
    achievements_1.ACHIEVEMENTS.slice(start, start + visible).forEach((a, i) => {
        const y = 3 + i;
        const got = !!unlocked[a.id];
        (0, grid_1.putText)(grid, left, y, got ? (view.ascii ? "*" : "★") : view.ascii ? "." : "·", got ? "yellow" : "dim");
        (0, grid_1.putText)(grid, left + 2, y, a.name.padEnd(18), got ? "white" : "dim");
        (0, grid_1.putText)(grid, left + 21, y, (0, grid_1.clip)(a.text, width - 31), got ? "white" : "dim");
        (0, grid_1.putText)(grid, left + width - 8, y, `+${a.xp}xp`, got ? "green" : "dim");
    });
    if (start + visible < achievements_1.ACHIEVEMENTS.length)
        (0, grid_1.putCentered)(grid, 3 + visible, "more below", "dim");
    footer(grid, view, "↑/↓ scroll   M or BACKSPACE back");
}
function drawScores(grid, view) {
    (0, grid_1.putCentered)(grid, 1, "HIGH SCORES", "bold");
    const mode = content_1.MODES[view.listCursor % content_1.MODES.length] ?? content_1.MODES[0];
    if (!mode)
        return;
    const tabs = content_1.MODES.map((m) => (m.id === mode.id ? `[${m.name}]` : ` ${m.name} `)).join("  ");
    (0, grid_1.putCentered)(grid, 2, tabs, "cyan");
    const width = 58;
    const left = Math.max(1, Math.floor((view.columns - width) / 2));
    (0, grid_1.putText)(grid, left, 4, "  #     SCORE   WAVE   KILLS   COMBO   DATE   LEVEL", "dim");
    const board = view.profile.boards[mode.id];
    if (board.length === 0)
        (0, grid_1.putCentered)(grid, 6, "no runs yet - go set one", "dim");
    board.forEach((r, i) => {
        const date = r.at ? new Date(r.at).toISOString().slice(5, 10) : "";
        const row = `${String(i + 1).padStart(3)}  ${String(r.score).padStart(8)}  ${String(r.wave).padStart(5)}  ` +
            `${String(r.kills).padStart(6)}  ${String(r.maxCombo).padStart(6)}   ${date.padEnd(5)}  ` +
            (r.difficulty ? (0, content_1.difficultySpec)(r.difficulty).name : "");
        (0, grid_1.putText)(grid, left, 5 + i, row, i === 0 ? "yellow" : "white");
    });
    if (mode.id === "daily") {
        (0, grid_1.putCentered)(grid, 16, `today: ${view.daily.name}   your best today: ${view.dailyBest}`, "magenta");
    }
    footer(grid, view, "←/→ mode   M or BACKSPACE back");
}
