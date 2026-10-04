"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Engine } = require("../dist/game/engine");
const { seededRng, dailyMutator, MUTATORS, BOSSES } = require("../dist/game/content");

const at = 1_000_000;

/** Run the engine for `seconds` in small steps. */
function run(engine, seconds, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) engine.step(dt);
}

function engine(options = {}) {
  return new Engine(40, 20, { rng: seededRng(7), ...options });
}

test("a turn ending after game over adds nothing to the score", () => {
  const e = engine();
  for (let i = 0; i < 3; i++) {
    e.invulnTime = 0;
    e.ingest({ kind: "damage", at, tool: "Bash" });
  }
  assert.equal(e.status, "gameover");
  const score = e.score;
  e.ingest({ kind: "wave_clear", at });
  assert.equal(e.score, score);
  assert.equal(e.wave, 1);
});

test("tool calls during game over queue no enemies", () => {
  const e = engine();
  e.lives = 1;
  e.ingest({ kind: "damage", at, tool: "Bash" });
  e.ingest({ kind: "bug", at, tool: "Edit", weight: 6 });
  e.status = "playing";
  run(e, 2);
  assert.equal(e.enemies.filter((x) => x.type === "bug").length, 0);
});

test("enemy speed is capped however many turns go by", () => {
  const e = engine();
  e.wave = 500;
  e.ingest({ kind: "scout", at, tool: "Read" });
  run(e, 0.4);
  const scout = e.enemies.find((x) => x.type === "scout");
  assert.ok(scout);
  assert.ok(scout.vy <= 5.2 * 1.8 * 1.15 + 1e-9, `vy ${scout.vy}`);
});

test("a splitter breaks into two scouts", () => {
  const e = engine();
  e.ingest({ kind: "splitter", at, tool: "Write" });
  run(e, 0.1);
  const splitter = e.enemies.find((x) => x.type === "splitter");
  assert.ok(splitter);
  splitter.hp = 1;
  e.bullets.push({ x: splitter.x, y: splitter.y, vx: 0, vy: 0 });
  e.step(0.001);
  assert.equal(e.enemies.filter((x) => x.type === "scout").length, 2);
  assert.equal(e.stats.kills, 1);
});

test("a bomb clears the field and scores every kill", () => {
  const e = engine();
  e.ingest({ kind: "bug", at, tool: "Edit", weight: 6 });
  run(e, 2.5);
  const count = e.enemies.length;
  assert.ok(count >= 5);
  assert.equal(e.bombs, 1);
  e.apply("bomb");
  assert.equal(e.enemies.length, 0);
  assert.equal(e.bombs, 0);
  assert.equal(e.stats.bombKillsBest, count);
  assert.ok(e.score > 0);
  e.apply("bomb");
  assert.equal(e.stats.bombsUsed, 1);
});

test("every fifth Claude turn brings a boss, which drops loot when beaten", () => {
  const e = engine();
  for (let i = 0; i < 4; i++) e.ingest({ kind: "wave_clear", at: at + i });
  assert.equal(e.wave, 5);
  e.ingest({ kind: "turn_start", at: at + 10 });
  const boss = e.boss();
  assert.ok(boss);
  assert.equal(boss.boss.spec.name, BOSSES[0].name);
  // A second prompt in the same wave does not stack another boss.
  e.ingest({ kind: "turn_start", at: at + 11 });
  assert.equal(e.enemies.filter((x) => x.type === "boss").length, 1);

  run(e, 1);
  // Dropping under half health speeds the sweep up without a jump.
  const x = boss.x;
  boss.hp = 1;
  e.step(0.001);
  assert.ok(Math.abs(boss.x - x) < 0.1, `boss jumped from ${x} to ${boss.x}`);
  e.bullets.push({ x: boss.x, y: boss.y + 0.5, vx: 0, vy: 0 });
  e.step(0.001);
  assert.equal(e.boss(), undefined);
  assert.equal(e.stats.bosses, 1);
  assert.ok(e.powerups.some((p) => p.type === "bomb"));
});

test("a 25 combo starts a fever that doubles points", () => {
  const e = engine();
  const base = e.multiplier();
  e.ingest({ kind: "scout", at, tool: "Read" });
  run(e, 0.4);
  e.combo = 24;
  e.comboTimer = 3;
  const scout = e.enemies[0];
  scout.hp = 1;
  e.bullets.push({ x: scout.x, y: scout.y, vx: 0, vy: 0 });
  e.step(0.001);
  assert.ok(e.feverTime > 0);
  assert.equal(e.stats.fevers, 1);
  assert.ok(e.multiplier() > base * 2);
});

