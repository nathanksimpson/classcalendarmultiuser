/**
 * Shared sentinel tokens for lesson / event filters.
 */
(function (global) {
    const SENTINEL = {
        NO_GRADE: '__no_grade__',
        NO_LEVEL: '__no_level__',
        NO_TYPE: '__no_type__',
        NO_BOOK: '__no_book__',
        NO_TEACHER: '__no_teacher__'
    };

    global.CCPAppEnums = {
        SENTINEL
    };
})(typeof window !== 'undefined' ? window : globalThis);
