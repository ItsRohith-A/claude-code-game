/**
 * Hook entrypoint. Claude Code runs this for several hook events, passing the
 * event payload as JSON on stdin and the event kind as argv[2] (we pass it
 * explicitly from hooks.json rather than trusting hook_event_name alone).
 *
 * Contract with the rest of Claude Code: print nothing, always exit 0. Every
 * hook is registered `async: true`, so this process can never add latency to
 * the user's real work, and a crash here is invisible.
 */
import {
  classifyTool,
  isVerificationCommand,
  labelFor,
} from "./events";
import { gameIsLive, markCurrentSession, publish, resetLog } from "./bus";
import { ensureDirs, pluginRootPointerPath, pruneSessions, writeAtomic } from "./paths";

interface HookPayload {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  is_interrupt?: boolean;
  notification_type?: string;
  message?: string;
  source?: string;
}

/** Session files untouched for this long are deleted at the next session start. */
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Notifications that genuinely need the human, and so should pause the game. */
const NEEDS_HUMAN = new Set([
  "permission_prompt",
  "idle_prompt",
  "agent_needs_input",
  "elicitation_dialog",
  "elicitation_url_dialog",
]);

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    // If stdin never arrives, give up rather than hanging a background process.
    const timer = setTimeout(() => resolve(""), 2000);
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}

function onSessionStart(sessionId: string, payload: HookPayload): void {
  try {
    ensureDirs();
    // The status line shim reads this to find the current install, since an
    // update moves the plugin to a new versioned directory.
    writeAtomic(pluginRootPointerPath(), __dirname, 0o644);
  } catch {
    /* ignore */
  }
  pruneSessions(SESSION_RETENTION_MS);
  // A resumed session keeps its run going; a fresh or cleared one restarts.
  if (payload.source === "startup" || payload.source === "clear") resetLog(sessionId);
  markCurrentSession(sessionId);
  publish(sessionId, { kind: "session_start", label: payload.source });
}

async function main(): Promise<void> {
  const event = process.argv[2] ?? "";
  const raw = await readStdin();

  let payload: HookPayload = {};
  try {
    payload = raw.trim() ? (JSON.parse(raw) as HookPayload) : {};
  } catch {
    payload = {};
  }

  const sessionId = payload.session_id;
  if (!sessionId) return;

  if (event === "session-start") {
    onSessionStart(sessionId, payload);
    return;
  }

  if (event === "turn-start") markCurrentSession(sessionId);

  // Nobody is playing: the game skips old lines when it attaches, so writing
  // them would only grow a file nobody reads.
  if (!gameIsLive(sessionId)) return;

  const tool = payload.tool_name;
  const label = labelFor(payload.tool_input);
  const id = payload.tool_use_id;

  switch (event) {
    case "turn-start":
      publish(sessionId, { kind: "turn_start" });
      break;

    case "post-tool": {
      if (!tool) break;
      // A Bash call only earns a power-up when it actually verified something;
      // any other command sends a diver after the ship.
      if (tool === "Bash" || tool === "PowerShell") {
        const command = payload.tool_input?.["command"];
        if (typeof command !== "string" || !isVerificationCommand(command)) {
          publish(sessionId, { kind: "diver", tool, id, label, weight: 1 });
          break;
        }
      }
      const { kind, weight } = classifyTool(tool, false);
      publish(sessionId, { kind, tool, id, label, weight });
      break;
    }

    case "post-tool-failure": {
      // The user pressing Esc is not Claude failing: no heart lost for that.
      if (payload.is_interrupt) break;
      const { kind, weight } = classifyTool(tool ?? "", true);
      publish(sessionId, { kind, tool, id, label, weight });
      break;
    }

    case "permission-request":
      publish(sessionId, {
        kind: "attention",
        tool,
        id,
        label: `${tool ?? "a tool"} needs your approval`,
      });
      break;

    case "notification": {
      const type = payload.notification_type ?? "";
      if (NEEDS_HUMAN.has(type)) {
        publish(sessionId, { kind: "attention", label: payload.message?.slice(0, 60) });
      }
      break;
    }

    case "stop":
      publish(sessionId, { kind: "wave_clear" });
      break;

    case "subagent-stop":
      publish(sessionId, { kind: "ally", label: "a subagent reported back" });
      break;

    case "pre-compact":
      publish(sessionId, { kind: "supply", label: "context compacted" });
      break;

    case "session-end":
      publish(sessionId, { kind: "session_end" });
      break;

    default:
      break;
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0),
);
