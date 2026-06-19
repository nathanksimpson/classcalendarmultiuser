/**
 * Run: node tests/classroom-point-reasons.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-point-reasons.js')).href);

const r = globalThis.CCPClassroomPointReasons;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const t = (key) => {
    const map = {
        classroomPointReasonHomework: 'Homework (+/-)',
        classroomPointReasonAttitude: 'Classroom attitude (+/-)',
        classroomPointReasonUnprepared: 'Unprepared for class (-)',
        classroomPointReasonTshirt: 'Simson Tshirt (+)',
        classroomPointReasonTestResult: 'Good/Bad test result (+/-)',
        classroomPointReasonOther: 'Other…'
    };
    return map[key] || key;
};

const presets = r.getPointReasonPresets(t);
assert(presets.length === 6, 'six presets including Other');
assert(presets[0].id === 'homework', 'first preset homework');

assert(
    r.resolvePointReason({ presetId: 'homework', translate: t }) === 'Homework (+/-)',
    'resolve homework label'
);
assert(
    r.resolvePointReason({ presetId: 'other', customText: '  Late again  ' }) === 'Late again',
    'resolve other trims custom text'
);
assert(r.resolvePointReason({ presetId: 'other', customText: '' }) === '', 'empty other');
assert(r.isOtherReasonPreset('other'), 'other detected');
assert(!r.isOtherReasonPreset('homework'), 'homework not other');
assert(r.normalizePresetId('bogus') === 'homework', 'invalid falls back to default');

console.log('classroom-point-reasons.test.mjs: all passed');
