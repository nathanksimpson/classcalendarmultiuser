/**
 * TMS roster scrape for Cloudflare Worker — shared core via fetch.
 */
import * as TmsRosterCore from '../../shared/tms-roster-core.cjs';

export const getConfig = TmsRosterCore.getConfig;
export const credentialsConfigured = TmsRosterCore.credentialsConfigured;
export const login = TmsRosterCore.login;
export const scrapeRosters = TmsRosterCore.scrapeRosters;
export const probe = TmsRosterCore.probe;
export const parseCohortsFromHtml = TmsRosterCore.parseCohortsFromHtml;
export const parseStudentsFromTextLines = TmsRosterCore.parseStudentsFromTextLines;
export const parseStudentsFromHtml = TmsRosterCore.parseStudentsFromHtml;
export const parseStudentsFromClassPopup = TmsRosterCore.parseStudentsFromClassPopup;
export const parseStudentsFromNumberedBlocks = TmsRosterCore.parseStudentsFromNumberedBlocks;
export const trimRosterPasteTail = TmsRosterCore.trimRosterPasteTail;
export const parseClassSelectList = TmsRosterCore.parseClassSelectList;
export const mergeCohortLists = TmsRosterCore.mergeCohortLists;
export const isLikelyStudentName = TmsRosterCore.isLikelyStudentName;
export const isNoiseClassName = TmsRosterCore.isNoiseClassName;
export const isJunkHeaderCohortName = TmsRosterCore.isJunkHeaderCohortName;
export const CLASS_POPUP_PATH = TmsRosterCore.CLASS_POPUP_PATH;
