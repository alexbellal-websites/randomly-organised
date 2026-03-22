// ========= NIGHT MODE ============

const nightMode = document.querySelector('.night-mode');
const nightModeLabel = document.querySelector('.night-mode-label');

function updateNightButtonLabel() {
    const isDark = document.documentElement.classList.contains('dark');
    nightModeLabel.textContent = isDark ? 'Day' : 'Night';
    nightMode.setAttribute('aria-label', isDark ? 'Switch to night mode' : 'Switch to day mode');
}

if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
}
updateNightButtonLabel();

nightMode.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(
        'theme',
        document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
    updateNightButtonLabel();
});

// ========= BADGE FREQUENCY BUTTONS ===========
const tagsArea = document.querySelectorAll('.tags-area');
const globalGaugeDash = document.querySelector('.dash-global-capacity');
const globalGauge = globalGaugeDash.querySelector('.gauge-track');
const dashTotalNum = globalGaugeDash.querySelector('.total-num-month');
const listPanel = document.querySelectorAll('.list-panel');
const gauges = document.querySelectorAll('.gauge-track');
const dashTop = document.querySelector('.dash-top');

/** Label text only (before .frequency-badge), for data-task-name */
function syncTagPillTaskNames(root = document) {
    const scope =
        root.nodeType === 1 && root.classList?.contains('tag-pill')
            ? [root]
            : root.querySelectorAll('.tag-pill');
    scope.forEach(btn => {
        const parts = [];
        for (const node of btn.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent.trim();
                if (t) parts.push(t);
            }
            if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('frequency-badge')) {
                break;
            }
        }
        const label = parts.join(' ').trim();
        if (label) btn.dataset.taskName = label;
    });
}

/** Creates the frequency badge + listeners (static HTML & dynamically added tags). */
function attachFrequencyBadge(btn) {
    if (btn.querySelector('.frequency-badge')) return;
    const freq = btn.dataset.frequency;
    if (freq === undefined || freq === '') return;

    const badge = document.createElement('span');
    badge.className = 'frequency-badge hidden text-xs rounded-full flex items-center justify-center';
    badge.textContent = freq;
    badge.contentEditable = 'true';

    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        badge.focus();
        document.execCommand('selectAll', false, null);
    });

    badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            badge.blur();
        }
        if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
            e.preventDefault();
        }
    });

    badge.addEventListener('blur', () => {
        const val = parseInt(badge.textContent, 10) || 0;
        const section = btn.closest('.list-panel')?.dataset.section;
        const maxAllowed = section === 'cleanup' ? 200 : 28;
        const clamped = Math.max(0, Math.min(maxAllowed, val));
        badge.textContent = clamped;
        btn.dataset.frequency = String(clamped);
        updateSectionTotal();
        updateGlobalTotal();
        addTagToArray();
    });

    btn.classList.add('relative');
    btn.appendChild(badge);
}

/** Persist tag lists so deletions/additions survive full page refresh */
const LS_TAG_LISTS = 'organisedTagLists';
const TAG_LIST_IDS = ['ingredient-list', 'meal-list', 'cleanup-list', 'admin-list', 'exercise-list'];

function getTagPillLabel(btn) {
    const parts = [];
    for (const node of btn.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent.trim();
            if (t) parts.push(t);
        }
        if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('frequency-badge')) {
            break;
        }
    }
    return parts.join(' ').trim();
}

function serializeTagPill(btn) {
    syncTagPillTaskNames(btn);
    const text = getTagPillLabel(btn) || (btn.dataset.taskName || '').trim();
    const out = {
        className: btn.className,
        category: btn.dataset.category || '',
        text,
    };
    if (btn.dataset.frequency !== undefined && btn.dataset.frequency !== '') {
        out.frequency = btn.dataset.frequency;
    }
    return out;
}

