# Design mockups

Reference HTML from Claude Design for side-by-side implementation verification.

| File | Scene | Use |
|------|-------|-----|
| `essays-redesign.html` | `SCENE-ESSAYS` | Essay panel: deadlines strip, stat bar, two-stage status cells |

## Verification gate (required before UI PR is done)

1. `npm start` → hard refresh
2. Screenshot running component beside mockup region (light + dark)
3. Token audit on diff: no raw hex / off-grid px in changed CSS
4. EN + KO label width check
5. Design-Rules §5 checklist ticked in PR description

Open mockups in a browser (JS required for bundled exports).
