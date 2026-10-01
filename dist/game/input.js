"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOVE_STEP = void 0;
exports.startInput = startInput;
/**
 * Keyboard reader for the game pane.
 *
 * This process owns its own stdin, which is the whole reason the game lives in
 * a separate pane: inside Claude Code's pane the TUI owns the keyboard and a
 * plugin can never see a keypress.
 *
 * Terminals report key presses but not releases, so "holding" a key is really
 * the terminal's auto-repeat delivering a stream of presses. Each press moves
 * a fixed step, which reads as smooth motion while held.
 */
const MOVE_STEP = 2;
exports.MOVE_STEP = MOVE_STEP;
function startInput(onQuit) {
    let queue = [];
    const stdin = process.stdin;
    if (stdin.isTTY)
        stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
        // A single read can contain several keys plus multi-byte escape sequences.
        for (let i = 0; i < chunk.length; i++) {
            const ch = chunk[i];
            if (ch === undefined)
                continue;
            // Arrow keys arrive as ESC [ A..D.
            if (ch === "\x1b" && chunk[i + 1] === "[") {
                const code = chunk[i + 2];
                i += 2;
                if (code === "D")
                    queue.push("left");
                else if (code === "C")
                    queue.push("right");
                else if (code === "A")
                    queue.push("fire");
                continue;
            }
            switch (ch) {
                case "a":
                case "A":
                case "h":
                    queue.push("left");
                    break;
                case "d":
                case "D":
                case "l":
                    queue.push("right");
                    break;
                case " ":
                case "w":
                case "W":
                case "k":
                    queue.push("fire");
                    break;
                case "p":
                case "P":
                    queue.push("pause");
                    break;
                case "r":
                case "R":
                    queue.push("restart");
                    break;
                case "q":
                case "Q":
                case "\x03": // Ctrl+C
                case "\x04": // Ctrl+D
                    onQuit();
                    return;
                default:
                    break;
            }
        }
    };
    stdin.on("data", onData);
    return {
        drain() {
            const out = queue;
            queue = [];
            return out;
        },
        stop() {
            stdin.off("data", onData);
            if (stdin.isTTY) {
                try {
                    stdin.setRawMode(false);
                }
                catch {
                    /* terminal already gone */
                }
            }
            stdin.pause();
        },
    };
}
