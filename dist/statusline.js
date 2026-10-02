"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Status line renderer.
 *
 * This is the in-pane half of the plugin: it cannot take input, but it can draw
 * two rows under Claude's transcript. Row one keeps the normal context/cost
 * information a status line is for; row two is the live TOOLSTORM scoreboard.
 *
 * A plugin cannot register a status line (Claude Code only honours `agent` and
 * `subagentStatusLine` from a plugin's settings), so `/toolstorm install`
 * writes the `statusLine` entry into the user's own settings.json. If the user
 * had a status line before, it keeps running: its output replaces row one.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const bus_1 = require("./bus");
const events_1 = require("./events");
const paths_1 = require("./paths");
const RESET = "\x1b[0m";
const C = {
    dim: "\x1b[90m",
    white: "\x1b[97m",
    red: "\x1b[91m",
    green: "\x1b[92m",
    yellow: "\x1b[93m",
    magenta: "\x1b[95m",
    cyan: "\x1b[96m",
    bold: "\x1b[1m",
};
/** The chained status line gets this long before we draw without it. */
const CHAINED_TIMEOUT_MS = 1000;
function paint(text, color) {
    return `${color}${text}${RESET}`;
}
/**
 * The directory holding HEAD for a checkout. In a worktree or submodule, `.git`
 * is a file that points elsewhere with a `gitdir:` line.
 */
function gitDirOf(dir) {
    const dotGit = path.join(dir, ".git");
    let stat;
    try {
        stat = fs.statSync(dotGit);
    }
    catch {
        return null;
    }
    if (stat.isDirectory())
        return dotGit;
    try {
        const match = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, "utf8"));
        return match && match[1] ? path.resolve(dir, match[1].trim()) : null;
    }
    catch {
        return null;
    }
}
/** Read the branch from .git directly: spawning git would slow every refresh. */
function gitBranch(dir) {
    let current = path.resolve(dir);
    for (let i = 0; i < 12; i++) {
        const gitDir = gitDirOf(current);
        if (gitDir) {
            try {
                const contents = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
                const match = /^ref: refs\/heads\/(.+)$/.exec(contents);
                if (match && match[1])
                    return match[1];
                return contents.slice(0, 7); // detached HEAD
            }
            catch {
                return null;
            }
        }
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function contextBar(percent) {
    const width = 10;
    const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
    const color = percent >= 90 ? C.red : percent >= 70 ? C.yellow : C.green;
    return paint("█".repeat(filled), color) + paint("░".repeat(width - filled), C.dim);
}
function hearts(lives) {
    let out = "";
    for (let i = 0; i < events_1.MAX_LIVES; i++) {
        out += i < lives ? paint("♥", C.red) : paint("♡", C.dim);
    }
    return out;
}
function gameRow(state) {
    const tag = paint("TOOLSTORM", C.bold);
    if (!state || state.status === "detached") {
        const best = state?.highScore ?? 0;
        const hint = best > 0 ? `best ${best} — ` : "";
        return `${tag} ${paint(`${hint}/toolstorm to play`, C.dim)}`;
    }
    const age = Date.now() - state.heartbeat;
    if (age > events_1.LIVE_WINDOW_MS) {
        return `${tag} ${paint(`paused — score ${state.score}, best ${state.highScore} — /toolstorm to resume`, C.dim)}`;
    }
    const parts = [tag];
    if (state.status === "gameover") {
        parts.push(paint("GAME OVER", C.red));
        parts.push(paint(`score ${state.score}`, C.white));
        parts.push(paint(`best ${state.highScore}`, C.dim));
        parts.push(paint("R to restart", C.dim));
        return parts.join(paint(" │ ", C.dim));
    }
    if (state.status === "attention") {
        parts.push(paint("PAUSED - you are needed here", C.yellow));
    }
    else if (state.status === "paused") {
        parts.push(paint("paused", C.dim));
    }
    parts.push(paint(String(state.score).padStart(6, "0"), C.white));
    parts.push(`${paint("wave", C.dim)} ${paint(String(state.wave), C.cyan)}`);
    parts.push(hearts(state.lives));
    if (state.enemies > 0) {
        parts.push(paint(`${state.enemies} on screen`, C.dim));
    }
    if (state.combo >= 2) {
        parts.push(paint(`combo x${state.combo}`, C.yellow));
    }
    if (state.score >= state.highScore && state.score > 0) {
        parts.push(paint("NEW BEST", C.magenta));
    }
    return parts.join(paint(" │ ", C.dim));
}
function infoRow(input) {
    const sep = paint(" │ ", C.dim);
    const parts = [];
    const model = input.model?.display_name;
    if (model)
        parts.push(paint(`[${model}]`, C.cyan));
    const dir = input.workspace?.current_dir ?? input.workspace?.project_dir;
    if (dir) {
        parts.push(paint(path.basename(path.resolve(dir)), C.white));
        const branch = gitBranch(dir);
        if (branch)
            parts.push(paint(branch, C.magenta));
    }
    const pct = input.context_window?.used_percentage;
    if (typeof pct === "number") {
        parts.push(`${contextBar(pct)} ${paint(`${Math.round(pct)}%`, C.dim)}`);
    }
    const cost = input.cost?.total_cost_usd;
    if (typeof cost === "number" && cost > 0) {
        parts.push(paint(`$${cost.toFixed(2)}`, C.yellow));
    }
    return parts.join(sep);
}
/** Git Bash, found the way Claude Code finds it; bare `bash` may be WSL's. */
function gitBash() {
    const candidates = [
        process.env.CLAUDE_CODE_GIT_BASH_PATH,
        path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    ];
    return candidates.find((c) => !!c && fs.existsSync(c)) ?? "bash";
}
/**
 * Run the status line the user had before installing the HUD, feeding it the
 * same JSON, so installing TOOLSTORM adds a row instead of replacing theirs.
 */
function chainedRows(raw) {
    let previous;
    try {
        previous = JSON.parse(fs.readFileSync((0, paths_1.statuslineBackupPath)(), "utf8"));
    }
    catch {
        return null;
    }
    if (typeof previous.command !== "string" || !previous.command.trim())
        return null;
    // Never chain to ourselves: that would recurse on every refresh.
    if ((0, paths_1.isToolstormStatusline)(previous.command))
        return null;
    const options = {
        input: raw,
        encoding: "utf8",
        timeout: CHAINED_TIMEOUT_MS,
        windowsHide: true,
    };
    try {
        // Status line commands are written for a POSIX shell. On Windows that is
        // Git Bash, as Claude Code itself uses; plain cmd is the last resort.
        let result = process.platform === "win32"
            ? (0, child_process_1.spawnSync)(gitBash(), ["-c", previous.command], options)
            : (0, child_process_1.spawnSync)(previous.command, { ...options, shell: true });
        if (result.error && process.platform === "win32") {
            result = (0, child_process_1.spawnSync)(previous.command, { ...options, shell: true });
        }
        const out = (result.stdout ?? "").replace(/\s+$/, "");
        return out.length > 0 ? out : null;
    }
    catch {
        return null;
    }
}
function readStdin() {
    return new Promise((resolve) => {
        // The status line runs on a short leash; never hang the pane waiting.
        const timer = setTimeout(() => resolve(""), 1500);
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (c) => {
            data += c;
        });
        process.stdin.on("end", () => {
            clearTimeout(timer);
            resolve(data);
        });
        process.stdin.on("error", () => {
            clearTimeout(timer);
            resolve("");
        });
    });
}
async function main() {
    const raw = await readStdin();
    let input = {};
    try {
        input = raw.trim() ? JSON.parse(raw) : {};
    }
    catch {
        input = {};
    }
    const sessionId = input.session_id ?? "";
    const state = sessionId ? (0, bus_1.readState)(sessionId) : null;
    const first = chainedRows(raw) ?? infoRow(input);
    const lines = [first, gameRow(state)].filter((line) => line.length > 0);
    process.stdout.write(lines.join("\n") + "\n");
}
main().catch(() => {
    // A broken status line should degrade to nothing, not to an error banner.
    process.stdout.write("");
});
