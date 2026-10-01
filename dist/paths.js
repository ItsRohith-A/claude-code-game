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
exports.safeId = safeId;
exports.ensureDirs = ensureDirs;
exports.writeAtomic = writeAtomic;
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
/** Pointer to the most recent session, so `/toolstorm` can find it with no arguments. */
function currentSessionPath() {
    return path.join(rootDir(), "current-session");
}
function highScorePath() {
    return path.join(rootDir(), "highscore.json");
}
/** Session ids come from Claude Code, but never trust them as path segments. */
function safeId(sessionId) {
    const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
    return cleaned.slice(0, 120) || "unknown";
}
function ensureDirs() {
    fs.mkdirSync(sessionsDir(), { recursive: true });
}
/** Write a file without ever leaving a half-written file behind for a reader. */
function writeAtomic(target, data) {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
}
