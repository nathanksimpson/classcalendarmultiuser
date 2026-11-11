/**
 * Tools toolbars: grouped into TMS ▾ / Actions ▾ menus, existing button ids kept
 * (other modules and the Print Center click them by id), Sound board gone.
 * Run: node tests/tools-toolbar.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function panel(id) {
    const start = html.indexOf(`<section id="panel-${id}"`);
    assert(start >= 0, `panel-${id} exists`);
    return html.slice(start, html.indexOf('</section>', start));
}

function menuItems(section, labelKey) {
    const menus = section.split('<details class="toolbar-menu').slice(1);
    const menu = menus.find((m) => m.includes(`data-i18n="${labelKey}"`));
    return menu ? menu.slice(0, menu.indexOf('</details>')) : '';
}

// Essays
{
    const s = panel('essays');
    const tms = menuItems(s, 'toolsMenuTms');
    assert(tms.includes('id="classroomEssaysTmsSyncBtn"') && tms.includes('id="classroomEssaysTmsSyncAllBtn"'), 'Essays TMS menu has both syncs');
    const actions = menuItems(s, 'toolsMenuActions');
    ['classroomEssaysOpenSavedEditorBtn', 'classroomEssaysScrapeEditorBtn', 'classroomEssaysNewGroupBtn', 'classroomEssaysEditGroupBtn'].forEach((id) => {
        assert(actions.includes(`id="${id}"`), `Essays Actions menu has ${id}`);
    });
    assert(s.includes('id="classroomEssaysReportsWrap"'), 'Essays keeps Reports');
    assert(s.includes('id="classroomEssaysSaveBtn"') && s.includes('data-i18n="classroomSaveNow"'), 'Essays save button says Save now');
}

// Debate Rec
{
    const s = panel('debate-rec');
    const tms = menuItems(s, 'toolsMenuTms');
    assert(tms.includes('data-rec-check-scope="class"') && tms.includes('data-rec-check-scope="all"'), 'Rec TMS menu has both check scopes');
    assert(s.includes('id="classroomDebateRecCheckScope"'), 'Rec keeps the scope value the check code reads');
    assert(!s.includes('id="classroomDebateRecCheckBtn"'), 'old loose Check button removed');
}

// Teams / Scores / Speaking Test
assert(menuItems(panel('debate-teams'), 'toolsMenuActions').includes('id="classroomDebateRefreshRosterBtn"'), 'Teams Actions has Refresh roster');
{
    const actions = menuItems(panel('debate-scores'), 'toolsMenuActions');
    ['classroomDebateScoresPrintBtn', 'classroomDebateScoresPdfBtn', 'classroomDebateScoresWordBtn'].forEach((id) => {
        assert(actions.includes(`id="${id}"`), `Scores Actions has ${id}`);
    });
}
{
    const actions = menuItems(panel('speaking-test'), 'toolsMenuActions');
    assert(actions.includes('id="speakingTestPrintBlankBtn"') && actions.includes('id="speakingTestPrintAllBtn"'), 'Speaking Test Actions has both prints');
}

// Menus must not use the header-dropdown class: that would exempt their buttons from
// the read-only calendar lock (shouldAllowTeamViewOnlyInteraction).
assert(!/<details class="toolbar-menu[^"]*header-dropdown/.test(html), 'toolbar menus stay inside the read-only lock');

// Segment row
const tools = html.slice(html.indexOf('id="zoneSegments-tools"'), html.indexOf('</div>', html.indexOf('id="zoneSegments-tools"')));
const order = Array.from(tools.matchAll(/data-segment="([^"]+)"/g)).map((m) => m[1]);
assert(order.join(',') === 'essays,debate-teams,debate-scores,debate-rec,debate-books,speaking-test', `Tools order (got ${order.join(',')})`);
assert(!html.includes('panel-soundboard'), 'Sound board panel removed');

// Every menu label key exists in both languages
for (const lang of ['en', 'ko']) {
    const i18n = readFileSync(path.join(root, 'js', 'i18n', `calendar-${lang}.js`), 'utf8');
    ['toolsMenuTms', 'toolsMenuActions', 'debateRecCheckThisClass', 'debateRecCheckAllClasses', 'toolsMonthLabel', 'classroomClassViewOnly'].forEach((key) => {
        assert(i18n.includes(`${key}:`), `${lang} has ${key}`);
    });
}

console.log('tools-toolbar.test.mjs: all passed');
