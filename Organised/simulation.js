// ========== DATA ==========

const meals = {
    breakfast: [
        { name: 'Bread & butter', weight: 6 },
        { name: 'Fruits', weight: 24 },
        { name: 'Biscuits', weight: 6 },
    ],
    lunch: [
        { name: 'Pasta & sauce', weight: 10 },
        { name: 'Steak & Purée', weight: 6 },
        { name: 'Galettes', weight: 2 },
        { name: 'Chicken on Rice', weight: 12 },
    ],
    supper: [
        { name: 'Salad', weight: 14 },
        { name: 'Soup', weight: 15 },
        { name: 'Bruschietta', weight: 10 },
        { name: 'Order out', weight: 1 },
        { name: 'Potatoes & Meat', weight: 3 },
    ],
};

const cleanup = [
    { name: 'Hoover', weight: 6 },
    { name: 'Surfaces', weight: 4 },
    { name: 'Mirror & Sinks', weight: 4 },
    { name: 'Toilet', weight: 4 },
    { name: 'Bedding', weight: 4 },
    { name: 'Mopping', weight: 2 },
    { name: 'Laundry', weight: 8 },
    { name: 'Bin', weight: 5 },
    { name: 'Top cupboards', weight: 1 },
    { name: 'Glass dispensary', weight: 5 },
    { name: 'Shower', weight: 2 },
    { name: 'Windows', weight: 1 },
];

const admin = [
    { name: 'French Nationality', weight: 2 },
    { name: 'Planning', weight: 2 },
    { name: 'Pappers', weight: 2 },
    { name: 'Check subscriptions', weight: 2 },
];

const exercise = [
    { name: 'Legs', weight: 4 },
    { name: 'Upper body', weight: 4 },
    { name: 'Static', weight: 4 },
    { name: 'Arms', weight: 4 },
];

// ========== CONDITIONS ==========

const pairs = [
    { a: 'Hoover', b: 'Mopping', gap: 1 },
    { a: 'Legs', b: 'Upper body', gap: 1 },
    { a: 'Steak & Purée', b: 'Chicken on Rice', gap: 1 },
];

const restDaysPerWeek = { cleanup: 2, admin: 0, exercise: 2 };

const DAYS = 28;
const ATTEMPTS = 200;
const KEEP = 4;

// ========== WEIGHTED PICK ==========

function weightedPick(list, blocked) {
    const available = list.filter(t => !blocked.includes(t.name));
    if (available.length === 0) return null;

    const totalWeight = available.reduce((s, t) => s + t.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const task of available) {
        roll -= task.weight;
        if (roll <= 0) return task.name;
    }
    return available[available.length - 1].name;
}

// ========== GET BLOCKED TASKS ==========

function getBlocked(history, day) {
    const blocked = [];
    for (const pair of pairs) {
        for (let prev = Math.max(0, day - pair.gap); prev < day; prev++) {
            const prev_tasks = allTasks(history[prev]);
            if (prev_tasks.includes(pair.a)) blocked.push(pair.b);
            if (prev_tasks.includes(pair.b)) blocked.push(pair.a);
        }
    }
    return blocked;
}

// ========== PLAN REST DAYS ==========

function planRestDays(section, perWeek) {
    const rest = new Set();
    for (let w = 0; w < Math.ceil(DAYS / 7); w++) {
        const start = w * 7;
        const end = Math.min(start + 7, DAYS);
        const weekDays = Array.from({ length: end - start }, (_, i) => start + i);
        const shuffled = weekDays.sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(perWeek, shuffled.length); i++) {
            rest.add(shuffled[i]);
        }
    }
    return rest;
}

// ========== GENERATE ==========

function generateSchedule() {
    const schedule = Array.from({ length: DAYS }, () => ({
        breakfast: null, lunch: null, supper: null,
        cleanup: null, admin: null, exercise: null,
    }));

    const cleanupRest = planRestDays('cleanup', restDaysPerWeek.cleanup);
    const exerciseRest = planRestDays('exercise', restDaysPerWeek.exercise);

    for (let d = 0; d < DAYS; d++) {
        const blocked = getBlocked(schedule, d);

        // Meals: 1 per slot
        schedule[d].breakfast = weightedPick(meals.breakfast, blocked);
        schedule[d].lunch = weightedPick(meals.lunch, blocked);
        schedule[d].supper = weightedPick(meals.supper, blocked);

        // Cleanup
        if (!cleanupRest.has(d)) {
            schedule[d].cleanup = weightedPick(cleanup, blocked);
        }

        // Admin (no rest days)
        schedule[d].admin = weightedPick(admin, blocked);

        // Exercise
        if (!exerciseRest.has(d)) {
            schedule[d].exercise = weightedPick(exercise, blocked);
        }
    }

    return schedule;
}

// ========== VALIDATION ==========

