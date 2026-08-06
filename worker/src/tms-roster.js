/**
 * Cloudflare Worker re-exports for TMS roster + essay scrape.
 */
import * as TmsRosterCore from '../../shared/tms-roster-core.cjs';

export const getConfig = TmsRosterCore.getConfig;
export const credentialsConfigured = TmsRosterCore.credentialsConfigured;
export const login = TmsRosterCore.login;
export const scrapeRosters = TmsRosterCore.scrapeRosters;
export const scrapeEssaySubmissions = TmsRosterCore.scrapeEssaySubmissions;
export const parseWritingListRows = TmsRosterCore.parseWritingListRows;
export const parseWritingStudentLabel = TmsRosterCore.parseWritingStudentLabel;
export const groupWritingRowsIntoAssignments = TmsRosterCore.groupWritingRowsIntoAssignments;
export const probe = TmsRosterCore.probe;
export const parseCohortsFromHtml = TmsRosterCore.parseCohortsFromHtml;
export const parseStudentsFromTextLines = TmsRosterCore.parseStudentsFromTextLines;
export const parseStudentsFromHtml = TmsRosterCore.parseStudentsFromHtml;
export const parseStudentsFromClassPopup = TmsRosterCore.parseStudentsFromClassPopup;
export const parseStudentsFromNumberedBlocks = TmsRosterCore.parseStudentsFromNumberedBlocks;
export const trimRosterPasteTail = TmsRosterCore.trimRosterPasteTail;
export const parseClassSelectList = TmsRosterCore.parseClassSelectList;
export const parseWritingCmbbanOptions = TmsRosterCore.parseWritingCmbbanOptions;
export const cleanTmsCohortDisplayName = TmsRosterCore.cleanTmsCohortDisplayName;
export const inferScheduleFromTmsClassName = TmsRosterCore.inferScheduleFromTmsClassName;
export const unionTmsClassLists = TmsRosterCore.unionTmsClassLists;
export const mergeCohortLists = TmsRosterCore.mergeCohortLists;
export const isLikelyStudentName = TmsRosterCore.isLikelyStudentName;
export const isNoiseClassName = TmsRosterCore.isNoiseClassName;
export const isJunkHeaderCohortName = TmsRosterCore.isJunkHeaderCohortName;
export const CLASS_POPUP_PATH = TmsRosterCore.CLASS_POPUP_PATH;
export const WRITING_LIST_PATH = TmsRosterCore.WRITING_LIST_PATH;
