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
exports.EventTail = void 0;
exports.publish = publish;
exports.markCurrentSession = markCurrentSession;
exports.resetLog = resetLog;
exports.publishState = publishState;
exports.readState = readState;
exports.gameIsLive = gameIsLive;
exports.readCurrentSessionId = readCurrentSessionId;
exports.readHighScore = readHighScore;
exports.writeHighScore = writeHighScore;
const fs = __importStar(require("fs"));
const paths_1 = require("./paths");
const events_1 = require("./events");
/** A log past this size is restarted; the game tail notices the truncation. */
const MAX_LOG_BYTES = 1024 * 1024;
/**
 * Append one event. Called from hook processes, which must never fail loudly
 * and must never block Claude: every error is swallowed on purpose.
 */
function publish(sessionId, event) {
    try {
        (0, paths_1.ensureDirs)();
        const log = (0, paths_1.eventLogPath)(sessionId);
        const line = JSON.stringify({ at: Date.now(), ...event }) + "\n";
        // Async hooks run concurrently, so several processes may append at once.
        // Each line goes out in one O_APPEND write well under the pipe-buffer
        // size, which keeps lines whole; the order between them is not promised.
        fs.appendFileSync(log, line, { encoding: "utf8", mode: 0o600 });
        if (fs.statSync(log).size > MAX_LOG_BYTES)
            fs.writeFileSync(log, "");
    }
    catch {
        /* a broken game must never break the user's real work */
    }
}
/** Record the most recent session, the fallback when `launch` gets no id. */
function markCurrentSession(sessionId) {
    try {
        (0, paths_1.ensureDirs)();
        (0, paths_1.writeAtomic)((0, paths_1.currentSessionPath)(), sessionId);
    }
    catch {
        /* ignore */
    }
}
/** Start a fresh log for a new run. */
function resetLog(sessionId) {
    try {
        (0, paths_1.ensureDirs)();
        fs.writeFileSync((0, paths_1.eventLogPath)(sessionId), "", { mode: 0o600 });
    }
    catch {
        /* ignore */
    }
}
/** Incrementally reads appended lines, remembering where it stopped. */
class EventTail {
    file;
    offset = 0;
    partial = "";
    constructor(file, skipExisting) {
        this.file = file;
        if (skipExisting) {
            try {
                this.offset = fs.statSync(this.file).size;
            }
            catch {
                this.offset = 0;
            }
        }
    }
    /** Returns every complete event appended since the last call. */
    read() {
        let size;
        try {
            size = fs.statSync(this.file).size;
        }
        catch {
            return [];
        }
        // The log was truncated or replaced (new run): start over.
        if (size < this.offset) {
            this.offset = 0;
            this.partial = "";
        }
        if (size === this.offset)
            return [];
        let chunk = "";
        try {
            const fd = fs.openSync(this.file, "r");
            try {
                const length = size - this.offset;
                const buf = Buffer.allocUnsafe(length);
                const bytes = fs.readSync(fd, buf, 0, length, this.offset);
                chunk = buf.subarray(0, bytes).toString("utf8");
                this.offset += bytes;
            }
            finally {
                fs.closeSync(fd);
            }
        }
        catch {
            return [];
        }
        const text = this.partial + chunk;
        const lines = text.split("\n");
        // The last element is whatever follows the final newline: hold it back
        // until the writer finishes the line.
        this.partial = lines.pop() ?? "";
        const out = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed.kind === "string")
                    out.push(parsed);
            }
            catch {
                /* skip a malformed line rather than dying mid-game */
            }
        }
        return out;
    }
}
exports.EventTail = EventTail;
function publishState(state) {
    try {
        (0, paths_1.ensureDirs)();
        (0, paths_1.writeAtomic)((0, paths_1.statePath)(state.sessionId), JSON.stringify(state));
    }
    catch {
        /* ignore */
    }
}
function readState(sessionId) {
    try {
        return JSON.parse(fs.readFileSync((0, paths_1.statePath)(sessionId), "utf8"));
    }
    catch {
        return null;
    }
}
/**
 * Whether a game is attached to this session right now. The game skips the
 * existing log when it attaches, so events written while nothing is playing
 * would never be read: hooks check this and skip the write.
 */
function gameIsLive(sessionId) {
    return (0, events_1.isLive)(readState(sessionId));
}
function readCurrentSessionId() {
    try {
        const id = fs.readFileSync((0, paths_1.currentSessionPath)(), "utf8").trim();
        return id || null;
    }
    catch {
        return null;
    }
}
function readHighScore() {
    try {
        const parsed = JSON.parse(fs.readFileSync((0, paths_1.highScorePath)(), "utf8"));
        return typeof parsed.score === "number" ? parsed.score : 0;
    }
    catch {
        return 0;
    }
}
function writeHighScore(score) {
    try {
        (0, paths_1.ensureDirs)();
        if (score > readHighScore()) {
            (0, paths_1.writeAtomic)((0, paths_1.highScorePath)(), JSON.stringify({ score, at: Date.now() }));
        }
    }
    catch {
        /* ignore */
    }
}
