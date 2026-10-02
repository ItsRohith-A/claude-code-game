"use strict";
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
const events_1 = require("./events");
const bus_1 = require("./bus");
const paths_1 = require("./paths");
/** Session files untouched for this long are deleted at the next session start. */
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Notifications that genuinely need the human, and so should pause the game. */
const NEEDS_HUMAN = new Set([
    "permission_prompt",
    "idle_prompt",
    "agent_needs_input",
    "elicitation_dialog",
    "elicitation_url_dialog",
]);
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
function onSessionStart(sessionId, payload) {
    try {
        (0, paths_1.ensureDirs)();
        // The status line shim reads this to find the current install, since an
        // update moves the plugin to a new versioned directory.
        (0, paths_1.writeAtomic)((0, paths_1.pluginRootPointerPath)(), __dirname, 0o644);
    }
    catch {
        /* ignore */
    }
    (0, paths_1.pruneSessions)(SESSION_RETENTION_MS);
    // A resumed session keeps its run going; a fresh or cleared one restarts.
    if (payload.source === "startup" || payload.source === "clear")
        (0, bus_1.resetLog)(sessionId);
    (0, bus_1.markCurrentSession)(sessionId);
    (0, bus_1.publish)(sessionId, { kind: "session_start", label: payload.source });
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
    const sessionId = payload.session_id;
    if (!sessionId)
        return;
    if (event === "session-start") {
        onSessionStart(sessionId, payload);
        return;
    }
    if (event === "turn-start")
        (0, bus_1.markCurrentSession)(sessionId);
    // Nobody is playing: the game skips old lines when it attaches, so writing
    // them would only grow a file nobody reads.
    if (!(0, bus_1.gameIsLive)(sessionId))
        return;
    const tool = payload.tool_name;
    const label = (0, events_1.labelFor)(payload.tool_input);
    const id = payload.tool_use_id;
    switch (event) {
        case "turn-start":
            (0, bus_1.publish)(sessionId, { kind: "turn_start" });
            break;
        case "post-tool": {
            if (!tool)
                break;
            // A Bash call only earns a power-up when it actually verified something;
            // otherwise it is just another thing that moved on screen.
            if (tool === "Bash" || tool === "PowerShell") {
                const command = payload.tool_input?.["command"];
                if (typeof command !== "string" || !(0, events_1.isVerificationCommand)(command)) {
                    (0, bus_1.publish)(sessionId, { kind: "scout", tool, id, label, weight: 1 });
                    break;
                }
            }
            const { kind, weight } = (0, events_1.classifyTool)(tool, false);
            (0, bus_1.publish)(sessionId, { kind, tool, id, label, weight });
            break;
        }
        case "post-tool-failure": {
            // The user pressing Esc is not Claude failing: no heart lost for that.
            if (payload.is_interrupt)
                break;
            const { kind, weight } = (0, events_1.classifyTool)(tool ?? "", true);
            (0, bus_1.publish)(sessionId, { kind, tool, id, label, weight });
            break;
        }
        case "permission-request":
            (0, bus_1.publish)(sessionId, {
                kind: "attention",
                tool,
                id,
                label: `${tool ?? "a tool"} needs your approval`,
            });
            break;
        case "notification": {
            const type = payload.notification_type ?? "";
            if (NEEDS_HUMAN.has(type)) {
                (0, bus_1.publish)(sessionId, { kind: "attention", label: payload.message?.slice(0, 60) });
            }
            break;
        }
        case "stop":
            (0, bus_1.publish)(sessionId, { kind: "wave_clear" });
            break;
        case "session-end":
            (0, bus_1.publish)(sessionId, { kind: "session_end" });
            break;
        default:
            break;
    }
}
main().then(() => process.exit(0), () => process.exit(0));
