"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOARD_SIZE = void 0;
exports.emptyProfile = emptyProfile;
exports.normalizeProfile = normalizeProfile;
exports.xpToNext = xpToNext;
exports.levelFor = levelFor;
exports.xpForRun = xpForRun;
exports.totalsWith = totalsWith;
exports.applyRun = applyRun;
exports.bestScore = bestScore;
exports.fileProfileStore = fileProfileStore;
exports.memoryProfileStore = memoryProfileStore;
/**
 * The player's lasting progress: experience and level, lifetime totals,
 * unlocked achievements, a top-ten board per mode, daily bests and the chosen
 * ship. Kept in one small JSON file next to the session logs.
 *
 * Several game panes (one per Claude session) may finish runs at once, so
 * every change re-reads the file, applies itself, and writes it back whole.
 */
const fs = __importStar(require("fs"));
const paths_1 = require("./paths");
const achievements_1 = require("./game/achievements");
const content_1 = require("./game/content");
exports.BOARD_SIZE = 10;
const DAILY_DAYS_KEPT = 30;
function emptyProfile() {
    return {
        version: 1,
        xp: 0,
        totals: { runs: 0, kills: 0, bosses: 0, powerups: 0, playSeconds: 0, toolEvents: 0 },
        achievements: {},
        boards: { storm: [], endless: [], zen: [], daily: [] },
        daily: {},
        skin: "pioneer",
        difficulty: "medium",
    };
}
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
/** Accept whatever is on disk, keeping only fields of the right shape. */
function normalizeProfile(raw) {
    const out = emptyProfile();
    if (!raw || typeof raw !== "object")
        return out;
    const p = raw;
    out.xp = num(p.xp);
    const totals = (p.totals ?? {});
    for (const key of Object.keys(out.totals))
        out.totals[key] = num(totals[key]);
    if (p.achievements && typeof p.achievements === "object") {
        for (const [id, at] of Object.entries(p.achievements)) {
            if (achievements_1.ACHIEVEMENTS.some((a) => a.id === id))
                out.achievements[id] = num(at);
        }
    }
    const boards = (p.boards ?? {});
    for (const mode of content_1.MODES) {
        const list = boards[mode.id];
        if (!Array.isArray(list))
            continue;
        out.boards[mode.id] = list
            .filter((r) => !!r && typeof r === "object" && typeof r.score === "number")
            .map((r) => {
            const record = {
                score: num(r.score),
                wave: num(r.wave),
                kills: num(r.kills),
                maxCombo: num(r.maxCombo),
                at: num(r.at),
            };
            if (typeof r.mutator === "string")
                record.mutator = r.mutator;
            if ((0, content_1.isDifficultyId)(r.difficulty))
                record.difficulty = r.difficulty;
            return record;
        })
            .sort((a, b) => b.score - a.score)
            .slice(0, exports.BOARD_SIZE);
    }
    if (p.daily && typeof p.daily === "object") {
        for (const [day, best] of Object.entries(p.daily)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(day))
                out.daily[day] = num(best);
        }
    }
    if (typeof p.skin === "string")
        out.skin = p.skin;
    if ((0, content_1.isDifficultyId)(p.difficulty))
        out.difficulty = p.difficulty;
    return out;
}
/** XP to go from `level` to the next one. Each level asks a little more. */
function xpToNext(level) {
    return 400 + 200 * (level - 1);
}
function levelFor(xp) {
    let level = 1;
    let rest = Math.max(0, Math.floor(xp));
    while (rest >= xpToNext(level)) {
        rest -= xpToNext(level);
        level += 1;
    }
    return { level, into: rest, needed: xpToNext(level) };
}
/** Experience a run earns before achievements. */
function xpForRun(score, stats) {
    return Math.floor(score / 25) + stats.kills + stats.bosses * 150 + stats.wavesCleared * 20;
}
/** Lifetime totals as they would be with this run added. */
function totalsWith(profile, stats, finished) {
    const t = profile.totals;
    return {
        runs: t.runs + (finished ? 1 : 0),
        kills: t.kills + stats.kills,
        bosses: t.bosses + stats.bosses,
        powerups: t.powerups + stats.powerups,
        playSeconds: t.playSeconds + stats.elapsed,
        toolEvents: t.toolEvents + stats.toolEvents,
    };
}
/** Fold a finished run, and the achievements it earned, into a profile. */
function applyRun(profile, run, earned, now = Date.now()) {
    const next = normalizeProfile(JSON.parse(JSON.stringify(profile)));
    const levelBefore = levelFor(next.xp).level;
    next.totals = totalsWith(next, run.stats, true);
    let xpGained = xpForRun(run.score, run.stats);
    for (const id of earned) {
        if (next.achievements[id])
            continue;
        next.achievements[id] = now;
        xpGained += achievements_1.ACHIEVEMENTS.find((a) => a.id === id)?.xp ?? 0;
    }
    next.xp += xpGained;
    let rank = 0;
    if (run.score > 0) {
        const record = {
            score: run.score,
            wave: run.wave,
            kills: run.stats.kills,
            maxCombo: run.stats.maxCombo,
            at: now,
            ...(run.mutator ? { mutator: run.mutator } : {}),
            ...(run.difficulty ? { difficulty: run.difficulty } : {}),
        };
        const board = [...next.boards[run.mode], record].sort((a, b) => b.score - a.score).slice(0, exports.BOARD_SIZE);
        next.boards[run.mode] = board;
        rank = board.indexOf(record) + 1;
    }
    let newDailyBest = false;
    if (run.day) {
        if (run.score > (next.daily[run.day] ?? 0)) {
            next.daily[run.day] = run.score;
            newDailyBest = true;
        }
        const days = Object.keys(next.daily).sort().reverse();
        for (const old of days.slice(DAILY_DAYS_KEPT))
            delete next.daily[old];
    }
    return { profile: next, xpGained, levelBefore, levelAfter: levelFor(next.xp).level, rank, newDailyBest };
}
/** The best score on any board, for the status line and the HUD. */
function bestScore(profile, mode) {
    const modes = mode ? [mode] : content_1.MODES.map((m) => m.id);
    return Math.max(0, ...modes.map((m) => profile.boards[m][0]?.score ?? 0));
}
function fileProfileStore() {
    const load = () => {
        try {
            return normalizeProfile(JSON.parse(fs.readFileSync((0, paths_1.profilePath)(), "utf8")));
        }
        catch {
            return migrateHighScore(emptyProfile());
        }
    };
    return {
        load,
        update(change) {
            const next = change(load());
            try {
                (0, paths_1.ensureDirs)();
                (0, paths_1.writeAtomic)((0, paths_1.profilePath)(), JSON.stringify(next));
            }
            catch {
                /* progress is nice to keep, never worth crashing the game over */
            }
            return next;
        },
    };
}
function memoryProfileStore(initial = emptyProfile()) {
    let current = initial;
    return {
        load: () => normalizeProfile(JSON.parse(JSON.stringify(current))),
        update(change) {
            current = change(normalizeProfile(JSON.parse(JSON.stringify(current))));
            return current;
        },
    };
}
/** Before 0.3 only a single best score existed: carry it onto the STORM board. */
function migrateHighScore(profile) {
    try {
        const old = JSON.parse(fs.readFileSync((0, paths_1.highScorePath)(), "utf8"));
        const score = num(old.score);
        if (score > 0) {
            profile.boards.storm.push({ score, wave: 0, kills: 0, maxCombo: 0, at: num(old.at) || Date.now() });
        }
    }
    catch {
        /* no old score */
    }
    return profile;
}
