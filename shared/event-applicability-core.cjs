'use strict';

/**
 * Event applicability: additive (AND) across categories.
 * A class is excluded when it fails any active category filter or is in excludedClassIds.
 * Within a category, empty selection means no constraint on that dimension (legacy-friendly).
 * Partial selection whitelists only matching classes for that dimension.
 */

function targetFilterAppliesToClassCore(target, classData, ctx) {
    if (!target || !classData) {
        return false;
    }

    const classId = String(classData.id || '').trim();
    const excludedClassIds = Array.isArray(target.excludedClassIds) ? target.excludedClassIds : [];
    if (classId && excludedClassIds.includes(classId)) {
        return false;
    }

    const classIds = Array.isArray(target.classIds) ? target.classIds : [];
    const hasClassIds = classIds.length > 0;
    const hasClassNames = Array.isArray(target.classNames) && target.classNames.length > 0;
    const grades = Array.isArray(target.grades) ? target.grades : [];
    const sections = Array.isArray(target.sectionLevels) ? target.sectionLevels : [];
    const allElementary = target.allElementary === true;
    const allMiddleSchool = target.allMiddleSchool === true;

    const hasBroadFilters = grades.length > 0
        || sections.length > 0
        || allElementary
        || allMiddleSchool
        || excludedClassIds.length > 0;

    if ((hasClassIds || hasClassNames) && !hasBroadFilters) {
        if (hasClassIds && classId && classIds.includes(classId)) {
            return true;
        }
        if (!hasClassIds && hasClassNames && target.classNames.includes(classData.name)) {
            return true;
        }
        return false;
    }

    if (allElementary !== allMiddleSchool) {
        const grade = String(classData.grade || '').trim();
        const matchesBand = (allElementary && ctx.isElementaryGrade(grade))
            || (allMiddleSchool && ctx.isMiddleSchoolGrade(grade));
        if (!matchesBand) {
            return false;
        }
    }

    const gradeTotal = ctx.gradeTotal || 0;
    if (grades.length > 0 && gradeTotal > 0 && grades.length < gradeTotal) {
        if (!grades.includes(String(classData.grade || '').trim())) {
            return false;
        }
    }

    const sectionTotal = ctx.sectionTotal || 0;
    if (sections.length > 0 && sectionTotal > 0 && sections.length < sectionTotal) {
        const sec = ctx.getClassSectionPreset(classData);
        if (!sec || !sections.includes(sec)) {
            return false;
        }
    }

    return true;
}

function holidayHasAnyTargetFilterCore(target) {
    if (!target) {
        return false;
    }
    return (Array.isArray(target.grades) && target.grades.length > 0)
        || (Array.isArray(target.classIds) && target.classIds.length > 0)
        || (Array.isArray(target.classNames) && target.classNames.length > 0)
        || (Array.isArray(target.sectionLevels) && target.sectionLevels.length > 0)
        || (Array.isArray(target.excludedClassIds) && target.excludedClassIds.length > 0)
        || target.allElementary === true
        || target.allMiddleSchool === true;
}

module.exports = {
    targetFilterAppliesToClassCore,
    holidayHasAnyTargetFilterCore
};
