import type { Command } from "./engine";

/**
 * Keyboard and mouse reader for the game pane.
 *
 * This process owns its own stdin, which is the whole reason the game lives in
 * a separate pane: inside Claude Code's pane the TUI owns the keyboard and a
 * hook never sees a keypress.
 *
 * Terminals report key presses but not releases, so "holding" a key is really
 * the terminal's auto-repeat delivering a stream of presses. Each press moves
 * a fixed step, which reads as smooth motion while held.
 *
 * The mouse is different: with SGR mouse reporting on, the terminal sends both
 * presses and releases, and every movement. The ship follows the pointer, and
 * holding the left button keeps firing.
 */

const ESC = "\x1b";

/**
 * Report button presses and releases (1000), movement with or without a button
 * held (1003), in SGR encoding (1006), which has no 223-column limit.
 */
export const MOUSE_ON = "\x1b[?1000h\x1b[?1003h\x1b[?1006h";
export const MOUSE_OFF = "\x1b[?1006l\x1b[?1003l\x1b[?1000l";

/** One decoded input. Mouse columns are 1-based terminal columns. */
export type InputEvent =
  | { type: "command"; command: Command }
  | { type: "quit" }
  | { type: "aim"; column: number }
  | { type: "trigger"; held: boolean };

/** `ESC [ < button ; column ; row M|m`, where `m` means released. */
const SGR_MOUSE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

/** Bits of the SGR button code. */
const MOTION = 32;
const WHEEL = 64;

/**
 * Turns raw stdin text into input events. Stateful only to carry an escape
 * sequence that a read split in half over to the next read.
 */
export function createDecoder(): (chunk: string) => InputEvent[] {
  let pending = "";

  return (chunk: string): InputEvent[] => {
    const text = pending + chunk;
    pending = "";
    const out: InputEvent[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === undefined) continue;

      if (ch === ESC) {
        const rest = text.slice(i);

        if (rest.startsWith(`${ESC}[<`)) {
          const match = SGR_MOUSE.exec(rest);
          if (!match) {
            // Unfinished: wait for the rest, unless it is clearly garbage.
            if (/^\x1b\[<[\d;]*$/.test(rest)) pending = rest;
            if (pending) break;
            continue;
          }
          i += match[0].length - 1;
          out.push(...mouseEvents(Number(match[1]), Number(match[2]), match[4] === "M"));
          continue;
        }

        // A read can end right after ESC: keep it for the next one.
        if (rest.length === 1) {
          pending = rest;
          break;
        }

        // Arrow keys arrive as ESC [ A..D, or ESC O A..D in application mode.
        if (rest[1] === "[" || rest[1] === "O") {
          if (rest.length < 3) {
            pending = rest;
            break;
          }
          const code = rest[2];
          i += 2;
          if (code === "D") out.push({ type: "command", command: "left" });
          else if (code === "C") out.push({ type: "command", command: "right" });
          else if (code === "A") out.push({ type: "command", command: "fire" });
          continue;
        }
        continue;
      }

      switch (ch) {
        case "a":
        case "A":
        case "h":
          out.push({ type: "command", command: "left" });
          break;
        case "d":
        case "D":
        case "l":
          out.push({ type: "command", command: "right" });
          break;
        case " ":
        case "w":
        case "W":
        case "k":
          out.push({ type: "command", command: "fire" });
          break;
        case "p":
        case "P":
          out.push({ type: "command", command: "pause" });
          break;
        case "r":
        case "R":
          out.push({ type: "command", command: "restart" });
          break;
        case "q":
        case "Q":
        case "\x03": // Ctrl+C
        case "\x04": // Ctrl+D
          out.push({ type: "quit" });
          return out;
        default:
          break;
      }
    }
    return out;
  };
}

function mouseEvents(code: number, column: number, pressed: boolean): InputEvent[] {
  // The wheel scrolls nothing here: ignore it rather than read it as a click.
  if (code & WHEEL) return [];
  const button = code & 3;
  const moved = (code & MOTION) !== 0;
  const out: InputEvent[] = [{ type: "aim", column }];

  if (moved) return out;
  if (button === 0) out.push({ type: "trigger", held: pressed });
  // Right click pauses; on release only, so one click is one toggle.
  else if (button === 2 && !pressed) out.push({ type: "command", command: "pause" });
  // SGR reports every release as button 3 in some terminals: let go of fire.
  else if (button === 3 && !pressed) out.push({ type: "trigger", held: false });
  return out;
}

export interface InputHandler {
  /** Commands collected since the last drain, in arrival order. */
  drain(): Command[];
  /** The last terminal column the pointer was in, once it has moved. */
  aim(): number | null;
  /** Whether the left mouse button is down. */
  firing(): boolean;
  stop(): void;
}

export function startInput(onQuit: () => void, mouse: boolean): InputHandler {
  let queue: Command[] = [];
  let aimColumn: number | null = null;
  let held = false;
  const decode = createDecoder();
  const stdin = process.stdin;

  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  if (mouse) process.stdout.write(MOUSE_ON);

  const onData = (chunk: string): void => {
    for (const event of decode(chunk)) {
      switch (event.type) {
        case "command":
          queue.push(event.command);
          break;
        case "aim":
          aimColumn = event.column;
          break;
        case "trigger":
          held = event.held;
          break;
        case "quit":
          onQuit();
          return;
      }
    }
  };

  stdin.on("data", onData);

  return {
    drain(): Command[] {
      const out = queue;
      queue = [];
      return out;
    },
    aim: () => aimColumn,
    firing: () => held,
    stop(): void {
      stdin.off("data", onData);
      // Leave the terminal as we found it, or its clicks keep printing junk.
      if (mouse) process.stdout.write(MOUSE_OFF);
      if (stdin.isTTY) {
        try {
          stdin.setRawMode(false);
        } catch {
          /* terminal already gone */
        }
      }
      stdin.pause();
    },
  };
}
