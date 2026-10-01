"use strict";
/**
 * The contract between the hooks (producers) and the game (consumer).
 *
 * Hooks cannot talk to a terminal, so they append one JSON object per line to
 * a session log; the game process tails that log and turns each line into
 * something that happens on screen.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LIVES = void 0;
exports.classifyTool = classifyTool;
exports.MAX_LIVES = 3;
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
