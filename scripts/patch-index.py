import pathlib
import re

d = "di" + "v"
HTML = pathlib.Path(__file__).resolve().parent.parent / "index.html"
t = HTML.read_text(encoding="utf-8")

t = t.replace(
    '<button id="langToggleBtn" class="btn btn-outline btn-lang">??? ?????/button>',
    '<button type="button" id="langToggleBtn" class="btn btn-outline btn-lang" data-i18n="langToggle">🌐 한국어</button>',
)

if 'id="appStatus"' not in t:
    t = t.replace(
        "<header class=\"app-header\">",
        f"<header class=\"app-header\">\n            <{d} id=\"appStatus\" class=\"app-status\" role=\"status\" aria-live=\"polite\"></{d}>\n            ",
    )

if 'id="classTypeSelect"' not in t:
    row = f"""
                <{d} class="form-row class-type-row">
                    <{d} class="form-group class-type-select-wrap">
                        <label for="classTypeSelect" data-i18n="classTypeLabel">Class type</label>
                        <select id="classTypeSelect" aria-describedby="classTypeHint"></select>
                        <p id="classTypeHint" class="section-hint" data-i18n="classTypeHint"></p>
                    </{d}>
                    <{d} class="form-group class-type-inline-actions">
                        <span class="form-spacer-label" aria-hidden="true">&nbsp;</span>
                        <{d} class="class-type-action-buttons">
                            <button type="button" id="openClassTypeModalBtn" class="btn btn-outline btn-small" data-i18n="classTypeNewType">New class type</button>
                            <button type="button" id="deleteCustomClassTypeBtn" class="btn btn-outline btn-small" style="display: none;" data-i18n="classTypeDelete">Delete type</button>
                        </{d}>
                    </{d}>
                </{d}>
"""
    needle = f'<{d} id="classNameSuggestions" class="autocomplete-dropdown"></{d}>'
    t = t.replace(needle, needle + row)

if "classDayOfWeek" in t:
    meeting = f"""
                <{d} class="form-row form-row-meeting-days">
                    <{d} class="form-group form-group-meeting-days">
                        <label data-i18n="meetingDays">Meeting days</label>
                        <p class="section-hint" data-i18n="meetingDaysHint"></p>
                        <{d} class="meeting-days-block">
                            <{d} class="meeting-days-presets"></{d}>
                            <{d} id="classMeetingDaysRow" class="meeting-days-row" role="group" aria-label="Meeting days"></{d}>
                        </{d}>
                    </{d}>
"""
    t = re.sub(
        r'\s*<div class="form-row">\s*<div class="form-group">\s*<label for="classDayOfWeek"[^>]*>.*?</select>\s*</div>\s*',
        meeting,
        t,
        count=1,
        flags=re.DOTALL,
    )

if 'id="classTypeModal"' not in t:
    modal = f"""
    <{d} id="classTypeModal" class="modal">
        <{d} class="modal-content modal-small">
            <{d} class="modal-header">
                <h2 data-i18n="classTypeCreateTitle">Create a class type</h2>
                <button type="button" class="modal-close" id="closeClassTypeModal" aria-label="Close">&times;</button>
            </{d}>
            <form id="classTypeForm">
                <{d} class="form-group">
                    <label for="newClassTypeName" data-i18n="classTypeName">Type name</label>
                    <input type="text" id="newClassTypeName" required maxlength="80">
                </{d}>
                <{d} class="form-group">
                    <label for="newClassTypeTotalLessons" data-i18n="totalLessons">Total lessons</label>
                    <input type="number" id="newClassTypeTotalLessons" min="1" value="8" required>
                </{d}>
                <{d} class="form-group">
                    <label data-i18n="meetingDays">Meeting days</label>
                    <p class="section-hint" data-i18n="classTypeMeetingDaysHint"></p>
                    <{d} class="meeting-days-block">
                        <{d} class="meeting-days-presets"></{d}>
                        <{d} id="newClassTypeMeetingDaysRow" class="meeting-days-row" role="group"></{d}>
                    </{d}>
                </{d}>
                <{d} class="form-actions">
                    <button type="submit" class="btn btn-primary" data-i18n="classTypeSave">Save type</button>
                </{d}>
            </form>
        </{d}>
    </{d}>

"""
    t = t.replace("    <!-- Holiday Modal -->", modal + "    <!-- Holiday Modal -->")

t = t.replace(
    'data-i18n="bySection">By section (A/B/C):</label>',
    'data-i18n="bySection">By Simson level:</label>',
)

t = re.sub(
    r'(<select id="classGrade">\s*<option value="" data-i18n="selectGrade">)[^<]*(</option>)(?:\s*<option[^>]*>.*?</option>)*',
    r'\1Select grade (optional)\2',
    t,
    count=1,
    flags=re.DOTALL,
)

if "js/schedule-core.js" not in t:
    t = t.replace(
        '    <script src="app.js"></script>',
        '    <script src="js/schedule-core.js"></script>\n'
        '    <script src="js/utils.js"></script>\n'
        '    <script src="app.js"></script>',
    )

HTML.write_text(t, encoding="utf-8")
print("patched index.html", len(t))
