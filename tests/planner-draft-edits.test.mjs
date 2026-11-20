/**
 * Planner edits stay in the plan until Apply to calendar. Run: node tests/planner-draft-edits.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'planner', 'teacher-planner-core.js')).href);
const P = globalThis.CCPTeacherPlanner;

function cal() {
    const d = {
        classes: [
            { id: 'k1', name: 'Blue M · Grammar', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 2, roomId: 'r1' },
            { id: 'k2', name: 'Blue M · News', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 1 }
        ],
        cohorts: [{ id: 'co1', name: 'Blue M', classIds: ['k1', 'k2'] }, { id: 'co2', name: 'Navy M', classIds: [] }],
        rooms: [{ id: 'r1', name: '301' }, { id: 'r2', name: '302' }],
        teacherProfiles: [],
        plannerDrafts: [{ id: 'dr1', assignments: [] }],
        plannerState: { activeDraftId: 'dr1' }
    };
    P.ensurePlannerFields(d);
    d.plannerDrafts = [{ id: 'dr1', assignments: [] }];
    d.plannerState.activeDraftId = 'dr1';
    return d;
}

{
    const d = cal();
    const before = JSON.stringify(d.classes);
    P.editClassInDraft(d, 'k1', (c) => { c.name = 'Blue M · Grammar+'; c.cohortIds = ['co1', 'co2']; c.weeklyFrequency = 3; });
    P.removeClassInDraft(d, 'k2');
    P.addClassToDraft(d, { id: 'k3', name: 'Special', cohortIds: ['co2'], cohortId: 'co2', plannerSpecial: true });
    P.removeRoomInDraft(d, 'r1');
    // Calendar untouched; the plan sees the changes.
    assert.equal(JSON.stringify(d.classes), before);
    assert.equal(d.rooms.length, 2);
    const seen = P.allClasses(d);
    assert.deepEqual(seen.map((c) => c.id), ['k1', 'k3']);
    assert.equal(seen[0].name, 'Blue M · Grammar+');
    assert.deepEqual(P.plannerRooms(d).map((r) => r.id), ['r2']);
    const pend = P.pendingDraftChanges(d);
    assert.equal(pend.classEdits, 1);
    assert.equal(pend.removedClasses, 1);
    assert.equal(pend.newClasses, 1);
    assert.equal(pend.removedRooms, 1);
    // Apply writes them.
    P.applyDraftClassChanges(d);
    const k1 = d.classes.find((c) => c.id === 'k1');
    assert.equal(k1.name, 'Blue M · Grammar+');
    assert.equal(k1.weeklyFrequency, 3);
    assert.equal(k1.roomId, '');
    assert.ok(!d.classes.some((c) => c.id === 'k2'));
    assert.deepEqual(d.cohorts[0].classIds, ['k1']);
    assert.deepEqual(d.cohorts[1].classIds, ['k1']);
    assert.deepEqual(d.rooms.map((r) => r.id), ['r2']);
    assert.equal(P.pendingDraftChanges(d).total - P.pendingDraftChanges(d).newClasses, 0);
}

// Editing back to the calendar's value leaves no pending change; deleting a field is kept as a deletion.
{
    const d = cal();
    P.editClassInDraft(d, 'k1', (c) => { c.weeklyFrequency = 5; });
    P.editClassInDraft(d, 'k1', (c) => { c.weeklyFrequency = 2; });
    assert.equal(P.pendingDraftChanges(d).classEdits, 0);
    P.editClassInDraft(d, 'k1', (c) => { delete c.roomId; });
    assert.equal(P.allClasses(d)[0].roomId, undefined);
    assert.equal(d.classes[0].roomId, 'r1');
}

console.log('planner-draft-edits.test.mjs: all passed');
