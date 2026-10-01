#!/usr/bin/env node
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
 * TOOLSTORM control surface.
 *
 *   play                run the game in this terminal (best for tmux splits)
 *   launch              open the game in a new pane or window
 *   install-statusline  add the HUD to the user's settings.json
 *   remove-statusline   undo that, restoring any previous status line
 *   status              print the current game state as JSON
 *   simulate            feed fake tool-call events, to try it without Claude
 */
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const paths_1 = require("./paths");
const bus_1 = require("./bus");
const GAME_ENTRY = path.join(__dirname, "game", "main.js");
const STATUSLINE_ENTRY = path.join(__dirname, "statusline.js");
/** Status line refresh in seconds. Low enough to feel live, high enough to be cheap. */
const STATUSLINE_REFRESH = 2;
function settingsPath() {
    return path.join(os.homedir(), ".claude", "settings.json");
}
function statuslineBackupPath() {
    return path.join((0, paths_1.rootDir)(), "statusline-backup.json");
}
/** Forward slashes keep the path safe inside a JSON string and a shell command. */
function posix(p) {
    return p.replace(/\\/g, "/");
}
function resolveSession(argv) {
    const flag = argv.indexOf("--session");
    if (flag !== -1 && argv[flag + 1])
        return argv[flag + 1] ?? null;
    return process.env.CLAUDE_SESSION_ID ?? (0, bus_1.readCurrentSessionId)();
}
/**
 * Pick the best way to put the game beside Claude. Splitting the current
 * window is far nicer than a floating window, so tmux and Windows Terminal
 * splits are tried first.
 */
