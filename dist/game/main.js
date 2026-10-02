"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The game process. Runs in its own terminal pane so it owns a real keyboard,
 * tails the session event log the hooks write, and publishes a small state file
 * that the Claude Code status line renders as a HUD.
 */
const bus_1 = require("../bus");
const paths_1 = require("../paths");
const engine_1 = require("./engine");
const render_1 = require("./render");
const input_1 = require("./input");
const FPS = 24;
const FRAME_MS = Math.round(1000 / FPS);
/** How often the status-line state file is refreshed. */
const STATE_INTERVAL_MS = 400;
function parseArgs(argv) {
    let sessionId = null;
    let ascii = false;
    let mouse = process.env.CLAUDE_ARCADE_MOUSE !== "0";
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--session" || arg === "-s") {
            sessionId = argv[i + 1] ?? null;
            i += 1;
        }
        else if (arg === "--ascii") {
            ascii = true;
        }
        else if (arg === "--no-mouse") {
            mouse = false;
        }
    }
    if (!sessionId)
        sessionId = process.env.CLAUDE_ARCADE_SESSION ?? null;
    if (!sessionId)
        sessionId = (0, bus_1.readCurrentSessionId)();
    return { sessionId, ascii, mouse };
}
const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const HOME = "\x1b[H";
const CLEAR = "\x1b[2J";
function main() {
    const args = parseArgs(process.argv.slice(2));
    (0, paths_1.ensureDirs)();
    const sessionId = args.sessionId ?? "standalone";
    const attached = args.sessionId !== null;
    let highScore = (0, bus_1.readHighScore)();
    const columns = process.stdout.columns ?? 100;
    const rows = process.stdout.rows ?? 30;
    const size = (0, render_1.pickFieldSize)(columns, rows);
    const engine = new engine_1.Engine(size.width, size.height);
    // Skip whatever is already in the log: attaching mid-session should not
    // replay an hour of tool calls as one enormous wave.
    const tail = attached ? new bus_1.EventTail((0, paths_1.eventLogPath)(sessionId), true) : null;
    const opts = {
        columns,
        rows,
        ascii: args.ascii || process.env.CLAUDE_ARCADE_ASCII === "1",
        mouse: args.mouse,
        sessionLabel: sessionId.slice(0, 8),
        attached,
        highScore,
    };
    let running = true;
    let lastFrame = Date.now();
    let lastState = 0;
    let lastStatus = engine.status;
    /** False while the terminal is still swallowing the previous frame. */
    let writable = true;
    let timer = null;
    const saveHighScore = () => {
        (0, bus_1.writeHighScore)(engine.score);
        highScore = Math.max(highScore, engine.score);
    };
    const quit = () => {
        if (!running)
            return;
        running = false;
        if (timer)
            clearInterval(timer);
        input.stop();
        saveHighScore();
        (0, bus_1.publishState)(snapshot(engine, sessionId, "detached", highScore));
        process.stdout.write(LEAVE_SCREEN);
        process.stdout.write(`TOOLSTORM - final score ${engine.score}, wave ${engine.wave}\n`);
        process.exit(0);
    };
    const input = (0, input_1.startInput)(quit, args.mouse);
    /** The pointer column last applied, so the keys still work once it rests. */
    let lastAim = null;
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
    process.stdout.on("resize", () => {
        opts.columns = process.stdout.columns ?? opts.columns;
        opts.rows = process.stdout.rows ?? opts.rows;
        // Whatever the old size left on screen is now in the wrong place.
        process.stdout.write(CLEAR);
    });
    process.stdout.write(ENTER_SCREEN);
    engine.pushLog(attached ? "attached to session" : "no session - solo run", "cyan");
    timer = setInterval(() => {
        if (!running)
            return;
        const now = Date.now();
        // Clamp dt so a stalled pane (laptop sleep, scheduler hiccup) does not
        // teleport every enemy past the player on the next frame.
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        if (tail) {
            for (const event of tail.read())
                engine.ingest(event);
        }
        for (const command of input.drain())
            engine.apply(command);
        // The field starts one column in, past the border, and terminal columns
        // count from 1: column 2 is field x 0.
        const aim = input.aim();
        if (aim !== null && aim !== lastAim) {
            lastAim = aim;
            engine.moveTo(aim - 2);
        }
        if (input.firing())
            engine.apply("fire");
        engine.step(dt);
        if (engine.status === "gameover" && lastStatus !== "gameover") {
            // Save now, not at quit: the pane may be closed without a clean exit.
            saveHighScore();
        }
        else if (lastStatus === "gameover" && engine.status !== "gameover") {
            // A restart: the old run's score is now the one to beat.
            opts.highScore = highScore;
        }
        lastStatus = engine.status;
        // A slow terminal would otherwise queue frames in memory without bound;
        // skipping a frame costs nothing, the next one redraws everything.
        if (writable)
            writable = process.stdout.write(HOME + (0, render_1.renderFrame)(engine, opts));
        if (now - lastState >= STATE_INTERVAL_MS) {
            lastState = now;
            (0, bus_1.publishState)(snapshot(engine, sessionId, engine.status, highScore));
        }
    }, FRAME_MS);
}
function snapshot(engine, sessionId, status, highScore) {
    return {
        sessionId,
        score: engine.score,
        highScore: Math.max(highScore, engine.score),
        lives: engine.lives,
        wave: engine.wave,
        combo: engine.combo,
        enemies: engine.enemies.length,
        status,
        heartbeat: Date.now(),
        pid: process.pid,
    };
}
main();
