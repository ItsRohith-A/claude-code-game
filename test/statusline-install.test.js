"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { tempHome, run } = require("./helpers");

function cli(box, command) {
  return run("cli.js", [command], { env: box.env });
}

function settings(box) {
  return JSON.parse(fs.readFileSync(box.settings, "utf8"));
}

test("a settings file that does not parse is left untouched", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const broken = '{\n  "model": "opus",\n  "permissions": {"allow": ["Bash(ls)"]},\n}\n';
  fs.writeFileSync(box.settings, broken);

  const result = cli(box, "install-statusline");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Left your settings untouched/);
  assert.equal(fs.readFileSync(box.settings, "utf8"), broken);
});

test("install keeps every other setting and points at the stable shim", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  fs.writeFileSync(box.settings, JSON.stringify({ model: "opus", env: { A: "1" } }));

  assert.equal(cli(box, "install-statusline").status, 0);
  const s = settings(box);
  assert.equal(s.model, "opus");
  assert.deepEqual(s.env, { A: "1" });
  assert.match(s.statusLine.command, /toolstorm-statusline\.js"$/);
  assert.ok(fs.existsSync(path.join(box.arcade, "toolstorm-statusline.js")));
  assert.ok(fs.existsSync(path.join(box.arcade, "settings-backup.json")));

  assert.match(cli(box, "install-statusline").stdout, /already installed/);
});

test("someone else's statusline.js is backed up, chained, and restored", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const theirs = { type: "command", command: "node ~/scripts/statusline.js" };
  fs.writeFileSync(box.settings, JSON.stringify({ statusLine: theirs, model: "opus" }));

  const install = cli(box, "install-statusline");
  assert.equal(install.status, 0);
  assert.match(install.stdout, /Saved your existing status line/);
  assert.notEqual(settings(box).statusLine.command, theirs.command);

  assert.equal(cli(box, "remove-statusline").status, 0);
  assert.deepEqual(settings(box), { statusLine: theirs, model: "opus" });
  assert.equal(fs.existsSync(path.join(box.arcade, "statusline-backup.json")), false);
  assert.equal(fs.existsSync(path.join(box.arcade, "toolstorm-statusline.js")), false);
});

test("remove leaves a status line that is not ours alone", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const theirs = { statusLine: { type: "command", command: "node ~/scripts/statusline.js" } };
  fs.writeFileSync(box.settings, JSON.stringify(theirs));

  assert.match(cli(box, "remove-statusline").stdout, /not installed/);
  assert.deepEqual(settings(box), theirs);
});

test("an install from an older version moves to the shim", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  const legacy = 'node "/home/me/.claude/plugins/cache/toolstorm/toolstorm/0.1.0/dist/statusline.js"';
  fs.writeFileSync(box.settings, JSON.stringify({ statusLine: { type: "command", command: legacy } }));

  const result = cli(box, "install-statusline");
  assert.match(result.stdout, /survive plugin updates/);
  assert.match(settings(box).statusLine.command, /toolstorm-statusline\.js"$/);
  assert.equal(fs.existsSync(path.join(box.arcade, "statusline-backup.json")), false);
});

test("the HUD runs the user's previous status line as its first row", (t) => {
  const box = tempHome();
  t.after(box.cleanup);
  fs.mkdirSync(box.arcade, { recursive: true });
  const script = path.join(box.home, "mine.js").replace(/\\/g, "/");
  fs.writeFileSync(script, 'process.stdout.write("MY STATUS LINE")');
  fs.writeFileSync(
    path.join(box.arcade, "statusline-backup.json"),
    JSON.stringify({ type: "command", command: `node "${script}"` }),
  );

  const result = run("statusline.js", [], {
    env: box.env,
    input: JSON.stringify({ session_id: "nope", workspace: { current_dir: "." } }),
  });
  const rows = result.stdout.trimEnd().split("\n");
  assert.equal(rows[0], "MY STATUS LINE");
  assert.match(rows[1], /TOOLSTORM/);
});
