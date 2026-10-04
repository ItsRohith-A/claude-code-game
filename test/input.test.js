"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDecoder } = require("../dist/game/input");

const commands = (events) => events.filter((e) => e.type === "command").map((e) => e.command);

test("keys and arrows decode to commands", () => {
  const decode = createDecoder();
  assert.deepEqual(commands(decode("ad\x1b[D\x1b[C\x1bOA\x1b[B pr")), [
    "left",
    "right",
    "left",
    "right",
    "up",
    "down",
    "fire",
    "pause",
    "restart",
  ]);
});

test("menu keys decode to their own commands", () => {
  const decode = createDecoder();
  assert.deepEqual(commands(decode("ws\rbm\x7f")), ["up", "down", "confirm", "bomb", "menu", "back"]);
});

test("q quits and stops decoding", () => {
  const decode = createDecoder();
  assert.deepEqual(decode("aq d"), [{ type: "command", command: "left" }, { type: "quit" }]);
});

test("pointer movement aims without firing", () => {
  const decode = createDecoder();
  // Motion with no button: code 35 (32 motion + 3 none).
  assert.deepEqual(decode("\x1b[<35;40;10M"), [{ type: "aim", column: 40, row: 10 }]);
});

test("left button press and release toggle the trigger", () => {
  const decode = createDecoder();
  assert.deepEqual(decode("\x1b[<0;12;5M"), [
    { type: "aim", column: 12, row: 5 },
    { type: "trigger", held: true },
  ]);
  // Dragging with the button down (32 motion + 0 left) only aims.
  assert.deepEqual(decode("\x1b[<32;14;5M"), [{ type: "aim", column: 14, row: 5 }]);
  assert.deepEqual(decode("\x1b[<0;14;5m"), [
    { type: "aim", column: 14, row: 5 },
    { type: "trigger", held: false },
  ]);
});

test("right click pauses once, on release", () => {
  const decode = createDecoder();
  assert.deepEqual(commands(decode("\x1b[<2;5;5M")), []);
  assert.deepEqual(commands(decode("\x1b[<2;5;5m")), ["pause"]);
});

test("the wheel scrolls but never clicks or fires", () => {
  const decode = createDecoder();
  assert.deepEqual(decode("\x1b[<64;5;5M\x1b[<65;5;5M"), [
    { type: "wheel", down: false },
    { type: "wheel", down: true },
  ]);
});

test("middle click drops a bomb on release", () => {
  const decode = createDecoder();
  assert.deepEqual(commands(decode("\x1b[<1;5;5M")), []);
  assert.deepEqual(commands(decode("\x1b[<1;5;5m")), ["bomb"]);
});

test("a sequence split across reads is reassembled", () => {
  const decode = createDecoder();
  assert.deepEqual(decode("\x1b[<0;3"), []);
  assert.deepEqual(decode("0;7M"), [
    { type: "aim", column: 30, row: 7 },
    { type: "trigger", held: true },
  ]);
  assert.deepEqual(decode("\x1b"), []);
  assert.deepEqual(commands(decode("[D")), ["left"]);
});

test("mouse letters never leak out as key presses", () => {
  const decode = createDecoder();
  // 'M' and 'm' end mouse reports; digits and ';' must not become commands.
  const events = decode("\x1b[<35;100;20M\x1b[<0;100;20m");
  assert.equal(events.some((e) => e.type === "command"), false);
});
