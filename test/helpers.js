"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DIST = path.join(__dirname, "..", "dist");

/**
 * The environment for processes the tests start: only what Node, a shell and
 * Git Bash need to run, each named on purpose, plus the test's own values.
 * Nothing else from the developer's environment is passed on.
 */
function childEnv(extra) {
  const base = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TMPDIR: process.env.TMPDIR,
    ProgramFiles: process.env.ProgramFiles,
    CLAUDE_CODE_GIT_BASH_PATH: process.env.CLAUDE_CODE_GIT_BASH_PATH,
  };
  const env = {};
  for (const [key, value] of Object.entries({ ...base, ...extra })) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

/** A throwaway home directory with its own ~/.claude and ~/.claude-arcade. */
function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "toolstorm-test-"));
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const arcade = path.join(home, ".claude-arcade");
  return {
    home,
    arcade,
    settings: path.join(home, ".claude", "settings.json"),
    env: childEnv({ HOME: home, USERPROFILE: home, CLAUDE_ARCADE_HOME: arcade }),
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
