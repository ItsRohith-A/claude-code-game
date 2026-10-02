# How to publish TOOLSTORM

A simple step-by-step guide. Do the steps in order.

There are two ways to share the plugin:

1. **Your own marketplace (do this first).** Your GitHub repo *is* the store.
   Push it, and people can install it. No review, no form. Free.
2. **Anthropic's plugin directory (optional, later).** A public catalog on
   claude.ai. Needs a paid claude.ai plan and a review.

---

## Part 1 — Before you publish (checklist)

Tick every box before you push.

### 1. Code is built and tested

```bash
npm install
npm test
```

- All tests must pass.
- `npm test` also rebuilds `dist/`. Commit `dist/` too — users get the plugin
  straight from GitHub with no build step, so `dist/` must be up to date.

### 2. The plugin checks pass

```bash
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
```

Both must say `✔ Validation passed`.

Don't forget the **dot** at the end of the second line — it means "this
folder". Without it you get `error: missing required argument 'path'`.

### 3. Version number is raised

Users only get your changes when the version number goes up.

- Change `"version"` in **both** `.claude-plugin/plugin.json` and
  `package.json` (for example `0.2.0` → `0.2.1`).
- Small fix: raise the last number (`0.2.1`). New feature: raise the middle one
  (`0.3.0`).

This release is already set to `0.2.0`.

### 4. Add a LICENSE file ✅ done

`LICENSE` (MIT, "Rohith A", 2026) is in the repo. You don't need to register
it anywhere. If the owner should be your company instead of you, change the
name on the `Copyright` line.

### 5. Stop shipping `package-lock.json` ✅ done

When someone installs a plugin, Claude Code looks at its top folder. If it finds
**both** `package.json` and `package-lock.json`, it runs npm and installs the
packages listed there, for every user, on every install and update.

TOOLSTORM needs no packages to run; the listed ones (TypeScript) are only for
building. So `package-lock.json` is now in `.gitignore` and not in the repo,
and CI uses `npm install` instead of `npm ci`. You still have the file on your
computer. **Don't add it back.**

### 6. Never rename the plugin

The name `toolstorm` is now permanent. If you change it later, everyone who
installed it loses it. To change the name people *see*, change `displayName`
instead.

### 7. Try it yourself like a real user

Test the real install, not just your working copy:

```bash
claude plugin marketplace add .
claude plugin install toolstorm@toolstorm
```

Then start Claude Code and check:

- [ ] `/toolstorm` opens the game next to Claude.
- [ ] Ask Claude to read or edit a file. Enemies appear in the game.
- [ ] `/toolstorm install` adds the scoreboard. Restart. You see it.
- [ ] `/toolstorm remove` puts your old status line back.
- [ ] Mouse and keyboard both work.

When done, remove the test install:

```bash
claude plugin uninstall toolstorm@toolstorm
claude plugin marketplace remove toolstorm
```

### 8. Test on other computers if you can

So far it has only been tested on Windows (Windows Terminal). If you can, try it
on a Mac and on Linux, and inside tmux. If you can't, say "tested on Windows"
in the release notes.

### 9. Nothing secret in the repo

- No passwords, tokens or API keys in any file.
- `node_modules/` must not be committed (it is already in `.gitignore`).

---

## Part 2 — Publish on your own marketplace

This is the main way. It takes five minutes.

### Step 1. Make the GitHub repo public

On GitHub: **Settings → General → Danger Zone → Change visibility → Public**.

(If it stays private, only people who can see the repo can install it.)

### Step 2. Commit and push

```bash
git add -A
git commit
git push origin main
```

That's it — the plugin is published. The file
`.claude-plugin/marketplace.json` is what turns your repo into a store.

### Step 3. (Optional) Make a GitHub release

Nice for users, not required.

1. Tag the version:
   ```bash
   claude plugin tag --push
   ```
   This creates a tag named `toolstorm--v0.2.0` and pushes it.
2. On GitHub: **Releases → Draft a new release**, pick that tag, and write a
   few lines about what changed.

