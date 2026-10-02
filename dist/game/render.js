"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorCode = colorCode;
exports.paint = paint;
exports.pickFieldSize = pickFieldSize;
exports.renderFrame = renderFrame;
const events_1 = require("../events");
const engine_1 = require("./engine");
const UNICODE = {
    scout: "▾",
    bug: "◆",
    probe: "●",
    player: "▲",
    bullet: "│",
    enemyBullet: "•",
    shield: "(",
    hLine: "─",
    vLine: "│",
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    heart: "♥",
    emptyHeart: "♡",
    barFull: "█",
    barEmpty: "░",
};
const ASCII = {
    ...UNICODE,
    scout: "v",
    bug: "#",
    probe: "O",
    player: "A",
    bullet: "|",
    enemyBullet: "!",
    hLine: "-",
    vLine: "|",
    tl: "+",
    tr: "+",
    bl: "+",
    br: "+",
    heart: "*",
    emptyHeart: "-",
    barFull: "#",
    barEmpty: ".",
};
const COLORS = {
    reset: "\x1b[0m",
    dim: "\x1b[90m",
    white: "\x1b[97m",
    red: "\x1b[91m",
    green: "\x1b[92m",
    yellow: "\x1b[93m",
    blue: "\x1b[94m",
    magenta: "\x1b[95m",
    cyan: "\x1b[96m",
    bold: "\x1b[1m",
};
/** Erase to end of line, so a shorter frame leaves no stale characters. */
const CLEAR_EOL = "\x1b[K";
const RESET = COLORS.reset;
/** ANSI code for a theme colour name, or "" when the name is unknown. */
function colorCode(name) {
    return COLORS[name] ?? "";
}
function paint(text, color) {
    const code = colorCode(color);
    return code ? `${code}${text}${RESET}` : text;
}
const PANEL_WIDTH = 28;
/** Below this terminal width the work log moves under the field. */
const PANEL_MIN_TERMINAL = 76;
function pickFieldSize(columns, rows) {
    const panel = columns >= PANEL_MIN_TERMINAL ? PANEL_WIDTH + 1 : 0;
    // Reserve: title + 2 border rows + 3 HUD rows.
    const chromeRows = 6;
    const width = clamp(columns - panel - 2, 28, 100);
    const height = clamp(rows - chromeRows, 12, 34);
    return { width, height };
}
function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}
function blankRow(width) {
    const row = new Array(width);
    for (let i = 0; i < width; i++)
        row[i] = { ch: " ", color: "" };
    return row;
}
function put(grid, x, y, ch, color) {
    const row = grid[y];
    if (!row)
        return;
    if (x < 0 || x >= row.length)
        return;
    row[x] = { ch, color };
}
function putText(grid, x, y, text, color) {
    for (let i = 0; i < text.length; i++)
        put(grid, x + i, y, text[i] ?? " ", color);
}
/**
 * Clipped to the terminal: the field is sized once at launch, and a frame
 * wider or taller than a shrunken pane would wrap and scroll into garbage.
 */
