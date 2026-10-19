/**
 * Print Center registry + Data → Import & export index.
 * Run: node tests/print-center.test.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadModule() {
    const sandbox = { window: {}, globalThis: {}, setTimeout, clearTimeout, console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(path.join(root, 'js', 'print-center.js'), 'utf8'), sandbox);
    return sandbox;
}

function listFiles(dir, exts) {
    const out = [];
    readdirSync(dir).forEach((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            out.push(...listFiles(full, exts));
        } else if (exts.some((ext) => name.endsWith(ext))) {
            out.push(full);
        }
    });
    return out;
}

const indexHtml = readFileSync(path.join(root, 'index.html'), 'utf8');
const en = readFileSync(path.join(root, 'js', 'i18n', 'calendar-en.js'), 'utf8');
const ko = readFileSync(path.join(root, 'js', 'i18n', 'calendar-ko.js'), 'utf8');
const sourceBlob = [indexHtml, readFileSync(path.join(root, 'app.js'), 'utf8')]
    .concat(
        listFiles(path.join(root, 'js'), ['.js'])
            .filter((f) => !f.endsWith(`${path.sep}print-center.js`) && !f.includes(`${path.sep}i18n${path.sep}`))
            .map((f) => readFileSync(f, 'utf8'))
    )
    .concat(listFiles(path.join(root, 'templates'), ['.html']).map((f) => readFileSync(f, 'utf8')))
    .join('\n');
const printCenterSource = readFileSync(path.join(root, 'js', 'print-center.js'), 'utf8');

function hasI18nKey(source, key) {
    return new RegExp(`\\n\\s+${key}:\\s`).test(source);
}

function targetExists(target) {
    if (!target) {
        return false;
    }
    if (target.startsWith('#')) {
        const [idPart, ...rest] = target.split(' ');
        const id = idPart.slice(1);
        if (!sourceBlob.includes(`id="${id}"`)) {
            return false;
        }
        const attr = rest.join(' ').match(/\[data-report-action="([^"]+)"\]/);
        return !attr || sourceBlob.includes(`data-report-action="${attr[1]}"`);
    }
    return sourceBlob.includes(`id="${target}"`) || new RegExp(`id=\\\\?["']${target}\\\\?["']|\\.id = ['"]${target}['"]`).test(sourceBlob);
}

const dataTabs = new Set(Array.from(indexHtml.matchAll(/data-tab="([^"]+)"/g)).map((m) => m[1]));

{
    const sandbox = loadModule();
    const pc = sandbox.CCPPrintCenter;
    const ids = pc.list('').map((e) => e.id);
    assert(ids.length === 20, `20 default entries (got ${ids.length})`);
    assert(new Set(ids).size === ids.length, 'entry ids are unique');

    pc.list('').forEach((entry) => {
        assert(hasI18nKey(en, entry.labelKey), `EN label for ${entry.id}: ${entry.labelKey}`);
        assert(hasI18nKey(ko, entry.labelKey), `KO label for ${entry.id}: ${entry.labelKey}`);
        assert(hasI18nKey(en, entry.unavailableKey), `EN unavailable key for ${entry.id}`);
        assert(hasI18nKey(ko, entry.unavailableKey), `KO unavailable key for ${entry.id}`);
        entry.tabs.forEach((tab) => {
            assert(dataTabs.has(tab), `tab "${tab}" for ${entry.id} is a real data-tab`);
        });
        if (entry.via) {
            assert(targetExists(entry.via.target), `openVia target exists for ${entry.id}: ${entry.via.target}`);
        }
    });

    ['classroomDebateScoresPrintBtn', 'classroomDebateScoresWordBtn', 'classroomDebateScoresPdfBtn'].forEach((id) => {
        assert(targetExists(id), `${id} exists`);
    });
}

{
    const sandbox = loadModule();
    const pc = sandbox.CCPPrintCenter;
    const ordered = pc.list('essays');
    const firstNonEssay = ordered.findIndex((e) => !e.tabs.includes('essays'));
    assert(firstNonEssay > 0, 'essays entries listed first on the essays tab');
    assert(
        ordered.slice(0, firstNonEssay).every((e) => e.tabs.includes('essays')),
        'active-tab entries come before the rest'
    );
    const sections = pc.buildSections('essays');
    assert(sections[0].id === 'thisTab', '"For this tab" section first');
}

{
    const sandbox = loadModule();
    const pc = sandbox.CCPPrintCenter;
    const before = pc.list('').length;
    pc.register({ id: 'timetable', group: 'schedule', labelKey: 'timetablePrint', tabs: ['timetable'], run() {} });
    assert(pc.list('').length === before, 'register with an existing id replaces it');
    pc.register({
        id: 'x-unavailable',
        group: 'tools',
        labelKey: 'printBtn',
        available: () => false,
        run() {}
    });
    const row = pc.list('').find((e) => e.id === 'x-unavailable');
    assert(row && row.isAvailable === false, 'unavailable entries stay listed, flagged disabled');
    pc.init({ getActiveClassId: () => '' });
    const essay = pc.list('').find((e) => e.id === 'essays-class-summary');
    assert(essay && essay.isAvailable === false, 'class-scoped entries disabled without a class');
    pc.init({ getActiveClassId: () => 'c1' });
    assert(pc.list('').find((e) => e.id === 'essays-class-summary').isAvailable, 'enabled with a class');
    assert(pc.unregister('x-unavailable'), 'unregister removes entry');
}

{
    ['classroomDebateAssignmentSelect', 'classroomDebateScoresAssignmentSelect', 'classroomDebateScoresAssignmentWrap', 'classroomDebateAssignmentWrap'].forEach(
        (id) => {
            assert(!printCenterSource.includes(id), `print-center.js does not reference removed ${id}`);
        }
    );
}

{
    const sandbox = loadModule();
    const dt = sandbox.CCPDataTransfer;
    const rows = dt.rows();
    assert(rows.filter((r) => r.direction === 'import').length === 14, '13 imports + TMS sync');
    assert(rows.filter((r) => r.direction === 'export').length === 17, '17 exports');
    rows.forEach((row) => {
        assert(row.mode === 'run' || row.mode === 'jump', `${row.code} has a mode`);
        assert(hasI18nKey(en, row.labelKey), `EN label for ${row.code}`);
        assert(hasI18nKey(ko, row.labelKey), `KO label for ${row.code}`);
        assert(targetExists(row.targetId), `${row.code} target ${row.targetId} exists`);
        if (row.mode === 'jump') {
            assert(row.zone && row.segment, `${row.code} jump rows have a zone + segment`);
        }
    });
    const runSet = rows
        .filter((r) => r.mode === 'run')
        .map((r) => r.code)
        .sort();
    const expected = ['E1', 'E2', 'E3', 'E4', 'E5', 'I1', 'I13', 'I2', 'tms-sync'].sort();
    assert(JSON.stringify(runSet) === JSON.stringify(expected), `Run set is ${expected.join(',')} (got ${runSet.join(',')})`);
    assert(dt.HIGHLIGHT_CLASS === 'data-io-highlight', 'highlight class');
}

console.log('print-center.test.mjs: all passed');
