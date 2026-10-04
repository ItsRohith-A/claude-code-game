"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyRun,
  emptyProfile,
  levelFor,
  memoryProfileStore,
  normalizeProfile,
  BOARD_SIZE,
} = require("../dist/profile");
const { ACHIEVEMENTS, newlyEarned } = require("../dist/game/achievements");
const { emptyStats } = require("../dist/game/engine");
const { App } = require("../dist/game/app");
const { renderMenu, TITLE_ITEMS } = require("../dist/game/screens");
const { seededRng } = require("../dist/game/content");

const stats = (over = {}) => ({ ...emptyStats(), ...over });

test("levels need a little more XP each time", () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, needed: 400 });
  assert.equal(levelFor(399).level, 1);
  assert.equal(levelFor(400).level, 2);
  assert.equal(levelFor(400 + 600).level, 3);
});

test("a run lands on the board, ranked, and earns XP and trophies", () => {
  let profile = emptyProfile();
  for (const score of [500, 300, 900]) {
    profile = applyRun(profile, { mode: "storm", score, wave: 2, stats: stats({ kills: 10 }) }, []).profile;
  }
  const outcome = applyRun(profile, { mode: "storm", score: 700, wave: 3, stats: stats({ kills: 20 }) }, ["first_blood"]);
  assert.equal(outcome.rank, 2);
  assert.deepEqual(outcome.profile.boards.storm.map((r) => r.score), [900, 700, 500, 300]);
  assert.equal(outcome.profile.totals.runs, 4);
  assert.equal(outcome.profile.totals.kills, 50);
  assert.ok(outcome.profile.achievements.first_blood);
  assert.ok(outcome.xpGained >= 25);
});

test("boards keep only the top ten, and daily bests are kept per day", () => {
  let profile = emptyProfile();
  for (let i = 1; i <= 15; i++) {
    profile = applyRun(profile, { mode: "daily", score: i * 100, wave: 1, stats: stats(), day: "2026-10-03" }, []).profile;
  }
  assert.equal(profile.boards.daily.length, BOARD_SIZE);
  assert.equal(profile.boards.daily[0].score, 1500);
  assert.equal(profile.daily["2026-10-03"], 1500);
  const worse = applyRun(profile, { mode: "daily", score: 50, wave: 1, stats: stats(), day: "2026-10-03" }, []);
  assert.equal(worse.rank, 0);
  assert.equal(worse.newDailyBest, false);
});

test("a damaged profile file loads as a clean profile", () => {
  const p = normalizeProfile({ xp: "lots", totals: null, achievements: { bogus: 1, combo_10: 5 }, boards: { storm: [{ nope: 1 }] }, skin: 4 });
  assert.equal(p.xp, 0);
  assert.deepEqual(Object.keys(p.achievements), ["combo_10"]);
  assert.deepEqual(p.boards.storm, []);
  assert.equal(p.skin, "pioneer");
  const partial = normalizeProfile({ boards: { storm: [{ score: 5 }, { score: 9, wave: "x", difficulty: "nope" }] } });
  assert.deepEqual(partial.boards.storm, [
    { score: 9, wave: 0, kills: 0, maxCombo: 0, at: 0 },
    { score: 5, wave: 0, kills: 0, maxCombo: 0, at: 0 },
  ]);
  assert.equal(normalizeProfile(null).version, 1);
});

