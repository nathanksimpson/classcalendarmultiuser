/**
 * Cloudflare Worker re-exports for the shared TMS job runner.
 */
import * as TmsJobsCore from '../../shared/tms-jobs.cjs';

export const BRIDGE_PROTOCOL = TmsJobsCore.BRIDGE_PROTOCOL;
export const JOB_KINDS = TmsJobsCore.JOB_KINDS;
export const runTmsJob = TmsJobsCore.runTmsJob;