test("zen mode never ends the run", () => {
  const e = engine({ mode: "zen" });
  for (let i = 0; i < 10; i++) {
    e.invulnTime = 0;
    e.ingest({ kind: "damage", at, tool: "Bash" });
  }
  assert.equal(e.status, "playing");
  assert.equal(e.lives, 3);
});

test("a daily run ignores Claude's tool calls but still pauses for the human", () => {
  const day = "2026-10-03";
  const e = engine({ mode: "daily", mutator: dailyMutator(day) });
  e.ingest({ kind: "bug", at, tool: "Edit", weight: 6 });
  e.ingest({ kind: "damage", at, tool: "Bash" });
  assert.equal(e.lives, e.maxLives);
  e.ingest({ kind: "attention", at, id: "t1", label: "Bash needs your approval" });
  assert.equal(e.status, "attention");
});

test("the daily mutator is the same all day and comes from the list", () => {
  assert.equal(dailyMutator("2026-10-03").id, dailyMutator("2026-10-03").id);
  assert.ok(MUTATORS.includes(dailyMutator("2026-10-04")));
  const glass = MUTATORS.find((m) => m.id === "glass");
  assert.equal(new Engine(40, 20, { mode: "daily", mutator: glass }).lives, 1);
});

test("a subagent sends a wingman and compaction sends a bomb", () => {
  const e = engine();
  e.ingest({ kind: "ally", at });
  e.ingest({ kind: "supply", at });
  assert.ok(e.timers.wingman > 0);
  assert.equal(e.bombs, 2);
  e.ingest({ kind: "scout", at, tool: "Read" });
  run(e, 1);
  assert.ok(e.bullets.some((b) => b.ally) || e.stats.kills > 0);
});

test("endless mode runs its own waves and clears them", () => {
  const e = engine({ mode: "endless" });
  // Shoot everything, constantly, until the first wave is clear.
  for (let t = 0; t < 120 && e.wave === 1; t += 0.05) {
    for (const enemy of e.enemies) enemy.hp = 0;
    e.enemies = [];
    e.step(0.05);
  }
  assert.equal(e.wave, 2);
  assert.equal(e.stats.wavesCleared, 1);
  // Claude's turns do not move the wave counter in endless.
  e.ingest({ kind: "wave_clear", at });
  assert.equal(e.wave, 2);
});

test("a laser shot pierces through a column of enemies", () => {
  const e = engine();
  e.timers.laser = 5;
  for (const y of [4, 8]) {
    e.enemies.push({ id: 900 + y, type: "scout", x: 20, y, vx: 0, vy: 0, hp: 1, maxHp: 1, hitFlash: 0, fireIn: 9, age: 0, points: 50 });
  }
  e.bullets.push({ x: 20, y: 8, vx: 0, vy: 0, pierce: true, hit: [] });
  e.step(0.001);
  e.bullets[0].y = 4;
  e.step(0.001);
  assert.equal(e.stats.kills, 2);
});

test("hard is faster, tougher and pays more than easy", () => {
  const spawnBug = (difficulty) => {
    const e = new Engine(40, 20, { rng: seededRng(7), difficulty });
    e.ingest({ kind: "bug", at, tool: "Edit", weight: 1 });
    e.step(0.4);
    return e;
  };
  const easy = spawnBug("easy");
  const hard = spawnBug("hard");
  assert.ok(hard.enemies[0].vy > easy.enemies[0].vy * 1.4);
  assert.equal(easy.enemies[0].maxHp, 2);
  assert.equal(hard.enemies[0].maxHp, 3);
  assert.ok(hard.multiplier() > easy.multiplier() * 2);
  assert.equal(easy.lives, 5);
  assert.equal(hard.lives, 2);
});

test("shrinking the pane mid-run refits the field without costing a life", () => {
  const e = new Engine(90, 30, { rng: seededRng(7) });
  e.moveTo(85);
  e.ingest({ kind: "bug", at, tool: "Edit", weight: 6 });
  run(e, 3);
  e.enemies.push({ id: 999, type: "scout", x: 80, y: 27, vx: 0, vy: 0, hp: 1, maxHp: 1, hitFlash: 0, fireIn: 9, age: 0, points: 50 });
  e.resize(40, 20);
  assert.equal(e.width, 40);
  assert.equal(e.playerX, 38);
  assert.ok(e.enemies.every((x) => x.x >= 1 && x.x <= 38 && x.y < 17));
  assert.ok(e.stars.every((s) => s.x < 40 && s.y < 20));
  run(e, 0.5);
  assert.equal(e.lives, 3);
});