function saveTagListsToStorage() {
    const data = {};
    TAG_LIST_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        data[id] = [...el.querySelectorAll('.tag-pill')].map(serializeTagPill);
    });
    try {
        localStorage.setItem(LS_TAG_LISTS, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save tag lists', e);
    }
}

function restoreTagListsFromStorage() {
    try {
        const raw = localStorage.getItem(LS_TAG_LISTS);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        TAG_LIST_IDS.forEach((id) => {
            if (!Object.prototype.hasOwnProperty.call(data, id)) return;
            const arr = data[id];
            if (!Array.isArray(arr)) return;
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '';
            arr.forEach((item) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = item.className || 'tag-pill tag-btn';
                if (item.category) btn.dataset.category = item.category;
                if (item.frequency !== undefined && item.frequency !== '') {
                    btn.dataset.frequency = String(item.frequency);
                }
                btn.textContent = item.text || '';
                el.appendChild(btn);
                if (btn.dataset.frequency !== undefined && btn.dataset.frequency !== '') {
                    attachFrequencyBadge(btn);
                }
                syncTagPillTaskNames(btn);
            });
        });
    } catch (e) {
        console.warn('Could not restore tag lists', e);
    }
}

restoreTagListsFromStorage();

function getListTotal(list) {
    let sum = 0;
    list.querySelectorAll('.tag-pill').forEach(b => {
        sum += Number(b.dataset.frequency) || 0;
    })
    return sum;
}

function getGlobalTotal() {
    let sum = 0;
    tagsArea.forEach(list => {
        if (list.closest('section')?.id === 'meals') return;
        sum += getListTotal(list);
    });
    return sum;
}

function maxHit(max, total, gauge) {
    if (total > max) {
        gauge.style.background = '#0077b6';
    } else {
        gauge.style.background = '#22d3ee';
    }
}

function getRestDays(section) {
    const input = document.querySelector(`input[data-rest="${section}"]`);
    if (!input) return 0;
    return (parseInt(input.value, 10) || 0) * 4;
}

/** Jours « actifs » sur la grille 28 j. pour une section (aligné au scheduler) */
function getWorkingDaysInMonth(section) {
    return Math.max(0, 28 - getRestDays(section));
}

function gaugeDenominator(max) {
    return Math.max(1, max);
}

/** Sum of frequencies over 28 days → average per day */
function avgTasksPerDayLine(total) {
    const n = Number(total) || 0;
    const perDay = n / 28;
    const rounded = perDay >= 10 ? perDay.toFixed(0) : perDay.toFixed(1);
    return `${n} / 28 days → ~${rounded} per day`;
}

/**
 * Dénominateur jauge « Monthly capacity » (somme des fréquences / ce max).
 * - Meals : 28 × 3 repas
 * - Cleanup : 28 (échelle simple : fréquence = fois sur 28 j. ; plusieurs cleanups/jour → jauge peut dépasser 100 %)
 * - Admin / exercise : jours actifs (1 occurrence max / jour)
 */
function getSectionMax(section) {
    if (section === 'meals') return 84;
    if (section === 'cleanup') {
        return 28;
    }
    if (section === 'admin' || section === 'exercise') {
        return getWorkingDaysInMonth(section);
    }
    return 0;
}

function getCapacityTooltip(_section, total) {
    return avgTasksPerDayLine(total);
}

const CAPACITY_SECTIONS = new Set(['meals', 'cleanup', 'admin', 'exercise']);

function updateSectionTotal() {
    listPanel.forEach(panel => {
        const section = panel.dataset.section;
        if (!CAPACITY_SECTIONS.has(section)) return;

        const total = getListTotal(panel);
        const max = getSectionMax(section);
        const tip = getCapacityTooltip(section, total);
        const denom = gaugeDenominator(max);

        document.querySelectorAll(`.${section}-capacity`)
        .forEach(e => e.textContent = total);

        document.querySelectorAll(`.${section}-max`)
        .forEach(e => {
            e.textContent = max;
            const cap = e.closest('.capacity-num');
            if (cap) cap.dataset.tip = tip;
        });

        panel.querySelectorAll('.gauge-fill').forEach(g => {
            g.style.width = `${(total / denom) * 100}%`;
            maxHit(max, total, g);
        });

        dashCards.forEach(card => {
            if (card.dataset.section !== section) return;
            card.querySelectorAll('.gauge-fill').forEach(g => {
                g.style.width = `${(total / denom) * 100}%`;
                maxHit(max, total, g);
            });
        });
    });
}

