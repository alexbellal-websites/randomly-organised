/**
 * Calendar view — 4-week grid (28 days), weekly balance bars.
 */
(function () {
    const S = window.OrganisedScheduler;
    if (!S) {
        console.warn('OrganisedScheduler missing — load scheduler.js first');
        return;
    }

    const DAYS = S.SCHEDULE_DAYS;
    const LS_WEEK = S.LS_WEEK;

    const planBody = () => document.getElementById('calendar-plan-body');
    const genBtn = () => document.getElementById('btn-generate-month');
    const exportIcalBtn = () => document.getElementById('btn-export-ical');

    /** Week columns: indices (week-1)*7 + col — full 28-day grid */
    function dayIndexForWeekColumn(week, col) {
        const idx = (Number(week) - 1) * 7 + col;
        return idx < DAYS ? idx : null;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function mealCell(day) {
        const b = day?.breakfast || '—';
        const l = day?.lunch || '—';
        const u = day?.supper || '—';
        return `
            <td>
                <ul class="flex flex-col gap-4">
                    <li class="flex gap-2 items-center text-xs">
                        <div class="dot-breakfast"></div>
                        <div class="breakfast-meal">${escapeHtml(b)}</div>
                    </li>
                    <li class="flex gap-2 items-center text-xs">
                        <div class="dot-lunch"></div>
                        <div>${escapeHtml(l)}</div>
                    </li>
                    <li class="flex gap-2 items-center text-xs">
                        <div class="dot-supper"></div>
                        <div>${escapeHtml(u)}</div>
                    </li>
                </ul>
            </td>`;
    }

    function textCell(val, restLabel) {
        if (val == null || val === '') {
            if (restLabel) {
                return `<td class="empty-td" title="Rest" aria-label="Rest"></td>`;
            }
            return `<td><span class="text-muted text-xs"></span></td>`;
        }
        return `<td><span class="text-xs">${escapeHtml(val)}</span></td>`;
    }

    /** Cleanup: null = repos ; sinon liste (plusieurs tâches/jour). Ancien format: string. */
    function cleanupCell(day) {
        if (day.cleanup === null) {
            return `<td class="empty-td" title="Rest" aria-label="Rest"></td>`;
        }
        const list = S.cleanupAsList(day);
        if (list.length === 0) {
            return `<td><span class="text-muted text-xs"></span></td>`;
        }
        return `<td><ul class="flex flex-col gap-1.5 list-none text-left text-xs">${list
            .map((t) => `<li>${escapeHtml(t)}</li>`)
            .join('')}</ul></td>`;
    }

    function weekIndices(week) {
        const out = [];
        for (let c = 0; c < 7; c++) {
            const di = dayIndexForWeekColumn(week, c);
            if (di != null) out.push(di);
        }
        return out;
    }

    function renderPlan(schedule, week) {
        const pb = planBody();
        if (!pb || !schedule?.length) return;

        const rows = [];
        const idxs = weekIndices(week);

        rows.push(`<tr><td class="cat-cal">Meals</td>${idxs.map((i) => mealCell(schedule[i])).join('')}</tr>`);
        rows.push(`<tr><td class="cat-cal">Clean-up</td>${idxs.map((i) => cleanupCell(schedule[i])).join('')}</tr>`);
        rows.push(
            `<tr><td class="cat-cal">Admin</td>${idxs
                .map((i) => textCell(schedule[i].admin, true))
                .join('')}</tr>`
        );
        rows.push(
            `<tr><td class="cat-cal">Exercise</td>${idxs
                .map((i) => textCell(schedule[i].exercise, true))
                .join('')}</tr>`
        );

        pb.innerHTML = rows.join('');
    }

    function updateDashboardBars(schedule) {
        if (!schedule?.length) {
            document.querySelectorAll('.dash-day-bar').forEach((bar) => {
                bar.style.height = '0%';
            });
            return;
        }
        const week = getSelectedWeek();
        const loads = S.computeWeekdayLoadsForWeek(schedule, week);
        document.querySelectorAll('.dash-day-bar').forEach((bar, i) => {
            if (loads[i] != null) bar.style.height = `${loads[i]}%`;
        });
    }

    function getSelectedWeek() {
        let r = document.querySelector('input[name="week-num"]:checked');
        if (!r) r = document.querySelector('input[name="dash-balance-week"]:checked');
        if (!r) {
            const w = localStorage.getItem(LS_WEEK);
            if (w && /^[1-4]$/.test(w)) return Number(w);
        }
        return r ? Number(r.value) || 1 : 1;
    }

    /** Sync calendar + dashboard week radios + localStorage */
    function applyWeekSelection(w) {
        const v = String(Math.max(1, Math.min(4, Number(w) || 1)));
        localStorage.setItem(LS_WEEK, v);
        document.querySelectorAll('input[name="week-num"]').forEach((inp) => {
            inp.checked = inp.value === v;
        });
        document.querySelectorAll('input[name="dash-balance-week"]').forEach((inp) => {
            inp.checked = inp.value === v;
        });
    }

    function setWeek(w) {
        applyWeekSelection(w);
    }

    function renderAll() {
        const data = S.loadSchedulePayload();
        const week = getSelectedWeek();
        let schedule = data?.schedule;

        if (Array.isArray(schedule) && schedule.length >= DAYS) {
            schedule = schedule.slice(0, DAYS);
        } else {
            schedule = null;
        }

        if (!schedule) {
            if (planBody()) planBody().innerHTML = '';
            updateDashboardBars(null);
            return;
        }

        renderPlan(schedule, week);
        updateDashboardBars(schedule);
    }

    function generateMonth() {
        const pools = S.collectTaskPools();
        const pairs = S.loadPairsFromStorage();
        const result = S.runBestOfN(pools, pairs);
        if (!result) {
            alert('Could not generate a valid schedule. Try fewer pairs or more tasks.');
            return;
        }
        S.saveSchedulePayload({
            schedule: result.schedule,
            score: result.score,
            meta: result.meta,
            poolsSnapshot: pools,
        });
        renderAll();
    }

    function exportIcal() {
        const I = window.OrganisedIcal;
        if (!I) {
            alert('Calendar export unavailable (missing script).');
            return;
        }
        const data = S.loadSchedulePayload();
        let schedule = data?.schedule;
        if (!Array.isArray(schedule) || schedule.length < DAYS) {
            alert('Generate a schedule first (use “Generate 4 weeks”).');
            return;
        }
        schedule = schedule.slice(0, DAYS);
        const tzEl = document.getElementById('ical-zone');
        const timeZone = (tzEl && tzEl.value) || 'Europe/Paris';
        const ics = I.build(schedule, { timeZone, cleanupAsList: S.cleanupAsList });
        const mon = I.mondayYmdOfWeekContaining(new Date(), timeZone);
        I.download(ics, `planning-${mon}.ics`);
    }

    function init() {
        const savedW = localStorage.getItem(LS_WEEK);
        if (savedW && /^[1-4]$/.test(savedW)) setWeek(Number(savedW));
        else setWeek(S.getCurrentWeekOfMonth());

        renderAll();

        document.querySelectorAll('input[name="week-num"]').forEach((inp) => {
            inp.addEventListener('change', () => {
                applyWeekSelection(inp.value);
                renderAll();
            });
        });

        document.querySelectorAll('input[name="dash-balance-week"]').forEach((inp) => {
            inp.addEventListener('change', () => {
                applyWeekSelection(inp.value);
                renderAll();
            });
        });

        const b = genBtn();
        if (b) b.addEventListener('click', generateMonth);

        const ex = exportIcalBtn();
        if (ex) ex.addEventListener('click', exportIcal);

        document.addEventListener('organised-tags-changed', () => {
            renderAll();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.OrganisedCalendar = { renderAll, generateMonth, getSelectedWeek, exportIcal };
})();
