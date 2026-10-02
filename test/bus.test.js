"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { tempHome } = require("./helpers");

test("EventTail returns whole lines only and survives truncation", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const { EventTail } = require("../dist/bus");
  const file = path.join(box.home, "log.jsonl");
  fs.writeFileSync(file, '{"kind":"old","at":1}\n');

  const tail = new EventTail(file, true);
  assert.deepEqual(tail.read(), []);

  fs.appendFileSync(file, '{"kind":"bug","at":2}\n{"kind":"sc');
  assert.deepEqual(tail.read().map((e) => e.kind), ["bug"]);
  fs.appendFileSync(file, 'out","at":3}\nnot json\n');
  assert.deepEqual(tail.read().map((e) => e.kind), ["scout"]);

  fs.writeFileSync(file, '{"kind":"session_start","at":4}\n');
  assert.deepEqual(tail.read().map((e) => e.kind), ["session_start"]);
});

test("pruneSessions removes only old files", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  process.env.CLAUDE_ARCADE_HOME = box.arcade;
  t.after(() => delete process.env.CLAUDE_ARCADE_HOME);
  const { ensureDirs, sessionsDir, pruneSessions } = require("../dist/paths");

  ensureDirs();
  const fresh = path.join(sessionsDir(), "fresh.jsonl");
  const stale = path.join(sessionsDir(), "stale.jsonl");
  fs.writeFileSync(fresh, "");
  fs.writeFileSync(stale, "");
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  fs.utimesSync(stale, old, old);

  pruneSessions(7 * 24 * 3600 * 1000);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(stale), false);
});

test("writeAtomic writes through a symlink", { skip: process.platform === "win32" }, (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const { writeAtomic } = require("../dist/paths");
  const real = path.join(box.home, "real.json");
  const link = path.join(box.home, "link.json");
  fs.writeFileSync(real, "{}");
  fs.symlinkSync(real, link);

  writeAtomic(link, '{"a":1}');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(real, "utf8"), '{"a":1}');
});
