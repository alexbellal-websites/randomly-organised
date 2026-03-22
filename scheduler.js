/**
 * Organised — 4-week schedule generator (constraint-aware weighted random + best-of-N).
 * Pairs from localStorage key "organisedPairs" (JSON array of {a,b,gap,section}).
 */

/** Four calendar weeks (grid); not tied to civil month day 1 */
const SCHEDULE_DAYS = 28;
const GENERATION_ATTEMPTS = 120;
const KEEP_BEST = 4;

const LS_SCHEDULE = 'organisedSchedule';
const LS_PAIRS = 'organisedPairs';
const LS_WEEK = 'organisedCalendarWeek';

function getRestDaysPerWeek(section) {
    const inputs = document.querySelectorAll(`input[data-rest="${section}"]`);
    if (!inputs.length) return 0;
    /** Same value is synced across sections; read first match (calendar + per-section copies). */
    return parseInt(inputs[0].value, 10) || 0;
}

/** Build task pools from DOM (same idea as enrichedArr) */
function collectTaskPools() {
    const pools = {
        breakfast: [],
        lunch: [],
        supper: [],
        cleanup: [],
        admin: [],
        exercise: [],
    };

    document.querySelectorAll('.tags-area .tag-pill').forEach((btn) => {
        const panel = btn.closest('.list-panel');
        if (!panel?.dataset.section) return;
        const section = panel.dataset.section;
        const name = btn.dataset.taskName || '';
        if (!name) return;
        const w = Math.max(0, Number(btn.dataset.frequency) || 0);
        if (w <= 0 && section !== 'ingredients') return;

        if (section === 'meals') {
            const cat = btn.dataset.category || '';
            if (cat === 'breakfast' || cat.includes('breakfast')) pools.breakfast.push({ name, weight: w || 1 });
            else if (cat === 'lunch' || cat.includes('lunch')) pools.lunch.push({ name, weight: w || 1 });
            else if (cat === 'supper' || cat.includes('supper')) pools.supper.push({ name, weight: w || 1 });
        } else if (section === 'cleanup') {
            pools.cleanup.push({ name, weight: w || 1 });
        } else if (section === 'admin') {
            pools.admin.push({ name, weight: w || 1 });
        } else if (section === 'exercise') {
            pools.exercise.push({ name, weight: w || 1 });
        }
    });

    return pools;
}

function loadPairsFromStorage() {
    try {
        const raw = localStorage.getItem(LS_PAIRS);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((p) => p && p.a && p.b) : [];
    } catch {
        return [];
    }
}

function planRestDays(section, perWeek) {
    const rest = new Set();
    if (perWeek <= 0) return rest;
    for (let w = 0; w < Math.ceil(SCHEDULE_DAYS / 7); w++) {
        const start = w * 7;
        const end = Math.min(start + 7, SCHEDULE_DAYS);
        const weekDays = [];
        for (let i = start; i < end; i++) weekDays.push(i);
        weekDays.sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(perWeek, weekDays.length); i++) {
            rest.add(weekDays[i]);
        }
    }
    return rest;
}

function weightedPick(list, blocked) {
    const available = list.filter((t) => !blocked.includes(t.name));
    if (available.length === 0) return null;
    const totalWeight = available.reduce((s, t) => s + t.weight, 0);
    if (totalWeight <= 0) return available[0].name;
    let roll = Math.random() * totalWeight;
    for (const task of available) {
        roll -= task.weight;
        if (roll <= 0) return task.name;
    }
    return available[available.length - 1].name;
}

/** Flatten cleanup: null (rest), string (legacy), or string[] */
function cleanupAsList(day) {
    if (day.cleanup == null) return [];
    if (Array.isArray(day.cleanup)) return day.cleanup.filter(Boolean);
    return day.cleanup ? [day.cleanup] : [];
}

function allTasks(day) {
    return [day.breakfast, day.lunch, day.supper, ...cleanupAsList(day), day.admin, day.exercise].filter(Boolean);
}

