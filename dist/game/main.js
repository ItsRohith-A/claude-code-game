"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The game process. Runs in its own terminal pane so it owns a real keyboard,
 * tails the session event log the hooks write, and publishes a small state file
 * that the Claude Code status line renders as a HUD.
 */
const bus_1 = require("../bus");
const paths_1 = require("../paths");
const profile_1 = require("../profile");
const app_1 = require("./app");
const content_1 = require("./content");
const render_1 = require("./render");
const input_1 = require("./input");
const FPS = 30;
const FRAME_MS = Math.round(1000 / FPS);
/** How often the status-line state file is refreshed. */
const STATE_INTERVAL_MS = 400;
function parseArgs(argv) {
    let sessionId = null;
    let ascii = false;
    let mouse = process.env.CLAUDE_ARCADE_MOUSE !== "0";
    let bell = process.env.CLAUDE_ARCADE_BELL === "1";
    let mode;
    let difficulty;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--session" || arg === "-s") {
            sessionId = argv[i + 1] ?? null;
            i += 1;
        }
        else if (arg === "--mode") {
            const value = argv[i + 1];
            if ((0, content_1.isModeId)(value))
                mode = value;
            i += 1;
        }
        else if (arg === "--difficulty") {
            const value = argv[i + 1];
            if ((0, content_1.isDifficultyId)(value))
                difficulty = value;
            i += 1;
        }
        else if (arg === "--ascii") {
            ascii = true;
        }
        else if (arg === "--no-mouse") {
            mouse = false;
        }
        else if (arg === "--bell") {
            bell = true;
        }
    }
    if (!sessionId)
        sessionId = process.env.CLAUDE_ARCADE_SESSION ?? null;
    if (!sessionId)
        sessionId = (0, bus_1.readCurrentSessionId)();
    return { sessionId, ascii, mouse, bell, mode, difficulty };
}
const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const HOME = "\x1b[H";
const CLEAR = "\x1b[2J";
const BELL = "\x07";
function main() {
    const args = parseArgs(process.argv.slice(2));
    (0, paths_1.ensureDirs)();
    const sessionId = args.sessionId ?? "standalone";
    const attached = args.sessionId !== null;
    let columns = process.stdout.columns ?? 100;
    let rows = process.stdout.rows ?? 30;
    const size = (0, render_1.pickFieldSize)(columns, rows);
    const app = new app_1.App({
        width: size.width,
        height: size.height,
        attached,
        store: (0, profile_1.fileProfileStore)(),
        startMode: args.mode,
        difficulty: args.difficulty,
    });
    // Skip whatever is already in the log: attaching mid-session should not
    // replay an hour of tool calls as one enormous wave.
    const tail = attached ? new bus_1.EventTail((0, paths_1.eventLogPath)(sessionId), true) : null;
    const ascii = args.ascii || process.env.CLAUDE_ARCADE_ASCII === "1";
    const sessionLabel = sessionId.slice(0, 8);
    let running = true;
    let lastFrame = Date.now();
    let lastState = 0;
    /** False while the terminal is still swallowing the previous frame. */
    let writable = true;
    let timer = null;
    const quit = () => {
        if (!running)
            return;
        running = false;
        if (timer)
            clearInterval(timer);
        input.stop();
        const score = app.engine?.score ?? 0;
        app.finishRun();
        // The pre-0.3 single best score, kept for anything still reading it.
        (0, bus_1.writeHighScore)(score);
        (0, bus_1.publishState)({ ...app.snapshot(sessionId, process.pid), status: "detached" });
        process.stdout.write(LEAVE_SCREEN);
        process.stdout.write(score > 0 ? `TOOLSTORM - final score ${score}\n` : "TOOLSTORM - see you next time\n");
        process.exit(0);
    };
    const input = (0, input_1.startInput)(quit, args.mouse);
    process.on("SIGINT", quit);
    process.on("SIGTERM", quit);
    // Closing the pane or window hangs up on us: still keep the score.
    process.on("SIGHUP", quit);
    // However we exit, a terminal left in mouse mode prints junk on every click.
    process.on("exit", () => {
        if (args.mouse)
            process.stdout.write(input_1.MOUSE_OFF);
    });
    process.stdout.on("drain", () => {
        writable = true;
    });
    const fitTerminal = () => {
        const nextColumns = process.stdout.columns ?? columns;
        const nextRows = process.stdout.rows ?? rows;
        if (nextColumns === columns && nextRows === rows)
            return;
        columns = nextColumns;
        rows = nextRows;
        const next = (0, render_1.pickFieldSize)(columns, rows);
        app.resize(next.width, next.height);
        // Whatever the old size left on screen is now in the wrong place.
        process.stdout.write(CLEAR);
    };
    process.stdout.on("resize", fitTerminal);
    process.stdout.write(ENTER_SCREEN);
    timer = setInterval(() => {
        if (!running)
            return;
        // A fresh split pane shrinks just after we start. The resize event covers
        // that; checking every frame is a cheap safety net in case one is missed.
        fitTerminal();
        const now = Date.now();
        // Clamp dt so a stalled pane (laptop sleep, scheduler hiccup) does not
        // teleport every enemy past the player on the next frame.
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        if (tail) {
            for (const event of tail.read())
                app.ingest(event);
        }
        for (const event of input.drain()) {
            switch (event.type) {
                case "command":
                    app.handle(event.command);
                    break;
                case "aim":
                    app.point(event.column, event.row);
                    break;
                case "trigger":
                    app.trigger(event.held);
                    break;
                case "wheel":
                    app.wheel(event.down);
                    break;
                default:
                    break;
            }
        }
        // Holding the button keeps firing between mouse reports.
        if (input.firing())
            app.trigger(true);
        if (app.quitRequested) {
            quit();
            return;
        }
        app.step(dt);
        const cues = app.drainCues();
        if (args.bell && cues.some((c) => c === "hit" || c === "boss" || c === "gameover"))
            process.stdout.write(BELL);
        // A slow terminal would otherwise queue frames in memory without bound;
        // skipping a frame costs nothing, the next one redraws everything.
        if (writable) {
            writable = process.stdout.write(HOME + app.frame({ columns, rows, ascii, mouse: args.mouse, sessionLabel }));
        }
        if (now - lastState >= STATE_INTERVAL_MS) {
            lastState = now;
            (0, bus_1.publishState)(app.snapshot(sessionId, process.pid, now));
        }
    }, FRAME_MS);
}
main();
