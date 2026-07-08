import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesPath = path.join(root, 'styles.css');
const cssDir = path.join(root, 'css');

/** Section markers in styles.css → output file (build maintains partials). */
const SECTION_FILES = [
    { marker: 'CSS Variables & Reset', file: 'tokens.css' },
    { marker: 'App Layout', file: 'shell.css' },
    { marker: 'Buttons', file: 'components.css' },
    { marker: 'Calendar', file: 'calendar.css' },
    { marker: 'Class notes', file: 'class-notes.css' },
    { marker: 'Page shell', file: 'page-shell.css' }
];

function splitStyles() {
    const content = readFileSync(stylesPath, 'utf8').replace(/\r\n/g, '\n');
    const parts = content.split(/\/\* ={10,}\n   ([^\n]+)\n   ={10,} \*\//);
    if (parts.length < 2) {
        console.error('Could not parse styles.css sections');
        process.exit(1);
    }
    mkdirSync(cssDir, { recursive: true });

    const preamble = parts[0];
    const sections = [];
    for (let i = 1; i < parts.length; i += 2) {
        const title = parts[i].trim();
        const body = parts[i + 1] || '';
        sections.push({ title, body });
    }

    const fileBuckets = new Map(SECTION_FILES.map((s) => [s.file, []]));
    const features = [];

    sections.forEach(({ title, body }) => {
        const match = SECTION_FILES.find((s) => title.toLowerCase().includes(s.marker.toLowerCase()));
        const chunk = `/* ${title} */\n${body}`;
        if (match) {
            fileBuckets.get(match.file).push(chunk);
        } else {
            features.push(chunk);
        }
    });

    if (preamble.trim()) {
        const tokens = fileBuckets.get('tokens.css');
        tokens.unshift(preamble.trim());
    }

    fileBuckets.forEach((chunks, file) => {
        if (chunks.length) {
            writeFileSync(path.join(cssDir, file), chunks.join('\n\n'), 'utf8');
        }
    });
    writeFileSync(path.join(cssDir, 'features.css'), features.join('\n\n'), 'utf8');

    const imports = [
        'tokens.css',
        'shell.css',
        'components.css',
        'calendar.css',
        'class-notes.css',
        'page-shell.css',
        'features.css'
    ]
        .filter((f) => existsSync(path.join(cssDir, f)))
        .map((f) => `@import url('./${f}');`)
        .join('\n');

    const entryPath = path.join(cssDir, 'index.css');
    writeFileSync(entryPath, `${imports}\n`, 'utf8');
    console.log('Split styles.css into css/ (' + imports.split('\n').length + ' partials)');
}

function concatCssForDist(entryRel, outRel) {
    const visited = new Set();
    function resolve(filePath) {
        const abs = path.join(root, filePath);
        let css = readFileSync(abs, 'utf8');
        return css.replace(/@import\s+url\(['"]?\.\/([^'")]+)['"]?\)\s*;/g, (_, rel) => {
            const importPath = path.join(path.dirname(abs), rel).replace(/\\/g, '/');
            const key = importPath;
            if (visited.has(key)) {
                return '';
            }
            visited.add(key);
            const relFromRoot = path.relative(root, importPath).replace(/\\/g, '/');
            return resolve(relFromRoot);
        });
    }
    return resolve(entryRel);
}

export { splitStyles, concatCssForDist };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    splitStyles();
}
