import fs from 'fs';
import path from 'path';

const file = path.join(import.meta.dirname, '..', 'js', 'help-guide.js');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const tail = lines.slice(536).join('\n');
const head = `/**
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

`;
const out = head + tail.replace(
    'global.CCPHelpGuide = {\n        GUIDE,',
    'global.CCPHelpGuide = {\n        loadGuideContent,\n        getGuide,'
);
fs.writeFileSync(file, out);
console.log('Wrote', file, fs.statSync(file).size, 'bytes');
