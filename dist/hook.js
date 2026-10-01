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
 * Hook entrypoint. Claude Code runs this for several hook events, passing the
 * event payload as JSON on stdin and the event kind as argv[2] (we pass it
 * explicitly from hooks.json rather than trusting hook_event_name alone).
 *
 * Contract with the rest of Claude Code: print nothing, always exit 0. Every
 * hook is registered `async: true`, so this process can never add latency to
 * the user's real work, and a crash here is invisible.
 */
const path = __importStar(require("path"));
const events_1 = require("./events");
const bus_1 = require("./bus");
/** Commands whose success is worth celebrating with a power-up. */
const VERIFICATION = /\b(test|tests|jest|vitest|pytest|mocha|go\s+test|cargo\s+test|npm\s+run|pnpm\s+run|yarn\s+(?:run|test)|make|build|tsc|lint|eslint|ruff|mypy|gradle|mvn|dotnet\s+test)\b/i;
function readStdin() {
    return new Promise((resolve) => {
        // If stdin never arrives, give up rather than hanging a background process.
        const timer = setTimeout(() => resolve(""), 2000);
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
/** A short, screen-friendly label for the thing Claude just touched. */
function labelFor(payload) {
    const input = payload.tool_input ?? {};
    const filePath = input["file_path"] ?? input["notebook_path"] ?? input["path"];
    if (typeof filePath === "string" && filePath)
        return path.basename(filePath);
    const command = input["command"];
    if (typeof command === "string" && command) {
        return command.trim().split(/\s+/).slice(0, 2).join(" ").slice(0, 24);
    }
    const pattern = input["pattern"] ?? input["query"] ?? input["url"];
    if (typeof pattern === "string" && pattern)
        return pattern.slice(0, 24);
    return undefined;
}
function isVerificationCommand(payload) {
    const command = payload.tool_input?.["command"];
    return typeof command === "string" && VERIFICATION.test(command);
}
async function main() {
    const event = process.argv[2] ?? "";
    const raw = await readStdin();
    let payload = {};
    try {
        payload = raw.trim() ? JSON.parse(raw) : {};
    }
    catch {
        payload = {};
    }
    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || "unknown";
    const tool = payload.tool_name;
    const label = labelFor(payload);
    switch (event) {
        case "session-start": {
            // A resumed session keeps its run going; a fresh or cleared one restarts.
            if (payload.source === "startup" || payload.source === "clear")
                (0, bus_1.resetLog)(sessionId);
            (0, bus_1.publish)(sessionId, { kind: "session_start", label: payload.source });
            break;
        }
        case "turn-start":
            (0, bus_1.publish)(sessionId, { kind: "turn_start", weight: payload.turn_number ?? 0 });
            break;
        case "pre-tool":
            (0, bus_1.publish)(sessionId, { kind: "tool_pending", tool, label });
            break;
        case "post-tool": {
            if (!tool)
                break;
            // A Bash call only earns a power-up when it actually verified something;
            // otherwise it is just another thing that moved on screen.
            if ((tool === "Bash" || tool === "PowerShell") && !isVerificationCommand(payload)) {
                (0, bus_1.publish)(sessionId, { kind: "scout", tool, label, weight: 1 });
                break;
            }
            const { kind, weight } = (0, events_1.classifyTool)(tool, false);
            (0, bus_1.publish)(sessionId, { kind, tool, label, weight });
            break;
        }
        case "post-tool-failure": {
            const { kind, weight } = (0, events_1.classifyTool)(tool ?? "", true);
            (0, bus_1.publish)(sessionId, { kind, tool, label, weight });
            break;
        }
        case "notification": {
            const type = payload.notification_type ?? "";
            // Only the notifications that genuinely need the human should steal focus.
            const needsHuman = type === "permission_prompt" ||
                type === "idle_prompt" ||
                type === "agent_needs_input" ||
                type === "elicitation_dialog" ||
                type === "elicitation_url_dialog";
            if (needsHuman) {
                (0, bus_1.publish)(sessionId, { kind: "attention", label: payload.message?.slice(0, 60) });
            }
            break;
        }
        case "stop":
            (0, bus_1.publish)(sessionId, { kind: "wave_clear", weight: payload.turn_number ?? 0 });
            break;
        case "session-end":
            (0, bus_1.publish)(sessionId, { kind: "session_end" });
            break;
        default:
            break;
    }
}
main().then(() => process.exit(0), () => process.exit(0));
