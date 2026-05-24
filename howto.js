// How-to guide — English & Korean (standalone; no dependency on app.js)
(function () {
    const GUIDE = {
        en: {
            title: 'Help — Class Calendar Planner',
            intro: 'This app builds a term calendar for your classes: lesson days, holidays, deadlines, syllabus tables, and printouts. Everything is organized in tabs at the top. Use this guide in order when you are new, or jump to a section you need.',
            sections: [
                {
                    heading: '1. The tabs',
                    where: 'Top header — Calendar | Classes | Syllabus | Events | Homework | Print & data',
                    steps: [
                        'Calendar — view the month grid, set term dates, show/hide items, filter classes, and use quick add/edit pop-outs.',
                        'Classes — schedule and settings: meeting days, term dates, compression, colors, books (no long syllabus table here).',
                        'Syllabus — edit each class syllabus table, custom reusable syllabi (My syllabi), refresh from calendar, import homework paste, print.',
                        'Events — search holidays and deadlines and use the full event editor.',
                        'Homework — copy previous-week and this-week homework from each class syllabus to paste into your separate Simson grading and homework assignment websites (not inside this app).',
                        'Print & data — print options, clear all data, and edit default class types.',
                        'The app remembers which tab you last used in this browser.',
                        'Header (always visible): Help?, Export, Import, and the language button (English ↔ Korean).'
                    ]
                },
                {
                    heading: '2. Set up your term',
                    where: 'Calendar tab — calendar options (collapse/expand with the arrow at the top of that section)',
                    steps: [
                        'Enter a Calendar Name (e.g. Spring 2026 Term). The title in the header updates.',
                        'Choose Term Start Month — the first month shown on the calendar.',
                        'Choose Months to display (3–6 months).',
                        'The calendar grid updates automatically when you change these.'
                    ]
                },
                {
                    heading: '3. Add or edit a class',
                    where: 'Calendar tab → + Add Class, or Classes tab → pick a class / + Add Class',
                    steps: [
                        'Quick way: on the Calendar tab, click + Add Class or click a lesson bar on the grid. A compact pop-out opens for fast edits.',
                        'Full editor: in the pop-out, click Open full editor — or go to the Classes tab, select a class from the list (or + Add Class).',
                        'Enter Class name, then choose a Class type (built-in presets such as Debate, RC, GR, Write Right, Early Writers, Hand in Hand, and more). The type fills typical lesson count and book — you can still edit every field.',
                        'Set Period (1 = first period) if several classes share the same day; lower numbers appear first on the calendar and in print.',
                        'Set level, grade, default book, and optional Books by month.',
                        'Set Start Date, term length (calendar months), and End Date.',
                        'Set Meeting days: check weekdays or use quick presets — MWF, Mon/Wed (월수), Wed/Fri (수금), Mon/Fri (월금), T/T (Tue/Thu), or Clear. Use the preset that matches your section (e.g. Wed/Fri for 수금, not MWF).',
                        'Class colors: pick Background and Text swatches (shown together under meeting days) so lesson bars are easy to read.',
                        'Set Total Lessons and optional compression, custom schedule, or syllabus units.',
                        'Click Save Class. Colored lesson bars appear on the calendar.',
                        'Delete Class (in the full editor) removes that class after confirmation.'
                    ]
                },
                {
                    heading: '4. Add or edit events (holidays, deadlines, etc.)',
                    where: 'Calendar tab → + Add Event, right-click a day, or Events tab',
                    steps: [
                        'Quick way: Calendar tab → + Add Event, or click a holiday/event chip on the grid. Right-click any day on the calendar to add an event on that date.',
                        'Full editor: in the pop-out, click Open full editor — or go to the Events tab and select an event (or add new).',
                        'Pick Event type: Holiday, Evaluation deadline, Homework deadline, Evaluation period, or Other.',
                        'Enter name and date (or date range).',
                        'Choose Applies To: All Classes, or filter by Simson level, school band, grade, or specific class names.',
                        'Click Save Event. Events appear as chips or highlighted days on the calendar.',
                        'Delete Event removes the event after confirmation.'
                    ]
                },
                {
                    heading: '5. Import Korean public holidays',
                    where: 'Calendar tab — calendar options → Import Korean public holidays (after term start is set)',
                    steps: [
                        'Set your term start month first.',
                        'Click Import Korean public holidays.',
                        'Confirm — holidays for your term are added from a public calendar (duplicates are skipped).',
                        'Imported holidays store both Korean and English names. Switching language (header 🌐) updates names on the calendar and in print.',
                        'Requires an internet connection and works best when the app is opened through a local web server (not only file://).'
                    ]
                },
                {
                    heading: '6. Show or hide items on the calendar',
                    where: 'Calendar tab — Show on calendar bar (above the grid)',
                    steps: [
                        'Toggle Lessons, Holidays, Evaluation deadlines, Homework deadlines, Evaluation periods, or Other events.',
                        'This only changes what you see on screen; it re-draws the calendar.',
                        'Print uses separate checkboxes on the Print & data tab (and the Print button on the Calendar tab opens the same options).'
                    ]
                },
                {
                    heading: '7. Filter which classes appear',
                    where: 'Calendar tab — Show on calendar bar → Filter lessons…',
                    steps: [
                        'Click Filter lessons… to open the filter panel.',
                        'Check or uncheck classes by name, grade, level, class type, period, or default book. Use the search box to find classes quickly.',
                        'Use Select all, Clear all, or Reset filters as needed.',
                        'When a filter is active, only selected classes show on the calendar and in class-related print sections (class list, lesson schedule, syllabi). The button shows how many classes are visible.',
                        'This does not delete any data — it only hides classes from view and print.'
                    ]
                },
                {
                    heading: '8. View and quick-edit from the calendar',
                    where: 'Calendar tab — main month grid',
                    steps: [
                        'Click a lesson bar to open the class pop-out for that class.',
                        'Click a holiday or event chip (or a holiday-highlighted day) to open the event pop-out.',
                        'Hover over a lesson bar for a quick tooltip (level, grade, book, lesson label).',
                        'Use Open full editor in the pop-out when you need the syllabus table, compression UI, or more space.',
                        'Click outside the pop-out or press Escape to close it.'
                    ]
                },
                {
                    heading: '9. Switch language (English ↔ Korean)',
                    where: 'Header → language button (🌐)',
                    steps: [
                        'Click the language button to switch the whole app UI between English and Korean.',
                        'Your choice is saved in this browser.',
                        'Korean public holidays you imported show the matching language on screen and on printed/PDF output.',
                        'If this Help window is open, it updates when you change language.'
                    ]
                },
                {
                    heading: '10. Syllabus tab (pages, homework, custom syllabi)',
                    where: 'Syllabus tab — Classes list or My syllabi',
                    steps: [
                        'In Classes tab, set meeting days, dates, and lessons, then Save Class.',
                        'Open Syllabus tab → Classes → pick your class (or use Edit syllabus from Classes or Homework).',
                        'Step ① — Refresh from calendar (after the class schedule is saved).',
                        'Step ② — Apply preset pages, Fill pages from units, Import homework from paste, Start blank syllabus, or Apply custom syllabus from the dropdown.',
                        'My syllabi — + New custom syllabus to build a reusable template; Save template; apply it to any class later.',
                        'Add lesson row / Add note row for manual rows without a calendar date until you refresh.',
                        'Click Save syllabus (class mode) or Save template (template mode).',
                        'Homework tab copies text from the saved syllabus; use Edit syllabus there to jump back.'
                    ]
                },
                {
                    heading: '11. Edit default class types',
                    where: 'Print & data tab → Edit defaults (also available inside the class form)',
                    steps: [
                        'Click Edit defaults to change factory settings for built-in and PDF preset class types (lesson count, default book, labels, homework paste mode). Existing saved classes keep their own values; new classes use your edited defaults.',
                        'Use Reset on one type or Reset all to restore factory settings for presets.',
                        'Duplicate a preset to make a copy you can customize.',
                        'In the class form, click New class type to save your own reusable type (name, lesson count, meeting days). Delete type removes a custom type you created (not built-in presets).'
                    ]
                },
                {
                    heading: '12. Print or save as PDF',
                    where: 'Print & data tab, or Calendar tab → Print (same options)',
                    steps: [
                        'Open the Print & data tab (or click Print on the Calendar tab).',
                        'Choose whether to print the calendar grid, the summary page, and which summary sections (class list, events, lesson schedule, compression notes, syllabus tables).',
                        'If a lesson filter is active, only filtered classes appear in class-related sections.',
                        'Under “On printed calendar, show:” pick which event types appear on the printed calendar (independent from the on-screen visibility bar on the Calendar tab).',
                        'Click Print — your browser opens a separate tab with only the print content (not the app screen). Choose Save as PDF in the print dialog.',
                        'The calendar prints in landscape on its own tab. Summary sections and syllabi print in portrait (a second tab and print dialog if you selected both calendar and summary).',
                        'Allow pop-ups for this site if the browser blocks the print tab.',
                        'Holiday names on print follow your current language setting (important for imported Korean public holidays).',
                        'For syllabi only: uncheck Print Calendar and all summary sections except Syllabus tables (per class).'
                    ]
                },
                {
                    heading: '13. Save a backup (Export) or load one (Import)',
                    where: 'Top header → Export / Import',
                    steps: [
                        'Export downloads a .json file with all classes, events, settings, syllabus tables, and custom class types.',
                        'Import lets you pick a previously exported .json file to restore a calendar (replaces current data after confirmation).',
                        'Use Export before clearing data or moving to another computer.'
                    ]
                },
                {
                    heading: '14. Clear all data',
                    where: 'Print & data tab → Clear All Data (red button)',
                    steps: [
                        'Removes all classes and events from this browser.',
                        'Export first if you might need the data later.'
                    ]
                }
            ]
        },
        ko: {
            title: '도움말 — Class Calendar Planner',
            intro: '이 앱은 학기 캘린더를 만듭니다. 수업일, 공휴일, 마감일, 강의 계획표, 인쇄까지 한곳에서 관리할 수 있습니다. 상단 탭으로 기능이 나뉩니다. 처음에는 아래 순서대로, 필요한 항목만 골라 읽어도 됩니다.',
            sections: [
                {
                    heading: '1. 탭',
                    where: '상단 헤더 — Calendar | Classes | Syllabus | Events | Homework | Print & data',
                    steps: [
                        'Calendar(캘린더) — 월별 격자, 학기 설정, 표시/숨김, 수업 필터, 빠른 추가·수정 팝업.',
                        'Classes(수업) — 일정·설정(수업 요일, 학기, 압축, 색상 등).',
                        'Syllabus(강의 계획표) — 수업별 표 편집, 사용자 강의 계획표(내 템플릿), 새로고침·붙여넣기·인쇄.',
                        'Events(이벤트) — 공휴일·마감일 목록 검색 및 전체 편집기.',
                        'Homework(숙제) — 강의 계획표에서 지난주·이번주 숙제를 복사해, 이 앱 밖의 Simson 채점·숙제 배정 웹사이트에 붙여넣기.',
                        'Print & data(인쇄·데이터) — 인쇄 옵션, 전체 삭제, 기본 수업 유형 편집.',
                        '마지막으로 연 탭은 이 브라우저에 저장됩니다.',
                        '헤더(항상 표시): 도움말?, Export(보내기), Import(가져오기), 언어 버튼(영어 ↔ 한국어).'
                    ]
                },
                {
                    heading: '2. 학기 설정',
                    where: 'Calendar 탭 — 캘린더 옵션(위쪽 화살표로 접기/펼치기)',
                    steps: [
                        '캘린더 이름을 입력하세요 (예: 2026 봄학기). 헤더 제목이 바뀝니다.',
                        '학기 시작 월을 선택하세요 — 캘린더에 표시되는 첫 달입니다.',
                        '표시할 개월 수를 선택하세요 (3~6개월).',
                        '값을 바꾸면 캘린더가 자동으로 다시 그려집니다.'
                    ]
                },
                {
                    heading: '3. 수업 추가·수정',
                    where: 'Calendar 탭 → + Add Class, 또는 Classes 탭 → 수업 선택 / + Add Class',
                    steps: [
                        '빠른 방법: Calendar 탭에서 + Add Class 또는 격자의 수업 막대 클릭 → 작은 팝업에서 수정.',
                        '전체 편집: 팝업에서 Open full editor(전체 편집기 열기) — 또는 Classes 탭에서 목록 선택(또는 + Add Class).',
                        '수업 이름 입력 후 Class type(수업 유형) 선택. Debate, RC, GR, Write Right, Early Writers, Hand in Hand 등 프리셋이 수업 횟수·교재를 채웁니다. 모든 항목은 수정 가능합니다.',
                        '같은 요일에 여러 수업이 있으면 Period(교시) 설정. 숫자가 작을수록 캘린더·인쇄에서 먼저 표시됩니다 (1 = 1교시).',
                        '레벨, 학년, 기본 교재, 선택 사항인 월별 교재를 입력하세요.',
                        '시작일, 학기 개월 수, 종료일을 설정하세요.',
                        'Meeting days(수업 요일): 요일 선택 또는 MWF, 월수, 수금, 월금, 화·목(T/T), 지우기. 반 일정에 맞는 버튼을 사용하세요 (수금 반은 MWF가 아님).',
                        '수업 색상: Meeting days 아래 Background(배경)·Text(글자) 색을 함께 선택하세요.',
                        '총 수업 횟수와 선택 사항(압축, 사용자 지정 일정, syllabus 단원)을 설정하세요.',
                        'Save Class — 캘린더에 색상 수업 막대가 표시됩니다.',
                        'Delete Class(전체 편집기)는 확인 후 해당 수업을 삭제합니다.'
                    ]
                },
                {
                    heading: '4. 이벤트 추가·수정 (공휴일, 마감일 등)',
                    where: 'Calendar 탭 → + Add Event, 날짜 우클릭, 또는 Events 탭',
                    steps: [
                        '빠른 방법: Calendar 탭 → + Add Event, 또는 격자의 공휴일·이벤트 칩 클릭. 날짜를 우클릭하면 그 날짜로 이벤트를 추가할 수 있습니다.',
                        '전체 편집: 팝업에서 Open full editor — 또는 Events 탭에서 이벤트 선택(또는 새로 추가).',
                        '이벤트 유형: 공휴일, 평가 마감, 숙제 마감, 평가 기간, 기타.',
                        '이름과 날짜(또는 기간)를 입력하세요.',
                        '적용 대상: 전체 수업 또는 심슨 레벨, 학교 구분, 학년, 수업 이름으로 필터.',
                        'Save Event — 캘린더에 칩 또는 강조된 날로 표시됩니다.',
                        'Delete Event는 확인 후 이벤트를 삭제합니다.'
                    ]
                },
                {
                    heading: '5. 한국 공휴일 가져오기',
                    where: 'Calendar 탭 — 캘린더 옵션 → 한국 공휴일 가져오기 (학기 시작 월 설정 후)',
                    steps: [
                        '먼저 학기 시작 월을 설정하세요.',
                        '한국 공휴일 가져오기를 클릭하세요.',
                        '확인 — 해당 학기 공휴일이 공개 달력에서 추가됩니다 (중복은 건너뜀).',
                        '가져온 공휴일은 한국어·영어 이름이 함께 저장됩니다. 헤더 🌐 로 언어를 바꾸면 캘린더와 인쇄에 맞는 이름이 표시됩니다.',
                        '인터넷 연결이 필요하며, 로컬 웹 서버로 연 경우(파일만 여는 것보다) 가장 잘 동작합니다.'
                    ]
                },
                {
                    heading: '6. 캘린더에 표시할 항목',
                    where: 'Calendar 탭 — Show on calendar (격자 위)',
                    steps: [
                        '수업, 공휴일, 평가 마감, 숙제 마감, 평가 기간, 기타 이벤트를 켜거나 끕니다.',
                        '화면에 보이는 것만 바뀝니다. 캘린더가 다시 그려집니다.',
                        '인쇄는 Print & data 탭의 별도 체크박스를 사용합니다 (Calendar 탭의 Print 버튼도 같은 옵션으로 이동합니다).'
                    ]
                },
                {
                    heading: '7. 표시할 수업 필터',
                    where: 'Calendar 탭 — Show on calendar → 수업 필터…',
                    steps: [
                        '수업 필터… 를 클릭해 패널을 엽니다.',
                        '수업 이름, 학년, 레벨, 수업 유형, 교시, 기본 교재별로 체크·해제합니다. 검색창으로 빠르게 찾을 수 있습니다.',
                        '전체 선택, 전체 해제, 필터 초기화를 사용할 수 있습니다.',
                        '필터가 켜져 있으면 선택한 수업만 캘린더와 수업 관련 인쇄(수업 목록, 수업 일정, 강의 계획표)에 나타납니다. 버튼에 표시되는 수업 개수를 확인하세요.',
                        '데이터를 삭제하지 않습니다 — 보기와 인쇄에서만 숨깁니다.'
                    ]
                },
                {
                    heading: '8. 캘린더에서 보기·빠른 수정',
                    where: 'Calendar 탭 — 월별 격자',
                    steps: [
                        '수업 막대 클릭 → 해당 수업 팝업.',
                        '공휴일·이벤트 칩(또는 공휴일 강조 날짜) 클릭 → 이벤트 팝업.',
                        '수업 막대에 마우스를 올리면 레벨, 학년, 교재, 회차 툴팁이 나타납니다.',
                        '강의 계획표·압축 등 넓은 화면이 필요하면 팝업에서 Open full editor(전체 편집기 열기)를 사용하세요.',
                        '팝업 밖을 클릭하거나 Escape 키로 닫을 수 있습니다.'
                    ]
                },
                {
                    heading: '9. 언어 전환 (영어 ↔ 한국어)',
                    where: '헤더 → 🌐 언어 버튼',
                    steps: [
                        '언어 버튼을 클릭하면 앱 전체 UI가 영어와 한국어로 바뀝니다.',
                        '선택한 언어는 이 브라우저에 저장됩니다.',
                        '가져온 한국 공휴일은 화면과 인쇄/PDF에서 현재 언어에 맞는 이름으로 표시됩니다.',
                        '사용 방법 창이 열려 있으면 언어 변경 시 함께 바뀝니다.'
                    ]
                },
                {
                    heading: '10. Syllabus 탭 (페이지·과제·사용자 강의 계획표)',
                    where: 'Syllabus 탭 — Classes 또는 My syllabi(내 강의 계획표)',
                    steps: [
                        'Classes 탭에서 수업 요일·날짜를 맞춘 뒤 Save Class로 저장하세요.',
                        'Syllabus 탭 → Classes → 수업 선택(또는 수업/숙제 화면의 강의 계획표 편집).',
                        '① 캘린더에서 새로고침(수업 일정 저장 후).',
                        '② 프리셋 페이지 적용, 단원에서 채우기, 과제 붙여넣기, 빈 강의 계획표로 시작, 또는 사용자 강의 계획표 적용.',
                        '내 강의 계획표 — + 사용자 강의 계획표로 재사용 템플릿 만들기 → 템플릿 저장 → 다른 수업에 적용.',
                        '수업 행 추가 / 메모 행 추가로 수동 편집. 수업 모드에서는 강의 계획표 저장, 템플릿 모드에서는 템플릿 저장.',
                        'Homework 탭은 저장된 강의 계획표에서 복사합니다.'
                    ]
                },
                {
                    heading: '11. 기본 수업 유형 편집',
                    where: 'Print & data 탭 → Edit defaults (수업 폼에서도 가능)',
                    steps: [
                        'Edit defaults로 내장·PDF 프리셋의 기본값(수업 횟수, 교재, 라벨, 과제 붙여넣기 모드)을 바꿉니다. 이미 저장된 수업은 그대로이고, 새로 만드는 수업에 적용됩니다.',
                        '한 유형 또는 전체 초기화로 공장 설정을 되돌릴 수 있습니다.',
                        '복제로 프리셋 사본을 만들어 수정할 수 있습니다.',
                        '수업 폼에서 New class type으로 나만의 유형을 저장. Delete type은 직접 만든 유형만 삭제합니다(내장 프리셋 아님).'
                    ]
                },
                {
                    heading: '12. 인쇄 또는 PDF 저장',
                    where: 'Print & data 탭, 또는 Calendar 탭 → Print',
                    steps: [
                        'Print & data 탭을 엽니다 (Calendar 탭의 Print도 같은 옵션).',
                        '캘린더, 요약 페이지, 요약 항목(수업 목록, 이벤트, 수업 일정, 압축 메모, 강의 계획표)을 선택하세요.',
                        '수업 필터가 켜져 있으면 수업 관련 항목에는 필터된 수업만 포함됩니다.',
                        '“인쇄 캘린더에 표시:”에서 인쇄물에 나올 이벤트 유형을 고릅니다 (Calendar 탭 화면 표시와 별개).',
                        'Print 클릭 → 앱 화면이 아닌 인쇄 전용 탭이 열립니다. 인쇄 창에서 PDF로 저장하세요.',
                        '캘린더는 가로(landscape) 전용 탭에서 인쇄됩니다. 요약·강의 계획표는 세로(portrait) 탭에서 인쇄됩니다 (캘린더와 요약을 모두 선택하면 탭과 인쇄 창이 두 번 열립니다).',
                        '인쇄 탭이 막히면 이 사이트의 팝업을 허용하세요.',
                        '인쇄 시 공휴일 이름은 현재 언어 설정을 따릅니다 (가져온 한국 공휴일에 중요).',
                        '강의 계획표만: Print Calendar와 다른 요약 항목을 해제하고 강의 계획표 (수업별)만 선택하세요.'
                    ]
                },
                {
                    heading: '13. 백업 저장(보내기) / 불러오기(가져오기)',
                    where: '상단 헤더 → Export / Import',
                    steps: [
                        'Export는 모든 수업, 이벤트, 설정, 강의 계획표, 사용자 정의 수업 유형이 담긴 .json 파일을 다운로드합니다.',
                        'Import는 이전에 보낸 .json 파일을 선택해 캘린더를 복원합니다 (확인 후 현재 데이터를 대체).',
                        '데이터 삭제나 다른 PC로 옮기기 전에 Export 하세요.'
                    ]
                },
                {
                    heading: '14. 모든 데이터 삭제',
                    where: 'Print & data 탭 → Clear All Data (빨간 버튼)',
                    steps: [
                        '이 브라우저의 모든 수업과 이벤트를 삭제합니다.',
                        '나중에 필요할 수 있으면 먼저 Export 하세요.'
                    ]
                }
            ]
        }
    };

    const modal = document.getElementById('howToModal');
    const bodyEl = document.getElementById('howToBody');
    const titleEl = document.getElementById('howToTitle');
    const closeBtn = document.getElementById('closeHowToModal');

    if (!modal || !bodyEl || !titleEl) return;

    function renderGuide(lang) {
        const guide = GUIDE[lang] || GUIDE.en;
        titleEl.textContent = guide.title;
        bodyEl.innerHTML = `
            <p class="how-to-intro">${escapeHtml(guide.intro)}</p>
            ${guide.sections.map(section => `
                <section class="how-to-section">
                    <h3>${escapeHtml(section.heading)}</h3>
                    <p class="how-to-where"><span class="how-to-where-label">${lang === 'ko' ? '위치' : 'Where'}:</span> ${escapeHtml(section.where)}</p>
                    <ol class="how-to-steps">
                        ${section.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                    </ol>
                </section>
            `).join('')}
        `;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function openHowTo(lang) {
        renderGuide(lang);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        bodyEl.scrollTop = 0;
    }

    function closeHowTo() {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    function getAppLanguage() {
        const saved = localStorage.getItem('calendarLanguage');
        return saved === 'ko' ? 'ko' : 'en';
    }

    document.getElementById('howToBtn')?.addEventListener('click', () => openHowTo(getAppLanguage()));

    document.addEventListener('calendarLanguageChanged', (e) => {
        if (modal.classList.contains('active') && e.detail && (e.detail.lang === 'en' || e.detail.lang === 'ko')) {
            renderGuide(e.detail.lang);
        }
    });
    closeBtn?.addEventListener('click', closeHowTo);

    modal.addEventListener('pointerdown', (e) => {
        modal._howToBackdrop = e.target === modal;
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal && modal._howToBackdrop) closeHowTo();
        modal._howToBackdrop = false;
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeHowTo();
        }
    });
})();
