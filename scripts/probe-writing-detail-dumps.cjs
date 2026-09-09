const fs = require('fs');
const path = require('path');

const dumpDir = path.join(__dirname, '_tms-dump');
const files = [
    'writing-list-get.html',
    'writing-list-my-aca.html',
    'recphotopholi-sample.html',
    'writing-list-class-30964.html'
];

for (const name of files) {
    const p = path.join(dumpDir, name);
    if (!fs.existsSync(p)) {
        console.log('missing', name);
        continue;
    }
    const h = fs.readFileSync(p, 'utf8');
    console.log('\n====', name, 'len', h.length, '====');
    console.log('has photopoliview', /photopoliview/i.test(h));
    const fn = h.match(/function\s+photopoliview\s*\([^)]*\)\s*\{[\s\S]{0,1500}?\}/i);
    if (fn) {
        console.log('FUNCTION:\n', fn[0].slice(0, 1200));
    }
    const aspx = [...h.matchAll(/["']([^"']*\.aspx[^"']*)["']/gi)].map((m) => m[1]);
    const interesting = [...new Set(aspx)].filter((u) =>
        /write|photo|poli|essay|port|lms|view|edit/i.test(u)
    );
    console.log('interesting aspx', interesting.slice(0, 40));
    const link = h.match(/photopoliview\s*\([^)]+\)/i);
    console.log('sample call', link && link[0]);
    if (/recphotopholi/i.test(name) || /txtContent|포트폴리오|textarea/i.test(h)) {
        const title = h.match(/포트폴리오제목[\s\S]{0,200}/);
        console.log('portfolio snippet', title && title[0].slice(0, 180));
        const ta = h.match(/<textarea[^>]*>[\s\S]{0,200}/i);
        console.log('textarea', ta && ta[0].slice(0, 180));
        const ids = [...h.matchAll(/id=["']([^"']+)["']/gi)].map((m) => m[1]);
        console.log(
            'ids sample',
            [...new Set(ids)].filter((id) => /txt|content|essay|edit|body|memo/i.test(id)).slice(0, 30)
        );
    }
}