function pickLauncher(gameArgs) {
    const node = process.execPath;
    const inner = [GAME_ENTRY, ...gameArgs];
    if (process.env.TMUX) {
        return { name: "tmux split", command: "tmux", args: ["split-window", "-h", node, ...inner] };
    }
    if (process.platform === "win32") {
        if (hasCommand("wt")) {
            // -w 0 targets the window this session is already in.
            return {
                name: "Windows Terminal split",
                command: "wt",
                args: ["-w", "0", "split-pane", "-V", "--title", "TOOLSTORM", node, ...inner],
            };
        }
        return {
            name: "new console window",
            command: "cmd",
            args: ["/c", "start", "TOOLSTORM", "cmd", "/k", node, ...inner],
        };
    }
    if (process.platform === "darwin") {
        const script = `tell application "Terminal" to do script "${posix(node)} ${inner
            .map((a) => `'${a}'`)
            .join(" ")}"`;
        return { name: "Terminal.app window", command: "osascript", args: ["-e", script] };
    }
    for (const term of ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"]) {
        if (hasCommand(term)) {
            const args = term === "gnome-terminal" ? ["--", node, ...inner] : ["-e", node, ...inner];
            return { name: term, command: term, args };
        }
    }
    return null;
}
function hasCommand(name) {
    const probe = process.platform === "win32" ? "where" : "which";
    const result = (0, child_process_1.spawnSync)(probe, [name], { stdio: "ignore" });
    return result.status === 0;
}
function launch(argv) {
    const session = resolveSession(argv);
    const gameArgs = session ? ["--session", session] : [];
    if (argv.includes("--ascii"))
        gameArgs.push("--ascii");
    const launcher = pickLauncher(gameArgs);
    if (!launcher) {
        console.error("Could not find a terminal to open. Run this in a spare pane instead:");
        console.error(`  node "${posix(GAME_ENTRY)}"${session ? ` --session ${session}` : ""}`);
        return 1;
    }
    const child = (0, child_process_1.spawn)(launcher.command, launcher.args, {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    console.log(`TOOLSTORM launched (${launcher.name}).`);
    if (session)
        console.log(`Attached to session ${session.slice(0, 8)} - your tool calls feed it.`);
    else
        console.log("No Claude session found yet; it will run standalone.");
    console.log("Controls: arrows or A/D move, SPACE fires, P pauses, Q quits.");
    return 0;
}
// ------------------------------------------------------------- status line ---
function readJsonFile(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
        /* missing or malformed: treat as empty */
    }
    return {};
}
function installStatusline() {
    const file = settingsPath();
    const settings = readJsonFile(file);
    const desired = {
        type: "command",
        command: `node "${posix(STATUSLINE_ENTRY)}"`,
        refreshInterval: STATUSLINE_REFRESH,
    };
    const existing = settings["statusLine"];
    if (existing && typeof existing === "object") {
        const current = existing;
        if (typeof current.command === "string" && current.command.includes("statusline.js")) {
            console.log("TOOLSTORM status line already installed.");
            return 0;
        }
        // Keep whatever the user had so remove-statusline can put it back.
        (0, paths_1.ensureDirs)();
        (0, paths_1.writeAtomic)(statuslineBackupPath(), JSON.stringify(existing, null, 2));
        console.log(`Saved your existing status line to ${posix(statuslineBackupPath())}`);
    }
    settings["statusLine"] = desired;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    (0, paths_1.writeAtomic)(file, JSON.stringify(settings, null, 2) + "\n");
    console.log(`Installed the TOOLSTORM HUD into ${posix(file)}`);
    console.log("Row 1 keeps model/branch/context; row 2 is the live score.");
    console.log("Restart Claude Code (or run /statusline) to pick it up.");
    return 0;
}
function removeStatusline() {
    const file = settingsPath();
    const settings = readJsonFile(file);
    const existing = settings["statusLine"];
    if (!existing || typeof existing.command !== "string" || !existing.command.includes("statusline.js")) {
        console.log("TOOLSTORM status line is not installed; nothing to do.");
        return 0;
    }
    const backup = readJsonFile(statuslineBackupPath());
    if (Object.keys(backup).length > 0) {
        settings["statusLine"] = backup;
        console.log("Restored your previous status line.");
    }
    else {
        delete settings["statusLine"];
        console.log("Removed the status line entry.");
    }
    (0, paths_1.writeAtomic)(file, JSON.stringify(settings, null, 2) + "\n");
    return 0;
}
// ------------------------------------------------------------------ status ---
function status(argv) {
    const session = resolveSession(argv);
    if (!session) {
        console.log("No Claude session recorded yet. Start a turn, then try again.");
        return 0;
    }
    const state = (0, bus_1.readState)(session);
    console.log(JSON.stringify({ session, state }, null, 2));
    return 0;
}
// ---------------------------------------------------------------- simulate ---
/** Fake a Claude session so the game can be tried without burning tokens. */
async function simulate(argv) {
    const session = resolveSession(argv) ?? "simulated-session";
    (0, bus_1.resetLog)(session);
    console.log(`Simulating tool calls for session ${session}. Ctrl+C to stop.`);
    console.log(`Launch the game with:  node "${posix(GAME_ENTRY)}" --session ${session}`);
    const script = [
        ["turn_start", {}],
        ["tool_pending", { tool: "Read", label: "auth.ts" }],
        ["scout", { tool: "Read", label: "auth.ts" }],
        ["bug", { tool: "Edit", label: "auth.ts", weight: 2 }],
        ["scout", { tool: "Grep", label: "verifyToken" }],
        ["powerup", { tool: "Bash", label: "npm test" }],
        ["bug", { tool: "Write", label: "session.ts", weight: 2 }],
        ["probe", { tool: "WebFetch", label: "docs" }],
        ["damage", { tool: "Bash", label: "npm test" }],
        ["scout", { tool: "Glob", label: "**/*.ts" }],
        ["powerup", { tool: "Bash", label: "npm run build" }],
        ["wave_clear", {}],
    ];
    for (let round = 0; round < 50; round++) {
        for (const [kind, payload] of script) {
            (0, bus_1.publish)(session, { kind: kind, ...payload });
            await sleep(1200 + Math.random() * 1200);
        }
    }
    return 0;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// -------------------------------------------------------------------- main ---
function usage() {
    console.log("TOOLSTORM - a terminal arcade fueled by Claude Code's tool calls\n");
    console.log("  node dist/cli.js launch              open the game beside Claude");
    console.log("  node dist/cli.js play                run the game in this terminal");
    console.log("  node dist/cli.js install-statusline  add the score HUD to settings.json");
    console.log("  node dist/cli.js remove-statusline   undo that");
    console.log("  node dist/cli.js status              print the live game state");
    console.log("  node dist/cli.js simulate            fake tool calls, no Claude needed");
}
async function main() {
    const argv = process.argv.slice(2);
    const command = argv[0] ?? "";
    switch (command) {
        case "launch":
            process.exit(launch(argv));
            break;
        case "play": {
            // Hand this terminal straight to the game.
            const session = resolveSession(argv);
            const args = [GAME_ENTRY, ...(session ? ["--session", session] : [])];
            if (argv.includes("--ascii"))
                args.push("--ascii");
            const child = (0, child_process_1.spawn)(process.execPath, args, { stdio: "inherit" });
            child.on("exit", (code) => process.exit(code ?? 0));
            break;
        }
        case "install-statusline":
            process.exit(installStatusline());
            break;
        case "remove-statusline":
            process.exit(removeStatusline());
            break;
        case "status":
            process.exit(status(argv));
            break;
        case "simulate":
            process.exit(await simulate(argv));
            break;
        default:
            usage();
            process.exit(command ? 1 : 0);
    }
}
void main();
