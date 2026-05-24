# One-off patch for showClassNameSuggestions DOM safety
import pathlib

path = pathlib.Path(__file__).resolve().parent.parent / "app.js"
text = path.read_text(encoding="utf-8")
marker_start = "    // Build dropdown HTML\n"
marker_end = "    dropdown.classList.add('active');\n"
start = text.find(marker_start)
end = text.find(marker_end, start)
if start == -1 or end == -1:
    raise SystemExit(f"markers not found: start={start}, end={end}")

replacement = """    dropdown.innerHTML = '';
    const hintEl = document.createElement('motion');
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
    });

"""
replacement = replacement.replace("motion", "div")
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding="utf-8")
print("patched autocomplete")