function updateGlobalTotal() {
    const total = getGlobalTotal();
    const cMax = getSectionMax('cleanup');
    const aMax = getSectionMax('admin');
    const eMax = getSectionMax('exercise');
    const max = cMax + aMax + eMax;
    const denom = gaugeDenominator(max);
    dashTotalNum.textContent = total;
    document.querySelectorAll('.total-max').forEach(e => {
        e.textContent = max;
        const cap = e.closest('.capacity-num');
        if (cap) {
            cap.dataset.tip = avgTasksPerDayLine(total);
        }
    });
    const gauge = dashTop.querySelector('.gauge-fill');
    if (gauge) {
        gauge.style.width = `${(total / denom) * 100}%`;
        maxHit(max, total, gauge);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateGlobalTotal();
    updateSectionTotal();
    addTagToArray();
});

document.querySelectorAll('.tag-btn[data-frequency]').forEach(btn => attachFrequencyBadge(btn));

syncTagPillTaskNames();

const toggleFrequencies = document.querySelectorAll('.switch input');

function freqHintLabel() {
    return window.matchMedia('(max-width: 767px)').matches
        ? 'Tap a number to edit'
        : 'Click on a number to edit';
}

toggleFrequencies.forEach(toggle => {
    const section = toggle.closest('section');
    const sectionLayout = toggle.closest('.section-layout');
    const wrapper = document.createElement('div');
    wrapper.className = 'freq-hint-wrap';
    wrapper.style.position = 'relative';
    sectionLayout.parentNode.insertBefore(wrapper, sectionLayout);
    wrapper.appendChild(sectionLayout);
    const hint = document.createElement('div');
    hint.className = 'freq-hint hidden';
    hint.textContent = freqHintLabel();
    wrapper.appendChild(hint);

    toggle.addEventListener('change', () => {
        const badges = section.querySelectorAll('.frequency-badge');

        badges.forEach(badge => {
            badge.classList.toggle('hidden', !toggle.checked);
        });

        hint.classList.toggle('hidden', !toggle.checked);
    });
});

window.addEventListener('resize', () => {
    document.querySelectorAll('.freq-hint').forEach((el) => {
        el.textContent = freqHintLabel();
    });
});

// ======== REST SETTINGS =========

document.querySelectorAll('input[data-rest]').forEach(input => {
    const key = input.dataset.rest;
    const dashSpan = document.getElementById(`dash-rest-${key}`);

    input.addEventListener('change', () => {
        const val = input.value;
        localStorage.setItem(key, val);
        dashSpan.textContent = `${val} days`;
        document.querySelectorAll(`input[data-rest="${key}"]`).forEach(sibling => {
            if (sibling !== input) sibling.value = val;
        });
        updateSectionTotal();
        updateGlobalTotal();
    });

    const saved = localStorage.getItem(key);
    if (saved) {
        input.value = saved;
        dashSpan.textContent = `${saved} days`;
    }
});


// ========= MODAL ===========

const confirmModal = document.querySelector('.confirm-modal');
const overlay = document.querySelector('.overlay');
const cancelBtnModal = document.querySelector('.cancel-btn-modal');
const deleteBtnModal = document.querySelector('.delete-btn-modal');
const textModal = document.querySelector('.text-modal');

let modalIsOn = false;

function modalState() {

    if (modalIsOn === false) {
        confirmModal.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        confirmModal.classList.add('active');
        overlay.classList.add('active');
    }
}

