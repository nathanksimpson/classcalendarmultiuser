/**
 * Shared modal open/close, focus trap, and registry.
 * window.CCPModal
 */
(function (global) {
    const entries = new Map();
    const boundModals = new Set();

    function getModalFocusables(modal) {
        if (!modal) {
            return [];
        }
        return Array.from(
            modal.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => el.offsetParent !== null || modal.contains(el));
    }

    function bindA11y(modal, onClose) {
        if (!modal || boundModals.has(modal)) {
            return;
        }
        boundModals.add(modal);
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && typeof onClose === 'function') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key === 'Tab') {
                const focusables = getModalFocusables(modal);
                if (focusables.length < 2) {
                    return;
                }
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }

    function bindBackdropClose(modal, onClose) {
        if (!modal || modal.dataset.ccpBackdropBound === '1') {
            return;
        }
        modal.dataset.ccpBackdropBound = '1';
        let pressStartedOnBackdrop = false;
        modal.addEventListener('pointerdown', (e) => {
            pressStartedOnBackdrop = e.target === modal;
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal && pressStartedOnBackdrop && typeof onClose === 'function') {
                onClose();
            }
            pressStartedOnBackdrop = false;
        });
    }

    function open(modal, triggerEl) {
        if (!modal) {
            return;
        }
        const trigger = triggerEl || document.activeElement;
        if (trigger && trigger instanceof HTMLElement) {
            modal._ccpTrigger = trigger;
        }
        modal.removeAttribute('hidden');
        modal.style.removeProperty('display');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (!modal.getAttribute('role')) {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
        }
        const focusables = getModalFocusables(modal);
        const initialFocus =
            focusables.find((el) => el && !el.classList.contains('modal-close')) || focusables[0];
        if (initialFocus && typeof initialFocus.focus === 'function') {
            window.setTimeout(() => {
                if (modal.classList.contains('active')) {
                    initialFocus.focus();
                }
            }, 50);
        }
    }

    function close(modal) {
        if (!modal) {
            return;
        }
        const trigger = modal._ccpTrigger;
        modal.classList.remove('active');
        modal.style.removeProperty('display');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('hidden', '');
        if (trigger && typeof trigger.focus === 'function') {
            try {
                trigger.focus();
            } catch (_) {
                /* ignore */
            }
        }
        delete modal._ccpTrigger;
    }

    function register(id, options) {
        const opts = options || {};
        const el = typeof id === 'string' ? document.getElementById(id) : id;
        if (!el) {
            return;
        }
        const key = el.id || id;
        entries.set(key, { el, onClose: opts.onClose || null });
        if (opts.backdropClose !== false) {
            bindBackdropClose(el, opts.onClose || (() => close(el)));
        }
        if (opts.a11y !== false && opts.onClose) {
            bindA11y(el, opts.onClose);
        }
    }

    function openById(id, triggerEl) {
        const entry = entries.get(id);
        if (!entry || !entry.el) {
            const el = document.getElementById(id);
            if (el) {
                open(el, triggerEl);
            }
            return;
        }
        open(entry.el, triggerEl);
    }

    function closeById(id) {
        const entry = entries.get(id);
        if (!entry) {
            return;
        }
        if (typeof entry.onClose === 'function') {
            entry.onClose();
        } else {
            close(entry.el);
        }
    }

    global.CCPModal = {
        register,
        open,
        close,
        openById,
        closeById,
        bindA11y,
        bindBackdropClose,
        getModalFocusables
    };
})(typeof window !== 'undefined' ? window : globalThis);
