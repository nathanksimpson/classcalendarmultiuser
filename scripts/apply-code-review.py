# Applies code-review plan patches to app.js and index.html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app.js"
HTML = ROOT / "index.html"


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"MISSING [{label}]")
    return text.replace(old, new, 1)


def patch_app(text: str) -> str:
    text = must_replace(
        text,
        """function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}""",
        """function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegExp(s) {
    return String(s ?? '').replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}

function escapeAttr(s) {
    return escapeHtml(s);
}""",
        "escapeHtml",
    )

    text = must_replace(
        text,
        """function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="item-match">$1</span>');
}""",
        """function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const safeText = escapeHtml(text);
    const safeQuery = escapeRegExp(query);
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return safeText.replace(regex, '<span class="item-match">$1</span>');
}""",
        "highlightMatch",
    )

    text = must_replace(
        text,
        """    classNames.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `
            <input type="checkbox" name="holidayClass" value="${name}">
            ${name}
        `;
        container.appendChild(label);
    });""",
        """    classNames.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'holidayClass';
        cb.value = name;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        container.appendChild(label);
    });""",
        "populateHolidayClassCheckboxes",
    )

    text = must_replace(
        text,
        """    if (hasGrades && holiday.grades.includes(classData.grade)) {
        return true;
    }""",
        """    // Grade-targeted holidays skip classes with no grade set; school-band filters still apply above.
    if (hasGrades && classData.grade && holiday.grades.includes(classData.grade)) {
        return true;
    }""",
        "isHolidayForClass grade",
    )

    text = must_replace(
        text,
        """// Get holiday that covers a specific date (handles both single dates and ranges)
function getHolidayForDate(dateStr) {
    const checkDate = new Date(dateStr);
    
    for (const holiday of appData.holidays) {
        if (holiday.isRange) {
            // Check if date falls within range
            const start = new Date(holiday.startDate);
            const end = new Date(holiday.endDate);
            if (checkDate >= start && checkDate <= end) {
                return holiday;
            }
        } else {
            // Check single date
            if (holiday.date === dateStr) {
                return holiday;
            }
        }
    }
    
    return null;
}

// Get all dates covered by a holiday (for display purposes)
function getHolidayDates(holiday) {
    const dates = [];
    
    if (holiday.isRange) {
        const current = new Date(holiday.startDate);
        const end = new Date(holiday.endDate);
        
        while (current <= end) {
            dates.push(formatDateISO(current));
            current.setDate(current.getDate() + 1);
        }
    } else {
        dates.push(holiday.date);
    }
    
    return dates;
}""",
        """function getHolidayEventsList() {
    return getCalendarEvents().filter(ev => normalizeEventType(ev.type) === EVENT_TYPES.HOLIDAY);
}

// Get holiday that covers a specific date (handles both single dates and ranges)
function getHolidayForDate(dateStr) {
    const checkDate = parseISODateLocal(dateStr);
    if (Number.isNaN(checkDate.getTime())) {
        return null;
    }

    for (const holiday of getHolidayEventsList()) {
        if (holiday.isRange) {
            const start = parseISODateLocal(holiday.startDate);
            const end = parseISODateLocal(holiday.endDate);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
                && checkDate >= start && checkDate <= end) {
                return holiday;
            }
        } else if (holiday.date === dateStr) {
            return holiday;
        }
    }

    return null;
}

// Get all dates covered by a holiday (for display purposes)
function getHolidayDates(holiday) {
    const dates = [];

    if (holiday.isRange) {
        const current = parseISODateLocal(holiday.startDate);
        const end = parseISODateLocal(holiday.endDate);
        if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) {
            return dates;
        }
        while (current <= end) {
            dates.push(formatDateISO(current));
            current.setDate(current.getDate() + 1);
        }
    } else if (holiday.date) {
        dates.push(holiday.date);
    }

    return dates;
}""",
        "holiday dates",
    )

    text = must_replace(
        text,
        """            eventBar.innerHTML = `
                <span class="event-title">${classData.name} - ${lesson.label}</span>
                <span class="event-book">${bookLabel}</span>
            `;""",
        """            const titleSpan = document.createElement('span');
            titleSpan.className = 'event-title';
            titleSpan.textContent = `${classData.name} - ${lesson.label}`;
            const bookSpan = document.createElement('span');
            bookSpan.className = 'event-book';
            bookSpan.textContent = bookLabel;
            eventBar.appendChild(titleSpan);
            eventBar.appendChild(bookSpan);""",
        "createDayCell",
    )

    if "function appendSummaryTableRow" not in text:
        text = must_replace(
            text,
            "function updatePrintSummary() {",
            """function appendSummaryTableRow(tbody, cellTexts) {
    const row = document.createElement('tr');
    cellTexts.forEach(cellText => {
        const td = document.createElement('td');
        td.textContent = cellText ?? '';
        row.appendChild(td);
    });
    tbody.appendChild(row);
}

function updatePrintSummary() {""",
            "appendSummaryTableRow",
        )

    text = must_replace(
        text,
        """    appData.classes.forEach(classData => {
        const row = document.createElement('tr');
        const dayText = formatMeetingDaysSummary(classData);
        const booksSummary = formatBooksByMonthSummary(classData);
        row.innerHTML = `
            <td>${classData.name}</td>
            <td>${getClassLevelDisplay(classData)}</td>
            <td>${classData.grade || '—'}</td>
            <td>${classData.book || ''}</td>
            <td>${booksSummary}</td>
            <td>${formatDateDisplay(classData.startDate)}</td>
            <td>${formatDateDisplay(classData.endDate)}</td>
            <td>${dayText}</td>
        `;
        classTableBody.appendChild(row);
    });""",
        """    appData.classes.forEach(classData => {
        appendSummaryTableRow(classTableBody, [
            classData.name,
            getClassLevelDisplay(classData),
            classData.grade || '—',
            classData.book || '',
            formatBooksByMonthSummary(classData),
            formatDateDisplay(classData.startDate),
            formatDateDisplay(classData.endDate),
            formatMeetingDaysSummary(classData)
        ]);
    });""",
        "class summary table",
    )

    text = must_replace(
        text,
        """            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${getEventTypeLabel(ev.type)}</td>
                <td>${ev.name}</td>
                <td>${dateText}</td>
                <td>${appliesToText}</td>
            `;
            eventTableBody.appendChild(row);""",
        """            appendSummaryTableRow(eventTableBody, [
                getEventTypeLabel(ev.type),
                ev.name,
                dateText,
                appliesToText
            ]);""",
        "event summary table",
    )

    text = must_replace(
        text,
        "        const sortedHolidays = [...appData.holidays].sort((a, b) => {",
        "        const sortedHolidays = [...getHolidayEventsList()].sort((a, b) => {",
        "holiday summary sort",
    )

    text = must_replace(
        text,
        """            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${holiday.name}</td>
                <td>${dateText}</td>
                <td>${appliesToText}</td>
            `;
            holidayTableBody.appendChild(row);""",
        "            appendSummaryTableRow(holidayTableBody, [holiday.name, dateText, appliesToText]);",
        "holiday summary table",
    )

    text = must_replace(
        text,
        """        let lessonsHtml = lessons.map(l => {
            const mk = l.monthKey || formatDateISO(l.date).slice(0, 7);
            const bk = l.book != null && l.book !== '' ? l.book : getBookForMonthKey(classData, mk);
            return `<li>${l.label}: ${formatDateDisplay(formatDateISO(l.date))} — ${bk}</li>`;
        }).join('');
        
        itemDiv.innerHTML = `
            <h4>${classData.name} (${getClassLevelDisplay(classData)})</h4>
            <ul>${lessonsHtml}</ul>
        `;""",
        """        const h4 = document.createElement('h4');
        h4.textContent = `${classData.name} (${getClassLevelDisplay(classData)})`;
        itemDiv.appendChild(h4);
        const ul = document.createElement('ul');
        lessons.forEach(l => {
            const mk = l.monthKey || formatDateISO(l.date).slice(0, 7);
            const bk = l.book != null && l.book !== '' ? l.book : getBookForMonthKey(classData, mk);
            const li = document.createElement('li');
            li.textContent = `${l.label}: ${formatDateDisplay(formatDateISO(l.date))} — ${bk}`;
            ul.appendChild(li);
        });
        itemDiv.appendChild(ul);""",
        "lesson schedule summary",
    )

    # Autocomplete DOM build
    text = must_replace(
        text,
        """    // Build dropdown HTML
    let html = `<motion class="autocomplete-hint" data-i18n="selectToAutofill">${t('selectToAutofill') || 'Select to auto-fill fields:'}</motion>`;
    
    uniqueClasses.forEach((classData, index) => {
        const displayName = highlightMatch(classData.name, inputValue);
        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;
        html += `
            <motion class="autocomplete-item" data-index="${index}" data-class-id="${classData.id}">
                <motion class="item-name">${displayName}</motion>
                <motion class="item-details">${details}</motion>
            </motion>
        `;
    });
    
    dropdown.innerHTML = html;""".replace("motion", "motion"),
        "",
        "autocomplete-skip",
    )

    old_ac = """    // Build dropdown HTML
    let html = `<div class="autocomplete-hint" data-i18n="selectToAutofill">${t('selectToAutofill') || 'Select to auto-fill fields:'}</motion>`;
    
    uniqueClasses.forEach((classData, index) => {
        const displayName = highlightMatch(classData.name, inputValue);
        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;
        html += `
            <div class="autocomplete-item" data-index="${index}" data-class-id="${classData.id}">
                <div class="item-name">${displayName}</div>
                <div class="item-details">${details}</div>
            </div>
        `;
    });
    
    dropdown.innerHTML = html;""".replace("</motion>`", "</div>`").replace("motion class", "motion class")
    # fix typo above - use exact string
    old_ac = """    // Build dropdown HTML
    let html = `<motion class="autocomplete-hint" data-i18n="selectToAutofill">${t('selectToAutofill') || 'Select to auto-fill fields:'}</motion>`;
    
    uniqueClasses.forEach((classData, index) => {
        const displayName = highlightMatch(classData.name, inputValue);
        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;
        html += `
            <motion class="autocomplete-item" data-index="${index}" data-class-id="${classData.id}">
                <motion class="item-name">${displayName}</motion>
                <motion class="item-details">${details}</motion>
            </motion>
        `;
    });
    
    dropdown.innerHTML = html;"""

    # Correct old_ac with div tags
    old_ac = (
        "    // Build dropdown HTML\n"
        "    let html = `<div class=\"autocomplete-hint\" data-i18n=\"selectToAutofill\">${t('selectToAutofill') || 'Select to auto-fill fields:'}</div>`;\n"
        "    \n"
        "    uniqueClasses.forEach((classData, index) => {\n"
        "        const displayName = highlightMatch(classData.name, inputValue);\n"
        "        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;\n"
        "        html += `\n"
        "            <div class=\"autocomplete-item\" data-index=\"${index}\" data-class-id=\"${classData.id}\">\n"
        "                <motion class=\"item-name\">${displayName}</div>\n"
        "                <div class=\"item-details\">${details}</div>\n"
        "            </div>\n"
        "        `;\n"
        "    });\n"
        "    \n"
        "    dropdown.innerHTML = html;"
    )
    old_ac = old_ac.replace("motion class=\"item-name\">", "div class=\"item-name\">")

    new_ac = """    dropdown.innerHTML = '';
    const hintEl = document.createElement('div');
    hintEl.className = 'autocomplete-hint';
    hintEl.setAttribute('data-i18n', 'selectToAutofill');
    hintEl.textContent = t('selectToAutofill') || 'Select to auto-fill fields:';
    dropdown.appendChild(hintEl);

    uniqueClasses.forEach((classData, index) => {
        const item = document.createElement('motion');
        item.className = 'autocomplete-item';
        item.dataset.index = String(index);
        item.dataset.classId = classData.id;
        const nameEl = document.createElement('motion');
        nameEl.className = 'item-name';
        nameEl.innerHTML = highlightMatch(classData.name, inputValue);
        const detailsEl = document.createElement('motion');
        detailsEl.className = 'item-details';
        detailsEl.textContent = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;
        item.appendChild(nameEl);
        item.appendChild(detailsEl);
        dropdown.appendChild(item);
    });""".replace("motion", "div")

    if old_ac in text:
        text = text.replace(old_ac, new_ac, 1)
    else:
        print("WARN: autocomplete block not found")

    text = must_replace(
        text,
        """function computeScheduleCacheKey() {
    return JSON.stringify({
        classes: appData.classes,
        events: appData.events,
        holidays: appData.holidays
    });
}""",
        """function computeScheduleCacheKey() {
    return JSON.stringify({
        classes: appData.classes,
        events: appData.events
    });
}""",
        "computeScheduleCacheKey",
    )

    if "function getPersistedAppData" not in text:
        text = must_replace(
            text,
            "function saveDataToLocalCache() {",
            """function getPersistedAppData() {
    syncHolidaysFromEvents();
    const payload = JSON.parse(JSON.stringify(appData));
    delete payload.holidays;
    return payload;
}

function saveDataToLocalCache() {""",
            "getPersistedAppData",
        )

    text = must_replace(
        text,
        "    localStorage.setItem('classCalendarData', JSON.stringify(appData));",
        """    try {
        localStorage.setItem('classCalendarData', JSON.stringify(getPersistedAppData()));
    } catch (err) {
        console.error('localStorage save failed:', err);
        showAppStatus(t('storageQuotaError'), true);
    }""",
        "localStorage save",
    )

    text = must_replace(
        text,
        "            return JSON.parse(JSON.stringify(appData));",
        "            return getPersistedAppData();",
        "team sync payload",
    )

    text = must_replace(
        text,
        "function exportData() {\n    const dataStr = JSON.stringify(appData, null, 2);",
        "function exportData() {\n    const dataStr = JSON.stringify(getPersistedAppData(), null, 2);",
        "exportData",
    )

    if "let calendarNameSaveTimer" not in text:
        text = must_replace(
            text,
            "let teamSyncEnabled = false;",
            "let teamSyncEnabled = false;\nlet calendarNameSaveTimer = null;",
            "calendarNameSaveTimer",
        )

    text = must_replace(
        text,
        """    elements.calendarName.addEventListener('input', (e) => {
        appData.calendarName = e.target.value;
        saveData();
        updateCalendarTitle();
    });""",
        """    elements.calendarName.addEventListener('input', (e) => {
        appData.calendarName = e.target.value;
        updateCalendarTitle();
        clearTimeout(calendarNameSaveTimer);
        calendarNameSaveTimer = setTimeout(() => saveData(), 400);
    });""",
        "debounce calendar name",
    )

    text = must_replace(
        text,
        """function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            // Validate structure
            if (imported.classes && (imported.holidays || imported.events)) {""",
        """function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm(t('confirmImportOverwrite'))) {
        e.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            // Validate structure
            if (imported.classes && (imported.holidays || imported.events)) {""",
        "import confirm",
    )

    text = must_replace(
        text,
        "                if (!migrated) {\n                    alert(t('importSuccess'));\n                }",
        "                if (!migrated) {\n                    showAppStatus(t('importSuccess'));\n                }",
        "import success status",
    )

    text = must_replace(
        text,
        "    alert(t('clearDataSuccess'));",
        "    showAppStatus(t('clearDataSuccess'));",
        "clear success status",
    )

    if "function showAppStatus" not in text:
        text = must_replace(
            text,
            "// ============================================\n// Modal Functions",
            """// ============================================
// App status banner (non-blocking feedback)
// ============================================
function showAppStatus(message, isError = false) {
    const el = document.getElementById('appStatus');
    if (!el) {
        if (isError) console.error(message);
        else console.log(message);
        return;
    }
    el.textContent = message;
    el.classList.toggle('app-status-error', !!isError);
    el.classList.add('app-status-visible');
    clearTimeout(showAppStatus._timer);
    showAppStatus._timer = setTimeout(() => {
        el.classList.remove('app-status-visible');
    }, 5000);
}

// ============================================
// Modal Functions""",
            "showAppStatus",
        )

    if "modalFocusStack" not in text:
        text = must_replace(
            text,
            "function openModal(modal) {\n    modal.classList.add('active');\n}",
            """const modalFocusStack = [];

function getModalFocusableElements(modal) {
    const content = modal.querySelector('.modal-content');
    if (!content) return [];
    return Array.from(content.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && el.offsetParent !== null);
}

function trapModalFocus(modal, e) {
    if (e.key !== 'Tab') return;
    const focusable = getModalFocusableElements(modal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

function openModal(modal) {
    if (!modal) return;
    const previousFocus = document.activeElement;
    modal.classList.add('active');
    if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const title = modal.querySelector('h2');
    if (title && !modal.getAttribute('aria-labelledby')) {
        if (!title.id) title.id = `modal-title-${modal.id || 'dialog'}`;
        modal.setAttribute('aria-labelledby', title.id);
    }
    const focusable = getModalFocusableElements(modal);
    const focusTarget = focusable[0] || modal.querySelector('.modal-content');
    if (focusTarget && focusTarget.focus) focusTarget.focus();
    const keyHandler = (e) => trapModalFocus(modal, e);
    modal.addEventListener('keydown', keyHandler);
    modalFocusStack.push({ modal, previousFocus, keyHandler });
}""",
            "openModal a11y",
        )

        text = must_replace(
            text,
            "function closeModal(modal) {\n    modal.classList.remove('active');\n}",
            """function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    const entry = modalFocusStack.pop();
    if (entry && entry.modal === modal) {
        modal.removeEventListener('keydown', entry.keyHandler);
        if (entry.previousFocus && entry.previousFocus.focus) {
            entry.previousFocus.focus();
        }
    }
}""",
            "closeModal a11y",
        )

    # i18n keys
    if "confirmImportOverwrite" not in text:
        text = must_replace(
            text,
            "        importSuccess: 'Data imported successfully!',",
            """        confirmImportOverwrite: 'Replace all calendar data in this browser with the imported file? Export a backup first if you are unsure.',
        storageQuotaError: 'Could not save — browser storage is full. Export your calendar and remove old data.',
        emptyGradeHolidayHint: 'If a class has no grade, it will not match grade-specific holidays (school-wide bands still apply).',
        importSuccess: 'Data imported successfully!',""",
            "i18n en import",
        )
        text = must_replace(
            text,
            "        importSuccess: '데이터를 성공적으로 가져왔습니다!',",
            """        confirmImportOverwrite: '이 브라우저의 모든 캘린더 데이터를 가져온 파일로 바꿀까요? 확실하지 않으면 먼저보내기로 백업하세요.',
        storageQuotaError: '저장할 수 없습니다 — 브라우저 저장 공간이 가득 찼습니다. 캘린더를보낸 뒤 오래된 데이터를 지우세요.',
        emptyGradeHolidayHint: '학년이 없는 수업은 학년별 휴일에 해당하지 않습니다(초·중 전체 휴일은 그대로 적용).',
        importSuccess: '데이터를 성공적으로 가져왔습니다!',""",
            "i18n ko import",
        )

    return text


