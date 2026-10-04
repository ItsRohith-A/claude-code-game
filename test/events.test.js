"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTool, isVerificationCommand, labelFor, splitCommand, isLive } = require("../dist/events");

test("verification commands earn a power-up", () => {
  for (const command of [
    "npm test",
    "npm run test:unit",
    "pnpm run build",
    "yarn lint",
    "npx vitest run",
    "pytest -q",
    "python -m pytest tests/",
    "cargo test --all",
    "go test ./...",
    "make",
    "./gradlew check",
    "dotnet test",
    "cd web && npm test",
    "CI=1 npm test",
    "tsc --noEmit",
    "npm test 2>&1 | tail -20",
  ]) {
    assert.equal(isVerificationCommand(command), true, command);
  }
});

test("commands that merely mention a verification word do not", () => {
  for (const command of [
    'git commit -m "make it build"',
    "git commit -m 'fix; make it work'",
    "npm run dev",
    "echo test",
    "ls tests/",
    "cat Makefile",
    "grep -r build src",
    "docker build .",
  ]) {
    assert.equal(isVerificationCommand(command), false, command);
  }
});

test("splitCommand respects quotes", () => {
  assert.deepEqual(splitCommand('a && b "c; d" || e | f; g'), ["a", 'b "c; d"', "e", "f", "g"]);
});

test("labels keep nothing that could be a secret", () => {
  assert.equal(labelFor({ file_path: "/home/me/project/src/auth.ts" }), "auth.ts");
  assert.equal(labelFor({ command: "npm test -- --watch" }), "npm test");
  assert.equal(labelFor({ command: "echo sk-live-123456" }), "echo");
  assert.equal(labelFor({ command: "npm run test:unit" }), "npm run");
  assert.equal(labelFor({ command: "API_KEY=sk-live-1 node deploy.js" }), "node");
  assert.equal(labelFor({ command: "curl -H 'Authorization: x' https://a.io" }), "curl");
  assert.equal(labelFor({ url: "https://api.example.com/v1?key=sk-live-123456" }), "api.example.com");
  assert.equal(labelFor({ query: "my private search" }), undefined);
  // A search pattern is a search term: it never reaches the log.
  assert.equal(labelFor({ pattern: "verifyToken" }), undefined);
  assert.equal(labelFor({ pattern: "TODO", path: "/repo/src" }), "src");
  assert.equal(labelFor(undefined), undefined);
});

test("tool classification", () => {
  assert.deepEqual(classifyTool("Edit", false), { kind: "bug", weight: 2 });
  assert.deepEqual(classifyTool("Read", false), { kind: "scout", weight: 1 });
  assert.deepEqual(classifyTool("WebFetch", false), { kind: "probe", weight: 1 });
  assert.deepEqual(classifyTool("Write", false), { kind: "splitter", weight: 1 });
  assert.deepEqual(classifyTool("Agent", false), { kind: "carrier", weight: 1 });
  assert.deepEqual(classifyTool("mcp__github__create_issue", false), { kind: "probe", weight: 1 });
  assert.deepEqual(classifyTool("TodoWrite", false), { kind: "scout", weight: 1 });
  assert.deepEqual(classifyTool("Edit", true), { kind: "damage", weight: 1 });
});

test("a state file is live only while fresh and attached", () => {
  const now = 1_000_000;
  const state = { status: "playing", heartbeat: now - 1000 };
  assert.equal(isLive(state, now), true);
  assert.equal(isLive({ ...state, heartbeat: now - 60_000 }, now), false);
  assert.equal(isLive({ ...state, status: "detached" }, now), false);
  assert.equal(isLive(null, now), false);
});
