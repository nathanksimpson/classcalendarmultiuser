"""Apply code-review patches to app.js only."""
import pathlib

APP = pathlib.Path(__file__).resolve().parent.parent / "app.js"


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f"MISSING: {label}")
    return text.replace(old, new, 1)


def main():
    t = APP.read_text(encoding="utf-8")

    t = rep(t, """function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}""", """function escapeHtml(s) {
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
}""", "escapeHtml")

    t = rep(t, """function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="item-match">$1</span>');
}""", """function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const safeText = escapeHtml(text);
    const safeQuery = escapeRegExp(query);
    const regex = new RegExp(`(${safeQuery})`, 'gi');
    return safeText.replace(regex, '<span class="item-match">$1</span>');
}""", "highlightMatch")

    t = rep(t, """    classNames.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `
            <input type="checkbox" name="holidayClass" value="${name}">
            ${name}
        `;
        container.appendChild(label);
    });""", """    classNames.forEach(name => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'holidayClass';
        cb.value = name;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        container.appendChild(label);
    });""", "holiday checkboxes")

    t = rep(t, """    if (hasGrades && holiday.grades.includes(classData.grade)) {
        return true;
    }""", """    // Grade-targeted holidays skip classes with no grade set; school-band filters still apply.
    if (hasGrades && classData.grade && holiday.grades.includes(classData.grade)) {
        return true;
    }""", "isHolidayForClass")

    old_holiday = """// Get holiday that covers a specific date (handles both single dates and ranges)
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
}"""

    new_holiday = """function getHolidayEventsList() {
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
}"""
    t = rep(t, old_holiday, new_holiday, "holiday functions")

    t = rep(t, """            eventBar.innerHTML = `
                <span class="event-title">${classData.name} - ${lesson.label}</span>
                <span class="event-book">${bookLabel}</span>
            `;""", """            const titleSpan = document.createElement('span');
            titleSpan.className = 'event-title';
            titleSpan.textContent = `${classData.name} - ${lesson.label}`;
            const bookSpan = document.createElement('span');
            bookSpan.className = 'event-book';
            bookSpan.textContent = bookLabel;
            eventBar.appendChild(titleSpan);
            eventBar.appendChild(bookSpan);""", "eventBar")

    if "function appendSummaryTableRow" not in t:
        t = rep(t, "function updatePrintSummary() {", """function appendSummaryTableRow(tbody, cellTexts) {
    const row = document.createElement('tr');
    cellTexts.forEach(cellText => {
        const td = document.createElement('td');
        td.textContent = cellText ?? '';
        row.appendChild(td);
    });
    tbody.appendChild(row);
}

function updatePrintSummary() {""", "appendSummaryTableRow")

    t = rep(t, """    appData.classes.forEach(classData => {
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
    });""", """    appData.classes.forEach(classData => {
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
    });""", "class summary")

    t = rep(t, """            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${getEventTypeLabel(ev.type)}</td>
                <td>${ev.name}</td>
                <td>${dateText}</td>
                <td>${appliesToText}</td>
            `;
            eventTableBody.appendChild(row);""", """            appendSummaryTableRow(eventTableBody, [
                getEventTypeLabel(ev.type),
                ev.name,
                dateText,
                appliesToText
            ]);""", "event summary")

    t = rep(t, "        const sortedHolidays = [...appData.holidays].sort((a, b) => {", "        const sortedHolidays = [...getHolidayEventsList()].sort((a, b) => {", "holiday sort")

    t = rep(t, """            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${holiday.name}</td>
                <td>${dateText}</td>
                <td>${appliesToText}</td>
            `;
            holidayTableBody.appendChild(row);""", "            appendSummaryTableRow(holidayTableBody, [holiday.name, dateText, appliesToText]);", "holiday summary")

    t = rep(t, """        let lessonsHtml = lessons.map(l => {
            const mk = l.monthKey || formatDateISO(l.date).slice(0, 7);
            const bk = l.book != null && l.book !== '' ? l.book : getBookForMonthKey(classData, mk);
            return `<li>${l.label}: ${formatDateDisplay(formatDateISO(l.date))} — ${bk}</li>`;
        }).join('');
        
        itemDiv.innerHTML = `
            <h4>${classData.name} (${getClassLevelDisplay(classData)})</h4>
            <ul>${lessonsHtml}</ul>
        `;""", """        const h4 = document.createElement('h4');
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
        itemDiv.appendChild(ul);""", "lesson summary")

    old_ac = (
        "    // Build dropdown HTML\n"
        "    let html = `<motion class=\"autocomplete-hint\" data-i18n=\"selectToAutofill\">${t('selectToAutofill') || 'Select to auto-fill fields:'}</motion>`;\n"
    )
    # fix - use div in file
    old_ac = (
        "    // Build dropdown HTML\n"
        "    let html = `<div class=\"autocomplete-hint\" data-i18n=\"selectToAutofill\">${t('selectToAutofill') || 'Select to auto-fill fields:'}</div>`;\n"
        "    \n"
        "    uniqueClasses.forEach((classData, index) => {\n"
        "        const displayName = highlightMatch(classData.name, inputValue);\n"
        "        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;\n"
        "        html += `\n"
        "            <div class=\"autocomplete-item\" data-index=\"${index}\" data-class-id=\"${classData.id}\">\n"
        "                <div class=\"item-name\">${displayName}</motion>\n"
        "                <div class=\"item-details\">${details}</div>\n"
        "            </div>\n"
        "        `;\n"
        "    });\n"
        "    \n"
        "    dropdown.innerHTML = html;"
    )
    old_ac = old_ac.replace(
        '<motion class=\"item-name\">${displayName}</motion>',
        '<motion class=\"item-name\">${displayName}</motion>',
    )
    old_ac = (
        "    // Build dropdown HTML\n"
        "    let html = `<div class=\"autocomplete-hint\" data-i18n=\"selectToAutofill\">${t('selectToAutofill') || 'Select to auto-fill fields:'}</div>`;\n"
        "    \n"
        "    uniqueClasses.forEach((classData, index) => {\n"
        "        const displayName = highlightMatch(classData.name, inputValue);\n"
        "        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;\n"
        "        html += `\n"
        "            <div class=\"autocomplete-item\" data-index=\"${index}\" data-class-id=\"${classData.id}\">\n"
        "                <div class=\"item-name\">${displayName}</div>\n"
        "                <motion class=\"item-details\">${details}</div>\n"
        "            </div>\n"
        "        `;\n"
        "    });\n"
        "    \n"
        "    dropdown.innerHTML = html;"
    )
    old_ac = old_ac.replace('<motion class=\"item-details\">', '<div class=\"item-details\">')

    new_ac = (
        "    dropdown.innerHTML = '';\n"
        "    const hintEl = document.createElement('div');\n"
        "    hintEl.className = 'autocomplete-hint';\n"
        "    hintEl.setAttribute('data-i18n', 'selectToAutofill');\n"
        "    hintEl.textContent = t('selectToAutofill') || 'Select to auto-fill fields:';\n"
        "    dropdown.appendChild(hintEl);\n"
        "\n"
        "    uniqueClasses.forEach((classData, index) => {\n"
        "        const item = document.createElement('div');\n"
        "        item.className = 'autocomplete-item';\n"
        "        item.dataset.index = String(index);\n"
        "        item.dataset.classId = classData.id;\n"
        "        const nameEl = document.createElement('div');\n"
        "        nameEl.className = 'item-name';\n"
        "        nameEl.innerHTML = highlightMatch(classData.name, inputValue);\n"
        "        const detailsEl = document.createElement('div');\n"
        "        detailsEl.className = 'item-details';\n"
        "        detailsEl.textContent = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;\n"
        "        item.appendChild(nameEl);\n"
        "        item.appendChild(detailsEl);\n"
        "        dropdown.appendChild(item);\n"
        "    });"
    )
    if old_ac in t:
        t = t.replace(old_ac, new_ac, 1)
    else:
        print("WARN: autocomplete block missing")

    t = rep(t, """function computeScheduleCacheKey() {
    return JSON.stringify({
        classes: appData.classes,
        events: appData.events,
        holidays: appData.holidays
    });
}""", """function computeScheduleCacheKey() {
    return JSON.stringify({
        classes: appData.classes,
        events: appData.events
    });
}""", "cache key")

    if "function getPersistedAppData" not in t:
        t = rep(t, "function saveDataToLocalCache() {", """function getPersistedAppData() {
    syncHolidaysFromEvents();
    const payload = JSON.parse(JSON.stringify(appData));
    delete payload.holidays;
    return payload;
}

function saveDataToLocalCache() {""", "getPersistedAppData")

    t = rep(t, "    localStorage.setItem('classCalendarData', JSON.stringify(appData));", """    try {
        localStorage.setItem('classCalendarData', JSON.stringify(getPersistedAppData()));
    } catch (err) {
        console.error('localStorage save failed:', err);
        showAppStatus(t('storageQuotaError'), true);
    }""", "save local")

    t = rep(t, "            return JSON.parse(JSON.stringify(appData));", "            return getPersistedAppData();", "team save payload")

    t = rep(t, "function exportData() {\n    const dataStr = JSON.stringify(appData, null, 2);", "function exportData() {\n    const dataStr = JSON.stringify(getPersistedAppData(), null, 2);", "export")

    t = rep(t, "let teamSyncEnabled = false;", "let teamSyncEnabled = false;\nlet calendarNameSaveTimer = null;", "timer var")

    t = rep(t, """    elements.calendarName.addEventListener('input', (e) => {
        appData.calendarName = e.target.value;
        saveData();
        updateCalendarTitle();
    });""", """    elements.calendarName.addEventListener('input', (e) => {
        appData.calendarName = e.target.value;
        updateCalendarTitle();
        clearTimeout(calendarNameSaveTimer);
        calendarNameSaveTimer = setTimeout(() => saveData(), 400);
    });""", "debounce name")

    t = rep(t, """function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();""", """function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm(t('confirmImportOverwrite'))) {
        e.target.value = '';
        return;
    }
    
    const reader = new FileReader();""", "import confirm")

    t = rep(t, "                    alert(t('importSuccess'));", "                    showAppStatus(t('importSuccess'));", "import status")

    t = rep(t, "    alert(t('clearDataSuccess'));", "    showAppStatus(t('clearDataSuccess'));", "clear status")

    if "function showAppStatus" not in t:
        t = rep(t, "// ============================================\n// Modal Functions", """// ============================================
// App status banner
// ============================================
function showAppStatus(message, isError = false) {
    const el = document.getElementById('appStatus');
    if (!el) {
        if (isError) console.error(message);
        return;
    }
    el.textContent = message;
    el.classList.toggle('app-status-error', !!isError);
    el.classList.add('app-status-visible');
    clearTimeout(showAppStatus._timer);
    showAppStatus._timer = setTimeout(() => el.classList.remove('app-status-visible'), 5000);
}

// ============================================
// Modal Functions""", "showAppStatus")

    if "modalFocusStack" not in t:
        t = rep(t, "function openModal(modal) {\n    modal.classList.add('active');\n}", """const modalFocusStack = [];

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
    if (!focusable.length) return;
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
}""", "openModal")

        t = rep(t, "function closeModal(modal) {\n    modal.classList.remove('active');\n}", """function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    const entry = modalFocusStack.pop();
    if (entry && entry.modal === modal) {
        modal.removeEventListener('keydown', entry.keyHandler);
        if (entry.previousFocus && entry.previousFocus.focus) entry.previousFocus.focus();
    }
}""", "closeModal")

    if "confirmImportOverwrite" not in t:
        t = rep(t, "        importSuccess: 'Data imported successfully!',", """        confirmImportOverwrite: 'Replace all calendar data in this browser with the imported file? Export a backup first if you are unsure.',
        storageQuotaError: 'Could not save — browser storage is full. Export your calendar and remove old data.',
        emptyGradeHolidayHint: 'If a class has no grade, it will not match grade-specific holidays (school-wide bands still apply).',
        importSuccess: 'Data imported successfully!',""", "i18n en")

        t = rep(t, "        importSuccess: '데이터를 성공적으로 가져왔습니다!',", """        confirmImportOverwrite: '이 브라우저의 모든 캘린더 데이터를 가져온 파일로 바꿀까요? 확실하지 않으면 먼저보내기로 백업하세요.',
        storageQuotaError: '저장할 수 없습니다 — 브라우저 저장 공간이 가득 찼습니다. 캘린더를보낸 뒤 오래된 데이터를 지우세요.',
        emptyGradeHolidayHint: '학년이 없는 수업은 학년별 휴일에 해당하지 않습니다(초·중 전체 휴일은 그대로 적용).',
        importSuccess: '데이터를 성공적으로 가져왔습니다!',""", "i18n ko")

    APP.write_text(t, encoding="utf-8")
    print("OK", APP.stat().st_size)


if __name__ == "__main__":
    main()
