"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { tempHome, run } = require("./helpers");

function hook(box, event, payload) {
  const result = run("hook.js", [event], { env: box.env, input: JSON.stringify(payload) });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
}

function log(box, session) {
  try {
    return fs
      .readFileSync(path.join(box.arcade, "sessions", `${session}.jsonl`), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function startGame(box, session) {
  fs.mkdirSync(path.join(box.arcade, "sessions"), { recursive: true });
  fs.writeFileSync(
    path.join(box.arcade, "sessions", `${session}.state.json`),
    JSON.stringify({ sessionId: session, status: "playing", heartbeat: Date.now() }),
  );
}

test("nothing is written while no game is playing", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  hook(box, "session-start", { session_id: "s1", source: "startup" });
  hook(box, "post-tool", { session_id: "s1", tool_name: "Edit", tool_input: { file_path: "a.ts" } });
  assert.deepEqual(log(box, "s1").map((e) => e.kind), ["session_start"]);
  assert.equal(fs.readFileSync(path.join(box.arcade, "current-session"), "utf8"), "s1");
  assert.ok(fs.existsSync(path.join(box.arcade, "plugin-dist")));
});

test("a live game receives tool events", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  startGame(box, "s2");
  hook(box, "post-tool", { session_id: "s2", tool_name: "Edit", tool_use_id: "t1", tool_input: { file_path: "/x/a.ts" } });
  hook(box, "post-tool", { session_id: "s2", tool_name: "Bash", tool_input: { command: 'git commit -m "make it"' } });
  hook(box, "post-tool", { session_id: "s2", tool_name: "Bash", tool_input: { command: "npm test" } });
  hook(box, "permission-request", { session_id: "s2", tool_name: "Bash", tool_use_id: "t9" });
  const events = log(box, "s2");
  assert.deepEqual(events.map((e) => e.kind), ["bug", "scout", "powerup", "attention"]);
  assert.equal(events[0].id, "t1");
  assert.equal(events[0].label, "a.ts");
  assert.equal(events[3].id, "t9");
});

test("an interrupted tool costs no heart", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  startGame(box, "s3");
  hook(box, "post-tool-failure", { session_id: "s3", tool_name: "Bash", is_interrupt: true });
  hook(box, "post-tool-failure", { session_id: "s3", tool_name: "Bash", is_interrupt: false });
  assert.deepEqual(log(box, "s3").map((e) => e.kind), ["damage"]);
});

test("garbage on stdin is ignored quietly", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const result = run("hook.js", ["post-tool"], { env: box.env, input: "{not json" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});