test("achievements fire once each, from run stats and lifetime totals", () => {
  const ctx = {
    stats: stats({ kills: 1, maxCombo: 12 }),
    mode: "storm",
    score: 0,
    wave: 1,
    totals: { runs: 0, kills: 1, bosses: 0, powerups: 0, playSeconds: 0, toolEvents: 300 },
    finished: false,
  };
  const ids = newlyEarned(ctx, new Set()).map((a) => a.id).sort();
  assert.deepEqual(ids, ["combo_10", "first_blood", "witness"]);
  assert.deepEqual(newlyEarned(ctx, new Set(ids)), []);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

function app(options = {}) {
  return new App({ width: 40, height: 20, attached: false, store: memoryProfileStore(), rng: seededRng(3), ...options });
}

test("the title menu starts the chosen mode", () => {
  const a = app();
  assert.equal(a.screen, "title");
  a.handle("down");
  a.handle("confirm");
  assert.equal(a.screen, "game");
  assert.equal(a.engine.mode.id, "endless");
  assert.equal(a.snapshot("s", 1).status, "playing");
});

test("a finished run is recorded once, then R starts a fresh one", () => {
  const store = memoryProfileStore();
  const a = app({ store, startMode: "storm" });
  a.engine.score = 4200;
  a.engine.stats.kills = 30;
  a.engine.lives = 1;
  a.engine.ingest({ kind: "damage", at: 1, tool: "Bash" });
  a.step(0.05);
  a.step(0.05);
  assert.equal(a.engine.status, "gameover");
  assert.ok(a.summary);
  assert.equal(a.summary.rank, 1);
  assert.equal(store.load().totals.runs, 1);
  a.handle("restart");
  assert.equal(a.engine.status, "playing");
  assert.equal(a.engine.score, 0);
  a.handle("pause");
  a.handle("menu");
  assert.equal(a.screen, "title");
  // The second, empty run was too short to keep.
  assert.equal(store.load().totals.runs, 1);
});

test("a locked ship cannot be equipped, an unlocked one can", () => {
  const store = memoryProfileStore();
  const a = app({ store });
  a.cursor = TITLE_ITEMS.indexOf("hangar");
  a.handle("confirm");
  assert.equal(a.screen, "hangar");
  a.handle("down");
  a.handle("confirm");
  assert.equal(store.load().skin, "pioneer");
  a.profile.xp = 100_000;
  store.update((p) => ({ ...p, xp: 100_000 }));
  a.handle("confirm");
  assert.equal(store.load().skin, "trident");
  a.handle("back");
  assert.equal(a.screen, "title");
});

test("every screen renders at small and large sizes, in ASCII too", () => {
  const a = app();
  for (const [columns, rows] of [[40, 16], [120, 40]]) {
    for (const ascii of [false, true]) {
      for (const cursor of ["hangar", "trophies", "scores"].map((item) => TITLE_ITEMS.indexOf(item))) {
        a.screen = "title";
        a.cursor = cursor;
        assert.ok(a.frame({ columns, rows, ascii, mouse: true, sessionLabel: "abc" }).length > 0);
        a.handle("confirm");
        assert.notEqual(a.screen, "title");
        assert.ok(a.frame({ columns, rows, ascii, mouse: true, sessionLabel: "abc" }).length > 0);
        a.handle("back");
      }
      a.startRun("endless");
      a.engine.lives = 99;
      for (let i = 0; i < 200; i++) a.step(0.05);
      a.engine.apply("bomb");
      a.engine.ingest({ kind: "carrier", at: 1, tool: "Agent" });
      for (let i = 0; i < 40; i++) a.step(0.05);
      assert.ok(a.frame({ columns, rows, ascii, mouse: false, sessionLabel: "abc" }).length > 0);
      a.engine.apply("pause");
      assert.ok(a.frame({ columns, rows, ascii, mouse: false, sessionLabel: "abc" }).includes("PAUSED"));
      a.handle("menu");
    }
  }
  assert.equal(typeof renderMenu, "function");
});

test("a menu click only acts on the row it lands on", () => {
  const a = app();
  a.frame({ columns: 100, rows: 30, ascii: false, mouse: true, sessionLabel: "abc" });
  // A focus click on empty space opens nothing.
  a.point(5, 1);
  a.trigger(true);
  a.trigger(false);
  assert.equal(a.screen, "title");
  // A click on the ENDLESS row starts it.
  const { titleMenuTop } = require("../dist/game/screens");
  a.point(20, titleMenuTop(100, 30) + 2);
  a.trigger(true);
  assert.equal(a.screen, "game");
  assert.equal(a.engine.mode.id, "endless");
});

test("the hangar says why ENTER did nothing", () => {
  const a = app();
  a.cursor = TITLE_ITEMS.indexOf("hangar");
  a.handle("confirm");
  a.handle("confirm");
  assert.match(a.notice, /already your ship/);
  a.handle("down");
  a.handle("confirm");
  assert.match(a.notice, /locked until level 3/);
});

test("difficulty is chosen on the title menu, saved, and used by the next run", () => {
  const store = memoryProfileStore();
  const a = app({ store });
  a.cursor = TITLE_ITEMS.indexOf("difficulty");
  a.handle("right");
  assert.equal(store.load().difficulty, "hard");
  a.handle("left");
  a.handle("left");
  assert.equal(store.load().difficulty, "easy");
  a.handle("down");
  a.cursor = 0;
  a.handle("confirm");
  assert.equal(a.engine.difficulty.id, "easy");
  assert.equal(a.engine.lives, 5);
  assert.equal(a.snapshot("s", 1).maxLives, 5);
});

test("daily runs are always medium, whatever the setting", () => {
  const store = memoryProfileStore();
  const a = app({ store, difficulty: "hard" });
  assert.equal(store.load().difficulty, "hard");
  a.startRun("daily");
  assert.equal(a.engine.difficulty.id, "medium");
  a.startRun("endless");
  assert.equal(a.engine.difficulty.id, "hard");
  assert.equal(a.engine.lives, 2);
});
