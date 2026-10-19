/**
 * Phase 6 header / menu hierarchy (string checks on index.html + app.js).
 * Run: node tests/header-hierarchy.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = readFileSync(path.join(root, 'app.js'), 'utf8');
const zoneContext = readFileSync(path.join(root, 'js', 'classroom-zone-context.js'), 'utf8');
const essays = readFileSync(path.join(root, 'js', 'classroom-essays.js'), 'utf8');
const en = readFileSync(path.join(root, 'js', 'i18n', 'calendar-en.js'), 'utf8');
const ko = readFileSync(path.join(root, 'js', 'i18n', 'calendar-ko.js'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

/** Outer HTML of the element carrying id="…" (balanced on its own tag name). */
function block(id) {
    const at = html.indexOf(`id="${id}"`);
    assert(at >= 0, `#${id} exists`);
    const start = html.lastIndexOf('<', at);
    const tag = html.slice(start + 1).match(/^[a-zA-Z0-9-]+/)[0];
    const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(html))) {
        depth += m[0].startsWith('</') ? -1 : 1;
        if (depth === 0) {
            return html.slice(start, m.index + m[0].length);
        }
    }
    throw new Error(`unbalanced #${id}`);
}

{
    const cal = block('teamCalendarPopover');
    ['addClassBtn', 'addHolidayBtn', 'teamDeleteCalendarBtn', 'teamBackupBtn'].forEach((id) => {
        assert(!cal.includes(`id="${id}"`), `Calendar popover no longer has #${id}`);
    });
    assert(cal.includes('id="teamNewCalendarBtn"') && cal.includes('data-i18n="teamNewCalendarItem"'), 'New calendar item');
}

{
    const term = block('termSettingsModal');
    ['dayNotesToolbarBtn', 'openNotesAppLink', 'termSelectorFooter', 'fetchKrHolidaysBtn'].forEach((id) => {
        assert(!term.includes(`id="${id}"`), `Term settings no longer has #${id}`);
    });
    assert(term.includes('id="termSettingsHolidaysLink"'), 'Term settings links to Events for holidays');
    assert(block('termSummaryStrip').startsWith('<button'), 'term strip is a button');
}

{
    assert(!html.includes('id="navTabsCollapseToggle"'), 'header Hide tabs button removed');
    assert(!html.includes('id="headerMyScheduleBtn"'), 'header My schedule button removed');
    assert(html.includes('id="navTabsCollapsedChip"'), 'collapsed-tabs chip kept');
}

{
    const account = block('teamAccountPopover');
    ['accountMyTimetableBtn', 'accountHideTabsBtn', 'accountResetNavLayoutBtn', 'openPlannerAppHeaderBtn'].forEach((id) => {
        assert(account.includes(`id="${id}"`), `Account menu has #${id}`);
    });
    const prefsAt = account.indexOf('data-i18n="accountPreferencesHeading"');
    assert(prefsAt >= 0, 'Preferences heading present');
    assert(prefsAt < account.indexOf('id="themeToggleBtn"'), 'Preferences heading above Theme');
    assert(account.indexOf('id="accountResetNavLayoutBtn"') < account.indexOf('id="accountMyTimetableBtn"'), 'Preferences before My timetable');
}

{
    const tools = block('headerToolsCollapsible');
    const newAt = tools.indexOf('id="headerNewMenuBtn"');
    const notesAt = tools.indexOf('id="headerDayNotesBtn"');
    const calAt = tools.indexOf('id="teamCalendarMenuBtn"');
    assert(newAt >= 0 && notesAt > newAt && calAt > notesAt, '+ New, Day notes, then Calendar inside the collapsible tools');
    assert(tools.indexOf('id="openPrintBtn"') > calAt, 'Print after Calendar');
    assert(tools.includes('id="headerThemeToggleBtn"'), 'theme icon stays in header');
    const pinnedAt = html.indexOf('app-header-unified__tools-pinned');
    assert(html.indexOf('id="headerClassScope"') > pinnedAt, 'scope switch is pinned');
    assert(/id="headerClassScope"[^>]*role="radiogroup"/.test(html), 'scope switch is a radiogroup');
    const newMenu = block('headerNewPopover');
    ['headerNewClassItem', 'headerNewEventItem', 'headerNewCohortItem', 'headerNewDayNoteItem', 'headerNewEssayAssignmentItem'].forEach((id) => {
        assert(newMenu.includes(`id="${id}"`), `+ New has #${id}`);
    });
}