let currentTarget = null;

cancelBtnModal.addEventListener('click', () => {
    modalIsOn = false;
    modalState();
});

deleteBtnModal.addEventListener('click', () => {
    if (currentTarget) {
        currentTarget.remove();
        syncTagPillTaskNames();
        addTagToArray();
        updateSectionTotal();
        updateGlobalTotal();
    }
    modalIsOn = false;
    modalState();
    currentTarget = null;
})

overlay.addEventListener('click', () => {
    modalIsOn = false;
    modalState();
    currentTarget = null;
});

const LONG_PRESS_DELETE_MS = 550;

function prefersMobileDeleteGesture() {
    return window.matchMedia('(max-width: 767px)').matches;
}

/** Desktop : double-clic. Mobile (≤767px) : appui long sur la pastille */
function bindTagListDelete(list) {
    list.addEventListener('dblclick', (e) => {
        if (prefersMobileDeleteGesture()) return;
        deleteItem(e, list);
    });

    let longPressTimer = null;

    const clearLongPress = () => {
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    list.addEventListener(
        'touchstart',
        (e) => {
            if (!prefersMobileDeleteGesture()) return;
            const btn = e.target.closest('button');
            if (!btn || !list.contains(btn)) return;
            clearLongPress();
            longPressTimer = window.setTimeout(() => {
                longPressTimer = null;
                deleteItem({ target: btn }, list);
            }, LONG_PRESS_DELETE_MS);
        },
        { passive: true }
    );

    list.addEventListener('touchmove', clearLongPress, { passive: true });
    list.addEventListener('touchend', clearLongPress, { passive: true });
    list.addEventListener('touchcancel', clearLongPress, { passive: true });
}

function deleteItem(e, list) {
    const target = e.target;
    if (target.tagName !== 'BUTTON' || !list.contains(target)) return;
    
    currentTarget = target;
    const name = target.childNodes[0].textContent.trim();
    const styledName = document.createElement('span');
    styledName.textContent = name;
    styledName.className = target.className;
    styledName.style.color = getComputedStyle(target).color;
    styledName.style.fontSize = '0.875rem';

    textModal.innerHTML = '';
    textModal.appendChild(document.createTextNode('Delete '));
    textModal.appendChild(styledName);
    textModal.appendChild(document.createTextNode(' ?'));

    modalIsOn = true;
    modalState();
}

// ========= MENU ============

const menuItems = document.querySelectorAll('.menu-i');
const sections = document.querySelectorAll('main section');

function showSection(sectionId) {
    sections.forEach((section) => {
        section.classList.toggle('hidden', section.id !== sectionId);
        modalIsOn = false;
        modalState();
        currentTarget = null;
    });
    window.scrollTo({ top: 0 });
    localStorage.setItem('activeSection', sectionId);
}

const savedSection = localStorage.getItem('activeSection') || 'dashboard';
showSection(savedSection);

function isDesktopNav() {
    return window.matchMedia('(min-width: 768px)').matches;
}

// Expand / Shrink menu (desktop)
const layout = document.querySelector('.layout');
const navBar = document.querySelector('.nav-bar');
const shrinkMenu = document.getElementById('shrink-menu-arrow');
const expandMenu = document.getElementById('expand-menu-arrow');
const navBackdrop = document.getElementById('nav-backdrop');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');

let menuIsOpen = true;

function syncDesktopNav() {
    if (!isDesktopNav() || !layout || !navBar) return;
    const isCollapsed = !menuIsOpen;

    menuItems.forEach((item) => {
        const nameEl = item.querySelector('div:last-child div:last-child');
        if (!nameEl) return;
        nameEl.style.opacity = isCollapsed ? '0' : '1';
        setTimeout(() => {
            nameEl.style.display = isCollapsed ? 'none' : 'flex';
        }, 100);
    });

    if (shrinkMenu && expandMenu) {
        shrinkMenu.classList.toggle('-z-50', isCollapsed);
        expandMenu.classList.toggle('z-50', isCollapsed);
    }
    navBar.classList.toggle('w-[84px]', isCollapsed);
    layout.classList.toggle('layout--nav-collapsed', isCollapsed);
}

function resetNavForMobileLayout() {
    if (!navBar || !layout) return;
    navBar.classList.remove('w-[84px]', 'nav-mobile-open');
    layout.classList.remove('layout--nav-collapsed');
    menuItems.forEach((item) => {
        const nameEl = item.querySelector('div:last-child div:last-child');
        if (!nameEl) return;
        nameEl.style.opacity = '1';
        nameEl.style.display = 'flex';
    });
}

function setMobileNavOpen(open) {
    if (!navBar || !navBackdrop || !mobileMenuToggle) return;
    navBar.classList.toggle('nav-mobile-open', open);
    navBackdrop.classList.toggle('is-open', open);
    navBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    mobileMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('mobile-nav-open', open);
    const iconOpen = mobileMenuToggle.querySelector('.icon-open');
    const iconClose = mobileMenuToggle.querySelector('.icon-close');
    if (iconOpen && iconClose) {
        iconOpen.classList.toggle('hidden', open);
        iconClose.classList.toggle('hidden', !open);
    }
}

function closeMobileNav() {
    setMobileNavOpen(false);
}

function onWindowResizeNav() {
    if (isDesktopNav()) {
        closeMobileNav();
        syncDesktopNav();
    } else {
        resetNavForMobileLayout();
        closeMobileNav();
    }
}

shrinkMenu?.addEventListener('click', () => {
    menuIsOpen = false;
    syncDesktopNav();
    localStorage.setItem('menu', 'collapsed');
});

expandMenu?.addEventListener('click', () => {
    menuIsOpen = true;
    syncDesktopNav();
    localStorage.setItem('menu', 'expanded');
});

if (localStorage.getItem('menu') === 'collapsed' && isDesktopNav()) {
    menuIsOpen = false;
    syncDesktopNav();
} else if (!isDesktopNav()) {
    resetNavForMobileLayout();
}

window.addEventListener('resize', onWindowResizeNav);

mobileMenuToggle?.addEventListener('click', () => {
    const open = !navBar.classList.contains('nav-mobile-open');
    setMobileNavOpen(open);
});

navBackdrop?.addEventListener('click', closeMobileNav);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
});

