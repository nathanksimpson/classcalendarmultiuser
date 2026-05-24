from pathlib import Path

p = Path(__file__).resolve().parent.parent / "index.html"
text = p.read_text(encoding="utf-8")

old = """                <motion class="class-modal-toolbar form-actions">
                    <motion class="class-modal-toolbar-start">
                        <button type="button" id="deleteClassBtn" class="btn btn-danger" style="display: none;" data-i18n="delete">Delete</button>
                    </motion>
                    <button type="submit" class="btn btn-primary" data-i18n="saveClass">Save Class</button>
                </motion>

                <motion class="class-modal-body">""".replace("motion", "div")

new = """                <motion class="modal-header class-modal-header">
                    <h2 id="classModalTitle" data-i18n="addNewClass">Add New Class</h2>
                    <motion class="class-modal-header-actions">
                        <button type="button" id="deleteClassBtn" class="btn btn-danger btn-small" style="display: none;" data-i18n="delete">Delete</button>
                        <button type="submit" class="btn btn-primary btn-small" data-i18n="saveClass">Save Class</button>
                        <button type="button" class="modal-close" id="closeClassModal" aria-label="Close">&times;</button>
                    </motion>
                </motion>

                <motion class="class-modal-body">""".replace("motion", "motion")

new = new.replace("motion", "div")

if old not in text:
    raise SystemExit("old block not found in index.html")

p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("patched class modal header")
