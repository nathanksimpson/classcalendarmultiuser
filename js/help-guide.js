/**
 * Help guide — role matrix and loaders. Section text: help/guide-content.json
 * Keep ROLE_PRESETS in sync with server/auth-permissions.js.
 */
(function (global) {
    let guideContentPromise = null;

    function loadGuideContent() {
        if (!guideContentPromise) {
            guideContentPromise = fetch('/help/guide-content.json')
                .then((res) => {
                    if (!res.ok) {
                        throw new Error('Failed to load help content');
                    }
                    return res.json();
                });
        }
        return guideContentPromise;
    }

    async function getGuide(lang) {
        const root = await loadGuideContent();
        const key = lang === 'ko' ? 'ko' : 'en';
        return root[key] || root.en;
    }

    const ROLE_MATRIX = {
    "permOrder": [
        "manage_users",
        "manage_groups",
        "manage_calendar_access",
        "manage_settings",
        "create_calendars",
        "delete_calendars",
        "view_calendars",
        "view_all_calendars",
        "force_save",
        "bypass_collaborative_lock",
        "view_presence",
        "view_audit",
        "apply_suggestions",
        "access_admin_page"
    ],
    "permLabels": {
        "en": {
            "manage_users": "Manage accounts (Admin → Accounts tab)",
            "manage_groups": "Manage groups (Admin → Groups tab)",
            "manage_calendar_access": "Assign calendar access (Admin → Calendars tab)",
            "manage_settings": "Security settings (Admin → System tab)",
            "create_calendars": "Create team calendars (+ New)",
            "delete_calendars": "Delete team calendars (Remove)",
            "view_calendars": "View calendars (assigned team calendars)",
            "view_all_calendars": "View all calendars (any team calendar, not only assigned)",
            "force_save": "Save over revision conflicts (with lock rules)",
            "bypass_collaborative_lock": "Edit while someone else holds lock (read-only bypass)",
            "view_presence": "Who is online (Admin → Monitor tab)",
            "view_audit": "Activity log (Admin → Monitor tab)",
            "apply_suggestions": "Apply calendar change suggestions",
            "access_admin_page": "Open Admin page"
        },
        "ko": {
            "manage_users": "계정 관리 (Admin → Accounts 탭)",
            "manage_groups": "그룹 관리 (Admin → Groups 탭)",
            "manage_calendar_access": "캘린더 접근 지정 (Admin → Calendars 탭)",
            "manage_settings": "보안 설정 (Admin → System 탭)",
            "create_calendars": "팀 캘린더 만들기 (+ New)",
            "delete_calendars": "팀 캘린더 삭제 (Remove)",
            "view_calendars": "캘린더 보기 (지정된 팀 캘린더)",
            "view_all_calendars": "모든 캘린더 보기 (지정 없이 모든 팀 캘린더)",
            "force_save": "버전 충돌 시 강제 저장 (잠금 규칙 적용)",
            "bypass_collaborative_lock": "다른 사람 잠금 중에도 편집(읽기 전용 우회)",
            "view_presence": "접속 중인 사용자 (Admin → Monitor 탭)",
            "view_audit": "활동 로그 (Admin → Monitor 탭)",
            "apply_suggestions": "캘린더 변경 제안 적용",
            "access_admin_page": "Admin 페이지 열기"
        }
    },
    "roleIds": [
        "super_admin",
        "user_admin",
        "head_teacher",
        "settings_admin",
        "teacher",
        "viewer"
    ],
    "roleLabels": {
        "en": {
            "super_admin": "Super admin",
            "user_admin": "User admin",
            "head_teacher": "Head teacher",
            "settings_admin": "Settings admin",
            "teacher": "Teacher",
            "viewer": "Viewer (account)"
        },
        "ko": {
            "super_admin": "최고 관리자",
            "user_admin": "사용자 관리",
            "head_teacher": "담당(리드) 선생님",
            "settings_admin": "설정 관리",
            "teacher": "선생님",
            "viewer": "보기 전용(계정)"
        }
    }
};

    const ROLE_PRESETS = {
    "super_admin": "all",
    "user_admin": [
        "manage_users",
        "manage_groups",
        "access_admin_page"
    ],
    "head_teacher": [
        "view_calendars",
        "create_calendars",
        "bypass_collaborative_lock",
        "force_save",
        "view_presence",
        "apply_suggestions",
        "view_audit",
        "access_admin_page"
    ],
    "settings_admin": [
        "manage_settings",
        "access_admin_page"
    ],
    "teacher": ["view_calendars", "create_calendars"],
    "viewer": ["view_calendars"]
};

    const ROLES_INTRO = {
    "en": [
        "Two different ideas control what someone can do:",
        "Account role — set on Admin → Accounts tab → Edit. Controls which Admin tabs appear, creating/deleting team calendars, seeing all calendars, and lock bypass.",
        "Admin tabs map to permissions: Accounts (manage_users), Groups (manage_groups), Calendars (manage_calendar_access), System (manage_settings), Monitor (view_presence and/or view_audit).",
        "View calendars (global) — open team calendars you are assigned to on Admin → Calendars. View all calendars — open any team calendar without a separate assignment (head teacher preset).",
        "Calendar access level — set per person or group on Admin → Calendars tab for each calendar: Editor (edit with team lock), Suggester (propose changes; editor or head teacher applies), Viewer (read/print only for that calendar).",
        "Manage calendar access / delete: by default, teachers and head teachers only manage calendars they created (+ New). Super admins (or anyone with Manage calendar access / Delete calendars / View all calendars checkboxes) can manage any calendar.",
        "Legacy admin role in the database is treated as Super admin.",
        "Super admin and Head teacher can release stale locks (canForceUnlock). There is still no force takeover of an active editor — only Allow, Release, or timeout.",
        "Custom global permissions: Super admins set per-user checkboxes in Admin → Accounts → Edit (or Add teacher). If checkboxes match the chosen role exactly, the app stores the role preset only (no Custom badge). If they differ, the user keeps a custom list (Custom badge). The matrix below shows each role’s default preset; custom users follow their checkboxes instead.",
        "Granting Super admin role or all global permissions on a non–super-admin role requires the acting super admin’s password. Kakao-only super admins must set a password first."
    ],
    "ko": [
        "두 가지 개념이 권한을 나눕니다:",
        "계정 역할 — Admin → Accounts 탭 → Edit에서 설정. Admin 탭 표시, 팀 캘린더 만들기/삭제, 모든 캘린더 보기, 잠금 우회 등.",
        "Admin 탭과 권한: Accounts(manage_users), Groups(manage_groups), Calendars(manage_calendar_access), System(manage_settings), Monitor(view_presence·view_audit).",
        "캘린더 보기(전역) — Admin → Calendars에서 지정한 팀 캘린더를 엽니다. 모든 캘린더 보기 — 별도 지정 없이 모든 팀 캘린더를 엽니다(head teacher 프리셋).",
        "캘린더 접근 수준 — Admin → Calendars 탭에서 캘린더마다: Editor(팀 잠금 하에 편집), Suggester(제안; 편집자·담당 선생님이 적용), Viewer(해당 캘린더 읽기·인쇄만).",
        "캘린더 접근 관리/삭제: 기본적으로 선생님·head teacher는 본인이 만든 캘린더(+ New)만 관리합니다. 최고 관리자 또는 Manage calendar access / Delete calendars / View all calendars 권한이 있으면 모든 캘린더를 관리할 수 있습니다.",
        "DB의 예전 admin 역할은 Super admin과 같습니다.",
        "Super admin·Head teacher는 오래된 잠금 해제(canForceUnlock) 가능. 편집 중 강제 빼앗기 없음 — 허용, 잠금 해제, 만료만.",
        "맞춤 전역 권한: 최고 관리자가 Admin → Accounts → Edit(또는 Add teacher)에서 사용자별 체크박스를 설정합니다. 체크가 선택한 역할 프리셋과 같으면 역할만 저장(Custom 뱃지 없음). 다르면 맞춤 목록이 저장됩니다(Custom 뱃지). 아래 표는 역할별 기본값이며, 맞춤 사용자는 체크박스를 따릅니다.",
        "Super admin 역할 부여 또는 다른 역할에 전역 권한을 모두 부여할 때는 작업하는 최고 관리자의 비밀번호 확인이 필요합니다. 카카오만 쓰는 최고 관리자는 먼저 비밀번호를 설정해야 합니다."
    ]
};

    function roleHasPermission(roleId, permKey) {
        const preset = ROLE_PRESETS[roleId];
        if (preset === 'all') {
            return true;
        }
        if (!Array.isArray(preset)) {
            return false;
        }
        return preset.includes(permKey);
    }

    global.CCPHelpGuide = {
        loadGuideContent,
        getGuide,
        ROLE_MATRIX,
        ROLES_INTRO,
        roleHasPermission,
        canForceUnlockRoles: ['super_admin', 'head_teacher']
    };
})(typeof window !== 'undefined' ? window : globalThis);
