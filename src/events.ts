/**
 * The contract between the hooks (producers) and the game (consumer).
 *
 * Hooks cannot talk to a terminal, so they append one JSON object per line to
 * a session log; the game process tails that log and turns each line into
 * something that happens on screen.
 */

export type GameEventKind =
  | "session_start"   // new run
  | "turn_start"      // user submitted a prompt: a wave begins
  | "tool_pending"    // PreToolUse: an enemy warps in
  | "bug"             // code was changed: spawn a bug
  | "scout"           // Claude read/searched: weak fast enemy
  | "probe"           // Claude hit the network: tougher, shoots back
  | "powerup"         // a command succeeded (tests passed): drop a pickup
  | "damage"          // a tool failed: you take a hit
  | "attention"       // Claude needs the human: pause the game
  | "resume"          // attention cleared
  | "wave_clear"      // Claude finished the turn
  | "session_end";

export interface GameEvent {
  /** Monotonic within a session; the game uses it to skip replayed lines. */
  seq: number;
  kind: GameEventKind;
  /** Epoch ms, for ordering and for ignoring stale events on a late attach. */
  at: number;
  /** Tool that caused this, when there was one. Shown on the enemy. */
  tool?: string;
  /** Short human label, e.g. a file basename. Rendered in the side log. */
  label?: string;
  /** How much the event is worth: enemy count, damage amount, etc. */
  weight?: number;
}

/** What the game publishes for the status line to render. */
export interface GameState {
  sessionId: string;
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  combo: number;
  enemies: number;
  status: "attached" | "playing" | "paused" | "attention" | "gameover" | "detached";
  /** Epoch ms of the last frame, so the HUD can tell a live game from a dead one. */
  heartbeat: number;
  pid: number;
}

export const MAX_LIVES = 3;

/** Tool name -> what it becomes in the game. The heart of the "work is fuel" design. */
export function classifyTool(toolName: string, failed: boolean): {
  kind: GameEventKind;
  weight: number;
} {
  if (failed) return { kind: "damage", weight: 1 };

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