function serialize(grid, columns, rows) {
    const out = [];
    for (const row of grid.slice(0, Math.max(1, rows))) {
        let line = "";
        let current = "";
        for (const cell of row.slice(0, Math.max(1, columns))) {
            if (cell.color !== current) {
                if (current)
                    line += RESET;
                const code = colorCode(cell.color);
                line += code;
                current = code ? cell.color : "";
            }
            line += cell.ch;
        }
        if (current)
            line += RESET;
        out.push(line + CLEAR_EOL);
    }
    return out.join("\r\n");
}
function glyphForEnemy(theme, type) {
    return type === "scout" ? theme.scout : type === "bug" ? theme.bug : theme.probe;
}
function colorForEnemy(type) {
    return type === "scout" ? "cyan" : type === "bug" ? "magenta" : "yellow";
}
function powerupGlyph(type) {
    switch (type) {
        case "shield":
            return { ch: "S", color: "cyan" };
        case "spread":
            return { ch: "W", color: "yellow" };
        case "rapid":
            return { ch: "R", color: "green" };
        case "life":
            return { ch: "+", color: "magenta" };
    }
}
function renderFrame(engine, opts) {
    const theme = opts.ascii ? ASCII : UNICODE;
    const showPanel = opts.columns >= PANEL_MIN_TERMINAL;
    const boxWidth = engine.width + 2;
    const totalWidth = boxWidth + (showPanel ? PANEL_WIDTH + 1 : 0);
    const totalHeight = 1 + engine.height + 2 + 3;
    const grid = [];
    for (let y = 0; y < totalHeight; y++)
        grid.push(blankRow(totalWidth));
    // ---- title -------------------------------------------------------------
    const title = "TOOLSTORM";
    putText(grid, 0, 0, title, "bold");
    putText(grid, title.length + 1, 0, theme.vLine, "dim");
    const subtitle = opts.attached
        ? `live: ${opts.sessionLabel}`
        : "standalone (no Claude session attached)";
    putText(grid, title.length + 3, 0, subtitle, opts.attached ? "green" : "dim");
    // ---- field box ---------------------------------------------------------
    const boxTop = 1;
    const fieldTop = boxTop + 1;
    put(grid, 0, boxTop, theme.tl, "dim");
    put(grid, boxWidth - 1, boxTop, theme.tr, "dim");
    for (let x = 1; x < boxWidth - 1; x++)
        put(grid, x, boxTop, theme.hLine, "dim");
    const boxBottom = fieldTop + engine.height;
    put(grid, 0, boxBottom, theme.bl, "dim");
    put(grid, boxWidth - 1, boxBottom, theme.br, "dim");
    for (let x = 1; x < boxWidth - 1; x++)
        put(grid, x, boxBottom, theme.hLine, "dim");
    const borderColor = engine.shakeTime > 0 ? "red" : "dim";
    for (let y = fieldTop; y < boxBottom; y++) {
        put(grid, 0, y, theme.vLine, borderColor);
        put(grid, boxWidth - 1, y, theme.vLine, borderColor);
    }
    const fx = (x) => 1 + Math.round(x);
    const fy = (y) => fieldTop + Math.round(y);
    // ---- field contents ----------------------------------------------------
    for (const p of engine.particles) {
        put(grid, fx(p.x), fy(p.y), p.glyph, p.color);
    }
    for (const b of engine.bullets) {
        put(grid, fx(b.x), fy(b.y), theme.bullet, "white");
    }
    for (const b of engine.enemyBullets) {
        put(grid, fx(b.x), fy(b.y), theme.enemyBullet, "red");
    }
    for (const p of engine.powerups) {
        const g = powerupGlyph(p.type);
        put(grid, fx(p.x), fy(p.y), g.ch, g.color);
    }
    for (const e of engine.enemies) {
        const hurt = e.hitFlash > 0;
        put(grid, fx(e.x), fy(e.y), glyphForEnemy(theme, e.type), hurt ? "white" : colorForEnemy(e.type));
        // Damaged multi-hit enemies carry a pip so you can see what is nearly dead.
        if (engine_1.ENEMY_SPECS[e.type].hp > 1 && e.hp < engine_1.ENEMY_SPECS[e.type].hp) {
            put(grid, fx(e.x) + 1, fy(e.y), String(e.hp), "dim");
        }
    }
    // Player: blink while invulnerable, show a bracket when shielded.
    const playerRow = engine.height - 2;
    const blinkOff = engine.invulnTime > 0 && Math.floor(engine.invulnTime * 10) % 2 === 0;
    if (!blinkOff) {
        put(grid, fx(engine.playerX), fy(playerRow), theme.player, "green");
        if (engine.shieldTime > 0) {
            put(grid, fx(engine.playerX) - 1, fy(playerRow), "(", "cyan");
            put(grid, fx(engine.playerX) + 1, fy(playerRow), ")", "cyan");
        }
    }
    // ---- overlays ----------------------------------------------------------
    if (engine.status === "attention") {
        overlay(grid, fieldTop, engine.height, boxWidth, [
            { text: "CLAUDE NEEDS YOU", color: "yellow" },
            { text: engine.attentionNote.slice(0, engine.width - 4), color: "white" },
            { text: "", color: "" },
            { text: "switch to Claude, then press P here", color: "dim" },
        ]);
    }
    else if (engine.status === "gameover") {
        overlay(grid, fieldTop, engine.height, boxWidth, [
            { text: "GAME OVER", color: "red" },
            { text: `score ${engine.score}`, color: "white" },
            {
                text: engine.score >= opts.highScore ? "NEW HIGH SCORE" : `best ${opts.highScore}`,
                color: engine.score >= opts.highScore ? "yellow" : "dim",
            },
            { text: "", color: "" },
            { text: "R restart    Q quit", color: "dim" },
        ]);
    }
    else if (engine.status === "paused") {
        overlay(grid, fieldTop, engine.height, boxWidth, [
            { text: "PAUSED", color: "cyan" },
            { text: "P to resume", color: "dim" },
        ]);
    }
    else if (engine.bannerTime > 0 && engine.bannerText) {
        const y = fieldTop + Math.floor(engine.height / 2);
        const x = 1 + Math.max(0, Math.floor((engine.width - engine.bannerText.length) / 2));
        putText(grid, x, y, engine.bannerText, "yellow");
    }
    // ---- HUD ---------------------------------------------------------------
    const hud1 = boxBottom + 1;
    let cursor = 0;
    cursor = putSeg(grid, cursor, hud1, "SCORE", String(engine.score).padStart(6, "0"), "white");
    cursor = putSeg(grid, cursor, hud1, "BEST", String(Math.max(opts.highScore, engine.score)), "dim");
    cursor = putSeg(grid, cursor, hud1, "WAVE", String(engine.wave), "cyan");
    putText(grid, cursor, hud1, "LIVES", "dim");
    cursor += 6;
    for (let i = 0; i < events_1.MAX_LIVES; i++) {
        const alive = i < engine.lives;
        put(grid, cursor + i, hud1, alive ? theme.heart : theme.emptyHeart, alive ? "red" : "dim");
    }
    cursor += events_1.MAX_LIVES + 1;
    if (engine.combo >= 2) {
        const mult = 1 + Math.floor(engine.combo / 5) * 0.5;
        putText(grid, cursor, hud1, `COMBO x${engine.combo} (${mult.toFixed(1)}x)`, "yellow");
    }
    // Power-up timers.
    const hud2 = boxBottom + 2;
    let px = 0;
    px = putTimer(grid, px, hud2, theme, "SHIELD", engine.shieldTime, 10, "cyan");
    px = putTimer(grid, px, hud2, theme, "SPREAD", engine.spreadTime, 12, "yellow");
    putTimer(grid, px, hud2, theme, "RAPID", engine.rapidTime, 12, "green");
    putText(grid, 0, boxBottom + 3, opts.mouse
        ? "move " + arrowHint(opts.ascii) + "/mouse  fire SPACE/click  pause P  quit Q"
        : "move " + arrowHint(opts.ascii) + "  fire SPACE  pause P  quit Q", "dim");
    // ---- side panel: what Claude is actually doing -------------------------
    if (showPanel) {
        const px0 = boxWidth + 1;
        putText(grid, px0, boxTop, "CLAUDE'S WORK", "bold");
        const lines = engine.log.slice(-(engine.height - 1)).reverse();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line)
                continue;
            const y = fieldTop + i;
            if (y >= boxBottom)
                break;
            putText(grid, px0, y, line.text.slice(0, PANEL_WIDTH), line.color || "white");
        }
    }
    return serialize(grid, opts.columns, opts.rows);
}
function arrowHint(ascii) {
    return ascii ? "A/D" : "←/→";
}
function putSeg(grid, x, y, label, value, color) {
    putText(grid, x, y, label, "dim");
    putText(grid, x + label.length + 1, y, value, color);
    return x + label.length + value.length + 3;
}
function putTimer(grid, x, y, theme, label, remaining, max, color) {
    if (remaining <= 0)
        return x;
    putText(grid, x, y, label, "dim");
    const barX = x + label.length + 1;
    const width = 8;
    const filled = Math.max(0, Math.min(width, Math.round((remaining / max) * width)));
    for (let i = 0; i < width; i++) {
        put(grid, barX + i, y, i < filled ? theme.barFull : theme.barEmpty, i < filled ? color : "dim");
    }
    return barX + width + 2;
}
function overlay(grid, fieldTop, fieldHeight, boxWidth, lines) {
    const innerWidth = boxWidth - 2;
    const startY = fieldTop + Math.max(0, Math.floor((fieldHeight - lines.length) / 2) - 1);
    // Dim the playfield behind the message so the text stays readable.
    for (let i = -1; i <= lines.length; i++) {
        const y = startY + i;
        for (let x = 1; x <= innerWidth; x++)
            put(grid, x, y, " ", "");
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || !line.text)
            continue;
        const x = 1 + Math.max(0, Math.floor((innerWidth - line.text.length) / 2));
        putText(grid, x, startY + i, line.text, line.color);
    }
}
