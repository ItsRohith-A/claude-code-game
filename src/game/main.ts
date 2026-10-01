/**
 * The game process. Runs in its own terminal pane so it owns a real keyboard,
 * tails the session event log the hooks write, and publishes a small state file
 * that the Claude Code status line renders as a HUD.
 */
import { EventTail, publishState, readCurrentSessionId, readHighScore, writeHighScore } from "../bus";
import { eventLogPath, ensureDirs } from "../paths";
import { Engine } from "./engine";
import { pickFieldSize, renderFrame, type RenderOptions } from "./render";
import { startInput, MOVE_STEP } from "./input";
import type { GameState } from "../events";

const FPS = 24;
const FRAME_MS = Math.round(1000 / FPS);
/** How often the status-line state file is refreshed. */
const STATE_INTERVAL_MS = 400;

interface Args {
  sessionId: string | null;
  ascii: boolean;
}

function parseArgs(argv: string[]): Args {
  let sessionId: string | null = null;
  let ascii = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--session" || arg === "-s") {
      sessionId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--ascii") {
      ascii = true;
    }
  }
  if (!sessionId) sessionId = process.env.CLAUDE_ARCADE_SESSION ?? null;
  if (!sessionId) sessionId = readCurrentSessionId();
  return { sessionId, ascii };
}

const ESC = String.fromCharCode(27);
const ENTER_SCREEN = `${ESC}[?1049h${ESC}[?25l`;
const LEAVE_SCREEN = `${ESC}[?25h${ESC}[?1049l`;
const HOME = `${ESC}[H`;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureDirs();

  const sessionId = args.sessionId ?? "standalone";
  const attached = args.sessionId !== null;
  const highScore = readHighScore();

  const columns = process.stdout.columns ?? 100;
  const rows = process.stdout.rows ?? 30;
  const size = pickFieldSize(columns, rows);
  const engine = new Engine(size.width, size.height);

  // Skip whatever is already in the log: attaching mid-session should not
  // replay an hour of tool calls as one enormous wave.
  const tail = attached ? new EventTail(eventLogPath(sessionId), true) : null;

  const opts: RenderOptions = {
    columns,
    rows,
    ascii: args.ascii || process.env.CLAUDE_ARCADE_ASCII === "1",
    sessionLabel: sessionId.slice(0, 8),
    attached,
    highScore,
  };

  let running = true;
  let lastFrame = Date.now();
  let lastState = 0;
  let timer: NodeJS.Timeout | null = null;

  const quit = (): void => {
    if (!running) return;
    running = false;
    if (timer) clearInterval(timer);
    input.stop();
    writeHighScore(engine.score);
    publishState(snapshot(engine, sessionId, "detached", highScore));
    process.stdout.write(LEAVE_SCREEN);
    process.stdout.write(
      `TOOLSTORM - final score ${engine.score}, wave ${engine.wave}\n`,
    );
    process.exit(0);
  };

  const input = startInput(quit);

  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  process.stdout.on("resize", () => {
    opts.columns = process.stdout.columns ?? opts.columns;
    opts.rows = process.stdout.rows ?? opts.rows;
  });

  process.stdout.write(ENTER_SCREEN);
  engine.pushLog(attached ? "attached to session" : "no session - solo run", "cyan");

  timer = setInterval(() => {
    if (!running) return;

    const now = Date.now();
    // Clamp dt so a stalled pane (laptop sleep, scheduler hiccup) does not
    // teleport every enemy past the player on the next frame.
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (tail) {
      for (const event of tail.read()) engine.ingest(event);
    }

    for (const command of input.drain()) {
      if (command === "left") engine.moveBy(-MOVE_STEP);
      else if (command === "right") engine.moveBy(MOVE_STEP);
      else engine.apply(command);
    }

    engine.step(dt);
    process.stdout.write(HOME + renderFrame(engine, opts));

    if (now - lastState >= STATE_INTERVAL_MS) {
      lastState = now;
      publishState(snapshot(engine, sessionId, statusForHud(engine.status), highScore));
    }
  }, FRAME_MS);
}

function statusForHud(status: Engine["status"]): GameState["status"] {
  return status;
}

function snapshot(
  engine: Engine,
  sessionId: string,
  status: GameState["status"],
  highScore: number,
): GameState {
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
