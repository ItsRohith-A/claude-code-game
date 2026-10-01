/**
 * Hook entrypoint. Claude Code runs this for several hook events, passing the
 * event payload as JSON on stdin and the event kind as argv[2] (we pass it
 * explicitly from hooks.json rather than trusting hook_event_name alone).
 *
 * Contract with the rest of Claude Code: print nothing, always exit 0. Every
 * hook is registered `async: true`, so this process can never add latency to
 * the user's real work, and a crash here is invisible.
 */
import * as path from "path";
import { classifyTool, type GameEventKind } from "./events";
import { publish, resetLog } from "./bus";

interface HookPayload {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  notification_type?: string;
  message?: string;
  source?: string;
  turn_number?: number;
}

/** Commands whose success is worth celebrating with a power-up. */
const VERIFICATION = /\b(test|tests|jest|vitest|pytest|mocha|go\s+test|cargo\s+test|npm\s+run|pnpm\s+run|yarn\s+(?:run|test)|make|build|tsc|lint|eslint|ruff|mypy|gradle|mvn|dotnet\s+test)\b/i;

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

/** A short, screen-friendly label for the thing Claude just touched. */
function labelFor(payload: HookPayload): string | undefined {
  const input = payload.tool_input ?? {};
  const filePath = input["file_path"] ?? input["notebook_path"] ?? input["path"];
  if (typeof filePath === "string" && filePath) return path.basename(filePath);

  const command = input["command"];
  if (typeof command === "string" && command) {
    return command.trim().split(/\s+/).slice(0, 2).join(" ").slice(0, 24);
  }

  const pattern = input["pattern"] ?? input["query"] ?? input["url"];
  if (typeof pattern === "string" && pattern) return pattern.slice(0, 24);

  return undefined;
}

function isVerificationCommand(payload: HookPayload): boolean {
  const command = payload.tool_input?.["command"];
  return typeof command === "string" && VERIFICATION.test(command);
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

  const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || "unknown";
  const tool = payload.tool_name;
  const label = labelFor(payload);

  switch (event) {
    case "session-start": {
      // A resumed session keeps its run going; a fresh or cleared one restarts.
      if (payload.source === "startup" || payload.source === "clear") resetLog(sessionId);
      publish(sessionId, { kind: "session_start", label: payload.source });
      break;
    }

    case "turn-start":
      publish(sessionId, { kind: "turn_start", weight: payload.turn_number ?? 0 });
      break;

    case "pre-tool":
      publish(sessionId, { kind: "tool_pending", tool, label });
      break;

    case "post-tool": {
      if (!tool) break;
      // A Bash call only earns a power-up when it actually verified something;
      // otherwise it is just another thing that moved on screen.
      if ((tool === "Bash" || tool === "PowerShell") && !isVerificationCommand(payload)) {
        publish(sessionId, { kind: "scout", tool, label, weight: 1 });
        break;
      }
      const { kind, weight } = classifyTool(tool, false);
      publish(sessionId, { kind, tool, label, weight });
      break;
    }

    case "post-tool-failure": {
      const { kind, weight } = classifyTool(tool ?? "", true);
      publish(sessionId, { kind, tool, label, weight });
      break;
    }

    case "notification": {
      const type = payload.notification_type ?? "";
      // Only the notifications that genuinely need the human should steal focus.
      const needsHuman =
        type === "permission_prompt" ||
        type === "idle_prompt" ||
        type === "agent_needs_input" ||
        type === "elicitation_dialog" ||
        type === "elicitation_url_dialog";
      if (needsHuman) {
        publish(sessionId, { kind: "attention", label: payload.message?.slice(0, 60) });
      }
      break;
    }

    case "stop":
      publish(sessionId, { kind: "wave_clear", weight: payload.turn_number ?? 0 });
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
