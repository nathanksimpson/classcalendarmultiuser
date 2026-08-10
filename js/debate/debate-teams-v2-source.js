// Auto-extracted from design_handoff_debate_teams/Debate Teams.dc.html
class Component extends DCLogic {
  static FORMATS = {
    ap: { name: 'Asia Parliamentary (AP)', min: 4, govName: 'Proposition', oppName: 'Opposition',
      govRoles: [{ abbr: 'PM', name: 'Prime Minister' }, { abbr: 'DPM', name: 'Deputy Prime Minister' }, { abbr: 'GW', name: 'Government Whip', isWhip: true }],
      oppRoles: [{ abbr: 'LO', name: 'Leader of Opposition' }, { abbr: 'DLO', name: 'Deputy Leader of Opposition' }, { abbr: 'OW', name: 'Opposition Whip', isWhip: true }],
      reply: { gov: { abbr: 'GR', name: 'Government Reply', isReply: true }, opp: { abbr: 'OR', name: 'Opposition Reply', isReply: true } },
      order: ['PM', 'LO', 'DPM', 'DLO', 'GW', 'OW', 'OR', 'GR'] },
    bp: { name: 'British Parliamentary (BP)', min: 8, fourTeam: true,
      benches: [{ id: 'og', name: 'Opening Government' }, { id: 'oo', name: 'Opening Opposition' }, { id: 'cg', name: 'Closing Government' }, { id: 'co', name: 'Closing Opposition' }],
      roles: { og: [{ abbr: 'PM', name: 'Prime Minister' }, { abbr: 'DPM', name: 'Deputy Prime Minister' }],
        oo: [{ abbr: 'LO', name: 'Leader of Opposition' }, { abbr: 'DLO', name: 'Deputy Leader of Opposition' }],
        cg: [{ abbr: 'MG', name: 'Member of Government' }, { abbr: 'GW', name: 'Government Whip', isWhip: true }],
        co: [{ abbr: 'MO', name: 'Member of Opposition' }, { abbr: 'OW', name: 'Opposition Whip', isWhip: true }] },
      order: ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW'] },
    wudc: { name: 'WUDC (World Universities)', min: 8, fourTeam: true,
      benches: [{ id: 'og', name: 'Opening Government' }, { id: 'oo', name: 'Opening Opposition' }, { id: 'cg', name: 'Closing Government' }, { id: 'co', name: 'Closing Opposition' }],
      roles: { og: [{ abbr: 'PM', name: 'Prime Minister' }, { abbr: 'DPM', name: 'Deputy Prime Minister' }],
        oo: [{ abbr: 'LO', name: 'Leader of Opposition' }, { abbr: 'DLO', name: 'Deputy Leader of Opposition' }],
        cg: [{ abbr: 'MG', name: 'Member of Government' }, { abbr: 'GW', name: 'Government Whip', isWhip: true }],
        co: [{ abbr: 'MO', name: 'Member of Opposition' }, { abbr: 'OW', name: 'Opposition Whip', isWhip: true }] },
      order: ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW'] },
    policy: { name: 'Policy Debate (CX)', min: 4, govName: 'Affirmative', oppName: 'Negative',
      govRoles: [{ abbr: '1A', name: 'First Affirmative' }, { abbr: '2A', name: 'Second Affirmative' }],
      oppRoles: [{ abbr: '1N', name: 'First Negative' }, { abbr: '2N', name: 'Second Negative' }],
      order: ['1AC', '1NC', '2AC', '2NC'],
      aliases: { '1AC': '1A', '2AC': '2A', '1NC': '1N', '2NC': '2N' } },
    ld: { name: 'Lincoln-Douglas (LD)', min: 2, oneVsOne: true, govName: 'Affirmative', oppName: 'Negative',
      govRoles: [{ abbr: 'AFF', name: 'Affirmative' }],
      oppRoles: [{ abbr: 'NEG', name: 'Negative' }],
      order: ['AC', 'NC'], aliases: { AC: 'AFF', NC: 'NEG' } },
    pf: { name: 'Public Forum (PF)', min: 4, govName: 'Pro', oppName: 'Con',
      govRoles: [{ abbr: '1st Pro', name: 'First Speaker Pro' }, { abbr: '2nd Pro', name: 'Second Speaker Pro' }],
      oppRoles: [{ abbr: '1st Con', name: 'First Speaker Con' }, { abbr: '2nd Con', name: 'Second Speaker Con' }],
      order: ['1st Pro', '1st Con', '2nd Pro', '2nd Con'] },
    bf: { name: 'Balloon/Forum Debate (BF)', min: 4, govName: 'Team A', oppName: 'Team B',
      govRoles: [{ abbr: 'A1', name: 'Speaker 1' }, { abbr: 'A2', name: 'Speaker 2' }, { abbr: 'A3', name: 'Speaker 3' }],
      oppRoles: [{ abbr: 'B1', name: 'Speaker 1' }, { abbr: 'B2', name: 'Speaker 2' }, { abbr: 'B3', name: 'Speaker 3' }],
      order: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'] },
    knc: { name: 'KNC (Korea National Congress)', min: 4, govName: 'Affirmative', oppName: 'Negative',
      govRoles: [{ abbr: 'Aff Rep', name: 'Affirmative Representative' }, { abbr: 'Aff 2', name: 'Affirmative Second' }],
      oppRoles: [{ abbr: 'Neg Rep', name: 'Negative Representative' }, { abbr: 'Neg 2', name: 'Negative Second' }],
      order: ['Aff Rep', 'Neg Rep', 'Aff 2', 'Neg 2'] },
    simson: { name: 'Simson Format', min: 4, govName: 'Government', oppName: 'Opposition',
      govRoles: [{ abbr: 'PM', name: 'Prime Minister' }, { abbr: 'DPM', name: 'Deputy Prime Minister' }, { abbr: 'DPM2', name: 'Deputy Prime Minister 2' }],
      oppRoles: [{ abbr: 'LO', name: 'Leader of Opposition' }, { abbr: 'DLO', name: 'Deputy Leader of Opposition' }, { abbr: 'DLO2', name: 'Deputy Leader of Opposition 2' }],
      order: ['PM', 'LO', 'DPM', 'DLO', 'DPM2', 'DLO2'] },
    simple: { name: 'Simple (No Roles)', min: 4, govName: 'Proposition', oppName: 'Opposition',
      govRoles: [], oppRoles: [], order: [] }
  };

  static COLORS = { gov: '#3d6b5e', opp: '#8c4a3f', og: '#3d6b5e', oo: '#8c4a3f', cg: '#2b4f45', co: '#6d3630' };
  static STORE_KEY = 'debateTeamsApp_v2';

  state = {
    students: [], newName: '', pasteOpen: false, pasteText: '',
    formatId: 'ap', includeReply: false, maxTeamSize: 3,
    classTitle: '', hrTeacher: '', topic: '', sheetTemplate: 'garam',
    debates: [], toast: ''
  };

  shuffle(arr) {
    // Fisher–Yates: unbiased, every ordering equally likely
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  componentDidMount() {
    try {
      const raw = localStorage.getItem(Component.STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        this.setState({
          students: Array.isArray(s.students) ? s.students : [],
          formatId: Component.FORMATS[s.formatId] ? s.formatId : 'ap',
          includeReply: !!s.includeReply,
          maxTeamSize: s.maxTeamSize || 3,
          classTitle: s.classTitle || '',
          hrTeacher: s.hrTeacher || '',
          topic: s.topic || '',
          sheetTemplate: s.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam',
          debates: Array.isArray(s.debates) ? s.debates : []
        });
      }
    } catch (e) {}
  }

  set(patch) {
    this.setState(patch);
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => {
      try {
        const { students, formatId, includeReply, maxTeamSize, classTitle, hrTeacher, topic, sheetTemplate, debates } = this.state;
        localStorage.setItem(Component.STORE_KEY, JSON.stringify({ students, formatId, includeReply, maxTeamSize, classTitle, hrTeacher, topic, sheetTemplate, debates }));
      } catch (e) {}
    }, 150);
  }

  showToast(msg) {
    this.set({ toast: msg });
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.set({ toast: '' }), 2200);
  }

  baseFmt(id) { return Component.FORMATS[id] || Component.FORMATS.ap; }

  fmt() {
    const base = this.baseFmt(this.state.formatId);
    const f = { ...base };
    if (this.state.includeReply && base.reply) {
      f.govRoles = [...base.govRoles, { ...base.reply.gov }];
      f.oppRoles = [...base.oppRoles, { ...base.reply.opp }];
    }
    return f;
  }

  effOrder(f) {
    // only tokens whose role actually exists in this generation (e.g. drop OR/GR when reply speeches are off)
    const has = new Set();
    if (f.fourTeam) Object.values(f.roles).forEach(rs => rs.forEach(r => has.add(r.abbr)));
    else { (f.govRoles || []).forEach(r => has.add(r.abbr)); (f.oppRoles || []).forEach(r => has.add(r.abbr)); }
    return (f.order || []).filter(t => {
      const base = String(t).replace('*', '');
      return has.has((f.aliases && f.aliases[base]) || base);
    });
  }

  effMax(f) {
    if (f.fourTeam) return 2;
    if (f.oneVsOne) return 1;
    const v = parseInt(this.state.maxTeamSize, 10);
    return isNaN(v) ? 3 : Math.min(10, Math.max(1, v));
  }

  // ---------- generation ----------
  genTwo(list, f) {
    const maxPer = this.effMax(f) * 2;
    const d = Math.max(1, Math.ceil(list.length / maxPer));
    const sizes = Array(d).fill(0);
    for (let i = 0; i < list.length; i++) sizes[i % d]++;
    for (let i = 0; i < sizes.length; i++) {
      for (let j = i + 1; j < sizes.length; j++) {
        if (sizes[i] % 2 === 1 && sizes[j] % 2 === 1 && sizes[i] + 1 <= maxPer && sizes[j] - 1 >= 2) { sizes[i]++; sizes[j]--; }
      }
    }
    let idx = 0;
    const out = [];
    sizes.forEach(sz => {
      if (sz < 2) return;
      const chunk = list.slice(idx, idx + sz);
      idx += sz;
      const gov = [], opp = [];
      chunk.forEach((name, i) => {
        const arr = i % 2 === 0 ? gov : opp;
        const roles = i % 2 === 0 ? f.govRoles : f.oppRoles;
        arr.push({ name, role: roles[arr.length] ? { ...roles[arr.length] } : null, present: '', rebut: '' });
      });
      out.push({ number: out.length + 1, formatId: this.state.formatId, fourTeam: false, notes: '', order: this.effOrder(f),
        benches: [{ id: 'gov', label: f.govName, members: gov }, { id: 'opp', label: f.oppName, members: opp }] });
    });
    return out;
  }

  genFour(list, f) {
    const out = [];
    let idx = 0;
    const seat = ['og', 'oo', 'og', 'oo', 'cg', 'co', 'cg', 'co'];
    while (idx + 8 <= list.length) {
      const chunk = list.slice(idx, idx + 8);
      idx += 8;
      const benches = f.benches.map(b => ({ id: b.id, label: b.name, members: [] }));
      chunk.forEach((name, i) => {
        const b = benches.find(x => x.id === seat[i]);
        const roles = f.roles[seat[i]];
        b.members.push({ name, role: roles[b.members.length] ? { ...roles[b.members.length] } : null, present: '', rebut: '' });
      });
      out.push({ number: out.length + 1, formatId: this.state.formatId, fourTeam: true, notes: '', order: this.effOrder(f), benches });
    }
    const left = list.slice(idx);
    if (left.length >= 4) {
      const gov = [], opp = [];
      left.forEach((name, i) => {
        const arr = i % 2 === 0 ? gov : opp;
        const roles = i % 2 === 0 ? f.roles.og : f.roles.oo;
        arr.push({ name, role: roles[arr.length] ? { ...roles[arr.length] } : null, present: '', rebut: '' });
      });
      out.push({ number: out.length + 1, formatId: this.state.formatId, fourTeam: false, simplified: true, notes: '', order: ['PM', 'LO', 'DPM', 'DLO'],
        benches: [{ id: 'gov', label: 'Government', members: gov }, { id: 'opp', label: 'Opposition', members: opp }] });
    } else if (left.length && out.length) {
      const benches = out[out.length - 1].benches;
      left.forEach((name, i) => benches[i % benches.length].members.push({ name, role: null, present: '', rebut: '' }));
    }
    return out;
  }

  hasEdits() {
    return this.state.debates.some(d => (d.notes && d.notes.trim()) ||
      d.benches.some(b => b.members.some(m => (m.present && m.present.trim()) || (m.rebut && m.rebut.trim()))));
  }

  generate = () => {
    const f = this.fmt();
    const n = this.state.students.length;
    if (n < f.min) { alert('Please add at least ' + f.min + ' students for ' + f.name + '.'); return; }
    if (this.state.debates.length && this.hasEdits()) {
      if (!confirm('Regenerating creates new random teams. Notes and argument fields will be cleared. Continue?')) return;
    }
    const shuffled = this.shuffle(this.state.students);
    const debates = f.fourTeam ? this.genFour(shuffled, f) : this.genTwo(shuffled, f);
    this.set({ debates });
  };

  // ---------- member updates ----------
  updMember(di, bi, mi, key, val) {
    const debates = this.state.debates.slice();
    debates[di] = { ...debates[di], benches: debates[di].benches.slice() };
    debates[di].benches[bi] = { ...debates[di].benches[bi], members: debates[di].benches[bi].members.slice() };
    debates[di].benches[bi].members[mi] = { ...debates[di].benches[bi].members[mi], [key]: val };
    this.set({ debates });
  }

  // ---------- score sheets ----------
  // Score sheets show only the English name when a chip reads "김나은 (Naeun)"
  exportName(name) {
    const m = String(name).match(/\(\s*([A-Za-z][^)]*)\)/);
    return m ? m[1].trim() : name;
  }

  speakers() {
    const out = [];
    this.state.debates.forEach(d => {
      const f = this.baseFmt(d.formatId);
      const rank = new Map();
      (d.order || f.order || []).forEach((t, i) => {
        const base = String(t).replace('*', '');
        const abbr = (f.aliases && f.aliases[base]) || base;
        if (!rank.has(abbr)) rank.set(abbr, i);
      });
      const all = [];
      d.benches.forEach(b => b.members.forEach(m => {
        if (!m.name) return;
        all.push({ name: this.exportName(m.name), roleAbbr: m.role ? m.role.abbr : '', debate: String(d.number), bench: b.label,
          _r: m.role && rank.has(m.role.abbr) ? rank.get(m.role.abbr) : 999 });
      }));
      all.sort((a, b) => a._r - b._r);
      out.push(...all);
    });
    return out;
  }

  ctx() {
    return {
      classTitle: this.state.classTitle.trim(),
      hrTeacher: this.state.hrTeacher.trim(),
      dateStr: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
      formatName: this.baseFmt(this.state.formatId).name,
      speakers: this.speakers()
    };
  }

  dateFile() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  tplKey() { return this.state.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam'; }

  tplUrl(tpl) {
    const r = typeof window !== 'undefined' && window.__resources;
    if (r && r[tpl.key + 'Docx']) return r[tpl.key + 'Docx'];
    return tpl.file;
  }

  exportWord = async () => {
    if (!this.state.debates.length) { alert('Generate assignments first.'); return; }
    if (typeof PizZip === 'undefined') { alert('Word export library did not load. Check your connection and refresh.'); return; }
    try {
      const m = await import('./scoresheet.js');
      const tpl = m.TEMPLATES[this.tplKey()];
      const res = await fetch(this.tplUrl(tpl));
      if (!res.ok) throw new Error('Could not load ' + tpl.file + ' — keep it next to the app file.');
      const out = m.fillDocx(await res.arrayBuffer(), this.ctx(), PizZip, tpl);
      this.download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        'Debate-Feedback-' + tpl.label.replace('–', '-') + '-' + this.dateFile() + '.docx');
    } catch (e) {
      alert('Word export failed: ' + (e && e.message ? e.message : e));
    }
  };

  exportPdf = async () => {
    if (!this.state.debates.length) { alert('Generate assignments first.'); return; }
    if (typeof html2pdf === 'undefined') { alert('PDF library did not load. Check your connection and refresh.'); return; }
    const m = await import('./scoresheet.js');
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;pointer-events:none;z-index:-1;background:#fff';
    el.innerHTML = m.buildPdfHtml(this.ctx(), m.TEMPLATES[this.tplKey()]);
    document.body.appendChild(el);
    try {
      await html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: 'Debate-Feedback-' + this.dateFile() + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      }).from(el).save();
    } catch (e) {
      alert('PDF export failed: ' + (e && e.message ? e.message : e) + '\n\nTip: Download Word for the exact school score sheet.');
    } finally {
      document.body.removeChild(el);
    }
  };

  printSheets = async () => {
    if (!this.state.debates.length) { alert('Generate assignments first.'); return; }
    const m = await import('./scoresheet.js');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Allow pop-ups for this page to print score sheets.'); return; }
    win.document.write(m.buildPrintHtml(this.ctx(), m.TEMPLATES[this.tplKey()]));
    win.document.close();
    win.focus();
    win.print();
  };

  // ---------- copy ----------
  copy = () => {
    const s = this.state;
    let text = (s.classTitle.trim() || 'DEBATE TEAM ASSIGNMENTS') + '\n';
    if (s.topic.trim()) text += 'Motion: ' + s.topic.trim() + '\n';
    text += 'Format: ' + this.baseFmt(s.formatId).name + '\n' + '='.repeat(40) + '\n\n';
    s.debates.forEach(d => {
      text += 'DEBATE ' + d.number + '\n' + '-'.repeat(20) + '\n';
      d.benches.forEach(b => {
        text += b.label + ':\n';
        b.members.forEach(m => {
          text += '  * ' + m.name + (m.role ? ' (' + m.role.abbr + ')' : '') + '\n';
          if (m.present && m.present.trim()) text += '    Present: ' + m.present.trim() + '\n';
          if (m.rebut && m.rebut.trim()) text += '    Rebut: ' + m.rebut.trim() + '\n';
        });
      });
      if (d.notes && d.notes.trim()) text += 'Notes: ' + d.notes.trim() + '\n';
      text += '\n';
    });
    navigator.clipboard.writeText(text).then(
      () => this.showToast('Results copied to clipboard'),
      () => this.showToast('Copy failed — select and copy manually')
    );
  };

  // ---------- backup ----------
  exportJson = () => {
    const { students, formatId, includeReply, maxTeamSize, classTitle, hrTeacher, topic, sheetTemplate, debates } = this.state;
    const data = { app: 'debate-teams', version: 2, exportedAt: new Date().toISOString(),
      students, formatId, includeReply, maxTeamSize, classTitle, hrTeacher, topic, sheetTemplate, debates };
    this.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      'debate-teams-backup-' + this.dateFile() + '.json');
    this.showToast('Backup downloaded');
  };

  importFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app === 'debate-teams' && Array.isArray(data.students)) {
          if ((this.state.students.length || this.state.debates.length) &&
              !confirm('Loading a backup replaces your current students and assignments. Continue?')) return;
          this.set({
            students: data.students,
            formatId: Component.FORMATS[data.formatId] ? data.formatId : 'ap',
            includeReply: !!data.includeReply,
            maxTeamSize: data.maxTeamSize || 3,
            classTitle: data.classTitle || '',
            hrTeacher: data.hrTeacher || '',
            topic: data.topic || '',
            sheetTemplate: data.sheetTemplate === 'yeoul' ? 'yeoul' : 'garam',
            debates: Array.isArray(data.debates) ? data.debates : []
          });
          this.showToast('Backup loaded');
        } else if (data.app === 'debate-team-randomizer') {
          // old-app backup: bring over students + settings; regenerate assignments
          if ((this.state.students.length || this.state.debates.length) &&
              !confirm('This is a backup from the old app. Students and settings will load; assignments must be regenerated. Continue?')) return;
          const st = data.settings || {};
          this.set({
            students: Array.isArray(data.students) ? data.students : [],
            formatId: Component.FORMATS[st.formatId] ? st.formatId : 'ap',
            includeReply: !!st.includeReply,
            maxTeamSize: st.maxTeamSize || 3,
            classTitle: st.classTitle || '',
            hrTeacher: st.hrTeacher || '',
            debates: []
          });
          this.showToast('Old backup loaded — press Generate teams');
        } else {
          alert('This file is not a recognised backup from this app.');
        }
      } catch (err) {
        alert('Could not read backup file: ' + (err.message || err));
      }
    };
    reader.onerror = () => alert('Could not read the selected file.');
    reader.readAsText(file);
  };

  // ---------- students ----------
  addName = () => {
    const name = this.state.newName.trim();
    if (!name) return;
    if (this.state.students.includes(name)) { this.showToast('"' + name + '" is already in the list'); return; }
    this.set({ students: [...this.state.students, name], newName: '' });
  };

  // Extracts "김나은 (Naeun)" pairs from academy roster exports (촬영 알림 / SMS dumps)
  parseRoster(text) {
    const out = [];
    const re = /([가-힣]{2,4})\s*★*\s*\n?\s*\(\s*([A-Za-z][A-Za-z\-\.' ]*)\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1] + ' (' + m[2].trim() + ')';
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }

  looksLikeRoster(text) {
    return /촬영\s*알림|\tSMS|출석\s*지각|Test Point/.test(text);
  }

  addPaste = () => {
    const raw = this.state.pasteText;
    let names;
    if (this.looksLikeRoster(raw)) {
      names = this.parseRoster(raw);
      if (!names.length) names = raw.split('\n').map(n => n.trim()).filter(Boolean);
    } else {
      names = raw.split('\n')
        .map(n => n.replace(/^\s*\d+[\.\)]\s*/, '').replace(/★+/g, '').trim())
        .filter(Boolean);
    }
    let added = 0;
    const students = [...this.state.students];
    names.forEach(n => { if (!students.includes(n)) { students.push(n); added++; } });
    this.set({ students, pasteText: added ? '' : this.state.pasteText, pasteOpen: !added });
    this.showToast(added ? 'Added ' + added + ' student' + (added === 1 ? '' : 's') : 'No new names to add');
  };

  formatSummary(f) {
    if (f.fourTeam) return '4 benches of 2 (' + f.min + ' per room) · ' + f.order.join(' → ');
    if (f.oneVsOne) return '1 v 1 · values & philosophy';
    const g = f.govRoles.map(r => r.abbr).join(', ');
    const o = f.oppRoles.map(r => r.abbr).join(', ');
    if (!f.govRoles.length) return 'Two teams, no assigned roles · min ' + f.min;
    return f.govRoles.length + ' v ' + f.oppRoles.length + ' · ' + g + ' / ' + o + ' · min ' + f.min;
  }

  renderVals() {
    const s = this.state;
    const f = this.fmt();
    const C = Component.COLORS;
    const showArguments = this.props.showArguments !== false;
    const showNotesVal = this.props.showNotes !== false && s.debates.length > 0;

    const studentChips = s.students.map(name => ({
      name,
      onRemove: () => this.set({ students: s.students.filter(x => x !== name) })
    }));

    const debateCards = s.debates.map((d, di) => {
      const base = this.baseFmt(d.formatId);
      return {
        num: d.number,
        formatName: base.name + (d.simplified ? ' — simplified' : ''),
        hasOrder: !!((d.order || base.order || []).length),
        orderText: (d.order || base.order || []).join(' → '),
        notes: d.notes || '',
        onNotes: (e) => {
          const debates = s.debates.slice();
          debates[di] = { ...debates[di], notes: e.target.value };
          this.set({ debates });
        },
        benches: d.benches.map((b, bi) => {
          const color = C[b.id] || '#3d6b5e';
          const isGovSide = b.id === 'gov' || b.id === 'og' || b.id === 'cg';
          return {
            label: b.label,
            color,
            members: b.members.map((m, mi) => ({
              name: m.name,
              hasRole: !!m.role,
              abbr: m.role ? m.role.abbr : '',
              roleTitle: m.role ? m.role.name : '',
              chipColor: m.role && m.role.isWhip ? '#6d675c' : color,
              chipBg: m.role && m.role.isWhip ? '#eceae2' : (isGovSide ? '#e7efeb' : '#f3e9e6'),
              showArgs: showArguments && !d.fourTeam,
              present: m.present || '',
              rebut: m.rebut || '',
              onPresent: (e) => this.updMember(di, bi, mi, 'present', e.target.value),
              onRebut: (e) => this.updMember(di, bi, mi, 'rebut', e.target.value)
            }))
          };
        })
      };
    });

    const totalAssigned = s.debates.reduce((sum, d) => sum + d.benches.reduce((t, b) => t + b.members.length, 0), 0);

    return {
      // students
      studentCount: s.students.length,
      hasStudents: s.students.length > 0,
      studentChips,
      newName: s.newName,
      onNameInput: (e) => this.set({ newName: e.target.value }),
      onNameKey: (e) => { if (e.key === 'Enter') this.addName(); },
      onAddName: this.addName,
      onClearStudents: () => { if (confirm('Remove all students?')) this.set({ students: [] }); },
      pasteOpen: s.pasteOpen,
      pasteLabel: s.pasteOpen ? 'Hide paste box' : 'Paste a list…',
      onTogglePaste: () => this.set({ pasteOpen: !s.pasteOpen }),
      pasteText: s.pasteText,
      onPasteInput: (e) => this.set({ pasteText: e.target.value }),
      onAddPaste: this.addPaste,
      // format
      formatId: s.formatId,
      onFormatChange: (e) => this.set({ formatId: e.target.value }),
      formatSummary: this.formatSummary(f),
      hasReply: !!this.baseFmt(s.formatId).reply,
      includeReply: s.includeReply,
      onToggleReply: (e) => this.set({ includeReply: e.target.checked }),
      showMaxSize: !f.fourTeam && !f.oneVsOne,
      maxTeamSize: s.maxTeamSize,
      onMaxInput: (e) => this.set({ maxTeamSize: e.target.value }),
      // class
      classTitle: s.classTitle,
      onClassInput: (e) => this.set({ classTitle: e.target.value }),
      hrTeacher: s.hrTeacher,
      onHrInput: (e) => this.set({ hrTeacher: e.target.value }),
      topic: s.topic,
      onTopicInput: (e) => this.set({ topic: e.target.value }),
      hasTopic: !!s.topic.trim(),
      // actions
      onGenerate: this.generate,
      generateLabel: s.debates.length ? 'Regenerate teams' : 'Generate teams',
      onExportJson: this.exportJson,
      onImportFile: this.importFile,
      onCopy: this.copy,
      onPrint: () => window.print(),
      sheetTemplate: s.sheetTemplate,
      onSheetTemplateChange: (e) => this.set({ sheetTemplate: e.target.value }),
      onWord: this.exportWord,
      onPdf: this.exportPdf,
      onPrintSheets: this.printSheets,
      // results
      hasDebates: s.debates.length > 0,
      noDebates: s.debates.length === 0,
      statsText: totalAssigned + ' students · ' + s.debates.length + (s.debates.length === 1 ? ' debate · ' : ' debates · ') + this.baseFmt(s.formatId).name,
      debateCards,
      showNotesVal,
      printTitle: s.classTitle.trim() || 'Debate Team Assignments',
      printMeta: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + ' · ' + this.baseFmt(s.formatId).name,
      // toast
      toast: s.toast,
      hasToast: !!s.toast
    };
  }
}
