import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const refPath =
    '\\\\simson-jsl\\simson-jsl\\잠실르엘\\2. 교수팀개인\\심나단 (Nathan)\\Apps In Development\\Cursor Builds\\Debate Team Randomizer\\index.html';
const outPath = path.join(__dirname, '..', 'templates', 'classroom-debate-teams-body.html');

const html = fs.readFileSync(refPath, 'utf8');
const start = html.indexOf('<details id="setup-details"');
const end = html.indexOf('</nav>', start);
if (start < 0 || end < 0) {
    console.error('markers not found');
    process.exit(1);
}
const fragment = html.slice(start, end + '</nav>'.length);
const wrapped = `<div class="classroom-debate-panel">\n${fragment}\n</div>\n`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, wrapped);
console.log('Wrote', outPath, wrapped.length);