### Step 4. Tell people how to install

Share these two lines:

```bash
claude plugin marketplace add ItsRohith-A/claude-code-game
claude plugin install toolstorm@toolstorm
```

Or, inside Claude Code (newer versions), one line:

```
/plugin install toolstorm --marketplace ItsRohith-A/claude-code-game
```

### Step 5. Check it from a clean machine

On another computer (or ask a friend), run the two install lines above and
play once. If it works there, it works for everyone.

---

## Part 3 — Releasing an update later

Every time you change something:

1. Make the change in `src/`.
2. `npm test` (this also rebuilds `dist/`).
3. Raise the version (Part 1, step 3).
4. Commit and push.

Users then update with:

```bash
claude plugin update toolstorm@toolstorm
```

**Note:** for your own marketplace, automatic updates are **off** by default.
Users must run the update command, or turn on auto-update for your
marketplace in `/plugin`. Mention this in release notes.

---

## Part 4 — Anthropic's directory (optional)

Do this only after Part 2 works and people have used it.

### Read this first: will it even work there?

The directory sends your plugin to **claude.ai chat, Cowork and Claude Code**.
TOOLSTORM only really works in **Claude Code in a terminal**:

| Where | Does TOOLSTORM work? |
| --- | --- |
| Claude Code (terminal) | Yes |
| Cowork | No — no terminal to open the game in |
| claude.ai chat | No — hooks don't run there |

So most directory users outside Claude Code would install something that does
nothing. If you still submit, say clearly at the top of the README:
**"Claude Code only. Needs a terminal."**

### What you need

- A **paid claude.ai plan** (Pro, Max, Team or Enterprise).
- The repo public on GitHub.
- A `LICENSE` file (Part 1, step 4).

### Fix these before you submit

These are things the directory's checker looks at. Fix them, or expect a
manual review:

1. **Remove the `.gitattributes` file.** The directory refuses repos whose
   `.gitattributes` has settings that change file contents. Ours sets line
   endings (`eol=lf`), which may count. It's safe to delete: the files are
   already stored with the right line endings.
2. **No `package-lock.json` in the repo.** Done if you followed Part 1,
   step 5. Otherwise the checker flags "Dependencies install from a lockfile"
   and sends it to a human reviewer.
3. **The compiled `dist/` files.** The checker prefers readable code. Ours is
   readable (not minified), and the TypeScript source is in `src/`. Expect a
   reviewer to look, and that's fine.
4. **Explain everything in the README.** The security scan looks for hidden
   behavior. The README already says what files the plugin writes and that
   `/toolstorm install` edits `~/.claude/settings.json`. Keep that accurate.
5. **Fill in the extra fields** in `.claude-plugin/plugin.json`: `icon` (a PNG
   in the repo, for example `./icon.png`), `supportUrl` (for example your
   GitHub Issues link) and, if you can, `privacyPolicyUrl`. A simple privacy
   page can say: "TOOLSTORM collects nothing and sends nothing over the
   network."

### How to submit

1. Go to **[claude.ai/directory/manage](https://claude.ai/directory/manage)**.
2. Click **Submit new** → **Plugin bundle**.
3. Enter your repo: `ItsRohith-A/claude-code-game`.
4. Click **Validate**. Fix anything marked **Blocking**, push, and click
   **Re-validate**.
5. Submit. Things marked **Policy hold** are reviewed by a person. Wait for the
   result in the portal.

To update a directory listing later: raise the version and push. The directory
picks up the new version after it passes its checks again.

---

## Quick summary

**To publish now:**

1. `npm test` passes, `claude plugin validate --strict .` passes.
2. Add a `LICENSE` file.
3. Take `package-lock.json` out of the repo.
4. Test-install it like a user.
5. Make the repo public, commit, push.
6. Share: `claude plugin marketplace add ItsRohith-A/claude-code-game` then
   `claude plugin install toolstorm@toolstorm`.

**For every update:** change code → `npm test` → raise version → push.

**Directory:** optional, paid plan, and the game only works in Claude Code.
