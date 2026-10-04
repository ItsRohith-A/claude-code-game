/**
 * The game process. Runs in its own terminal pane so it owns a real keyboard,
 * tails the session event log the hooks write, and publishes a small state file
 * that the Claude Code status line renders as a HUD.
 */
import { EventTail, publishState, readCurrentSessionId, writeHighScore } from "../bus";
import { eventLogPath, ensureDirs } from "../paths";
import { fileProfileStore } from "../profile";
import { App } from "./app";
import { isDifficultyId, isModeId, type DifficultyId, type ModeId } from "./content";
import { pickFieldSize } from "./render";
import { MOUSE_OFF, startInput } from "./input";

const FPS = 30;
const FRAME_MS = Math.round(1000 / FPS);
/** How often the status-line state file is refreshed. */
const STATE_INTERVAL_MS = 400;

interface Args {
  sessionId: string | null;
  ascii: boolean;
  mouse: boolean;
  bell: boolean;
  mode: ModeId | undefined;
  difficulty: DifficultyId | undefined;
}

function parseArgs(argv: string[]): Args {
  let sessionId: string | null = null;
  let ascii = false;
  let mouse = process.env.CLAUDE_ARCADE_MOUSE !== "0";
  let bell = process.env.CLAUDE_ARCADE_BELL === "1";
  let mode: ModeId | undefined;
  let difficulty: DifficultyId | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--session" || arg === "-s") {
      sessionId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--mode") {
      const value = argv[i + 1];
      if (isModeId(value)) mode = value;
      i += 1;
    } else if (arg === "--difficulty") {
      const value = argv[i + 1];
      if (isDifficultyId(value)) difficulty = value;
      i += 1;
    } else if (arg === "--ascii") {
      ascii = true;
    } else if (arg === "--no-mouse") {
      mouse = false;
    } else if (arg === "--bell") {
      bell = true;
    }
  }
  if (!sessionId) sessionId = process.env.CLAUDE_ARCADE_SESSION ?? null;
  if (!sessionId) sessionId = readCurrentSessionId();
  return { sessionId, ascii, mouse, bell, mode, difficulty };
}

const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const HOME = "\x1b[H";
const CLEAR = "\x1b[2J";
const BELL = "\x07";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureDirs();

  const sessionId = args.sessionId ?? "standalone";
  const attached = args.sessionId !== null;

  let columns = process.stdout.columns ?? 100;
  let rows = process.stdout.rows ?? 30;
  const size = pickFieldSize(columns, rows);
  const app = new App({
    width: size.width,
    height: size.height,
    attached,
    store: fileProfileStore(),
    startMode: args.mode,
    difficulty: args.difficulty,
  });

  // Skip whatever is already in the log: attaching mid-session should not
  // replay an hour of tool calls as one enormous wave.
  const tail = attached ? new EventTail(eventLogPath(sessionId), true) : null;
  const ascii = args.ascii || process.env.CLAUDE_ARCADE_ASCII === "1";
  const sessionLabel = sessionId.slice(0, 8);

  let running = true;
  let lastFrame = Date.now();
  let lastState = 0;
  /** False while the terminal is still swallowing the previous frame. */
  let writable = true;
  let timer: NodeJS.Timeout | null = null;

  const quit = (): void => {
    if (!running) return;
    running = false;
    if (timer) clearInterval(timer);
    input.stop();
    const score = app.engine?.score ?? 0;
    app.finishRun();
    // The pre-0.3 single best score, kept for anything still reading it.
    writeHighScore(score);
    publishState({ ...app.snapshot(sessionId, process.pid), status: "detached" });
    process.stdout.write(LEAVE_SCREEN);
    process.stdout.write(score > 0 ? `TOOLSTORM - final score ${score}\n` : "TOOLSTORM - see you next time\n");
    process.exit(0);
  };

  const input = startInput(quit, args.mouse);

  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  // Closing the pane or window hangs up on us: still keep the score.
  process.on("SIGHUP", quit);
  // However we exit, a terminal left in mouse mode prints junk on every click.
  process.on("exit", () => {
    if (args.mouse) process.stdout.write(MOUSE_OFF);
  });
  process.stdout.on("drain", () => {
    writable = true;
  });
  process.stdout.on("resize", () => {
    columns = process.stdout.columns ?? columns;
    rows = process.stdout.rows ?? rows;
    // The run in progress keeps its field; the next one uses the new size.
    const next = pickFieldSize(columns, rows);
    app.resize(next.width, next.height);
    // Whatever the old size left on screen is now in the wrong place.
    process.stdout.write(CLEAR);
  });

  process.stdout.write(ENTER_SCREEN);

  timer = setInterval(() => {
    if (!running) return;

    const now = Date.now();
    // Clamp dt so a stalled pane (laptop sleep, scheduler hiccup) does not
    // teleport every enemy past the player on the next frame.
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (tail) {
      for (const event of tail.read()) app.ingest(event);
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
    if (input.firing()) app.trigger(true);
    if (app.quitRequested) {
      quit();
      return;
    }

    app.step(dt);
    const cues = app.drainCues();
    if (args.bell && cues.some((c) => c === "hit" || c === "boss" || c === "gameover")) process.stdout.write(BELL);

    // A slow terminal would otherwise queue frames in memory without bound;
    // skipping a frame costs nothing, the next one redraws everything.
    if (writable) {
      writable = process.stdout.write(HOME + app.frame({ columns, rows, ascii, mouse: args.mouse, sessionLabel }));
    }

    if (now - lastState >= STATE_INTERVAL_MS) {
      lastState = now;
      publishState(app.snapshot(sessionId, process.pid, now));
    }
  }, FRAME_MS);
}

main();
