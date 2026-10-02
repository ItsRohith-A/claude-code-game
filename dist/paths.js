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
exports.rootDir = rootDir;
exports.sessionsDir = sessionsDir;
exports.eventLogPath = eventLogPath;
exports.statePath = statePath;
exports.currentSessionPath = currentSessionPath;
exports.highScorePath = highScorePath;
exports.pluginRootPointerPath = pluginRootPointerPath;
exports.statuslineShimPath = statuslineShimPath;
exports.statuslineBackupPath = statuslineBackupPath;
exports.isToolstormStatusline = isToolstormStatusline;
exports.safeId = safeId;
exports.ensureDirs = ensureDirs;
exports.writeAtomic = writeAtomic;
exports.pruneSessions = pruneSessions;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/** Root data directory. Overridable so tests and multiple checkouts don't collide. */
function rootDir() {
    const override = process.env.CLAUDE_ARCADE_HOME;
    if (override && override.trim())
        return override;
    return path.join(os.homedir(), ".claude-arcade");
}
function sessionsDir() {
    return path.join(rootDir(), "sessions");
}
/** Append-only event log the hooks write and the game tails. */
function eventLogPath(sessionId) {
    return path.join(sessionsDir(), `${safeId(sessionId)}.jsonl`);
}
/** Live game state the status line reads. One file per session. */
function statePath(sessionId) {
    return path.join(sessionsDir(), `${safeId(sessionId)}.state.json`);
}
/** Pointer to the most recent session, the fallback when no id is passed. */
function currentSessionPath() {
    return path.join(rootDir(), "current-session");
}
function highScorePath() {
    return path.join(rootDir(), "highscore.json");
}
/**
 * Where the plugin's current dist/ lives. Hooks refresh it on every session
 * start, because the plugin root is a versioned directory that an update
 * replaces.
 */
function pluginRootPointerPath() {
    return path.join(rootDir(), "plugin-dist");
}
/**
 * The status line command points here rather than into the plugin root, so a
 * plugin update cannot leave settings.json pointing at a deleted directory.
 */
function statuslineShimPath() {
    return path.join(rootDir(), "toolstorm-statusline.js");
}
/** The user's own status line, saved by install so remove can put it back. */
function statuslineBackupPath() {
    return path.join(rootDir(), "statusline-backup.json");
}
/**
 * Whether a status line command is ours. Matches the shim by its unique name,
 * and the plugin-root path older versions wrote, never a bare `statusline.js`
 * that could be anybody's.
 */
function isToolstormStatusline(command) {
    if (typeof command !== "string")
        return false;
    if (command.includes("toolstorm-statusline"))
        return true;
    return /toolstorm/i.test(command) && /[\\/]dist[\\/]statusline\.js/.test(command);
}
/** Session ids come from Claude Code, but never trust them as path segments. */
function safeId(sessionId) {
    const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
    return cleaned.slice(0, 120) || "unknown";
}
function ensureDirs() {
    // The logs name files and commands from the user's work: keep them private.
    fs.mkdirSync(sessionsDir(), { recursive: true, mode: 0o700 });
}
/**
 * Write a file without ever leaving a half-written file behind for a reader.
 * A symlinked target (dotfile managers do this to settings.json) is written
 * through, so the link survives.
 */
function writeAtomic(target, data, mode = 0o600) {
    let real = target;
    try {
        real = fs.realpathSync(target);
    }
    catch {
        /* does not exist yet */
    }
    const tmp = `${real}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data, { mode });
    try {
        fs.renameSync(tmp, real);
    }
    catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
    }
}
/** Drop session files nobody has touched for `maxAgeMs`. */
function pruneSessions(maxAgeMs, now = Date.now()) {
    let names;
    try {
        names = fs.readdirSync(sessionsDir());
    }
    catch {
        return;
    }
    for (const name of names) {
        const file = path.join(sessionsDir(), name);
        try {
            if (now - fs.statSync(file).mtimeMs > maxAgeMs)
                fs.rmSync(file, { force: true });
        }
        catch {
            /* raced with another session: fine */
        }
    }
}