function isValid(schedule) {
    for (const pair of pairs) {
        for (let d = 0; d < DAYS - 1; d++) {
            const today = allTasks(schedule[d]);
            const tomorrow = allTasks(schedule[d + 1]);
            if (
                (today.includes(pair.a) && tomorrow.includes(pair.b)) ||
                (today.includes(pair.b) && tomorrow.includes(pair.a))
            ) return false;
        }
    }
    return true;
}

function allTasks(day) {
    return [day.breakfast, day.lunch, day.supper, day.cleanup, day.admin, day.exercise].filter(Boolean);
}

// ========== SCORING (balance only — conditions are strict) ==========

function score(schedule) {
    const loads = schedule.map(d => allTasks(d).length);
    const avg = loads.reduce((a, b) => a + b, 0) / DAYS;
    const variance = loads.reduce((s, l) => s + (l - avg) ** 2, 0) / DAYS;
    const balanceScore = 1 / (1 + variance);

    // Variety: penalise same task appearing too many days in a row
    let streakPenalty = 0;
    const taskNames = new Set();
    for (const d of schedule) for (const t of allTasks(d)) taskNames.add(t);

    for (const name of taskNames) {
        let streak = 0;
        for (let d = 0; d < DAYS; d++) {
            if (allTasks(schedule[d]).includes(name)) { streak++; } 
            else { streak = 0; }
            if (streak >= 3) streakPenalty += 0.02;
        }
    }

    return Math.max(0, balanceScore - streakPenalty);
}

// ========== RUN ==========

console.log('='.repeat(60));
console.log('1 task per category per day — weighted random');
console.log('Meals: 1 breakfast + 1 lunch + 1 supper');
console.log('='.repeat(60));

const candidates = [];
let rejected = 0;

for (let i = 0; i < ATTEMPTS; i++) {
    const s = generateSchedule();
    if (isValid(s)) {
        candidates.push({ schedule: s, score: score(s) });
    } else {
        rejected++;
    }
}

candidates.sort((a, b) => b.score - a.score);
const winners = candidates.slice(0, KEEP);

console.log(`\nGenerated: ${ATTEMPTS} | Valid: ${candidates.length} | Rejected: ${rejected}`);
console.log(`Acceptance: ${((candidates.length / ATTEMPTS) * 100).toFixed(1)}%`);

// Count task appearances across best schedule
console.log('\n' + '='.repeat(60));
console.log('TOP', Math.min(KEEP, winners.length), 'SCHEDULES');
console.log('='.repeat(60));

winners.forEach((w, i) => {
    console.log(`\n--- Week ${i + 1} (score: ${(w.score * 100).toFixed(1)}%) ---`);

    const loads = w.schedule.map(d => allTasks(d).length);
    console.log(`Tasks/day: [${loads.join(', ')}]`);
    console.log(`Min: ${Math.min(...loads)} | Max: ${Math.max(...loads)} | Avg: ${(loads.reduce((a, b) => a + b, 0) / DAYS).toFixed(1)}`);

    // Task frequency count
    const counts = {};
    for (const d of w.schedule) {
        for (const t of allTasks(d)) {
            counts[t] = (counts[t] || 0) + 1;
        }
    }
    console.log('\nTask appearances:');
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
        const bar = '█'.repeat(count);
        console.log(`  ${name.padEnd(20)} ${String(count).padStart(2)}x ${bar}`);
    }

    // Week 1 detail
    console.log('\nFirst 7 days:');
    for (let d = 0; d < 7; d++) {
        const day = w.schedule[d];
        const parts = [];
        if (day.breakfast) parts.push(`🥐 ${day.breakfast}`);
        if (day.lunch)     parts.push(`🍽  ${day.lunch}`);
        if (day.supper)    parts.push(`🌙 ${day.supper}`);
        if (day.cleanup)   parts.push(`🧹 ${day.cleanup}`);
        if (day.admin)     parts.push(`📋 ${day.admin}`);
        if (day.exercise)  parts.push(`💪 ${day.exercise}`);
        console.log(`  Day ${String(d + 1).padStart(2)}: ${parts.join(' | ')}`);
    }
});

// Diversity
if (winners.length >= 2) {
    console.log('\n' + '='.repeat(60));
    console.log('DIVERSITY');
    console.log('='.repeat(60));
    for (let i = 0; i < winners.length; i++) {
        for (let j = i + 1; j < winners.length; j++) {
            let same = 0;
            for (let d = 0; d < DAYS; d++) {
                if (JSON.stringify(winners[i].schedule[d]) === JSON.stringify(winners[j].schedule[d])) same++;
            }
            console.log(`Week ${i+1} vs ${j+1}: ${same}/${DAYS} identical days (${((same/DAYS)*100).toFixed(1)}%)`);
        }
    }
}
