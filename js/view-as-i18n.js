/**
 * View As banner strings — English & Korean (shared across planner, admin, pending, notes).
 */
(function (global) {
    const VIEW_AS_STRINGS = {
        en: {
            viewAsBannerPrimary: 'Viewing as: {name}',
            viewAsBannerSecondary: 'Super Admin: {actor} · Changes are not saved',
            viewAsExitBtn: 'Exit View As',
            viewAsEnded: 'View As ended. You can close this tab.',
            viewAsActivationFailed: 'View As activation failed',
            viewAsExitFailed: 'Could not exit View As',
            viewAsLinkExpired: 'View As link expired. Close this tab and try again from Admin.',
            viewAsDocTitle: 'View as: {name}',
            viewAsUserFallback: 'User',
            viewAsSuperAdminFallback: 'Super Admin'
        },
        ko: {
            viewAsBannerPrimary: '{name}(으)로 보는 중',
            viewAsBannerSecondary: '최고 관리자: {actor} · 변경 사항은 저장되지 않습니다',
            viewAsExitBtn: 'View As 종료',
            viewAsEnded: 'View As가 종료되었습니다. 이 탭을 닫을 수 있습니다.',
            viewAsActivationFailed: 'View As 활성화에 실패했습니다',
            viewAsExitFailed: 'View As를 종료할 수 없습니다',
            viewAsLinkExpired: 'View As 링크가 만료되었습니다. 이 탭을 닫고 관리자에서 다시 시도하세요.',
            viewAsDocTitle: 'View as: {name}',
            viewAsUserFallback: '사용자',
            viewAsSuperAdminFallback: '최고 관리자'
        }
    };

    function getLang() {
        if (global.CCPLanguage && global.CCPLanguage.resolveCalendarLanguage) {
            return global.CCPLanguage.resolveCalendarLanguage();
        }
        try {
            const s = localStorage.getItem('calendarLanguage');
            return s === 'ko' ? 'ko' : 'en';
        } catch (_) {
            return 'en';
        }
    }

    function tViewAs(key, vars) {
        const lang = getLang();
        let str =
            (VIEW_AS_STRINGS[lang] && VIEW_AS_STRINGS[lang][key]) ||
            (VIEW_AS_STRINGS.en && VIEW_AS_STRINGS.en[key]) ||
            key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
            });
        }
        return str;
    }

    function applyViewAsBannerLanguage() {
        if (typeof document === 'undefined') {
            return;
        }
        const exitBtn = document.getElementById('viewAsBannerExitBtn');
        if (exitBtn) {
            exitBtn.textContent = tViewAs('viewAsExitBtn');
        }
    }

    global.CCPViewAsI18n = {
        VIEW_AS_STRINGS,
        getLang,
        tViewAs,
        applyViewAsBannerLanguage
    };
})(typeof window !== 'undefined' ? window : globalThis);
