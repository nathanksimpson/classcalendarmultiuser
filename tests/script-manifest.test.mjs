/**
 * Run: node tests/script-manifest.test.mjs
 * Guardrail: one ?v= per script path; no CSS both linked and @imported;
 * Homework Day 3 still loads students + debate-teams + debate core.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
}

function parseSrc(src) {
    const q = src.indexOf('?');
    if (q < 0) {
        return { path: src, version: '' };
    }
    const qs = src.slice(q + 1);
    const m = qs.match(/(?:^|&)v=([^&]+)/);
    return { path: src.slice(0, q), version: m ? m[1] : '' };
}

function collectQuotedScripts(source) {
    const out = [];
    const re = /['"]((?:js\/|https?:\/\/)[^'"]+\.js(?:\?[^'"]*)?)['"]/g;
    let m;
    while ((m = re.exec(source))) {
        out.push(m[1]);
    }
    return out;
}

function resolveConsts(source) {
    const consts = new Map();
    const re = /const\s+(SCRIPT_[A-Z0-9_]+)\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(source))) {
        consts.set(m[1], m[2]);
    }
    return consts;
}

function expandConstRefs(source, consts) {
    let expanded = source;
    consts.forEach((value, name) => {
        expanded = expanded.replace(new RegExp(`\\b${name}\\b`, 'g'), JSON.stringify(value));
    });
    return expanded;
}

function addVersions(map, srcList, origin) {
    srcList.forEach((src) => {
        const { path: p, version } = parseSrc(src);
        if (!map.has(p)) {
            map.set(p, new Map());
        }
        const versions = map.get(p);
        if (!versions.has(version)) {
            versions.set(version, []);
        }
        versions.get(version).push(origin);
    });
}

const indexHtml = read('index.html');
const tabScriptsSrc = read('js/app-tab-scripts.js');
const extScriptsSrc = read('js/load-extension-scripts.js');
const stylesCss = read('styles.css');

const consts = resolveConsts(tabScriptsSrc);
const tabExpanded = expandConstRefs(tabScriptsSrc, consts);

const indexScripts = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
const extScripts = collectQuotedScripts(extScriptsSrc);
const tabQuoted = collectQuotedScripts(tabExpanded);

const versionsByPath = new Map();
addVersions(versionsByPath, indexScripts, 'index.html');
addVersions(versionsByPath, extScripts, 'js/load-extension-scripts.js');
addVersions(versionsByPath, tabQuoted, 'js/app-tab-scripts.js');

const conflicts = [];
versionsByPath.forEach((versions, p) => {
    const withV = [...versions.keys()].filter((v) => v);
    if (withV.length > 1) {
        conflicts.push(`${p}: ${[...versions.entries()].map(([v, origins]) => `v=${v || '(none)'} (${origins.join(', ')})`).join(' vs ')}`);
    }
});
assert(conflicts.length === 0, `Script path has more than one ?v= value:\n${conflicts.join('\n')}`);

const linkedCss = [...indexHtml.matchAll(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map(
    (m) => parseSrc(m[1]).path.replace(/^\.\//, '')
);
const importedCss = [...stylesCss.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)].map(
    (m) => m[1].replace(/^\.\//, '')
);
const doubleCss = linkedCss.filter((href) => importedCss.includes(href));
assert(
    doubleCss.length === 0,
    `CSS is both <link>ed in index.html and @imported from styles.css: ${doubleCss.join(', ')}`
);

const debateTeamsList = tabQuoted.filter((src) => {
    /* collect from debate-teams block via expanded source */
    return true;
});
void debateTeamsList;

const debateTeamsBlock = tabExpanded.match(/['"]debate-teams['"]\s*:\s*\[([\s\S]*?)\]/);
assert(debateTeamsBlock, 'Missing TAB_SCRIPTS[\'debate-teams\']');
const debateTeamsSrcs = collectQuotedScripts(debateTeamsBlock[1]);
const debateTeamsPaths = debateTeamsSrcs.map((s) => parseSrc(s).path);
assert(
    debateTeamsPaths.includes('js/classroom-debate-teams.js'),
    'TAB_SCRIPTS[\'debate-teams\'] must include js/classroom-debate-teams.js (Homework Day 3)'
);

const coreBlock = tabExpanded.match(/DEBATE_CORE_SCRIPTS\s*=\s*\[([\s\S]*?)\]/);
assert(coreBlock, 'Missing DEBATE_CORE_SCRIPTS');
const coreSrcs = collectQuotedScripts(coreBlock[1]);
assert(coreSrcs.length >= 3, 'DEBATE_CORE_SCRIPTS must list debate core files');
coreSrcs.forEach((src) => {
    const p = parseSrc(src).path;
    assert(
        debateTeamsPaths.includes(p),
        `TAB_SCRIPTS['debate-teams'] must include DEBATE_CORE_SCRIPTS entry ${p}`
    );
});

const studentsBlock = tabExpanded.match(/students:\s*\[([\s\S]*?)\]/);
assert(studentsBlock, 'Missing TAB_SCRIPTS.students');
const studentsPaths = collectQuotedScripts(studentsBlock[1]).map((s) => parseSrc(s).path);
assert(
    studentsPaths.includes('js/classroom-roster.js'),
    'TAB_SCRIPTS.students must include js/classroom-roster.js (Homework Day 3 roster)'
);

console.log('script-manifest.test.mjs: all passed');