def patch_html(text: str) -> str:
    text = text.replace(
        '<button id="langToggleBtn" class="btn btn-outline btn-lang">??? ?????/button>',
        '<button type="button" id="langToggleBtn" class="btn btn-outline btn-lang" data-i18n="langToggle">🌐 한국어</button>',
    )
    if 'id="appStatus"' not in text:
        text = text.replace(
            '<header class="app-header">',
            '<header class="app-header">\n            <div id="appStatus" class="app-status" role="status" aria-live="polite"></motion>',
        ).replace("</motion>", "</motion>")
        text = text.replace(
            '<header class="app-header">\n            <div id="appStatus" class="app-status" role="status" aria-live="polite"></motion>',
            '<header class="app-header">\n            <motion id="appStatus" class="app-status" role="status" aria-live="polite"></motion>',
        )
        text = text.replace(
            '<header class="app-header">\n            <motion id="appStatus"',
            '<header class="app-header">\n            <div id="appStatus"',
        )
        text = text.replace('aria-live="polite"></motion>', 'aria-live="polite"></div>')

    # class type row after autocomplete
    if 'id="classTypeSelect"' not in text:
        insert = """
                <div class="form-row class-type-row">
                    <div class="form-group class-type-select-wrap">
                        <label for="classTypeSelect" data-i18n="classTypeLabel">Class type</label>
                        <select id="classTypeSelect" aria-describedby="classTypeHint"></select>
                        <p id="classTypeHint" class="section-hint" data-i18n="classTypeHint"></p>
                    </div>
                    <motion class="form-group class-type-inline-actions">
                        <span class="form-spacer-label" aria-hidden="true">&nbsp;</span>
                        <div class="class-type-action-buttons">
                            <button type="button" id="openClassTypeModalBtn" class="btn btn-outline btn-small" data-i18n="classTypeNewType">New class type</button>
                            <button type="button" id="deleteCustomClassTypeBtn" class="btn btn-outline btn-small" style="display: none;" data-i18n="classTypeDelete">Delete type</button>
                        </div>
                    </div>
                </div>
""".replace("motion", "motion")
        insert = insert.replace("motion", "motion").replace("<motion class", "<div class").replace("</motion>", "</div>")
        text = text.replace(
            '<motion id="classNameSuggestions" class="autocomplete-dropdown"></div>'.replace("motion", "div"),
            '<div id="classNameSuggestions" class="autocomplete-dropdown"></motion>\n' + insert,
        )
        if 'class-type-row' not in text:
            text = text.replace(
                '<div id="classNameSuggestions" class="autocomplete-dropdown"></div>',
                '<div id="classNameSuggestions" class="autocomplete-dropdown"></div>' + insert,
            )

    # Remove classDayOfWeek row and add meeting days - use regex
    text = re.sub(
        r'\s*<div class="form-row">\s*<div class="form-group">\s*<label for="classDayOfWeek"[^>]*>.*?</select>\s*</div>\s*\n\s*<div class="form-group">\s*<label for="classColor"',
        """
                <div class="form-row form-row-meeting-days">
                    <div class="form-group form-group-meeting-days">
                        <label data-i18n="meetingDays">Meeting days</label>
                        <p class="section-hint" data-i18n="meetingDaysHint"></p>
                        <div class="meeting-days-block">
                            <motion class="meeting-days-presets"></div>
                            <div id="classMeetingDaysRow" class="meeting-days-row" role="group" aria-label="Meeting days"></motion>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="classColor""
        .replace("motion", "div"),
        text,
        count=1,
        flags=re.DOTALL,
    )

    if 'id="classTypeModal"' not in text:
        modal = """
    <div id="classTypeModal" class="modal">
        <div class="modal-content modal-small">
            <div class="modal-header">
                <h2 data-i18n="classTypeCreateTitle">Create a class type</h2>
                <button type="button" class="modal-close" id="closeClassTypeModal" aria-label="Close">&times;</button>
            </div>
            <form id="classTypeForm">
                <div class="form-group">
                    <label for="newClassTypeName" data-i18n="classTypeName">Type name</label>
                    <input type="text" id="newClassTypeName" required maxlength="80" data-i18n-placeholder="classTypeNamePlaceholder">
                </div>
                <div class="form-group">
                    <label for="newClassTypeTotalLessons" data-i18n="totalLessons">Total Lessons</label>
                    <input type="number" id="newClassTypeTotalLessons" min="1" value="8" required>
                </div>
                <div class="form-group">
                    <label data-i18n="meetingDays">Meeting days</label>
                    <p class="section-hint" data-i18n="classTypeMeetingDaysHint"></p>
                    <div class="meeting-days-block">
                        <div class="meeting-days-presets"></div>
                        <motion id="newClassTypeMeetingDaysRow" class="meeting-days-row" role="group"></div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" data-i18n="classTypeSave">Save type</button>
                </motion>
            </form>
        </div>
    </div>
""".replace("motion", "div").replace("</motion>", "</div>")
        text = text.replace("    <!-- Holiday Modal -->", modal + "\n    <!-- Holiday Modal -->")

    text = text.replace(
        'data-i18n="bySection">By section (A/B/C):</label>',
        'data-i18n="bySection">By Simson level:</label>',
    )

    # Grade select: keep only placeholder
    text = re.sub(
        r'(<select id="classGrade">.*?<option value="" data-i18n="selectGrade">)[^<]*(</option>)\s*(?:<option[^>]*>.*?</option>\s*)+',
        r'\1Select grade (optional)\2\n                        ',
        text,
        count=1,
        flags=re.DOTALL,
    )

    if 'js/schedule-core.js' not in text:
        text = text.replace(
            '    <script src="app.js"></script>',
            '    <script src="js/schedule-core.js"></script>\n    <script src="js/utils.js"></script>\n    <script src="app.js"></script>',
        )

    return text


def main():
    app = APP.read_text(encoding="utf-8")
    app = patch_app(app)
    APP.write_text(app, encoding="utf-8")
    print("patched app.js", APP.stat().st_size)

    html = HTML.read_text(encoding="utf-8")
    html = patch_html(html)
    HTML.write_text(html, encoding="utf-8")
    print("patched index.html", HTML.stat().st_size)


if __name__ == "__main__":
    main()
