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
/** Status line refresh in seconds. Low enough to feel live, high enough to be cheap. */
const STATUSLINE_REFRESH = 2;
function settingsPath() {
    return path.join(os.homedir(), ".claude", "settings.json");
}
/** A copy of the whole settings.json from before our last edit. */
function settingsBackupPath() {
    return path.join((0, paths_1.rootDir)(), "settings-backup.json");
}
/** Forward slashes keep the path safe inside a JSON string and a shell command. */
function posix(p) {
    return p.replace(/\\/g, "/");
}
function resolveSession(argv) {
    const flag = argv.indexOf("--session");
    if (flag !== -1 && argv[flag + 1])
        return argv[flag + 1] ?? null;
    // Last resort: whichever session submitted a prompt most recently. The
    // /toolstorm skill always passes --session, so this only serves people
    // running the CLI by hand.
    return (0, bus_1.readCurrentSessionId)();
}
// ---------------------------------------------------------------- launching ---
/** Quote one argument for a POSIX shell. */
function shQuote(arg) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}
/** Quote one argument the way Windows programs split their command line. */
function winQuote(arg) {
    return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}
/** Escape text for the inside of an AppleScript string literal. */
function appleString(text) {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
/** For terminal CLIs that report failure: run to completion, check the status. */
function viaCli(name, command, args) {
    return {
        name,
        run: () => (0, child_process_1.spawnSync)(command, args, { stdio: "ignore", windowsHide: true }).status === 0,
    };
}
/** For GUI launchers that hand off and return: fire and forget. */
function detachedLauncher(name, command, args, extra = {}) {
    return {
        name,
        run: () => {
            try {
                const child = (0, child_process_1.spawn)(command, args, { detached: true, stdio: "ignore", ...extra });
                child.on("error", () => {
                    /* reported to nobody: we already printed a launch message */
                });
                child.unref();
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
/**
 * Every way we know to put the game beside Claude, best first. Splitting the
 * pane Claude is in beats a floating window, so multiplexers and terminals
 * with a split CLI come first, each only when we are actually inside it.
 */
function launchers(gameArgs) {
    const node = process.execPath;
    const argv = [node, GAME_ENTRY, ...gameArgs];
    const shellCommand = argv.map(shQuote).join(" ");
    const out = [];
    if (process.env.TMUX) {
        // tmux runs its command through a shell, so hand it one quoted string.
        out.push(viaCli("tmux split", "tmux", ["split-window", "-h", shellCommand]));
    }
    if (process.env.ZELLIJ) {
        out.push(viaCli("zellij pane", "zellij", ["run", "--direction", "right", "--name", "TOOLSTORM", "--", ...argv]));
    }
    if (process.env.WEZTERM_PANE) {
        out.push(viaCli("WezTerm split", "wezterm", ["cli", "split-pane", "--right", "--", ...argv]));
    }
    if (process.env.KITTY_WINDOW_ID) {
        // Needs allow_remote_control in kitty.conf; falls through when it is off.
        out.push(viaCli("kitty split", "kitty", ["@", "launch", "--location=vsplit", "--title", "TOOLSTORM", ...argv]));
    }
    if (process.platform === "win32") {
        // Only split Windows Terminal when we are inside it: `-w 0` means "the
        // most recent window", which from VS Code would be some other window.
        if (process.env.WT_SESSION && hasCommand("wt")) {
            out.push(detachedLauncher("Windows Terminal split", "wt", [
                "-w",
                "0",
                "split-pane",
                "-V",
                "--title",
                "TOOLSTORM",
                ...argv,
            ]));
        }
        // `start` reads its first argument as the window title only when it is
        // quoted, so build the command line ourselves rather than let Node quote.
        const line = `start "TOOLSTORM" ${argv.map(winQuote).join(" ")}`;
        out.push(detachedLauncher("new console window", "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
            windowsVerbatimArguments: true,
        }));
        return out;
    }
    if (process.platform === "darwin") {
        if (process.env.TERM_PROGRAM === "iTerm.app") {
            const script = `tell application "iTerm" to tell current session of current window to ` +
                `split vertically with default profile command "${appleString(shellCommand)}"`;
            out.push(viaCli("iTerm split", "osascript", ["-e", script]));
        }
        const script = `tell application "Terminal"\n` +
            `  do script "${appleString(shellCommand)}"\n` +
            `  activate\n` +
            `end tell`;
        out.push(viaCli("Terminal.app window", "osascript", ["-e", script]));
        return out;
    }
    for (const term of ["x-terminal-emulator", "gnome-terminal", "konsole", "alacritty", "xterm"]) {
        if (hasCommand(term)) {
            const args = term === "gnome-terminal" ? ["--", ...argv] : ["-e", ...argv];
            out.push(detachedLauncher(term, term, args));
        }
    }
    return out;
}
function hasCommand(name) {
    const probe = process.platform === "win32" ? "where" : "which";
    const result = (0, child_process_1.spawnSync)(probe, [name], { stdio: "ignore", windowsHide: true });
    return result.status === 0;
}
function launch(argv) {
    const session = resolveSession(argv);
    const gameArgs = session ? ["--session", session] : [];
    if (argv.includes("--ascii"))
        gameArgs.push("--ascii");
    if (argv.includes("--no-mouse"))
        gameArgs.push("--no-mouse");
    const used = launchers(gameArgs).find((launcher) => launcher.run());
    if (!used) {
        console.error("Could not find a terminal to open. Run this in a spare pane instead:");
        console.error(`  node "${posix(GAME_ENTRY)}"${session ? ` --session ${session}` : ""}`);
        return 1;
    }
    console.log(`TOOLSTORM launched (${used.name}).`);
    if (session)
        console.log(`Attached to session ${session.slice(0, 8)} - your tool calls feed it.`);
    else
        console.log("No Claude session found yet; it will run standalone.");
    console.log("Controls: mouse or arrows/A/D move, click or SPACE fires, P pauses, Q quits.");
    return 0;
}
/**
 * Read settings.json. A missing file is an empty object; a file we cannot
 * parse is an error, never an empty object: writing one back would erase
 * every setting the user has.
 */
function readSettings(file) {
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT")
            return { settings: {} };
        return { error: `could not read ${posix(file)}: ${err.message}` };
    }
    if (!text.trim())
        return { settings: {} };
    try {
        const parsed = JSON.parse(text.replace(/^﻿/, ""));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return { settings: parsed };
        }
        return { error: `${posix(file)} does not hold a JSON object` };
    }
    catch (err) {
        return { error: `${posix(file)} is not valid JSON (${err.message})` };
    }
}
function readJsonObject(file) {
    const result = readSettings(file);
    return "settings" in result && Object.keys(result.settings).length > 0 ? result.settings : null;
}
/** Keep a copy of the file as it was, then write the new one in its place. */
function writeSettings(file, settings) {
    (0, paths_1.ensureDirs)();
    if (fs.existsSync(file)) {
        // settings.json can hold tokens in `env`: keep the copy private.
        fs.copyFileSync(file, settingsBackupPath());
        fs.chmodSync(settingsBackupPath(), 0o600);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    (0, paths_1.writeAtomic)(file, JSON.stringify(settings, null, 2) + "\n", 0o644);
}
/**
 * A small file at a stable path that loads the current install's status line.
 * The plugin root moves on every update; settings.json must not follow it.
 */
function writeStatuslineShim() {
    (0, paths_1.ensureDirs)();
    (0, paths_1.writeAtomic)((0, paths_1.pluginRootPointerPath)(), __dirname, 0o644);
    const shim = (0, paths_1.statuslineShimPath)();
    const source = [
        "// TOOLSTORM status line shim, written by `/toolstorm install`.",
        "// Loads the status line from the current plugin install, wherever that is.",
        'const fs = require("fs");',
        'const path = require("path");',
        `let dir = ${JSON.stringify(__dirname)};`,
        "try {",
        `  const current = fs.readFileSync(${JSON.stringify((0, paths_1.pluginRootPointerPath)())}, "utf8").trim();`,
        '  if (current && fs.existsSync(path.join(current, "statusline.js"))) dir = current;',
        "} catch {}",
        'try { require(path.join(dir, "statusline.js")); } catch {}',
        "",
    ].join("\n");
    (0, paths_1.writeAtomic)(shim, source, 0o644);
    return shim;
}
function failSettings(error) {
    console.error(`Left your settings untouched: ${error}.`);
    console.error("Fix the file, or add this to it by hand:");
    console.error(JSON.stringify({ statusLine: { type: "command", command: `node "${posix((0, paths_1.statuslineShimPath)())}"` } }, null, 2));
    return 1;
}
function installStatusline() {
    const file = settingsPath();
    const read = readSettings(file);
    if ("error" in read)
        return failSettings(read.error);
    const settings = read.settings;
    const shim = writeStatuslineShim();
    const desired = {
        type: "command",
        command: `node "${posix(shim)}"`,
        refreshInterval: STATUSLINE_REFRESH,
    };
    const existing = settings["statusLine"];
    const current = existing && typeof existing === "object" ? existing : null;
    if (current && (0, paths_1.isToolstormStatusline)(current.command)) {
        if (current.command === desired.command) {
            console.log("TOOLSTORM status line already installed.");
            return 0;
        }
        // An older version pointed into the plugin root: move it to the shim.
        settings["statusLine"] = { ...current, ...desired };
        writeSettings(file, settings);
        console.log("Updated the TOOLSTORM status line to survive plugin updates.");
        return 0;
    }
    if (current) {
        // Keep whatever the user had: remove-statusline puts it back, and the HUD
        // keeps running it as its first row in the meantime.
        (0, paths_1.writeAtomic)((0, paths_1.statuslineBackupPath)(), JSON.stringify(existing, null, 2));
        console.log(`Saved your existing status line to ${posix((0, paths_1.statuslineBackupPath)())}`);
        console.log("It keeps running: its output stays on the first row.");
    }
    else {
        // Nothing to restore later, so a backup left from an old install is stale.
        fs.rmSync((0, paths_1.statuslineBackupPath)(), { force: true });
    }
    const existed = fs.existsSync(file);
    settings["statusLine"] = desired;
    writeSettings(file, settings);
    console.log(`Installed the TOOLSTORM HUD into ${posix(file)}`);
    if (existed)
        console.log(`A copy of the previous file is at ${posix(settingsBackupPath())}`);
    console.log("Restart Claude Code (or run /statusline) to pick it up.");
    return 0;
}
function removeStatusline() {
    const file = settingsPath();
    const read = readSettings(file);
    if ("error" in read)
        return failSettings(read.error);
    const settings = read.settings;
    const existing = settings["statusLine"];
    if (!existing || !(0, paths_1.isToolstormStatusline)(existing.command)) {
        console.log("TOOLSTORM status line is not installed; nothing to do.");
        return 0;
    }
    const backup = readJsonObject((0, paths_1.statuslineBackupPath)());
    if (backup && typeof backup["command"] === "string" && !(0, paths_1.isToolstormStatusline)(backup["command"])) {
        settings["statusLine"] = backup;
        console.log("Restored your previous status line.");
    }
    else {
        delete settings["statusLine"];
        console.log("Removed the status line entry.");
    }
    writeSettings(file, settings);
    fs.rmSync((0, paths_1.statuslineBackupPath)(), { force: true });
    fs.rmSync((0, paths_1.statuslineShimPath)(), { force: true });
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
            if (argv.includes("--no-mouse"))
                args.push("--no-mouse");
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
