/**
 * TMS roster scrape — re-exports shared core (fetch-based; Node + Worker).
 * @see shared/tms-roster-core.cjs
 */
'use strict';

const tmsRoster = require('../shared/tms-roster-core.cjs');
const { enableTmsTlsTrust } = require('./tms-tls');

enableTmsTlsTrust(tmsRoster);

module.exports = tmsRoster;
