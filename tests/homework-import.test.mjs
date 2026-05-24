import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadHomeworkImport() {
    const code = readFileSync(path.join(root, 'js', 'homework-import.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPHomeworkImport;
}

const HI = loadHomeworkImport();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

// Debate parser
{
    const text = `Day 1
Covered in class: intro
Homework: read ch1

Day 2
HW: write summary`;
    const blocks = HI.parseDebateHomework(text);
    assert(blocks.length === 2, 'two debate blocks');
    assert(blocks[0].marker === 'day1', 'day1 marker');
    assert(blocks[0].body.includes('Covered in class'), 'day1 body');
}

// Unit pair parser
{
    const text = `Unit 1 Part 1
Pages 10-12

Unit 1 Part 2
Pages 13-15`;
    const blocks = HI.parseUnitPairHomework(text);
    assert(blocks.length === 2, 'two unit parts');
    assert(HI.sessionFromUnitPart('Unit 2 Part 1') === 3, 'session 3 for U2P1');
}

// Map to syllabus rows
{
    const rows = [
        { id: 'r1', kind: 'lesson', sessionNumber: 1, planTitle: 'Unit 1 [1/2] – Speaking', planDetail: '' },
        { id: 'r2', kind: 'lesson', sessionNumber: 2, planTitle: 'Unit 1 [2/2] – Writing', planDetail: '' }
    ];
    const blocks = [{ title: 'Unit 1 Part 1', body: 'HW A' }, { title: 'Unit 1 Part 2', body: 'HW B' }];
    const { mappings, unmatched } = HI.mapBlocksToSyllabusTargets(blocks, rows, 'unitPair');
    assert(mappings.length === 2, 'both matched');
    assert(unmatched.length === 0, 'none unmatched');
    assert(mappings[0].rowId === 'r1', 'first row');
}

console.log('All homework-import tests passed.');
