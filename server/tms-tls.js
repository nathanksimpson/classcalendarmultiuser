/**
 * Node's Mozilla CA bundle rejects TMS (tms.esimson.com) because the site's
 * HTTPS chain is incomplete. Windows / PowerShell already trust it.
 * Prefer system CAs; fall back to a TMS-only undici agent if needed.
 */
'use strict';

function enableTmsTlsTrust(tmsRoster) {
    try {
        const tls = require('tls');
        if (
            typeof tls.setDefaultCACertificates === 'function' &&
            typeof tls.getCACertificates === 'function'
        ) {
            const systemCerts = tls.getCACertificates('system');
            if (systemCerts && systemCerts.length) {
                tls.setDefaultCACertificates([...tls.getCACertificates(), ...systemCerts]);
                return 'system-ca';
            }
        }
    } catch (_) {
        /* Workers / older Node */
    }
    if (tmsRoster && typeof tmsRoster.setFetchDispatcher === 'function') {
        try {
            const undici = require('undici');
            const Agent = undici && undici.Agent;
            if (Agent) {
                tmsRoster.setFetchDispatcher(
                    new Agent({
                        connect: { rejectUnauthorized: false }
                    })
                );
                return 'insecure-tms-agent';
            }
        } catch (_) {
            /* undici unavailable */
        }
    }
    return '';
}

module.exports = { enableTmsTlsTrust };
