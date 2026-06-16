import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../shared/classroom-access-core.cjs');

export const prepareClassroomForSave = core.prepareClassroomForSave;
export const userCanBypass = core.userCanBypass;
export const userCanEditCohortRoster = core.userCanEditCohortRoster;
export const isHomeroomForCohort = core.isHomeroomForCohort;
export const isUserAssignedToClassInData = core.isUserAssignedToClassInData;
export const classesForUser = core.classesForUser;
export const assertCanEditClass = core.assertCanEditClass;
export const collectClassIdsFromSessions = core.collectClassIdsFromSessions;
