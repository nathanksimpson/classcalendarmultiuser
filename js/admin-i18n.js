/**
 * Admin page strings — English & Korean (uses calendarLanguage from main app).
 */
(function (global) {
    const ADMIN_STRINGS = {
        en: {
            pageTitle: 'Admin — Class Calendar',
            backToCalendar: '← Back to calendar',
            signIn: 'Sign in',
            signOut: 'Sign out',
            langToggle: '🌐 한국어',
            langToggleTitle: 'Switch to Korean',
            themeDark: '🌙 Dark',
            themeLight: '☀️ Light',
            themeToggleTitle: 'Switch light/dark theme',
            adminHeading: 'Admin',
            adminIntro: 'Manage teachers, groups, and which calendars each person can open.',
            lockSettingsHeading: 'Security & lock settings',
            lockSettingsHint:
                'Control edit-lock expiry and automatic sign-out when a teacher is inactive (no mouse, keyboard, or touch).',
            lockExpiresLabel: 'Lock expires after',
            lockExpiresSuffix: 'minutes of no lock activity',
            idleLogoutLabel: 'Sign out after',
            idleLogoutSuffix: 'minutes idle',
            idleWarningLabel: 'Idle warning',
            idleWarningSuffix: 'minutes before sign-out',
            saveSettings: 'Save settings',
            usersHeading: 'Teachers & admins',
            usersHint1:
                'Add teachers by email. They sign in with Kakao or a password you set. Use Reset password anytime to set a new temp password (they must sign in again).',
            usersHint2:
                'Deactivate blocks sign-in and signs them out. Use Reactivate to restore access. Delete permanently (deactivated accounts only) removes the user from the database and cannot be undone.',
            thName: 'Name',
            thEmail: 'Email',
            thRole: 'Role',
            thStatus: 'Status',
            thActions: 'Actions',
            addTeacherHeading: 'Add teacher',
            displayName: 'Display name',
            email: 'Email',
            role: 'Role',
            roleTeacher: 'Teacher',
            roleAdmin: 'Admin',
            optionalTempPassword: 'Optional temp password',
            addUser: 'Add user',
            groupsHeading: 'Groups',
            groupsHint: 'Put teachers in groups, then assign groups to calendars when creating or editing access.',
            thGroupName: 'Name',
            thMembers: 'Members',
            newGroupHeading: 'New group',
            groupName: 'Group name',
            membersLegend: 'Members',
            createGroup: 'Create group',
            calendarAccessHeading: 'Calendar access',
            calendarAccessHint:
                'Choose a calendar, then pick teachers and groups who may open it. Admins always see every calendar.',
            calendarLabel: 'Calendar',
            teachersDirectLegend: 'Teachers (direct access)',
            groupsLegend: 'Groups',
            saveAccess: 'Save access',
            resetPasswordTitle: 'Reset password',
            closeAria: 'Close',
            resetPasswordNew: 'New password (min 8 characters)',
            resetPasswordConfirm: 'Confirm new password',
            cancel: 'Cancel',
            savePassword: 'Save password',
            bootstrapHeading: 'First-time setup',
            bootstrapHint: 'No admin exists yet. Use the bootstrap secret from your server .env.',
            bootstrapSecret: 'Bootstrap secret',
            bootstrapEmail: 'Your email',
            bootstrapName: 'Your name',
            bootstrapPasswordOptional: 'Password (optional)',
            bootstrapCreate: 'Create admin account',
            statusActive: 'Active',
            statusDeactivated: 'Deactivated',
            deactivate: 'Deactivate',
            deactivateTitle: 'Block sign-in (account is kept; use Reactivate later)',
            onlyAdminDeactivate: 'Cannot deactivate the only admin',
            reactivate: 'Reactivate',
            reactivateTitle: 'Allow sign-in again',
            deletePermanently: 'Delete permanently',
            deletePermanentlyTitle: 'Remove this account from the database (cannot be undone)',
            makeAdmin: 'Make admin',
            makeTeacher: 'Make teacher',
            resetPassword: 'Reset password',
            resetPasswordTitleBtn: 'Set a new password; signs them out everywhere',
            clearPassword: 'Clear password',
            clearPasswordTitle: 'Remove password login (Kakao only if linked)',
            editMembers: 'Edit members',
            deleteGroup: 'Delete',
            saveMembers: 'Save members',
            editGroupPrefix: 'Edit:',
            saving: 'Saving…',
            signedInAs: 'Signed in as {name}',
            mustBeAdmin: 'You must sign in as an admin.',
            signInFirst: 'Sign in first, then return here.',
            adminCreated: 'Admin created — you are signed in. Refreshing…',
            noticedNewUser: 'Saved: new user added.',
            noticedGroupCreated: 'Saved: group created.',
            passwordTooShort: 'Password must be at least 8 characters.',
            passwordMismatch: 'Passwords do not match.',
            resetPasswordFor: 'Set a new password for {name}.',
            confirmClearPassword:
                'Clear password for {label}?\n\nThey can only sign in with Kakao (if linked). Any password sessions will end.',
            savedPasswordCleared: 'Saved: password cleared for {label}.',
            savedPasswordUpdated: 'Saved: password updated. They must sign in again with the new password.',
            confirmPermanentDelete:
                'Permanently delete {label}?\n\nThis removes their account from the database. This cannot be undone.',
            permanentlyDeleted: 'Permanently deleted {label}.',
            confirmDeactivate:
                'Deactivate {label}?\n\nThey will not be able to sign in until you Reactivate them. You can permanently delete the account later (deactivated users only).',
            savedDeactivated: 'Saved: deactivated {label}.',
            confirmMakeAdmin: 'Make {name} an admin?',
            savedNowAdmin: 'Saved: {name} is now an admin.',
            confirmDemote: 'Demote {name} to teacher?',
            savedNowTeacher: 'Saved: {name} is now a teacher.',
            savedReactivated: 'Saved: reactivated {label}.',
            confirmDeleteGroup: 'Delete group "{name}"? Calendars will lose this group assignment.',
            savedGroupDeleted: 'Saved: deleted group "{name}".',
            savedGroupMembers: 'Saved: updated members for group "{name}".',
            savedCalendarAccess: 'Saved: calendar access for "{name}".',
            savedLockSettings:
                'Saved: lock {lock} min, idle sign-out {idle} min (warning {warn} min before).',
            couldNotSaveSettings: 'Could not save settings.',
            bootstrapNameDefault: 'Lead teacher'
        },
        ko: {
            pageTitle: '관리 — Class Calendar',
            backToCalendar: '← 캘린더로',
            signIn: '로그인',
            signOut: '로그아웃',
            langToggle: '🌐 English',
            langToggleTitle: 'Switch to English',
            themeDark: '🌙 다크',
            themeLight: '☀️ 라이트',
            themeToggleTitle: '밝기/어두기 테마 전환',
            adminHeading: '관리',
            adminIntro: '선생님, 그룹, 캘린더 접근 권한을 관리합니다.',
            lockSettingsHeading: '보안 및 잠금 설정',
            lockSettingsHint:
                '편집 잠금 만료 시간과 선생님이 비활성(마우스·키보드·터치 없음)일 때 자동 로그아웃을 설정합니다.',
            lockExpiresLabel: '잠금 만료',
            lockExpiresSuffix: '분 동안 잠금 활동 없음',
            idleLogoutLabel: '로그아웃',
            idleLogoutSuffix: '분 유휴 후',
            idleWarningLabel: '유휴 경고',
            idleWarningSuffix: '분 전 (로그아웃 전)',
            saveSettings: '설정 저장',
            usersHeading: '선생님 및 관리자',
            usersHint1:
                '이메일로 선생님을 추가하세요. 카카오 또는 설정한 비밀번호로 로그인합니다. Reset password로 임시 비밀번호를 언제든 재설정할 수 있습니다(다시 로그인 필요).',
            usersHint2:
                'Deactivate는 로그인을 차단하고 로그아웃시킵니다. Reactivate로 복구. Delete permanently는 비활성 계정만 DB에서 삭제하며 되돌릴 수 없습니다.',
            thName: '이름',
            thEmail: '이메일',
            thRole: '역할',
            thStatus: '상태',
            thActions: '작업',
            addTeacherHeading: '선생님 추가',
            displayName: '표시 이름',
            email: '이메일',
            role: '역할',
            roleTeacher: 'Teacher',
            roleAdmin: 'Admin',
            optionalTempPassword: '선택: 임시 비밀번호',
            addUser: '사용자 추가',
            groupsHeading: '그룹',
            groupsHint: '선생님을 그룹으로 묶고, 캘린더 만들기·접근 편집 시 그룹을 지정하세요.',
            thGroupName: '이름',
            thMembers: '구성원',
            newGroupHeading: '새 그룹',
            groupName: '그룹 이름',
            membersLegend: '구성원',
            createGroup: '그룹 만들기',
            calendarAccessHeading: '캘린더 접근',
            calendarAccessHint: '캘린더를 고른 뒤 열 수 있는 선생님과 그룹을 선택하세요. 관리자는 모든 캘린더를 볼 수 있습니다.',
            calendarLabel: '캘린더',
            teachersDirectLegend: '선생님 (직접 접근)',
            groupsLegend: '그룹',
            saveAccess: '접근 저장',
            resetPasswordTitle: '비밀번호 재설정',
            closeAria: '닫기',
            resetPasswordNew: '새 비밀번호 (8자 이상)',
            resetPasswordConfirm: '새 비밀번호 확인',
            cancel: '취소',
            savePassword: '비밀번호 저장',
            bootstrapHeading: '최초 설정',
            bootstrapHint: '관리자가 없습니다. 서버 .env의 bootstrap secret을 사용하세요.',
            bootstrapSecret: 'Bootstrap secret',
            bootstrapEmail: '이메일',
            bootstrapName: '이름',
            bootstrapPasswordOptional: '비밀번호 (선택)',
            bootstrapCreate: '관리자 계정 만들기',
            statusActive: '활성',
            statusDeactivated: '비활성',
            deactivate: 'Deactivate',
            deactivateTitle: '로그인 차단 (계정 유지, 나중에 Reactivate)',
            onlyAdminDeactivate: '유일한 관리자는 비활성화할 수 없음',
            reactivate: 'Reactivate',
            reactivateTitle: '다시 로그인 허용',
            deletePermanently: 'Delete permanently',
            deletePermanentlyTitle: 'DB에서 계정 삭제 (되돌릴 수 없음)',
            makeAdmin: '관리자로',
            makeTeacher: '선생님으로',
            resetPassword: 'Reset password',
            resetPasswordTitleBtn: '새 비밀번호 설정; 모든 세션 종료',
            clearPassword: 'Clear password',
            clearPasswordTitle: '비밀번호 로그인 제거 (카카오만 가능)',
            editMembers: '구성원 편집',
            deleteGroup: '삭제',
            saveMembers: '구성원 저장',
            editGroupPrefix: '편집:',
            saving: '저장 중…',
            signedInAs: '{name}(으)로 로그인됨',
            mustBeAdmin: '관리자로 로그인해야 합니다.',
            signInFirst: '먼저 로그인한 뒤 다시 오세요.',
            adminCreated: '관리자 생성됨 — 로그인되었습니다. 새로고침 중…',
            noticedNewUser: '저장됨: 새 사용자 추가.',
            noticedGroupCreated: '저장됨: 그룹 생성.',
            passwordTooShort: '비밀번호는 8자 이상이어야 합니다.',
            passwordMismatch: '비밀번호가 일치하지 않습니다.',
            resetPasswordFor: '{name}의 새 비밀번호를 설정하세요.',
            confirmClearPassword:
                '{label}의 비밀번호를 지울까요?\n\n카카오(연결된 경우)로만 로그인할 수 있습니다. 비밀번호 세션은 종료됩니다.',
            savedPasswordCleared: '저장됨: {label} 비밀번호 삭제.',
            savedPasswordUpdated: '저장됨: 비밀번호 변경. 새 비밀번호로 다시 로그인해야 합니다.',
            confirmPermanentDelete:
                '{label}을(를) 영구 삭제할까요?\n\nDB에서 계정이 제거됩니다. 되돌릴 수 없습니다.',
            permanentlyDeleted: '영구 삭제됨: {label}.',
            confirmDeactivate:
                '{label}을(를) 비활성화할까요?\n\nReactivate 전까지 로그인할 수 없습니다. 나중에 영구 삭제할 수 있습니다(비활성만).',
            savedDeactivated: '저장됨: {label} 비활성화.',
            confirmMakeAdmin: '{name}을(를) 관리자로 지정할까요?',
            savedNowAdmin: '저장됨: {name} 관리자로 변경.',
            confirmDemote: '{name}을(를) teacher로 변경할까요?',
            savedNowTeacher: '저장됨: {name} teacher로 변경.',
            savedReactivated: '저장됨: {label} 재활성화.',
            confirmDeleteGroup: '그룹 "{name}"을(를) 삭제할까요? 캘린더에서 이 그룹 지정이 제거됩니다.',
            savedGroupDeleted: '저장됨: 그룹 "{name}" 삭제.',
            savedGroupMembers: '저장됨: 그룹 "{name}" 구성원 업데이트.',
            savedCalendarAccess: '저장됨: "{name}" 캘린더 접근.',
            savedLockSettings: '저장됨: 잠금 {lock}분, 유휴 로그아웃 {idle}분 (경고 {warn}분 전).',
            couldNotSaveSettings: '설정을 저장할 수 없습니다.',
            bootstrapNameDefault: '책임 선생님'
        }
    };

    let adminLang = 'en';

    function getAdminLang() {
        try {
            const saved = localStorage.getItem('calendarLanguage');
            return saved === 'ko' ? 'ko' : 'en';
        } catch (_) {
            return 'en';
        }
    }

    function t(key, vars) {
        const bag = ADMIN_STRINGS[adminLang] || ADMIN_STRINGS.en;
        let s = bag[key] != null ? bag[key] : ADMIN_STRINGS.en[key] || key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
            });
        }
        return s;
    }

    function applyAdminLanguage() {
        adminLang = getAdminLang();
        document.documentElement.lang = adminLang === 'ko' ? 'ko' : 'en';
        document.title = t('pageTitle');

        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = t(key);
            }
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                el.setAttribute('title', t(key));
            }
        });
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            const key = el.getAttribute('data-i18n-aria');
            if (key) {
                el.setAttribute('aria-label', t(key));
            }
        });

        const roleSelect = document.getElementById('newRole');
        if (roleSelect) {
            const teacherOpt = roleSelect.querySelector('option[value="teacher"]');
            const adminOpt = roleSelect.querySelector('option[value="admin"]');
            if (teacherOpt) {
                teacherOpt.textContent = t('roleTeacher');
            }
            if (adminOpt) {
                adminOpt.textContent = t('roleAdmin');
            }
        }

        const bootstrapName = document.getElementById('bootstrapName');
        if (bootstrapName && !bootstrapName.dataset.userEdited) {
            bootstrapName.placeholder = t('bootstrapNameDefault');
            if (bootstrapName.value === 'Lead teacher' || bootstrapName.value === '책임 선생님') {
                bootstrapName.value = t('bootstrapNameDefault');
            }
        }

        const langBtn = document.getElementById('adminLangToggle');
        if (langBtn) {
            langBtn.textContent = t('langToggle');
            langBtn.title = t('langToggleTitle');
        }

        const logoutBtn = document.getElementById('adminLogoutBtn');
        if (logoutBtn) {
            logoutBtn.textContent = t('signOut');
        }

        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const themeBtn = document.getElementById('adminThemeToggle');
        if (themeBtn) {
            themeBtn.textContent = theme === 'dark' ? t('themeLight') : t('themeDark');
            themeBtn.title = t('themeToggleTitle');
        }
    }

    function setAdminLang(next) {
        const lang = next === 'ko' ? 'ko' : 'en';
        try {
            localStorage.setItem('calendarLanguage', lang);
        } catch (_) {
            /* ignore */
        }
        applyAdminLanguage();
    }

    function toggleAdminLang() {
        setAdminLang(getAdminLang() === 'ko' ? 'en' : 'ko');
    }

    function setupAdminLanguageToggle(onChange) {
        let btn = document.getElementById('adminLangToggle');
        if (!btn) {
            return;
        }
        if (btn.dataset.bound === '1') {
            applyAdminLanguage();
            return;
        }
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            toggleAdminLang();
            if (typeof onChange === 'function') {
                onChange();
            }
        });
        applyAdminLanguage();
    }

    global.AdminI18n = {
        t,
        applyAdminLanguage,
        setupAdminLanguageToggle,
        getAdminLang
    };
})();
