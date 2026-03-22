/**
 * Pairing UI ↔ localStorage "organisedPairs" [{ a, b, gap, section }]
 */
(function () {
    const LS = 'organisedPairs';
    const LONG_PRESS_MS = 550;

    function prefersMobileDeleteGesture() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    /** Desktop : double-clic sur la ligne. Mobile : appui long (~550 ms). */
    function bindPairRowDelete(el, resolveSection) {
        const tryRemove = (row) => {
            if (!row || !el.contains(row)) return;
            const section =
                typeof resolveSection === 'function' ? resolveSection(row) : resolveSection;
            removePair(section, row.dataset.a, row.dataset.b, row.dataset.gap);
        };

        el.addEventListener('dblclick', (e) => {
            if (prefersMobileDeleteGesture()) return;
            tryRemove(e.target.closest('.pair-row'));
        });

        let t = null;
        const clear = () => {
            if (t) {
                clearTimeout(t);
                t = null;
            }
        };

        el.addEventListener(
            'touchstart',
            (e) => {
                if (!prefersMobileDeleteGesture()) return;
                const row = e.target.closest('.pair-row');
                if (!row || !el.contains(row)) return;
                clear();
                t = setTimeout(() => {
                    t = null;
                    tryRemove(row);
                }, LONG_PRESS_MS);
            },
            { passive: true }
        );
        el.addEventListener('touchmove', clear, { passive: true });
        el.addEventListener('touchend', clear, { passive: true });
        el.addEventListener('touchcancel', clear, { passive: true });
    }

    function loadPairs() {
        try {
            const raw = localStorage.getItem(LS);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter((p) => p && p.a && p.b) : [];
        } catch {
            return [];
        }
    }

    function savePairs(pairs) {
        localStorage.setItem(LS, JSON.stringify(pairs));
    }

    function taskNamesForSection(section) {
        const panel = document.querySelector(`.list-panel[data-section="${section}"]`);
        if (!panel) return [];
        const names = new Set();
        panel.querySelectorAll('.tag-pill').forEach((btn) => {
            const n = (btn.dataset.taskName || btn.textContent || '').trim();
            if (n) names.add(n);
        });
        return [...names].sort((a, b) => a.localeCompare(b));
    }

    function fillSelect(sel, names) {
        const cur = sel.value;
        sel.innerHTML = '<option value="">Pick</option>';
        names.forEach((n) => {
            const o = document.createElement('option');
            o.value = n;
            o.textContent = n;
            sel.appendChild(o);
        });
        if (names.includes(cur)) sel.value = cur;
    }

    const pairConfigs = [
        { section: 'ingredients', first: 'ingredient-pair-first', second: 'ingredient-pair-second', gap: 'ingredient-pair-gap', add: 'ingredient-pair-add', recap: 'ingredient-pair-recap-list' },
        { section: 'meals', first: 'meal-pair-first', second: 'meal-pair-second', gap: 'meal-pair-gap', add: 'meal-pair-add', recap: 'meal-pair-recap-list' },
        { section: 'cleanup', first: 'pair-first', second: 'pair-second', gap: 'pair-gap', add: 'pair-add', recap: 'pair-recap-list' },
        { section: 'admin', first: 'admin-pair-first', second: 'admin-pair-second', gap: 'admin-pair-gap', add: 'admin-pair-add', recap: 'admin-pair-recap-list' },
        { section: 'exercise', first: 'exercise-pair-first', second: 'exercise-pair-second', gap: 'exercise-pair-gap', add: 'exercise-pair-add', recap: 'exercise-pair-recap-list' },
    ];

    function refreshSelects() {
        pairConfigs.forEach(({ section, first, second }) => {
            const names = taskNamesForSection(section);
            const a = document.getElementById(first);
            const b = document.getElementById(second);
            if (a) fillSelect(a, names);
            if (b) fillSelect(b, names);
        });
    }

    function renderPairRow(p) {
        const row = document.createElement('div');
        row.className = 'pair-row cursor-pointer';
        row.dataset.a = p.a;
        row.dataset.b = p.b;
        const g = Number(p.gap);
        const gapNum = Number.isFinite(g) ? g : 1;
        row.dataset.gap = String(gapNum);
        row.dataset.section = p.section || '';
        const gapLabel =
            gapNum === 0 ? 'same day' : `${gapNum} day${gapNum === 1 ? '' : 's'}`;
        row.title = `${p.a} → ${p.b} (${gapLabel})`;
        row.innerHTML = `
            <span class="tag-pill tag-btn bg-blue-600 text-white pair-pill-label" title="${escapeAttr(p.a)}">${escapeHtml(p.a)}</span>
            <span class="pair-arrow text-muted">→</span>
            <span class="tag-pill tag-btn bg-blue-600 text-white pair-pill-label" title="${escapeAttr(p.b)}">${escapeHtml(p.b)}</span>
            <span class="pair-gap-label">${gapLabel}</span>
        `;
        return row;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /** Pour attributs HTML title="" */
    function escapeAttr(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function renderSectionRecaps(all) {
        pairConfigs.forEach(({ section, recap }) => {
            const el = document.getElementById(recap);
            if (!el) return;
            el.innerHTML = '';
            all
                .filter((p) => p.section === section)
                .forEach((p) => el.appendChild(renderPairRow(p)));
        });
    }

    function renderDashboardPairs(all) {
        const grid = document.getElementById('dash-pairs-list');
        const count = document.getElementById('dash-pairs-count');
        if (!grid) return;
        grid.innerHTML = '';
        if (all.length === 0) {
            grid.innerHTML = '<p class="text-xs text-muted">Add pairs from each section\'s settings to see them here.</p>';
            if (count) count.textContent = 'No pairs yet';
            return;
        }
        if (count) count.textContent = `${all.length} pair${all.length === 1 ? '' : 's'}`;
        all.forEach((p) => {
            const row = renderPairRow(p);
            grid.appendChild(row);
        });
    }

    function renderAll(all) {
        renderSectionRecaps(all);
        renderDashboardPairs(all);
    }

    function addPairFromForm(section, firstId, secondId, gapId) {
        const aEl = document.getElementById(firstId);
        const bEl = document.getElementById(secondId);
        const gEl = document.getElementById(gapId);
        const a = (aEl?.value || '').trim();
        const b = (bEl?.value || '').trim();
        const raw = parseInt(gEl?.value, 10);
        const gap =
            section === 'cleanup'
                ? Math.max(0, Number.isFinite(raw) ? raw : 1)
                : Math.max(1, Number.isFinite(raw) ? raw : 1);
        if (!a || !b) return false;
        /** Même tâche deux fois : réservé au cleanup (ex. Laundry + Laundry, gap 2) */
        if (a === b && section !== 'cleanup') return false;
        const pairs = loadPairs();
        pairs.push({ a, b, gap, section });
        savePairs(pairs);
        renderAll(pairs);
        if (aEl) aEl.value = '';
        if (bEl) bEl.value = '';
        if (gEl) gEl.value = '';
        return true;
    }

    function removePair(section, a, b, gap) {
        let pairs = loadPairs();
        const g = Number(gap);
        pairs = pairs.filter((p) => !(p.section === section && p.a === a && p.b === b && Number(p.gap) === g));
        savePairs(pairs);
        renderAll(pairs);
    }

    function init() {
        refreshSelects();
        renderAll(loadPairs());

        pairConfigs.forEach(({ section, first, second, gap, add, recap }) => {
            const btn = document.getElementById(add);
            if (btn) {
                btn.addEventListener('click', () => {
                    addPairFromForm(section, first, second, gap);
                });
            }
            const recapEl = document.getElementById(recap);
            if (recapEl) {
                bindPairRowDelete(recapEl, () => section);
            }
        });

        const dash = document.getElementById('dash-pairs-list');
        if (dash) {
            bindPairRowDelete(dash, (row) => row.dataset.section);
        }

        document.addEventListener('organised-tags-changed', () => {
            refreshSelects();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.OrganisedPairs = { loadPairs, savePairs, refreshSelects, renderAll };
})();
