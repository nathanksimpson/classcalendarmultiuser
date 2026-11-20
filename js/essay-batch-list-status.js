/**
 * One status on a batch-editor card: the Essays list status.
 * Filters, counts, and sort read listStatus. They do not read the old
 * Done / Resubmit checkboxes (isDone / isResubmit).
 */
(function (global) {
    'use strict';

    const COMPLETE = 'complete';
    const RESUBMIT = 'resubmit_required';
    const DEMERIT = 'demerit';

    function statusOf(result) {
        if (!result || result.listStatus == null) {
            return '';
        }
        return String(result.listStatus);
    }

    function isComplete(result) {
        return statusOf(result) === COMPLETE;
    }

    function isResubmit(result) {
        return statusOf(result) === RESUBMIT;
    }

    function isDemerit(result) {
        return statusOf(result) === DEMERIT;
    }

    /** A final Essays mark: Complete, Resubmit, or Demerit. Received is still open. */
    function isSettled(result) {
        const status = statusOf(result);
        return status === COMPLETE || status === RESUBMIT || status === DEMERIT;
    }

    /**
     * Old cards stored a Done / Resubmit checkbox beside the list.
     * If the list status was never saved on the card, use that checkbox once.
     */
    function statusFromLegacyChecklist(result) {
        const current = statusOf(result);
        if (current) {
            return current;
        }
        if (result && result.isResubmit) {
            return RESUBMIT;
        }
        if (result && result.isDone) {
            return COMPLETE;
        }
        return '';
    }

    function matchesFilter(result, filter) {
        const status = filter || 'all';
        if (status === 'all') {
            return true;
        }
        if (status === 'open') {
            return !(isSettled(result) || (result && result.isFailed));
        }
        if (status === 'complete' || status === 'done') {
            return isComplete(result);
        }
        if (status === 'resubmit') {
            return isResubmit(result);
        }
        if (status === 'failed') {
            return Boolean(result && result.isFailed);
        }
        return true;
    }

    global.CCPEssayBatchListStatus = {
        statusOf,
        isComplete,
        isResubmit,
        isDemerit,
        isSettled,
        statusFromLegacyChecklist,
        matchesFilter
    };
})(typeof window !== 'undefined' ? window : globalThis);
