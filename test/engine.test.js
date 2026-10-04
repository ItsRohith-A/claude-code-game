"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Engine, MOVE_STEP } = require("../dist/game/engine");

const at = 1_000_000;

function attention(engine, id) {
  engine.ingest({ kind: "attention", at, id, label: "Bash needs your approval" });
  assert.equal(engine.status, "attention");
}

test("the permission banner clears when its own tool finishes", () => {
  const engine = new Engine(40, 20);
  attention(engine, "toolu_1");
  engine.ingest({ kind: "scout", at: at + 100, id: "toolu_1", tool: "Bash" });
  assert.equal(engine.status, "playing");
});

test("a parallel tool landing just after the prompt does not clear it", () => {
  const engine = new Engine(40, 20);
  attention(engine, "toolu_1");
  engine.ingest({ kind: "scout", at: at + 50, id: "toolu_0", tool: "Read" });
  assert.equal(engine.status, "attention");
  // Much later unrelated work means Claude moved on (the user denied it).
  engine.ingest({ kind: "scout", at: at + 5000, id: "toolu_2", tool: "Read" });
  assert.equal(engine.status, "playing");
});

test("a turn ending always clears the banner", () => {
  const engine = new Engine(40, 20);
  attention(engine, "toolu_1");
  engine.ingest({ kind: "wave_clear", at: at + 10 });
  assert.equal(engine.status, "playing");
  assert.equal(engine.wave, 2);
});

test("a shield absorbs one hit, then lives run out into game over", () => {
  const engine = new Engine(40, 20);
  engine.timers.shield = 5;
  engine.ingest({ kind: "damage", at, tool: "Bash" });
  assert.equal(engine.lives, 3);
  assert.equal(engine.timers.shield, 0);

  for (let i = 0; i < 3; i++) {
    engine.invulnTime = 0;
    engine.ingest({ kind: "damage", at, tool: "Bash" });
  }
  assert.equal(engine.lives, 0);
  assert.equal(engine.status, "gameover");
});

test("movement uses MOVE_STEP and stays on the field", () => {
  const engine = new Engine(40, 20);
  const start = engine.playerX;
  engine.apply("left");
  assert.equal(engine.playerX, start - MOVE_STEP);
  for (let i = 0; i < 100; i++) engine.apply("right");
  assert.equal(engine.playerX, 38);
});

test("moveTo puts the ship under the pointer, clamped to the field", () => {
  const engine = new Engine(40, 20);
  engine.moveTo(10);
  assert.equal(engine.playerX, 10);
  engine.moveTo(-5);
  assert.equal(engine.playerX, 1);
  engine.moveTo(500);
  assert.equal(engine.playerX, 38);
  engine.apply("pause");
  engine.moveTo(20);
  assert.equal(engine.playerX, 38);
});

test("pause freezes the field", () => {
  const engine = new Engine(40, 20);
  engine.ingest({ kind: "bug", at, tool: "Edit", weight: 1 });
  engine.step(0.5);
  const enemy = engine.enemies[0];
  assert.ok(enemy);
  const y = enemy.y;
  engine.apply("pause");
  engine.step(0.5);
  assert.equal(enemy.y, y);
});

test("tool events spawn enemies over time", () => {
  const engine = new Engine(40, 20);
  engine.ingest({ kind: "bug", at, tool: "Edit", weight: 2 });
  engine.ingest({ kind: "probe", at, tool: "WebFetch", weight: 1 });
  for (let i = 0; i < 20; i++) engine.step(0.05);
  const types = engine.enemies.map((e) => e.type).sort();
  assert.deepEqual(types, ["bug", "bug", "probe"]);
});