menuItems.forEach((item) => {
    item.addEventListener('click', () => {
        showSection(item.dataset.section);
        if (!isDesktopNav()) closeMobileNav();
    });
});

// ========= DASHBOARD ============
const dashCards = document.querySelectorAll('.dash-card');

dashCards.forEach(card => {
    card.addEventListener('click', () => {
        showSection(card.dataset.section);
    });
});

// ========= PAGES ===========

const darkCategories = ['supper-meal', 'lunch-meal', 'harder-work', 'medium-work'];

function addFormItem(input, category, list, frequency = null) {

    const name = input.value.trim();
    if (!name) return;

    const categoryChosen = category.value;
    const option = category.options[category.selectedIndex];
    const colorAuto = option.dataset.color || 'bg-slate-200';

    const newItem = document.createElement('button');
    newItem.type = 'button';
    newItem.className = `tag-pill tag-btn ${colorAuto}`;
    newItem.dataset.category = categoryChosen;

    if (darkCategories.includes(categoryChosen)) {
        newItem.classList.add('text-white');
    }

    newItem.textContent = name;
    newItem.dataset.taskName = name;

    if (frequency && frequency.value !== '') {
        newItem.dataset.frequency = frequency.value;
    }

    list.appendChild(newItem);

    if (newItem.dataset.frequency !== undefined && newItem.dataset.frequency !== '') {
        attachFrequencyBadge(newItem);
        syncTagPillTaskNames(newItem);
        frequency.value = '';
    }

    addTagToArray();
    updateSectionTotal();
    updateGlobalTotal();

    input.value = '';
    category.value = '';
}

