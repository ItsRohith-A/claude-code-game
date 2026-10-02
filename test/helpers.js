"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DIST = path.join(__dirname, "..", "dist");

/** A throwaway home directory with its own ~/.claude and ~/.claude-arcade. */
function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "toolstorm-test-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const arcade = path.join(home, ".claude-arcade");
  return {
    home,
    arcade,
    settings: path.join(home, ".claude", "settings.json"),
    env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_ARCADE_HOME: arcade },
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

/** Run one of the built entry points with stdin and an environment. */
function run(entry, args, { env, input = "" } = {}) {
  return spawnSync(process.execPath, [path.join(DIST, entry), ...args], {
    env,
    input,
    encoding: "utf8",
    timeout: 15000,
  });
}

module.exports = { DIST, tempHome, run };
