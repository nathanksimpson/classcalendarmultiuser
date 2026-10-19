/**
 * Content expand toggle + setup pipeline stepper (Books → Syllabi → Homework).
 * window.CCPContentExpand
 */
(function (global) {
    'use strict';

    let hooks = {};

    function t(key) {
        return typeof hooks.t === 'function' ? hooks.t(key) : key;
    }

    function getAppData() {
        return typeof hooks.getAppData === 'function' ? hooks.getAppData() : {};
    }

    function navigateToZone(zoneId, segment) {
        if (typeof hooks.navigateToZone === 'function') {
            hooks.navigateToZone(zoneId, segment);
        }
    }

    function getActiveTab() {
        return typeof hooks.getActiveTab === 'function' ? hooks.getActiveTab() : '';
    }

    function zoneClasses() {
        return hooks.zoneClasses || 'classes';
    }

    function zoneSchedule() {
        return hooks.zoneSchedule || 'schedule';
    }

    function updateContentPipelineStepper(tabId) {
        const stepper = document.getElementById('contentPipelineStepper');
        if (!stepper) {
            return;
        }
        const appData = getAppData() || {};
        const contentTabs = ['curriculum', 'syllabus'];
        const hasBooks = (appData.curriculumBooks || []).some((b) => b && b.id);
        const hasSyllabi = (appData.classes || []).some((c) => c && c.syllabus && c.syllabus.length);
        const setupIncomplete = !hasBooks || !hasSyllabi;
        stepper.hidden = !contentTabs.includes(tabId) || !setupIncomplete;
        if (stepper.hidden) {
            return;
        }
        const stepMap = {
            curriculum: 'books',
            syllabus: 'syllabi',
            homework: 'homework'
        };
        const activeStep = stepMap[tabId] || 'books';
        ['books', 'syllabi', 'homework'].forEach((step) => {
            const el = stepper.querySelector(`[data-step="${step}"]`);
            if (!el) {
                return;
            }
            el.classList.remove('is-active', 'is-done');
            if (step === activeStep) {
                el.classList.add('is-active');
            }
            if (step === 'books' && hasBooks) {
                el.classList.add('is-done');
            }
            if (step === 'syllabi' && hasSyllabi) {
                el.classList.add('is-done');
            }
            if (step === 'homework' && tabId === 'homework') {
                el.classList.add('is-done');
            }
        });
        if (!stepper.dataset.pipelineBound) {
            stepper.dataset.pipelineBound = '1';
            document.getElementById('contentStepBooks')?.addEventListener('click', () =>
                navigateToZone(zoneClasses(), 'curriculum'));
            document.getElementById('contentStepSyllabi')?.addEventListener('click', () =>
                navigateToZone(zoneClasses(), 'syllabus'));
            document.getElementById('contentStepHomework')?.addEventListener('click', () =>
                navigateToZone(zoneSchedule(), 'homework'));
        }
    }

    function updateContentExpandChrome() {
        const btn = document.getElementById('contentExpandToggleBtn');
        if (!btn) {
            return;
        }
        const expanded = document.documentElement.getAttribute('data-content-expanded') === '1';
        btn.textContent = expanded ? t('contentCollapse') : t('contentExpand');
    }

    function syncContentExpandToggleVisibility(tabId) {
        const btn = document.getElementById('contentExpandToggleBtn');
        if (!btn) {
            return;
        }
        const tab = tabId || getActiveTab();
        const showOn = ['homework', 'curriculum', 'syllabus'];
        btn.hidden = !showOn.includes(tab);
    }

    function setupContentExpandToggle() {
        const btn = document.getElementById('contentExpandToggleBtn');
        if (!btn || btn.dataset.bound === '1') {
            return;
        }
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const expanded = document.documentElement.getAttribute('data-content-expanded') === '1';
            if (expanded) {
                document.documentElement.removeAttribute('data-content-expanded');
            } else {
                document.documentElement.setAttribute('data-content-expanded', '1');
            }
            updateContentExpandChrome();
            requestAnimationFrame(() => {
                if (typeof hooks.syncHomeworkSidebarChromeOffset === 'function') {
                    hooks.syncHomeworkSidebarChromeOffset();
                }
            });
        });
    }

    function init(nextHooks) {
        hooks = nextHooks && typeof nextHooks === 'object' ? nextHooks : {};
    }

    function setup() {
        setupContentExpandToggle();
    }

    global.CCPContentExpand = {
        init,
        setup,
        updateContentPipelineStepper,
        updateContentExpandChrome,
        syncContentExpandToggleVisibility,
        setupContentExpandToggle
    };
})(typeof window !== 'undefined' ? window : globalThis);