// MEALS PAGE

// ingredients
const ingredientInput = document.getElementById('ingredient-input');
const categoryIngredient = document.getElementById('ingredient-category');
const listOfIngredients = document.getElementById('ingredient-list');
const submitIngredient = document.getElementById('ingredient-submit');

submitIngredient.addEventListener('click', (e) => {
    e.preventDefault();
    addFormItem(ingredientInput, categoryIngredient, listOfIngredients)
});

bindTagListDelete(listOfIngredients);

// meals 
const mealInput = document.getElementById('meal-input');
const categoryMeal = document.getElementById('meal-category');
const submitMeal = document.getElementById('meal-submit');
const frequenceMeal = document.getElementById('meal-frequency');
const listOfMeals = document.getElementById('meal-list');

submitMeal.addEventListener('click', (e) => {
    e.preventDefault();
    addFormItem(mealInput, categoryMeal, listOfMeals, frequenceMeal);
});

bindTagListDelete(listOfMeals);


// CLEAN-UP PAGE
const taskInput = document.getElementById('cleanup-input');
const categoryTask = document.getElementById('cleanup-category');
const submitTask = document.getElementById('cleanup-submit');
const frequenceTask = document.getElementById('cleanup-frequency');
const listOfTasks = document.getElementById('cleanup-list');

submitTask.addEventListener('click', (e) => {
    e.preventDefault();
    addFormItem(taskInput, categoryTask, listOfTasks, frequenceTask);
});

bindTagListDelete(listOfTasks);


// ADMIN PAGE
const adminInput = document.getElementById('admin-input');
const categoryAdmin = document.getElementById('admin-category');
const submitAdminTask = document.getElementById('admin-submit');
const frequenceAdminTask = document.getElementById('admin-frequency');
const listOfAdminTasks = document.getElementById('admin-list');

submitAdminTask.addEventListener('click', (e) => {
    e.preventDefault();
    addFormItem(adminInput, categoryAdmin, listOfAdminTasks, frequenceAdminTask);
});

bindTagListDelete(listOfAdminTasks);


// EXERCISE PAGE
const exerciseInput = document.getElementById('exercise-input');
const categoryExercise = document.getElementById('exercise-category');
const submitExercise = document.getElementById('exercise-submit');
const frequenceExercise = document.getElementById('exercise-frequency');
const listOfExercises = document.getElementById('exercise-list');

submitExercise.addEventListener('click', (e) => {
    e.preventDefault();
    addFormItem(exerciseInput, categoryExercise, listOfExercises, frequenceExercise);
});

bindTagListDelete(listOfExercises);


// ============= CALENDAR ================

// Show more options

document.querySelectorAll('.title-pref').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        const box = e.target.closest('.pref-container');
        const boxBody = box.querySelector('.body-pref');
        const iconShow = box.querySelector('.show-more');
        const isOpen = !boxBody.classList.contains('hidden');

        if (isOpen) {
            boxBody.classList.add('hidden');
            iconShow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>`;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            boxBody.classList.remove('hidden');
            iconShow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                                </svg>`;
            setTimeout(() => {
                const top = box.getBoundingClientRect().top + window.scrollY - 32;
                window.scrollTo({ top, behavior: 'smooth' });
            }, 50);
        }
    });
});

// Integration & random (draft)
const enrichedArr = [];

function addTagToArray() {
    enrichedArr.length = 0;
    tagsArea.forEach(tag => {
        tag.querySelectorAll('.tag-pill').forEach(b => {
            enrichedArr.push({
                name: b.dataset.taskName || '',
                value: Number(b.dataset.frequency) || 0,
                section: b.closest('.list-panel').dataset.section || null,
            });
        });
    });
    saveTagListsToStorage();
    document.dispatchEvent(new CustomEvent('organised-tags-changed'));
}
