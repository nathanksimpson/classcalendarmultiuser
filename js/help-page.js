/**
 * Help page — render, search, table of contents, theme and language.
 */
(function () {
    const STRINGS = {
        en: {
            pageTitle: 'Help — Class Calendar',
            backToCalendar: '← Back to calendar',
            langToggle: '🌐 한국어',
            langToggleTitle: 'Switch to Korean',
            themeDark: '🌙 Dark',
            themeLight: '☀️ Light',
            themeToggleTitle: 'Switch light/dark theme',
            tocHeading: 'Contents',
            searchPlaceholder: 'Search help…',
            searchLabel: 'Search help',
            whereLabel: 'Where',
            noResults: 'No sections match your search.',
            matrixPermission: 'Permission',
            matrixYes: 'Yes',
            matrixNo: '—'
        },
        ko: {
            pageTitle: '도움말 — Class Calendar',
            backToCalendar: '← 캘린더로 돌아가기',
            langToggle: '🌐 English',
            langToggleTitle: 'Switch to English',
            themeDark: '🌙 다크',
            themeLight: '☀️ 라이트',
            themeToggleTitle: '밝은/어두운 테마 전환',
            tocHeading: '목차',
            searchPlaceholder: '도움말 검색…',
            searchLabel: '도움말 검색',
            whereLabel: '위치',
            noResults: '검색어와 일치하는 항목이 없습니다.',
            matrixPermission: '권한',
            matrixYes: '예',
            matrixNo: '—'
        }
    };

    let currentLang = 'en';
    let searchQuery = '';
    let searchTimer = null;

    function t(key) {
        const pack = STRINGS[currentLang] || STRINGS.en;
        return pack[key] != null ? pack[key] : STRINGS.en[key] || key;
    }

    function getInitialLang() {
        try {
            const params = new URLSearchParams(location.search);
            const q = params.get('lang');
            if (q === 'ko' || q === 'en') {
                return q;
            }
        } catch (_) {
            /* ignore */
        }
        try {
            const saved = localStorage.getItem('calendarLanguage');
            return saved === 'ko' ? 'ko' : 'en';
        } catch (_) {
            return 'en';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightHtml(text, query) {
        const safe = escapeHtml(text);
        const q = (query || '').trim();
        if (!q) {
            return safe;
        }
        try {
            const re = new RegExp(escapeRegExp(q), 'gi');
            return safe.replace(re, (m) => '<mark>' + m + '</mark>');
        } catch (_) {
            return safe;
        }
    }

    function sectionSlug(heading) {
        const numMatch = String(heading || '').match(/^(\d+)\.\s*/);
        const num = numMatch ? numMatch[1] : '0';
        const rest = String(heading || '')
            .replace(/^\d+\.\s*/, '')
            .toLowerCase()
            .replace(/[^\w\s\u0080-\uFFFF-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        return 'help-section-' + num + (rest ? '-' + rest : '');
    }

    /** With <base href="/">, hash-only links resolve to /#id (main app). Use help.html#id. */
    function helpPagePath() {
        const path = location.pathname || '';
        if (path.endsWith('help.html')) {
            return path;
        }
        return '/help.html';
    }

    function helpSectionHref(sectionId) {
        return helpPagePath() + '#' + sectionId;
    }

    function scrollToSectionId(sectionId) {
        if (!sectionId) {
            return;
        }
        const target = document.getElementById(sectionId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function sectionSearchText(section) {
        const parts = [section.heading, section.where].concat(section.steps || []);
        return parts.join(' ').toLowerCase();
    }

    function sectionMatches(section, query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            return true;
        }
        return sectionSearchText(section).includes(q);
    }

    function renderRolesMatrix(lang, query) {
        const guide = window.CCPHelpGuide;
        if (!guide || !guide.ROLE_MATRIX) {
            return '';
        }
        const matrix = guide.ROLE_MATRIX;
        const labels = matrix.permLabels[lang] || matrix.permLabels.en;
        const roleLabels = matrix.roleLabels[lang] || matrix.roleLabels.en;
        const introLines = (guide.ROLES_INTRO && guide.ROLES_INTRO[lang]) || [];

        let html =
            '<ul class="help-roles-intro">' +
            introLines.map((line) => '<li>' + highlightHtml(line, query) + '</li>').join('') +
            '</ul>';
        html += '<div class="help-matrix-wrap"><table class="help-matrix"><thead><tr><th scope="col">' +
            escapeHtml(t('matrixPermission')) +
            '</th>';
        matrix.roleIds.forEach((roleId) => {
            html += '<th scope="col">' + highlightHtml(roleLabels[roleId] || roleId, query) + '</th>';
        });
        html += '</tr></thead><tbody>';
        matrix.permOrder.forEach((permKey) => {
            html += '<tr><th scope="row">' + highlightHtml(labels[permKey] || permKey, query) + '</th>';
            matrix.roleIds.forEach((roleId) => {
                const yes = guide.roleHasPermission(roleId, permKey);
                html +=
                    '<td class="' +
                    (yes ? 'help-matrix-yes' : 'help-matrix-no') +
                    '" aria-label="' +
                    escapeHtml(roleLabels[roleId] || roleId) +
                    '">' +
                    (yes ? escapeHtml(t('matrixYes')) : escapeHtml(t('matrixNo'))) +
                    '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function renderSection(section, lang, query, visible) {
        const id = sectionSlug(section.heading);
        const hiddenClass = visible ? '' : ' is-filtered-out';
        let inner = '';
        if (section.rolesSection) {
            inner = renderRolesMatrix(lang, query);
        } else {
            inner =
                '<ol class="help-steps">' +
                (section.steps || [])
                    .map((step) => '<li>' + highlightHtml(step, query) + '</li>')
                    .join('') +
                '</ol>';
        }
        return (
            '<section class="help-section' +
            hiddenClass +
            '" id="' +
            escapeHtml(id) +
            '" data-section-id="' +
            escapeHtml(id) +
            '">' +
            '<h2>' +
            highlightHtml(section.heading, query) +
            '</h2>' +
            '<p class="help-where"><span class="help-where-label">' +
            escapeHtml(t('whereLabel')) +
            ':</span> ' +
            highlightHtml(section.where, query) +
            '</p>' +
            inner +
            '</section>'
        );
    }

    function renderToc(sections, query) {
        const listEl = document.getElementById('helpTocList');
        const tocNav = document.getElementById('helpToc');
        if (!listEl || !tocNav) {
            return;
        }
        const q = (query || '').trim();
        const items = sections.map((section) => {
            const id = sectionSlug(section.heading);
            const matches = sectionMatches(section, q);
            const hiddenClass = q && !matches ? ' is-hidden-match' : '';
            const shortTitle = section.heading.replace(/^\d+\.\s*/, '');
            return (
                '<li><a href="' +
                escapeHtml(helpSectionHref(id)) +
                '" class="' +
                hiddenClass.trim() +
                '">' +
                highlightHtml(shortTitle, q) +
                '</a></li>'
            );
        });
        listEl.innerHTML = items.join('');
        tocNav.hidden = sections.length === 0;
    }

    async function renderPage() {
        const api = window.CCPHelpGuide;
        if (!api || !api.getGuide) {
            return;
        }
        let guide;
        try {
            guide = await api.getGuide(currentLang);
        } catch (err) {
            console.error(err);
            return;
        }
        if (!guide) {
            return;
        }
        const titleEl = document.getElementById('helpTitle');
        const introEl = document.getElementById('helpIntro');
        const bodyEl = document.getElementById('helpBody');
        const noResultsEl = document.getElementById('helpNoResults');
        if (!titleEl || !introEl || !bodyEl) {
            return;
        }

        document.title = t('pageTitle');
        titleEl.textContent = guide.title;
        introEl.textContent = guide.intro;

        const q = searchQuery.trim();
        const sections = guide.sections || [];
        let anyVisible = false;
        const html = sections
            .map((section) => {
                const visible = sectionMatches(section, q);
                if (visible) {
                    anyVisible = true;
                }
                return renderSection(section, currentLang, q, visible);
            })
            .join('');
        bodyEl.innerHTML = html;

        if (noResultsEl) {
            if (q && !anyVisible) {
                noResultsEl.textContent = t('noResults');
                noResultsEl.hidden = false;
            } else {
                noResultsEl.hidden = true;
                noResultsEl.textContent = '';
            }
        }

        renderToc(sections, q);
        applyChromeStrings();
    }

    function applyChromeStrings() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key && t(key)) {
                el.textContent = t(key);
            }
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            if (key && t(key)) {
                el.title = t(key);
            }
        });
        const searchEl = document.getElementById('helpSearch');
        const searchLabel = document.getElementById('helpSearchLabel');
        if (searchEl) {
            searchEl.placeholder = t('searchPlaceholder');
            searchEl.setAttribute('aria-label', t('searchLabel'));
        }
        if (searchLabel) {
            searchLabel.textContent = t('searchLabel');
        }
    }

    function getStoredTheme() {
        const saved = localStorage.getItem('calendarTheme');
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next;
        localStorage.setItem('calendarTheme', next);
        const btn = document.getElementById('helpThemeToggle');
        if (btn) {
            btn.textContent = next === 'dark' ? t('themeLight') : t('themeDark');
            btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
            btn.title = t('themeToggleTitle');
        }
    }

    function setLanguage(lang) {
        currentLang = lang === 'ko' ? 'ko' : 'en';
        try {
            localStorage.setItem('calendarLanguage', currentLang);
        } catch (_) {
            /* ignore */
        }
        document.documentElement.lang = currentLang === 'ko' ? 'ko' : 'en';
        renderPage();
    }

    function toggleLanguage() {
        setLanguage(currentLang === 'ko' ? 'en' : 'ko');
    }

    function scrollToHash() {
        const hash = location.hash;
        if (!hash || hash.length < 2) {
            return;
        }
        scrollToSectionId(hash.slice(1));
    }

    function setupTocClickScroll() {
        const toc = document.getElementById('helpTocList');
        if (!toc || toc.dataset.bound === '1') {
            return;
        }
        toc.dataset.bound = '1';
        toc.addEventListener('click', (e) => {
            const link = e.target.closest('a[href*="#"]');
            if (!link) {
                return;
            }
            const href = link.getAttribute('href') || '';
            const hashIdx = href.indexOf('#');
            if (hashIdx < 0) {
                return;
            }
            const sectionId = href.slice(hashIdx + 1);
            const target = document.getElementById(sectionId);
            if (!target) {
                return;
            }
            e.preventDefault();
            const nextUrl = helpSectionHref(sectionId);
            if (location.pathname.endsWith('help.html') && location.hash !== '#' + sectionId) {
                history.replaceState(null, '', nextUrl);
            }
            scrollToSectionId(sectionId);
        });
    }

    function setupSearch() {
        const input = document.getElementById('helpSearch');
        if (!input) {
            return;
        }
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchQuery = input.value;
                renderPage();
            }, 150);
        });
    }

    function setupThemeToggle() {
        const btn = document.getElementById('helpThemeToggle');
        if (!btn || btn.dataset.bound === '1') {
            return;
        }
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            const current =
                document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    function setupLangToggle() {
        const btn = document.getElementById('helpLangToggle');
        if (!btn || btn.dataset.bound === '1') {
            return;
        }
        btn.dataset.bound = '1';
        btn.addEventListener('click', toggleLanguage);
    }

    async function init() {
        currentLang = getInitialLang();
        document.documentElement.lang = currentLang === 'ko' ? 'ko' : 'en';
        applyTheme(getStoredTheme());
        setupSearch();
        setupThemeToggle();
        setupLangToggle();
        setupTocClickScroll();
        await renderPage();
        window.addEventListener('hashchange', scrollToHash);
        requestAnimationFrame(scrollToHash);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            void init();
        });
    } else {
        void init();
    }
})();