{
    assert(html.includes('id="classNotesDaySummaryBtn"'), 'Notes has Day summary button');
    const data = block('panel-data');
    assert(data.includes('print-data-section--danger'), 'Data has Danger zone');
    assert(data.includes('print-data-section--import-export'), 'Data has Import & export');
    assert(!data.includes('print-data-section--nav-layout'), 'Data nav layout section removed');
    assert(data.includes('id="teamBackupBtn"') && data.includes('id="teamDeleteCalendarBtn"'), 'backup + remove moved to Data');
    assert(html.includes('id="printCenterModal"') && html.includes('id="printCenterList"'), 'Print Center modal present');
}

{
    const tabs = Array.from(html.matchAll(/class="app-zone-segment-btn[^"]*"[^>]*data-tab="([^"]+)"/g))
        .map((m) => m[1])
        .sort();
    const expected = [
        'attendance',
        'briefing',
        'calendar',
        'classes',
        'cohorts',
        'command-center',
        'curriculum',
        'debate-books',
        'debate-scores',
        'debate-teams',
        'essays',
        'events',
        'homework',
        'homework-tracking',
        'ledger',
        'notes',
        'points',
        'portfolio',
        'soundboard',
        'speaking-test',
        'students',
        'syllabus',
        'teachers',
        'tests',
        'timetable'
    ];
    assert(JSON.stringify(tabs) === JSON.stringify(expected), `zone/segment data-tab set unchanged (got ${tabs.join(',')})`);
    const zones = Array.from(html.matchAll(/class="app-zone-btn[^"]*"[^>]*data-zone="([^"]+)"/g)).map((m) => m[1]);
    assert(zones.join(',') === 'schedule,classes,classroom,tools,more', `zone ids unchanged (got ${zones.join(',')})`);
    assert(html.includes('id="panel-data"') && html.includes('data-tab="data"'), 'Data panel id unchanged');
}

{
    const eventName = 'ccp:essayNewCustomAssignment';
    assert(app.includes(`const ESSAY_NEW_CUSTOM_ASSIGNMENT_EVENT = '${eventName}'`), '+ New dispatches the essay event');
    assert(/new CustomEvent\(ESSAY_NEW_CUSTOM_ASSIGNMENT_EVENT/.test(app), '+ New uses the shared constant');
    assert(zoneContext.includes(`'${eventName}'`), 'zone context emits the same event');
    assert(essays.includes(`'${eventName}'`), 'classroom-essays listens for the same event');
    assert(/await navigateToZone\(APP_ZONE_TOOLS, 'essays'\)/.test(app), 'essay item awaits Tools → Essays first');
}

{
    // Header scaling A+B+C: lock pill never stacks; primary row height-capped; short scope labels.
    assert(
        /\.team-lock-sync-bar\.team-lock-sync-bar--inline[\s\S]{0,220}?flex-wrap:\s*nowrap/.test(styles),
        'lock pill forces nowrap'
    );
    assert(
        /\.team-lock-sync-bar\.team-lock-sync-bar--inline\s+\.team-lock-control[\s\S]{0,120}?flex-wrap:\s*nowrap/.test(
            styles
        ) ||
            /\.team-lock-sync-bar\.team-lock-sync-bar--inline,\s*\n\.team-lock-sync-bar\.team-lock-sync-bar--inline\s+\.team-lock-control[\s\S]{0,80}?flex-wrap:\s*nowrap/.test(
                styles
            ),
        'lock control forces nowrap'
    );
    assert(
        /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.app-top-bar-row--primary\s*\{[\s\S]*?max-height:\s*calc\(var\(--touch-min\)/.test(
            styles
        ),
        'primary row has a one-control-row height cap at ≤1024'
    );
    assert(
        /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.app-top-bar-row--primary\s*\{[\s\S]*?overflow-x:\s*auto/.test(
            styles
        ),
        'primary row scrolls sideways instead of growing taller'
    );
    assert(html.includes('header-class-scope__short') && html.includes('header-class-scope__full'), 'scope switch has short + full labels');
    assert(html.includes('header-pinned-icon') && html.includes('header-pinned-label'), 'pinned tools have icon + label spans');
    assert(en.includes("classScopeAllShort: 'All'") && en.includes("classScopeMineShort: 'Mine'"), 'EN short scope labels');
    assert(ko.includes("classScopeAllShort: '전체'") && ko.includes("classScopeMineShort: '내 수업'"), 'KO short scope labels');
}

console.log('header-hierarchy.test.mjs: all passed');
