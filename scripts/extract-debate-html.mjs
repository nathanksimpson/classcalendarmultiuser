/**
 * Extract debate UI from Debate Teams.dc.html (Claude handoff).
 * Usage: node scripts/extract-debate-html.mjs [path-to-Debate Teams.dc.html]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const refPath =
    process.argv[2] ||
    path.join(root, 'design_handoff_debate_teams', 'Debate Teams.dc.html');

if (!fs.existsSync(refPath)) {
    console.error('Reference HTML not found:', refPath);
    process.exit(1);
}

const html = fs.readFileSync(refPath, 'utf8');

const scriptMatch = html.match(
    /<script[^>]*type="text\/x-dc"[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/i
);
if (!scriptMatch) {
    console.error('Could not find data-dc-script block');
    process.exit(1);
}

const scriptBody = scriptMatch[1];
const componentStart = scriptBody.indexOf('class Component extends DCLogic');
if (componentStart < 0) {
    console.error('Component class not found');
    process.exit(1);
}

let depth = 0;
let componentEnd = -1;
let inClass = false;
for (let i = componentStart; i < scriptBody.length; i++) {
    const ch = scriptBody[i];
    if (ch === '{') {
        depth++;
        inClass = true;
    } else if (ch === '}') {
        depth--;
        if (inClass && depth === 0) {
            componentEnd = i + 1;
            break;
        }
    }
}

if (componentEnd < 0) {
    console.error('Could not find end of Component class');
    process.exit(1);
}

const componentSource = scriptBody.slice(componentStart, componentEnd);
const componentOut = path.join(root, 'js', 'debate', 'debate-teams-v2-source.js');
fs.writeFileSync(
    componentOut,
    `// Auto-extracted from design_handoff_debate_teams/Debate Teams.dc.html\n${componentSource}\n`
);
console.log('Wrote', componentOut, componentSource.length, 'chars');

const helmetMatch = html.match(/<helmet[^>]*>[\s\S]*?<style>([\s\S]*?)<\/style>/i);
if (helmetMatch) {
    const helmetCssPath = path.join(root, 'scripts', '_extracted-debate-helmet.css');
    fs.writeFileSync(helmetCssPath, helmetMatch[1].trim() + '\n');
    console.log('Wrote helmet CSS reference:', helmetCssPath);
}

console.log('Template and debate-teams-v2.css are maintained in-repo; compare against .dc.html inline styles.');
