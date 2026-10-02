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
exports.LIVE_WINDOW_MS = exports.MAX_LIVES = void 0;
exports.isLive = isLive;
exports.classifyTool = classifyTool;
exports.splitCommand = splitCommand;
exports.isVerificationCommand = isVerificationCommand;
exports.labelFor = labelFor;
/**
 * The contract between the hooks (producers) and the game (consumer).
 *
 * Hooks cannot talk to a terminal, so they append one JSON object per line to
 * a session log; the game process tails that log and turns each line into
 * something that happens on screen.
 */
const path = __importStar(require("path"));
exports.MAX_LIVES = 3;
/** A state file older than this means the game pane is gone or frozen. */
exports.LIVE_WINDOW_MS = 6000;
function isLive(state, now = Date.now()) {
    return !!state && state.status !== "detached" && now - state.heartbeat <= exports.LIVE_WINDOW_MS;
}
/** Tool name -> what it becomes in the game. The heart of the "work is fuel" design. */
function classifyTool(toolName, failed) {
    if (failed)
        return { kind: "damage", weight: 1 };
    switch (toolName) {
        // Changing code is what creates bugs to shoot.
        case "Edit":
        case "Write":
        case "NotebookEdit":
            return { kind: "bug", weight: 2 };
        // Looking around is cheap: fast, flimsy enemies worth a few points.
        case "Read":
        case "Grep":
        case "Glob":
        case "LSP":
            return { kind: "scout", weight: 1 };
        // Reaching outside the machine: armoured and it shoots back.
        case "WebFetch":
        case "WebSearch":
            return { kind: "probe", weight: 1 };
        // Running something that worked is a reward.
        case "Bash":
        case "PowerShell":
            return { kind: "powerup", weight: 1 };
        // Agents and tasks are a mini boss.
        case "Agent":
        case "Task":
            return { kind: "probe", weight: 3 };
        default:
            return { kind: "scout", weight: 1 };
    }
}
/**
 * Commands whose success is worth celebrating with a power-up. Anchored to the
 * start of a command, so `git commit -m "make it build"` does not count.
 */
const VERIFICATION = new RegExp("^(?:(?:npx|bunx|pnpm\\s+exec|uv\\s+run|poetry\\s+run|python3?\\s+-m)\\s+)?" +
    "(?:" +
    [
        "(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|build|lint|typecheck|check)\\b",
        "(?:jest|vitest|mocha|pytest|tsc|eslint|ruff|mypy|tox|nox|phpunit|rspec)\\b",
        "go\\s+(?:test|build|vet)\\b",
        "cargo\\s+(?:test|build|check|clippy|nextest)\\b",
        "make\\b",
        "(?:\\./)?gradlew?\\s+(?:test|build|check)\\b",
        "(?:\\./)?mvnw?\\s+(?:test|verify|package|install)\\b",
        "dotnet\\s+(?:test|build)\\b",
    ].join("|") +
    ")", "i");
/** Leading `FOO=bar` assignments and wrappers that do not change what runs. */
const PREFIX = /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|time|sudo)\s+)+/;
/** Split a shell command on `&&`, `||`, `;`, `|` and newlines outside quotes. */
function splitCommand(command) {
    const parts = [];
    let current = "";
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i] ?? "";
        if (quote) {
            if (ch === "\\" && quote === '"') {
                current += ch + (command[i + 1] ?? "");
                i += 1;
                continue;
            }
            if (ch === quote)
                quote = null;
            current += ch;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === ";" || ch === "\n" || ch === "|" || ch === "&") {
            // `&&`, `||` and `|&` are one separator; a lone `&` backgrounds.
            if ((ch === "&" || ch === "|") && (command[i + 1] === "&" || command[i + 1] === "|"))
                i += 1;
            parts.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    parts.push(current);
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
function isVerificationCommand(command) {
    return splitCommand(command).some((part) => VERIFICATION.test(part.replace(PREFIX, "")));
}
/**
 * A short, screen-friendly label for the thing Claude just touched. The event
 * log sits on disk, so it keeps only what is safe to keep: file names, the
 * program a command ran, and the host of a URL. Never query strings, search
 * terms, or command arguments, which is where secrets live.
 */
function labelFor(toolInput) {
    const input = toolInput ?? {};
    const filePath = input["file_path"] ?? input["notebook_path"] ?? input["path"];
    if (typeof filePath === "string" && filePath)
        return path.basename(filePath).slice(0, 24);
    const command = input["command"];
    if (typeof command === "string" && command.trim()) {
        const first = splitCommand(command)[0] ?? "";
        const words = first.replace(PREFIX, "").split(/\s+/);
        const program = path.basename(words[0] ?? "");
        // Keep a subcommand such as `test` in `npm test`, but nothing that could
        // be a value: short, lowercase words only, so no digits, `=`, paths,
        // flags or tokens.
        const sub = words[1];
        const label = sub && /^[a-z][a-z:_-]{0,15}$/.test(sub) ? `${program} ${sub}` : program;
        return label.slice(0, 24) || undefined;
    }
    const url = input["url"];
    if (typeof url === "string" && url) {
        try {
            return new URL(url).hostname.slice(0, 24);
        }
        catch {
            return undefined;
        }
    }
    const pattern = input["pattern"];
    if (typeof pattern === "string" && pattern)
        return pattern.slice(0, 24);
    return undefined;
}
