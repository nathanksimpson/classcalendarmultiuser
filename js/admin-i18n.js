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
            navAriaLabel: 'Admin sections',
            navUsers: 'Teachers',
            navGroups: 'Groups',
            navCalendarAccess: 'Calendar access',
            navLock: 'Lock & sign-out',
            navPresence: 'Who is online',
            navActivity: 'Activity',
            usersWaitingHint: 'Waiting = signed in but no calendar access yet (assign via Groups or Calendar access below).',
            addTeacherCallout:
                'Most teachers appear automatically after their first Kakao sign-in. Use the form below only to pre-add someone before they log in.',
            emptyUsers: 'No users yet. Teachers appear here after Kakao sign-in, or use Add teacher below.',
            emptyGroups: 'No groups yet. Create one below.',
            emptyCalendars: 'No calendars yet. Create a team calendar from the main calendar page first.',
            updating: 'Updating…',
            actionsMenu: 'Actions',
            actionsMenuAria: 'Actions for this row',
            passwordActionsLabel: 'Password',
            captionUsers: 'Teachers and administrators',
            captionGroups: 'Teacher groups',
            mustBeAdminHint: 'Sign in with an admin account, or go back to the calendar.',
            lockSettingsHeading: 'Security & lock settings',
            lockSettingsHint:
                'Control edit-lock expiry and automatic sign-out when a teacher is inactive (no mouse, keyboard, or touch).',
            lockExpiresLabel: 'Lock expires after',
            lockExpiresSuffix: 'minutes of no lock activity',
            idleLogoutLabel: 'Sign out after',
            idleLogoutSuffix: 'minutes idle',
            idleWarningLabel: 'Idle warning',
            idleWarningSuffix: 'minutes before sign-out',
            sessionMaxDaysLabel: 'Stay signed in up to',
            sessionMaxDaysSuffix: 'days (new logins; shared PCs: use shorter idle sign-out above)',
            saveSettings: 'Save settings',
            usersHeading: 'Teachers & admins',
            usersHint1:
                'Teachers can sign in with Kakao (first login creates their account). Use Edit to set a recognizable name. Grant calendar access via groups or per-calendar access.',
            usersHint2:
                'Deactivate blocks sign-in and signs them out. Use Reactivate to restore access. Delete permanently (deactivated accounts only) removes the user from the database and cannot be undone.',
            thName: 'Name',
            thEmail: 'Email',
            thKakaoId: 'Kakao ID',
            thRole: 'Role',
            editUser: 'Edit',
            editUserTitle: 'Edit user',
            editUserHint: 'Set a clear display name so you can recognize this teacher (especially after Kakao sign-in).',
            saveUser: 'Save',
            savedUserUpdated: 'User updated.',
            editUserNameRequired: 'Display name is required.',
            thCalendars: 'Calendars',
            calendarsHasAccess: 'Has access',
            calendarsNoAccess: 'Waiting',
            thStatus: 'Status',
            thActions: 'Actions',
            addTeacherHeading: 'Add teacher',
            displayName: 'Display name',
            email: 'Email',
            kakaoUserIdOptional: 'Kakao user ID (optional)',
            addTeacherEmailOrKakaoHint:
                'Optional: pre-add before first Kakao sign-in. Otherwise teachers appear automatically after they log in (use Kakao ID in the Users table). Email is not required for privacy.',
            addTeacherNeedEmailOrKakao: 'Enter an email or Kakao user ID.',
            role: 'Role',
            roleTeacher: 'Teacher',
            roleAdmin: 'Admin',
            roleViewer: 'Viewer',
            roleHeadTeacher: 'Head teacher',
            roleUserAdmin: 'User admin',
            roleSettingsAdmin: 'Settings admin',
            roleSuperAdmin: 'Super admin',
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
            presenceTitle: 'Who is online',
            presenceHint: 'Teachers who sent a heartbeat in the last ~90 seconds.',
            presenceEmpty: 'No one online right now.',
            activityTitle: 'Activity log',
            activityHint: 'Recent saves and admin actions (not full calendar snapshots).',
            activityWhen: 'When',
            activityWho: 'Who',
            activityAction: 'Action',
            activitySummary: 'Summary',
            emptyActivity: 'No activity yet.',
            forceLogout: 'Force sign out',
            forceLogoutTitle: 'End all sessions for this user',
            confirmForceLogout: 'Force sign out {name} on all devices?',
            savedForceLogout: 'User signed out on all devices.',
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
                'Saved: lock {lock} min, idle sign-out {idle} min (warning {warn} min before), session {sessionDays} days.',
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
            navAriaLabel: '관리 섹션',
            navUsers: '선생님',
            navGroups: '그룹',
            navCalendarAccess: '캘린더 접근',
            navLock: '잠금·로그아웃',
            navPresence: '접속 중',
            navActivity: '활동 기록',
            usersWaitingHint: '대기 중 = 로그인했지만 캘린더 접근이 없음 (아래 그룹·캘린더 접근에서 부여).',
            addTeacherCallout:
                '대부분의 선생님은 첫 카카오 로그인 후 자동으로 목록에 나타납니다. 로그인 전에만 아래 양식으로 미리 등록하세요.',
            emptyUsers: '사용자가 없습니다. 카카오 로그인 후 나타나거나 아래에서 추가하세요.',
            emptyGroups: '그룹이 없습니다. 아래에서 만드세요.',
            emptyCalendars: '캘린더가 없습니다. 먼저 메인 캘린더 페이지에서 팀 캘린더를 만드세요.',
            updating: '업데이트 중…',
            actionsMenu: '작업',
            actionsMenuAria: '이 행의 작업',
            passwordActionsLabel: '비밀번호',
            captionUsers: '선생님 및 관리자',
            captionGroups: '선생님 그룹',
            mustBeAdminHint: '관리자 계정으로 로그인하거나 캘린더로 돌아가세요.',
            lockSettingsHeading: '보안 및 잠금 설정',
            lockSettingsHint:
                '편집 잠금 만료 시간과 선생님이 비활성(마우스·키보드·터치 없음)일 때 자동 로그아웃을 설정합니다.',
            lockExpiresLabel: '잠금 만료',
            lockExpiresSuffix: '분 동안 잠금 활동 없음',
            idleLogoutLabel: '로그아웃',
            idleLogoutSuffix: '분 유휴 후',
            idleWarningLabel: '유휴 경고',
            idleWarningSuffix: '분 전 (로그아웃 전)',
            sessionMaxDaysLabel: '로그인 유지',
            sessionMaxDaysSuffix: '일까지 (새 로그인 기준; 공용 PC는 위 유휴 로그아웃을 짧게)',
            saveSettings: '설정 저장',
            usersHeading: '선생님 및 관리자',
            usersHint1:
                '카카오 로그인 시 계정이 자동 생성됩니다. 이름을 알아보기 쉽게 하려면 편집을 사용하세요. 그룹·캘린더 접근 권한을 부여해야 플래너를 사용할 수 있습니다.',
            usersHint2:
                '비활성화하면 로그인이 차단되고 로그아웃됩니다. 재활성화로 복구할 수 있습니다. 영구 삭제는 비활성 계정만 DB에서 제거하며 되돌릴 수 없습니다.',
            thName: '이름',
            thEmail: '이메일',
            thKakaoId: '카카오 ID',
            thRole: '역할',
            editUser: '편집',
            editUserTitle: '사용자 편집',
            editUserHint: '표시 이름을 설정하세요(카카오 로그인 후 특히 중요).',
            saveUser: '저장',
            savedUserUpdated: '사용자 정보가 저장되었습니다.',
            editUserNameRequired: '표시 이름을 입력하세요.',
            thCalendars: '캘린더',
            calendarsHasAccess: '접근 있음',
            calendarsNoAccess: '대기 중',
            thStatus: '상태',
            thActions: '작업',
            addTeacherHeading: '선생님 추가',
            displayName: '표시 이름',
            email: '이메일',
            kakaoUserIdOptional: '카카오 사용자 ID (선택)',
            addTeacherEmailOrKakaoHint:
                '선택: 첫 카카오 로그인 전에 미리 등록할 때만 사용하세요. 보통은 선생님이 로그인한 뒤 Users 목록에 자동으로 나타납니다(카카오 ID로 확인). 이메일은 필수가 아닙니다.',
            addTeacherNeedEmailOrKakao: '이메일 또는 카카오 사용자 ID를 입력하세요.',
            role: '역할',
            roleTeacher: '선생님',
            roleAdmin: '관리자',
            roleViewer: '보기 전용',
            roleHeadTeacher: '담당(리드) 선생님',
            roleUserAdmin: '사용자 관리',
            roleSettingsAdmin: '설정 관리',
            roleSuperAdmin: '최고 관리자',
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
            presenceTitle: '접속 중인 선생님',
            presenceHint: '최근 약 90초 내에 활동(heartbeat)을 보낸 선생님입니다.',
            presenceEmpty: '현재 접속 중인 사용자가 없습니다.',
            activityTitle: '활동 기록',
            activityHint: '최근 저장 및 관리자 작업 내역입니다(전체 캘린더 스냅샷은 아님).',
            activityWhen: '시간',
            activityWho: '사용자',
            activityAction: '작업',
            activitySummary: '내용',
            emptyActivity: '아직 기록이 없습니다.',
            forceLogout: '강제 로그아웃',
            forceLogoutTitle: '이 사용자의 모든 세션 종료',
            confirmForceLogout: '{name}을(를) 모든 기기에서 강제 로그아웃할까요?',
            savedForceLogout: '모든 기기에서 로그아웃되었습니다.',
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
            deactivate: '비활성화',
            deactivateTitle: '로그인 차단 (계정 유지, 나중에 재활성화)',
            onlyAdminDeactivate: '유일한 관리자는 비활성화할 수 없음',
            reactivate: '재활성화',
            reactivateTitle: '다시 로그인 허용',
            deletePermanently: '영구 삭제',
            deletePermanentlyTitle: 'DB에서 계정 삭제 (되돌릴 수 없음)',
            makeAdmin: '관리자로',
            makeTeacher: '선생님으로',
            resetPassword: '비밀번호 재설정',
            resetPasswordTitleBtn: '새 비밀번호 설정; 모든 세션 종료',
            clearPassword: '비밀번호 지우기',
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
            confirmDemote: '{name}을(를) 선생님으로 변경할까요?',
            savedNowTeacher: '저장됨: {name} 선생님으로 변경.',
            savedReactivated: '저장됨: {label} 재활성화.',
            confirmDeleteGroup: '그룹 "{name}"을(를) 삭제할까요? 캘린더에서 이 그룹 지정이 제거됩니다.',
            savedGroupDeleted: '저장됨: 그룹 "{name}" 삭제.',
            savedGroupMembers: '저장됨: 그룹 "{name}" 구성원 업데이트.',
            savedCalendarAccess: '저장됨: "{name}" 캘린더 접근.',
            savedLockSettings:
                '저장됨: 잠금 {lock}분, 유휴 로그아웃 {idle}분 (경고 {warn}분 전), 세션 {sessionDays}일.',
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
        if (!document.body) {
            return;
        }
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

        document.querySelectorAll('select option[data-i18n]').forEach((opt) => {
            const key = opt.getAttribute('data-i18n');
            if (key) {
                opt.textContent = t(key);
            }
        });

        const sectionNav = document.getElementById('adminSectionNav');
        if (sectionNav) {
            sectionNav.setAttribute('aria-label', t('navAriaLabel'));
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

        document.querySelectorAll('.admin-actions-menu summary').forEach((el) => {
            el.textContent = t('actionsMenu');
            el.setAttribute('aria-label', t('actionsMenuAria'));
        });

        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const themeBtn = document.getElementById('adminThemeToggle');
        if (themeBtn) {
            themeBtn.textContent = theme === 'dark' ? t('themeLight') : t('themeDark');
            themeBtn.title = t('themeToggleTitle');
        }
    }

    function setAdminLang(next) {
        adminLang = next === 'ko' ? 'ko' : 'en';
        try {
            localStorage.setItem('calendarLanguage', adminLang);
        } catch (_) {
            /* ignore */
        }
        applyAdminLanguage();
        try {
            document.dispatchEvent(
                new CustomEvent('calendarLanguageChanged', { detail: { lang: adminLang } })
            );
        } catch (_) {
            /* ignore */
        }
    }

    function toggleAdminLang() {
        setAdminLang(adminLang === 'ko' ? 'en' : 'ko');
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
        getAdminLang,
        setAdminLang,
        toggleAdminLang
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAdminLanguage);
    } else {
        applyAdminLanguage();
    }
})(typeof window !== 'undefined' ? window : globalThis);