/**
 * Cleanup : ne pas placer `taskName` ce jour si une tâche liée est déjà dans la fenêtre [day-gap, day-1].
 * (Inclut les paires même nom, ex. Laundry+Laundry gap 2.)
 */
function isCleanupDayBlockedByPairSpacing(schedule, day, taskName, pairs) {
    for (const pair of pairs) {
        if (pair.section !== 'cleanup') continue;
        if (Number(pair.gap) === 0) continue;
        const gap = Math.max(1, Number(pair.gap) || 1);
        for (let prev = Math.max(0, day - gap); prev < day; prev++) {
            const list = schedule[prev].cleanup;
            if (!list || !list.length) continue;
            if (list.includes(pair.a) && taskName === pair.b) return true;
            if (list.includes(pair.b) && taskName === pair.a) return true;
        }
    }
    return false;
}

function getBlocked(schedule, day, pairs) {
    const blocked = [];
    for (const pair of pairs) {
        /** Same-day cleanup pairs use placement logic only, not meal spacing */
        if (Number(pair.gap) === 0) continue;
        const gap = Math.max(1, Number(pair.gap) || 1);
        for (let prev = Math.max(0, day - gap); prev < day; prev++) {
            const prevTasks = allTasks(schedule[prev]);
            if (prevTasks.includes(pair.a)) blocked.push(pair.b);
            if (prevTasks.includes(pair.b)) blocked.push(pair.a);
        }
    }
    return blocked;
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/** Même nom sur plusieurs pastilles → une entrée, fréquences additionnées */
function mergePoolByName(pool) {
    const m = new Map();
    for (const t of pool || []) {
        if (!t?.name) continue;
        const w = Math.max(0, Math.round(Number(t.weight) || 0));
        m.set(t.name, (m.get(t.name) || 0) + w);
    }
    return [...m.entries()].map(([name, weight]) => ({ name, weight }));
}

const CLEANUP_WEEKS = 4;

/** e.g. 4 occurrences → [1,1,1,1] (≈ 1× / semaine) ; 7 → [2,2,2,1] */
function splitAcrossWeeks(total, weeks = CLEANUP_WEEKS) {
    if (total <= 0) return Array(weeks).fill(0);
    const base = Math.floor(total / weeks);
    const rem = total % weeks;
    const out = [];
    for (let w = 0; w < weeks; w++) {
        out.push(base + (w < rem ? 1 : 0));
    }
    return out;
}

/**
 * Admin / exercise : cible par tâche sur 4 semaines.
 * - Fréquence &lt; 4 : au plus 1× par semaine (les occurrences sont sur des semaines différentes, tirées au hasard).
 * - Fréquence ≥ 4 : au moins 1× par semaine + surplus réparti comme splitAcrossWeeks.
 */
function splitAdminExerciseWeeks(total) {
    if (total <= 0) return [0, 0, 0, 0];
    if (total < 4) {
        const out = [0, 0, 0, 0];
        const idx = [0, 1, 2, 3];
        shuffleInPlace(idx);
        for (let i = 0; i < total; i++) out[idx[i]] = 1;
        return out;
    }
    return splitAcrossWeeks(total, CLEANUP_WEEKS);
}

/** Voisins du même champ : pas la tâche `name` (évite 2 jours de suite) */
function isAdjacentFreeForField(schedule, field, name, day) {
    return schedule[day - 1]?.[field] !== name && schedule[day + 1]?.[field] !== name;
}

/** Complément de placement : si total &lt; 4, ne pas mettre 2× la même tâche dans une même semaine ; sinon évite les voisins = name */
function pickSpillDayForField(schedule, field, name, total, available) {
    let free = available.filter((d) => schedule[d][field] === null);
    if (free.length === 0) return undefined;
    if (total < 4) {
        const weeksWithTask = new Set();
        for (const d of available) {
            if (schedule[d][field] === name) weeksWithTask.add(Math.floor(d / 7));
        }
        free = free.filter((d) => !weeksWithTask.has(Math.floor(d / 7)));
        if (free.length === 0) return undefined;
    }
    const noAdj = free.filter((d) => isAdjacentFreeForField(schedule, field, name, d));
    const pickFrom = noAdj.length ? noAdj : free;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
}

/** Semaine (0–3) contient déjà `name` sur ce champ (hors jour exclu) */
function weekAlreadyHasTaskName(schedule, field, name, weekIdx, excludeDay) {
    const start = weekIdx * 7;
    for (let d = start; d < start + 7 && d < SCHEDULE_DAYS; d++) {
        if (d === excludeDay) continue;
        if (schedule[d][field] === name) return true;
    }
    return false;
}

/**
 * Casse les paires « même tâche jours consécutifs » quand c’est possible sans toucher au reste des contraintes.
 * Déplace la 2e occurrence vers un jour vide plus loin (évite adjacence + règle &lt;4 : 1×/sem.).
 */
function repairAdjacentSameField(schedule, field, restSet, available, countMap) {
    const availSet = new Set(available);
    for (let attempt = 0; attempt < 60; attempt++) {
        let moved = false;
        for (let d = 0; d < SCHEDULE_DAYS - 1; d++) {
            if (restSet.has(d) || restSet.has(d + 1)) continue;
            const x = schedule[d][field];
            if (x == null || schedule[d + 1][field] !== x) continue;

            const total = countMap.get(x) || 0;
            const from = d + 1;
            const candidates = available.filter((k) => {
                if (k === from || k === d) return false;
                if (!availSet.has(k) || restSet.has(k)) return false;
                if (schedule[k][field] !== null) return false;
                if (!isAdjacentFreeForField(schedule, field, x, k)) return false;
                const wk = Math.floor(k / 7);
                if (total < 4 && weekAlreadyHasTaskName(schedule, field, x, wk, from)) return false;
                return true;
            });
            shuffleInPlace(candidates);
            if (candidates.length === 0) continue;
            const k = candidates[0];
            schedule[from][field] = null;
            schedule[k][field] = x;
            moved = true;
        }
        if (!moved) break;
    }
}

/** Jours d’une semaine hors repos (cleanup / admin / exercise selon le Set passé) */
function getValidDaysInWeek(weekIndex, restSet) {
    const days = [];
    for (let c = 0; c < 7; c++) {
        const d = weekIndex * 7 + c;
        if (d >= SCHEDULE_DAYS) break;
        if (!restSet.has(d)) days.push(d);
    }
    return days;
}

/** Plus forts restes — total des counts = totalSlots */
function allocateProportionalCounts(tasks, totalSlots) {
    const m = new Map();
    if (totalSlots <= 0) return m;
    const list = tasks && tasks.length ? tasks : [{ name: '—', weight: 1 }];
    const sumFreq = list.reduce((s, t) => s + Math.max(0, Number(t.weight) || 0), 0);
    if (sumFreq <= 0) {
        m.set(list[0].name, totalSlots);
        return m;
    }
    const rows = list.map((t) => {
        const w = Math.max(0, Number(t.weight) || 0);
        const raw = (totalSlots * w) / sumFreq;
        return { name: t.name, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
    });
    const sumFloor = rows.reduce((s, r) => s + r.floor, 0);
    let need = totalSlots - sumFloor;
    rows.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < need; i++) rows[i].floor++;
    rows.forEach((r) => m.set(r.name, r.floor));
    return m;
}

/** Jour valide de la semaine avec le moins de cleanups déjà posés (égalité → au hasard) */
function pickDayLeastCleanupLoad(schedule, validDays) {
    if (!validDays.length) return null;
    let minL = Infinity;
    for (const d of validDays) {
        const L = schedule[d].cleanup.length;
        if (L < minL) minL = L;
    }
    const best = validDays.filter((d) => schedule[d].cleanup.length === minL);
    shuffleInPlace(best);
    return best[0];
}

/**
 * Après placement : lisse la charge par semaine (évite 5–6 cleanups un jour et 1 un autre).
 * Ne change que la répartition entre jours, pas le total par semaine.
 */
function polishCleanupBalance(schedule, cleanupRest) {
    for (let w = 0; w < CLEANUP_WEEKS; w++) {
        const days = getValidDaysInWeek(w, cleanupRest);
        if (days.length < 2) continue;
        for (let attempt = 0; attempt < 200; attempt++) {
            const loads = days.map((d) => schedule[d].cleanup.length);
            const maxLoad = Math.max(...loads);
            const minLoad = Math.min(...loads);
            if (maxLoad <= minLoad + 1) break;
            const heavy = days.filter((d) => schedule[d].cleanup.length === maxLoad);
            const light = days.filter((d) => schedule[d].cleanup.length === minLoad);
            shuffleInPlace(heavy);
            shuffleInPlace(light);
            const from = heavy[0];
            const to = light[0];
            const arr = schedule[from].cleanup;
            if (!arr.length) break;
            const idx = Math.floor(Math.random() * arr.length);
            const item = arr.splice(idx, 1)[0];
            schedule[to].cleanup.push(item);
        }
    }
}

/**
 * Après polish : au plus une pastille du même nom par jour (le polish peut empiler deux « Laundry »).
 */
function repairCleanupDuplicateNamesPerDay(schedule, cleanupRest, pairs) {
    for (let attempt = 0; attempt < 400; attempt++) {
        let moved = false;
        outer: for (let w = 0; w < CLEANUP_WEEKS; w++) {
            const days = getValidDaysInWeek(w, cleanupRest);
            for (const d of days) {
                const arr = schedule[d].cleanup;
                if (!arr || arr.length < 2) continue;
                const counts = new Map();
                for (const n of arr) counts.set(n, (counts.get(n) || 0) + 1);
                const dupName = [...counts.keys()].find((n) => counts.get(n) > 1);
                if (!dupName) continue;
                const idx = arr.lastIndexOf(dupName);
                arr.splice(idx, 1);
                let candidates = days.filter((dd) => {
                    if (dd === d) return false;
                    const c = schedule[dd].cleanup;
                    if (!c || c.includes(dupName)) return false;
                    return !isCleanupDayBlockedByPairSpacing(schedule, dd, dupName, pairs);
                });
                if (candidates.length === 0) {
                    candidates = days.filter((dd) => {
                        if (dd === d) return false;
                        const c = schedule[dd].cleanup;
                        return c && !c.includes(dupName);
                    });
                }
                if (candidates.length === 0) {
                    arr.splice(idx, 0, dupName);
                    continue;
                }
                const to = pickDayLeastCleanupLoad(schedule, candidates);
                if (to === null) {
                    arr.splice(idx, 0, dupName);
                    continue;
                }
                schedule[to].cleanup.push(dupName);
                moved = true;
                break outer;
            }
        }
        if (!moved) break;
    }
}

/**
 * Paires cleanup avec gap 0 : la 2e tâche est toujours le même jour que la 1re (ex. Hoover → Mopping).
 */
function buildCleanupSameDayFollowerMap(pairs) {
    const map = new Map();
    for (const p of pairs) {
        if (p.section !== 'cleanup') continue;
        if (Number(p.gap) !== 0) continue;
        if (!p.a || !p.b || p.a === p.b) continue;
        map.set(p.b, p.a);
    }
    return map;
}

function cleanupFollowerDepth(name, followerToLeader) {
    const seen = new Set();
    let d = 0;
    let n = name;
    while (followerToLeader.has(n)) {
        if (seen.has(n)) return 999;
        seen.add(n);
        n = followerToLeader.get(n);
        d++;
    }
    return d;
}

function sortCleanupTasksForSameDay(tasks, followerToLeader) {
    const copy = [...tasks];
    copy.sort((a, b) => {
        const da = cleanupFollowerDepth(a.name, followerToLeader);
        const db = cleanupFollowerDepth(b.name, followerToLeader);
        if (da !== db) return da - db;
        return Math.round(Number(b.weight) || 0) - Math.round(Number(a.weight) || 0);
    });
    return copy;
}

/** Jours où l’on peut placer `taskName` sans violer les paires cleanup (gap &gt; 0) */
function filterCleanupDaysForPairSpacing(schedule, days, taskName, pairs) {
    if (!days.length) return days;
    const filtered = days.filter((d) => !isCleanupDayBlockedByPairSpacing(schedule, d, taskName, pairs));
    return filtered.length ? filtered : days;
}

/** Au plus une fois le même nom par jour (sauf si aucun autre jour dispo dans la fenêtre) */
function filterCleanupDaysAvoidDuplicateName(schedule, days, name) {
    if (!days.length) return days;
    const free = days.filter((d) => {
        const c = schedule[d].cleanup;
        return c && !c.includes(name);
    });
    return free.length ? free : days;
}

/**
 * Après polish : si une occurrence viole l’écart (ex. 2 Laundry trop proches), la déplace dans la semaine.
 */
function repairCleanupPairSpacing(schedule, cleanupRest, pairs) {
    const hasSpacing = (pairs || []).some((p) => p.section === 'cleanup' && Number(p.gap) !== 0);
    if (!hasSpacing) return;

    for (let attempt = 0; attempt < 600; attempt++) {
        let moved = false;
        for (let w = 0; w < CLEANUP_WEEKS; w++) {
            const days = getValidDaysInWeek(w, cleanupRest);
            shuffleInPlace(days);
            for (const d of days) {
                const arr = schedule[d].cleanup;
                if (!arr || !arr.length) continue;
                for (let i = arr.length - 1; i >= 0; i--) {
                    const name = arr[i];
                    if (!isCleanupDayBlockedByPairSpacing(schedule, d, name, pairs)) continue;
                    arr.splice(i, 1);
                    const candidates = days.filter((dd) => {
                        const c = schedule[dd].cleanup;
                        if (!c || c === null) return false;
                        return !isCleanupDayBlockedByPairSpacing(schedule, dd, name, pairs);
                    });
                    if (candidates.length === 0) {
                        arr.splice(i, 0, name);
                        continue;
                    }
                    const to = pickDayLeastCleanupLoad(schedule, candidates);
                    if (to === null) {
                        arr.splice(i, 0, name);
                        continue;
                    }
                    schedule[to].cleanup.push(name);
                    moved = true;
                    break;
                }
                if (moved) break;
            }
            if (moved) break;
        }
        if (!moved) break;
    }
}

/** Après polish : déplace les followers pour qu’ils restent le même jour que leur leader */
function repairSameDayCleanup(schedule, cleanupRest, followerToLeader) {
    if (!followerToLeader.size) return;
    for (let w = 0; w < CLEANUP_WEEKS; w++) {
        const days = getValidDaysInWeek(w, cleanupRest);
        for (const d of days) {
            const arr = schedule[d].cleanup;
            if (!arr || !arr.length) continue;
            for (let i = arr.length - 1; i >= 0; i--) {
                const name = arr[i];
                const leader = followerToLeader.get(name);
                if (!leader) continue;
                if (arr.includes(leader)) continue;
                const withLeader = days.filter((dd) => {
                    const c = schedule[dd].cleanup;
                    return c && c.includes(leader);
                });
                if (withLeader.length === 0) continue;
                const to = pickDayLeastCleanupLoad(schedule, withLeader);
                if (to === null || to === d) continue;
                arr.splice(i, 1);
                schedule[to].cleanup.push(name);
            }
        }
    }
}

/**
 * Fréquence = nombre d’occurrences sur les 28 jours (ex. 4 ≈ 1× / semaine).
 * Plusieurs cleanups le même jour possibles (ex. draps + lessive).
 * Répartition : chaque tâche sur les 4 semaines ; dans chaque semaine, chaque occurrence va sur le jour
 * le moins chargé (puis polish) pour éviter les pics 5–6 vs 1.
 * Paires gap 0 : la seconde tâche n’est placée que sur des jours où la première est déjà présente (même semaine).
 */
function placeCleanupMulti(schedule, pools, cleanupRest, pairs) {
    const followerToLeader = buildCleanupSameDayFollowerMap(pairs || []);

    for (let d = 0; d < SCHEDULE_DAYS; d++) {
        schedule[d].cleanup = cleanupRest.has(d) ? null : [];
    }

    /** Plusieurs pastilles « Laundry » → une entrée, fréquences additionnées (évite 2 lignes identiques) */
    const rawCleanup = pools.cleanup && pools.cleanup.length ? [...pools.cleanup] : [];
    const mergedCleanup = mergePoolByName(rawCleanup);
    shuffleInPlace(mergedCleanup);
    const ordered = sortCleanupTasksForSameDay(mergedCleanup, followerToLeader);

    for (const t of ordered) {
        const count = Math.max(0, Math.round(Number(t.weight) || 0));
        if (count <= 0) continue;
        const perWeek = splitAcrossWeeks(count, CLEANUP_WEEKS);
        const leader = followerToLeader.get(t.name);
        for (let w = 0; w < CLEANUP_WEEKS; w++) {
            let n = perWeek[w];
            let validDays = getValidDaysInWeek(w, cleanupRest);
            if (validDays.length === 0) continue;
            while (n > 0) {
                let daysPick = filterCleanupDaysForPairSpacing(schedule, validDays, t.name, pairs || []);
                if (leader) {
                    const withLeader = daysPick.filter((d) => {
                        const c = schedule[d].cleanup;
                        return c && c.includes(leader);
                    });
                    if (withLeader.length) {
                        daysPick = withLeader;
                    } else {
                        const fallback = validDays.filter((d) => {
                            const c = schedule[d].cleanup;
                            return c && c.includes(leader);
                        });
                        if (fallback.length) {
                            daysPick = filterCleanupDaysForPairSpacing(schedule, fallback, t.name, pairs || []);
                        }
                    }
                }
                daysPick = filterCleanupDaysAvoidDuplicateName(schedule, daysPick, t.name);
                const day = pickDayLeastCleanupLoad(schedule, daysPick);
                if (day === null) break;
                schedule[day].cleanup.push(t.name);
                n--;
            }
        }
    }

    polishCleanupBalance(schedule, cleanupRest);
    repairCleanupDuplicateNamesPerDay(schedule, cleanupRest, pairs);
    repairCleanupPairSpacing(schedule, cleanupRest, pairs);
    repairSameDayCleanup(schedule, cleanupRest, followerToLeader);
    repairCleanupDuplicateNamesPerDay(schedule, cleanupRest, pairs);
    repairCleanupPairSpacing(schedule, cleanupRest, pairs);
}

/**
 * Admin / exercise : 1 tâche max par jour, fréquence = fois sur 28 j.
 * Si Σfreq < jours dispo → jours sans tâche = repos « souple » (case vide).
 * Si Σfreq > jours dispo → réduction proportionnelle.
 * Répartition par semaine (voir splitAdminExerciseWeeks) + évite quand c’est possible la même tâche jours consécutifs.
 */
function placeOnePerDayField(schedule, pool, restSet, field) {
    const available = [];
    for (let d = 0; d < SCHEDULE_DAYS; d++) {
        schedule[d][field] = null;
        if (!restSet.has(d)) available.push(d);
    }
    const maxSlots = available.length;
    const safePool = mergePoolByName(pool);
    if (safePool.length === 0) return;

    shuffleInPlace(safePool);
    const sumW = safePool.reduce((s, t) => s + Math.max(0, Number(t.weight) || 0), 0);

    let countMap;
    if (sumW <= maxSlots) {
        countMap = new Map();
        safePool.forEach((t) => countMap.set(t.name, Math.max(0, Math.round(Number(t.weight) || 0))));
    } else {
        countMap = allocateProportionalCounts(safePool, maxSlots);
    }

    const taskOrder = [...countMap.keys()].filter((k) => (countMap.get(k) || 0) > 0);
    shuffleInPlace(taskOrder);

    for (const name of taskOrder) {
        const total = countMap.get(name) || 0;
        if (total <= 0) continue;
        const perWeek = splitAdminExerciseWeeks(total);
        for (let w = 0; w < CLEANUP_WEEKS; w++) {
            let n = perWeek[w];
            while (n > 0) {
                const weekDays = getValidDaysInWeek(w, restSet).filter((d) => schedule[d][field] === null);
                if (weekDays.length === 0) break;
                shuffleInPlace(weekDays);
                let day = weekDays.find((d) => isAdjacentFreeForField(schedule, field, name, d));
                if (day === undefined) day = weekDays[Math.floor(Math.random() * weekDays.length)];
                schedule[day][field] = name;
                n--;
            }
        }
        let placedCount = 0;
        for (const d of available) {
            if (schedule[d][field] === name) placedCount++;
        }
        let need = total - placedCount;
        while (need > 0) {
            const day = pickSpillDayForField(schedule, field, name, total, available);
            if (day === undefined) break;
            schedule[day][field] = name;
            need--;
        }
    }

    repairAdjacentSameField(schedule, field, restSet, available, countMap);
}

function generateSchedule(pools, pairs) {
    const schedule = Array.from({ length: SCHEDULE_DAYS }, () => ({
        breakfast: null,
        lunch: null,
        supper: null,
        cleanup: null,
        admin: null,
        exercise: null,
    }));

    const cleanupRest = planRestDays('cleanup', getRestDaysPerWeek('cleanup'));
    const adminRest = planRestDays('admin', getRestDaysPerWeek('admin'));
    const exerciseRest = planRestDays('exercise', getRestDaysPerWeek('exercise'));

    placeCleanupMulti(schedule, pools, cleanupRest, pairs);
    placeOnePerDayField(schedule, pools.admin, adminRest, 'admin');
    placeOnePerDayField(schedule, pools.exercise, exerciseRest, 'exercise');

    const safe = (arr) => (arr.length ? arr : [{ name: '—', weight: 1 }]);

    for (let d = 0; d < SCHEDULE_DAYS; d++) {
        const blocked = getBlocked(schedule, d, pairs);

        schedule[d].breakfast = weightedPick(safe(pools.breakfast), blocked);
        schedule[d].lunch = weightedPick(safe(pools.lunch), blocked);
        schedule[d].supper = weightedPick(safe(pools.supper), blocked);
    }
    return schedule;
}

function isValid(schedule, pairs) {
    for (const pair of pairs) {
        if (Number(pair.gap) === 0) continue;
        for (let d = 0; d < SCHEDULE_DAYS - 1; d++) {
            const today = allTasks(schedule[d]);
            const tomorrow = allTasks(schedule[d + 1]);
            if (
                (today.includes(pair.a) && tomorrow.includes(pair.b)) ||
                (today.includes(pair.b) && tomorrow.includes(pair.a))
            ) {
                return false;
            }
        }
    }
    return true;
}

function scoreSchedule(schedule) {
    const loads = schedule.map((d) => allTasks(d).length);
    const avg = loads.reduce((a, b) => a + b, 0) / SCHEDULE_DAYS;
    const variance = loads.reduce((s, l) => s + (l - avg) ** 2, 0) / SCHEDULE_DAYS;
    const balanceScore = 1 / (1 + variance);

    let streakPenalty = 0;
    const names = new Set();
    schedule.forEach((d) => allTasks(d).forEach((t) => names.add(t)));
    for (const name of names) {
        let streak = 0;
        for (let d = 0; d < SCHEDULE_DAYS; d++) {
            if (allTasks(schedule[d]).includes(name)) streak++;
            else streak = 0;
            if (streak >= 3) streakPenalty += 0.02;
        }
    }
    return Math.max(0, balanceScore - streakPenalty);
}

/**
 * @returns {{ schedule: object[], score: number, meta: object } | null}
 */
function runBestOfN(pools, pairs) {
    const candidates = [];
    for (let i = 0; i < GENERATION_ATTEMPTS; i++) {
        const s = generateSchedule(pools, pairs);
        if (isValid(s, pairs)) {
            candidates.push({ schedule: s, score: scoreSchedule(s) });
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return {
        schedule: best.schedule,
        score: best.score,
        meta: {
            validCount: candidates.length,
            attempts: GENERATION_ATTEMPTS,
            alternativesConsidered: Math.min(KEEP_BEST, candidates.length),
        },
    };
}

function saveSchedulePayload(payload) {
    localStorage.setItem(
        LS_SCHEDULE,
        JSON.stringify({
            generatedAt: new Date().toISOString(),
            days: SCHEDULE_DAYS,
            ...payload,
        })
    );
}

function loadSchedulePayload() {
    try {
        const raw = localStorage.getItem(LS_SCHEDULE);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Current calendar week 1–4 from real date (rough month quarters) */
function getCurrentWeekOfMonth() {
    const d = new Date();
    const day = d.getDate();
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
}

/** Aggregate task count per weekday (Mon=0..Sun=6) over full schedule */
function computeWeekdayLoads(schedule) {
    const loads = [0, 0, 0, 0, 0, 0, 0];
    schedule.forEach((day, idx) => {
        const dow = idx % 7;
        loads[dow] += allTasks(day).length;
    });
    const max = Math.max(...loads, 1);
    return loads.map((n) => (n / max) * 100);
}

/** Bar heights Mon–Sun for one block of 7 days (weekNum 1–4 → days 0–6 … 21–27) */
function computeWeekdayLoadsForWeek(schedule, weekNum) {
    const w = Math.max(0, Math.min(3, (Number(weekNum) || 1) - 1));
    const loads = [];
    for (let c = 0; c < 7; c++) {
        const idx = w * 7 + c;
        const day = schedule[idx];
        loads.push(day ? allTasks(day).length : 0);
    }
    const max = Math.max(...loads, 1);
    return loads.map((n) => (n / max) * 100);
}

/** Satisfaction score 0–100 from schedule vs pools (frequency deviation penalty) */
function computeSatisfactionScore(schedule, pools) {
    const counts = {};
    schedule.forEach((day) => {
        allTasks(day).forEach((t) => {
            counts[t] = (counts[t] || 0) + 1;
        });
    });

    const poolList = []
        .concat(pools.breakfast, pools.lunch, pools.supper, pools.cleanup, pools.admin, pools.exercise)
        .filter(Boolean);

    let err = 0;
    let n = 0;
    poolList.forEach((t) => {
        const target = t.weight;
        const got = counts[t.name] || 0;
        err += Math.abs(target - got);
        n += target || 1;
    });

    const fit = n > 0 ? Math.max(0, 100 - (err / n) * 10) : 70;
    return Math.min(100, Math.round(fit));
}

if (typeof window !== 'undefined') {
    window.OrganisedScheduler = {
        SCHEDULE_DAYS,
        collectTaskPools,
        loadPairsFromStorage,
        runBestOfN,
        saveSchedulePayload,
        loadSchedulePayload,
        getCurrentWeekOfMonth,
        computeWeekdayLoads,
        computeWeekdayLoadsForWeek,
        computeSatisfactionScore,
        allTasks,
        cleanupAsList,
        LS_SCHEDULE,
        LS_PAIRS,
        LS_WEEK,
    };
}
