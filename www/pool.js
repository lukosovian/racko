// ===== RACKO MODLARI: 8 Top, 9 Top, 10 Top, Snooker =====
// ON5 kendi kodu ve durumuyla (appState) aynen çalışır; bu dosya mod seçim ekranını ve diğer oyunları ekler.
// Bu oyunların durumu "pg" içinde tutulur; Geri Al geçmişi ve cihazlar arası eşitleme ON5'tekiyle aynı mantıkta.

const PG_KEY = 'bilardo_pg';
const PG_MODES = {
    '8':       { name: '8 TOP',   balls: 15, money: 8,  sub: 'Düz ya da çizgili, sonra siyah', unit: 'RAK' },
    '9':       { name: '9 TOP',   balls: 9,  money: 9,  sub: 'En küçük topa vur, 9 kazandırır', unit: 'RAK' },
    '10':      { name: '10 TOP',  balls: 10, money: 10, sub: 'Çağrılı atış, 10 kazandırır', unit: 'RAK' },
    'snooker': { name: 'SNOOKER', sub: 'Kırmızı, renk, en yüksek seri', unit: 'FRAME' }
};
const SNK = {
    1: { n: 'Kırmızı', c: '#d32f2f', g: 'radial-gradient(circle at 35% 30%, #ff8a80, #d32f2f 55%, #7f0000)' },
    2: { n: 'Sarı',    c: '#f6d10b', g: 'radial-gradient(circle at 35% 30%, #fff59d, #f6d10b 55%, #b38f00)' },
    3: { n: 'Yeşil',   c: '#17a34a', g: 'radial-gradient(circle at 35% 30%, #86efac, #17a34a 55%, #0b5e2a)' },
    4: { n: 'Kahve',   c: '#7a4a22', g: 'radial-gradient(circle at 35% 30%, #c08a5a, #7a4a22 55%, #3d230e)' },
    5: { n: 'Mavi',    c: '#1f5fd6', g: 'radial-gradient(circle at 35% 30%, #93c5fd, #1f5fd6 55%, #0b2f7a)' },
    6: { n: 'Pembe',   c: '#f58fb6', g: 'radial-gradient(circle at 35% 30%, #ffe0ec, #f58fb6 55%, #b44a78)' },
    7: { n: 'Siyah',   c: '#151515', g: 'radial-gradient(circle at 35% 30%, #777, #1a1a1a 55%, #000)' }
};

let pg = null;          // aktif 8/9/10/snooker maçı
let pgHist = [];        // geri al
let pgMatches = [];     // biten maçlar
let pgLink = { push: 0, pop: 0, applying: false };
let pgSetupCfg = null, pgSetupSlot = 1;
let pgFoulCfg = null;

const pgOther = p => 3 - p;
const pgClone = o => JSON.parse(JSON.stringify(o));
const pgBall = (n, cls = '', attrs = '') => `<div class="pool-ball b-${n} ${cls}" ${attrs}><span>${n}</span></div>`;
const pgName = p => (pg && pg.names && pg.names[p]) || (p === 1 ? 'OYUNCU 1' : 'OYUNCU 2');

// ---------- KAYIT ----------
function pgLoad() {
    try { pg = JSON.parse(localStorage.getItem(PG_KEY)) || null; } catch (e) { pg = null; }
    try { pgHist = JSON.parse(localStorage.getItem(PG_KEY + '_undo')) || []; } catch (e) { pgHist = []; }
    try { pgMatches = JSON.parse(localStorage.getItem(PG_KEY + '_matches')) || []; } catch (e) { pgMatches = []; }
}
function pgSave() {
    try {
        localStorage.setItem(PG_KEY, JSON.stringify(pg));
        localStorage.setItem(PG_KEY + '_undo', JSON.stringify(pgHist));
    } catch (e) {}
    pgAfterSave();
}
function pgSaveMatches() {
    try { localStorage.setItem(PG_KEY + '_matches', JSON.stringify(pgMatches)); } catch (e) {}
}
// Diğer telefona gönder (Geri Al geçmişi iki tarafta eşit kalsın diye eklenen/çıkarılan sayısı da gider)
function pgAfterSave() {
    if (pgLink.applying) return;
    if (!link.peers || !link.synced) { pgLink.push = pgLink.pop = 0; return; }
    linkSend({ t: 'pg', state: pg, push: pgLink.push, pop: pgLink.pop, screen: currentScreen });
    pgLink.push = pgLink.pop = 0;
}
function pgSendFull() {
    if (!link.peers || !link.synced) return;
    linkSend({ t: 'pgfull', state: pg, hist: pgHist, screen: currentScreen });
}
function pgOnRemote(msg, full) {
    pgLink.applying = true;
    try {
        let prev = pg;
        if (full) pgHist = Array.isArray(msg.hist) ? msg.hist : [];
        else {
            for (let i = 0; i < (msg.pop || 0); i++) pgHist.pop();
            for (let i = 0; i < (msg.push || 0); i++) { pgHist.push(pgClone(pg)); if (pgHist.length > 80) pgHist.shift(); }
        }
        pg = msg.state || null;
        pgSave();
        if (msg.pop || full) ['pgDlg', 'pgMenu'].forEach(id => { let el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (pg && pg.finished && !(prev && prev.matchId === pg.matchId && prev.finished)) { pgRecord(); }
        if (pg && !pg.finished) { let e = document.getElementById('pgEndModal'); if (e) e.style.display = 'none'; }
        let newMatch = pg && (!prev || prev.matchId !== pg.matchId);
        if (msg.screen === 'pgGame' && pg && currentScreen !== 'pgGame' && (newMatch || full || ['hub', 'pgSetup', 'home'].includes(currentScreen))) showScreen('pgGame');
        if (currentScreen === 'pgGame') { if (!pg) showScreen('hub'); else pgRender(); }
        if (currentScreen === 'hub') renderHub();
        if (pg && pg.finished && currentScreen === 'pgGame' && prev && prev.matchId === pg.matchId && !prev.finished) pgOpenEnd();
    } finally {
        pgLink.applying = false;
    }
}

// Her hamleden önce anlık görüntü alınır (Geri Al)
function pgAct(fn) {
    pgHist.push(pgClone(pg));
    if (pgHist.length > 80) pgHist.shift();
    pgLink.push++;
    fn();
    pgSave();
    pgRender();
}
function pgUndo() {
    if (!pgHist.length) { pgToast('Geri alınacak hamle yok'); return; }
    let wasFinished = pg && pg.finished;
    pg = pgHist.pop();
    pgLink.pop++;
    pgSave();
    closeModal('pgEndModal');
    pgRender();
    haptic('light');
    if (wasFinished && !pg.finished) pgToast('Maç sonu geri alındı');
}

// ---------- MAÇ ----------
function pgEmptyStats() {
    return { fouls: 0, bnr: 0, golden: 0, breaks: 0, breakWins: 0, hb: 0, fifty: 0, century: 0, points: 0, pots: 0 };
}
function pgNewRack() {
    pg.turn = pg.breaker;
    if (pg.mode === 'snooker') {
        pg.rack = { s: { 1: 0, 2: 0 }, reds: pg.reds, phase: 'red', next: 2, brk: 0, free: false, turnChanges: 0 };
    } else {
        pg.rack = { potted: [], by: {}, groups: { 1: null, 2: null }, fouls: { 1: 0, 2: 0 }, bih: null, isBreak: true, push: false, turnChanges: 0, breakPots: 0 };
    }
    pg.stats[pg.breaker].breaks++;
    pg.rackNo = (pg.rackNo || 0) + 1;
}
function pgStartMatch(cfg) {
    let first = cfg.first === 'kura' ? (Math.random() < 0.5 ? 1 : 2) : cfg.first;
    pg = {
        mode: cfg.mode, matchId: Date.now(), names: { 1: normName(cfg.names[1]) || 'OYUNCU 1', 2: normName(cfg.names[2]) || 'OYUNCU 2' },
        raceTo: cfg.raceTo, breakRule: cfg.breakRule, reds: cfg.reds,
        frames: { 1: 0, 2: 0 }, breaker: first, turn: first, rackNo: 0,
        startedAt: Date.now(), finishedAt: null, finished: false, winner: null,
        log: [], stats: { 1: pgEmptyStats(), 2: pgEmptyStats() }, rack: null
    };
    pgNewRack();
    rememberPlayer(pg.names[1]); rememberPlayer(pg.names[2]);
    pgHist = [];
    pgHideCelebrate();
    try { localStorage.setItem(PG_KEY + '_last', JSON.stringify(cfg)); } catch (e) {}
    pgLink.applying = true; pgSave(); pgLink.applying = false;
    showScreen('pgGame');
    pgSendFull();
    if (cfg.first === 'kura') pgToast(`🪙 Kura: ${pgName(first)} açıyor`);
}
function pgRematch() {
    closeModal('pgEndModal');
    let names = pg.names;
    pgStartMatch({ mode: pg.mode, names: { 1: names[1], 2: names[2] }, raceTo: pg.raceTo, breakRule: pg.breakRule, reds: pg.reds, first: pg.winner ? pgOther(pg.winner) : 'kura' });
}

// Rak / frame bitti
function pgRackWin(w, note) {
    let r = pg.rack, st = pg.stats;
    let entry = { w, b: pg.breaker, note: note || '' };
    if (pg.mode === 'snooker') {
        pgSnkCloseBreak();
        entry.s = { 1: r.s[1], 2: r.s[2] };
        st[1].points += r.s[1]; st[2].points += r.s[2];
    } else {
        if (w === pg.breaker && r.turnChanges === 0 && note !== 'foul3') { st[w].bnr++; entry.bnr = true; }
        if (note === 'golden') st[w].golden++;
    }
    if (w === pg.breaker) st[w].breakWins++;
    pg.log.push(entry);
    pg.frames[w]++;
    let celebrate = { w, bnr: entry.bnr, note };
    if (pg.raceTo > 0 && pg.frames[w] >= pg.raceTo) {
        pg.finished = true; pg.winner = w; pg.finishedAt = Date.now();
        pg.rack.done = true;
        setTimeout(() => { pgRecord(); playMatchWinSound(); haptic('success'); pgOpenEnd(); }, 50);
        return;
    }
    pg.breaker = pg.mode === 'snooker' || pg.breakRule === 'alt' ? pgOther(pg.breaker) : w;
    pgNewRack();
    setTimeout(() => pgCelebrate(celebrate), 30);
}

function pgRecord() {
    if (!pg || !pg.finished) return;
    if (pgMatches.some(m => m.id === pg.matchId)) return;
    pgMatches.push({ id: pg.matchId, mode: pg.mode, names: pg.names, frames: pg.frames, winner: pg.winner, raceTo: pg.raceTo,
        date: new Date(pg.finishedAt || Date.now()).toLocaleString('tr-TR'), mins: Math.round(((pg.finishedAt || Date.now()) - pg.startedAt) / 60000),
        log: pg.log, stats: pg.stats });
    if (pgMatches.length > 200) pgMatches.shift();
    pgSaveMatches();
}

// ---------- HAVUZ (8 / 9 / 10 TOP) ----------
function pgAllBalls() {
    let n = PG_MODES[pg.mode].balls;
    return Array.from({ length: n }, (_, i) => i + 1);
}
function pgOnTable() { return pgAllBalls().filter(b => !pg.rack.potted.includes(b)); }
function pgLowest() { let t = pgOnTable(); return t.length ? Math.min(...t) : null; }
function pgGroupBalls(g) { return g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]; }
function pgGroupLeft(p) {
    let g = pg.rack.groups[p];
    return g ? pgGroupBalls(g).filter(b => !pg.rack.potted.includes(b)).length : null;
}

// ON5'teki gibi: oyuncu kendi tarafına dokunur → giren topları ve faulü işaretler → YAZ.
// Iska yazılmaz; sırası gelen kendi vuruşunu yazınca sıra kendiliğinden ona geçer.
let pgShot = null;
function pgSetTurn(p) {
    if (!pg || pg.finished) return;
    if (pg.mode === 'snooker') return;
    pgOpenShot(p);
}
function pgSetGroup(p, g) {
    pgAct(() => { pg.rack.groups[p] = g; pg.rack.groups[pgOther(p)] = g === 'solid' ? 'stripe' : 'solid'; });
}
function pgOpenShot(p) {
    pgShot = { p, sel: [], cin: false, cmiss: false, coff: false, wrong: false, uncalled: false, push: false };
    pgRenderShot();
    document.getElementById('pgShotModal').style.display = 'flex';
}
function pgShotIsBreak(s) { return pg.rack.isBreak && s.p === pg.breaker; }
function pgShotPushOk(s) {
    let r = pg.rack;
    return pg.mode !== '8' && ((r.push && pg.turn === s.p) || (r.isBreak && s.p !== pg.breaker));
}
function pgShotFoul(s) { return s.cin || s.cmiss || s.coff; }
// Vuruşun sonucu (yazmadan önce düğmede gösterilir)
function pgShotOutcome(s) {
    let r = pg.rack, M = PG_MODES[pg.mode].money, p = s.p;
    let foul = pgShotFoul(s), money = s.sel.includes(M), brk = pgShotIsBreak(s);
    let others = s.sel.filter(b => b !== M);
    if (s.push && !foul) return { kind: 'push' };
    if (money) {
        if (pg.mode === '8' && !brk) {
            let g = r.groups[p];
            let left = g ? pgGroupBalls(g).filter(b => !r.potted.includes(b) && !others.includes(b)).length : 99;
            return (foul || s.wrong || left > 0) ? { kind: 'lose', why: foul ? 'faul' : s.wrong ? 'yanlış delik' : 'grup bitmeden' } : { kind: 'win' };
        }
        if (pg.mode === '9' && !foul) return { kind: 'win', golden: brk };
        if (pg.mode === '10' && !foul && !brk && !s.uncalled) return { kind: 'win' };
    }
    if (foul) return { kind: 'foul' };
    if (!s.sel.length) return { kind: 'miss' };
    return { kind: 'pot', n: s.sel.length };
}
function pgRenderShot() {
    let s = pgShot, r = pg.rack, M = PG_MODES[pg.mode].money, all = pgAllBalls();
    let brk = pgShotIsBreak(s), low = pgLowest();
    let hint = brk ? 'AÇILIŞ VURUŞU · giren topları işaretle' : '';
    if (!brk) {
        if (pg.mode === '8') {
            let g = r.groups[s.p];
            hint = g ? `Grubun: ${g === 'solid' ? 'DÜZ' : 'ÇİZGİLİ'} · ${pgGroupLeft(s.p)} top kaldı` : 'Açık masa · ilk sokulan top grubu belirler';
        } else if (low) hint = `Önce ${low} numaraya değmeli`;
    }
    hint += ' · Hiçbir şey seçmeden YAZ = ıska';
    let slots = all.map(b => {
        let gone = r.potted.includes(b), on = s.sel.includes(b);
        return `<div class="shot-slot ${gone ? 'gone' : ''} ${on ? 'st-in' : 'st-off'}" ${gone ? '' : `onclick="pgShotToggle(${b})"`}>
            <div class="shot-ball">${pgBall(b)}</div><div class="shot-cap">${on ? (b === M ? '★' : '✓') : ''}</div></div>`;
    }).join('');
    let chip = (k, label) => `<button class="shot-chip ${s[k] ? 'on' : ''}" onclick="pgShot.${k}=!pgShot.${k}; pgRenderShot()">${label}</button>`;
    let chips = [chip('cin', '⚪ Beyaz girdi'), chip('cmiss', '🚫 Değmedi / yanlış top'), chip('coff', '⬆ Top dışarı')];
    if (s.sel.includes(M) && !brk && pg.mode === '8') chips.push(chip('wrong', '8 yanlış deliğe'));
    if (s.sel.includes(M) && !brk && pg.mode === '10') chips.push(chip('uncalled', '10 çağrılmadan girdi'));
    if (pgShotPushOk(s)) chips.push(chip('push', '↗ Push out'));
    let o = pgShotOutcome(s), go = '', cls = '';
    if (o.kind === 'win') { go = `🏆 RAKI ALIR${o.golden ? ' · ALTIN AÇILIŞ' : ''}`; }
    else if (o.kind === 'lose') { go = `✗ RAKI KAYBEDER (${o.why})`; cls = 'neg'; }
    else if (o.kind === 'foul') { go = '⚠ FAUL YAZ'; cls = 'neg'; }
    else if (o.kind === 'push') { go = 'PUSH OUT YAZ'; cls = 'zero'; }
    else if (o.kind === 'miss') { go = 'ISKA · SIRA GEÇER'; cls = 'zero'; }
    else go = `YAZ · ${o.n} top`;
    document.getElementById('pgShotBody').innerHTML = `
        <div class="shot-head">
            <h3>${escapeHtml(pgName(s.p))}</h3>
            <div class="shot-hint">${hint}</div>
            <button class="close-btn" onclick="closeModal('pgShotModal')">X</button>
        </div>
        <div class="shot-balls">${slots}</div>
        <div class="shot-foot pg-shot-foot">${chips.join('')}<button class="shot-go ${cls}" onclick="pgCommitShot()">${go}</button></div>`;
}
function pgShotToggle(b) {
    let s = pgShot;
    s.sel = s.sel.includes(b) ? s.sel.filter(x => x !== b) : [...s.sel, b];
    pgRenderShot();
}
function pgCommitShot() {
    let s = pgShot;
    closeModal('pgShotModal');
    let o = pgShotOutcome(s);
    let ask3 = false;
    pgAct(() => { ask3 = pgApplyShot(s); });
    if (o.kind === 'pot' || o.kind === 'win') { playScoreSound(); haptic('light'); }
    else if (o.kind === 'foul' || o.kind === 'lose') { playMinusSound(); haptic('warning'); }
    else playClickSound();
    if (ask3) {
        let p = s.p, op = pgOther(p);
        pgDialog('3. FAUL', `<p><b>${escapeHtml(pgName(p))}</b> üst üste 3. faulünü yaptı mı? (Bu rakta, arada kurallı bir vuruşu olmadan.)</p>`, [
            { cls: 'lose', label: `Evet → ${escapeHtml(pgName(op))} RAKI ALIR`, sub: '3 ardışık faul kuralı', fn: () => pgAct(() => { pg.rack.fouls[p] = 0; pgRackWin(op, 'foul3'); }) },
            { label: 'Hayır, arada kurallı vuruşu vardı', sub: 'Faul sayacı 1 olur', fn: () => pgAct(() => { pg.rack.fouls[p] = 1; }) }
        ]);
    }
}
// Vuruşu uygular; 3. ardışık faulde sorulması gerekiyorsa true döner
function pgApplyShot(s) {
    let r = pg.rack, p = s.p, o = pgOther(p), M = PG_MODES[pg.mode].money;
    let brk = pgShotIsBreak(s), out = pgShotOutcome(s), foul = pgShotFoul(s);
    let others = s.sel.filter(b => b !== M);
    if (pg.turn !== p) { pg.turn = p; r.turnChanges++; }
    r.isBreak = false;
    others.forEach(b => { if (!r.potted.includes(b)) { r.potted.push(b); r.by[b] = p; } });
    if (!foul && out.kind !== 'push') pg.stats[p].pots += others.length;
    if (out.kind === 'win') { pg.stats[p].pots++; pgRackWin(p, out.golden ? 'golden' : ''); return false; }
    if (out.kind === 'lose') { if (foul) pg.stats[p].fouls++; pgRackWin(o, 'loss8'); return false; }
    // Para topu girdi ama rakı bitirmedi: ayak noktasına geri konur
    if (s.sel.includes(M)) setTimeout(() => pgToast(`${M} geri konuldu`), 20);
    // 8 top: açık masada ilk kurallı sokulan top grubu belirler
    if (pg.mode === '8' && !brk && !foul && !r.groups[1] && !r.groups[2] && others.length) {
        let g = others[0] < 8 ? 'solid' : 'stripe';
        r.groups[p] = g; r.groups[o] = g === 'solid' ? 'stripe' : 'solid';
        setTimeout(() => pgToast(`${pgName(p)}: ${g === 'solid' ? 'DÜZ (1-7)' : 'ÇİZGİLİ (9-15)'}`), 20);
    }
    r.push = false;
    if (out.kind === 'push') { r.bih = null; pg.turn = o; r.turnChanges++; return false; }
    if (foul) {
        r.fouls[p]++; pg.stats[p].fouls++;
        pg.turn = o; r.turnChanges++; r.bih = o;
        return pg.mode !== '8' && r.fouls[p] >= 3;
    }
    r.fouls[p] = 0; r.bih = null;
    // Devam eder mi? Kurallı top soktuysa evet (8 topta grup belliyse kendi grubundan biri girmeli)
    let cont = others.length > 0 || (brk && s.sel.includes(M));
    if (pg.mode === '8' && r.groups[p] && !brk) cont = others.some(b => pgGroupBalls(r.groups[p]).includes(b));
    if (pg.mode === '10' && s.uncalled) cont = false;
    if (!cont) { pg.turn = o; r.turnChanges++; }
    else if (brk && pg.mode !== '8') r.push = true;
    return false;
}

// ---------- SNOOKER ----------
function pgSnkRemaining(r) {
    if (r.phase === 'respot') return 7;
    let cols = r.phase === 'clear' ? [2, 3, 4, 5, 6, 7].filter(v => v >= r.next).reduce((a, b) => a + b, 0) : 27;
    return r.reds * 8 + (r.phase === 'color' ? 7 : 0) + cols;
}
function pgSnkCloseBreak() {
    let r = pg.rack, s = pg.stats[pg.turn];
    if (r.brk > s.hb) s.hb = r.brk;
    if (r.brk >= 100) s.century++; else if (r.brk >= 50) s.fifty++;
    r.brk = 0;
}
function pgSnkNormalize(r) {
    if (r.phase === 'color') { r.phase = r.reds > 0 ? 'red' : 'clear'; r.next = 2; }
    if (r.phase === 'red' && r.reds <= 0) { r.phase = 'clear'; r.next = 2; }
}
// Her oyuncunun topları kendi tarafında. Diğer oyuncu yazınca sıra kendiliğinden ona geçer (ıska yazılmaz).
function pgSnkView(p) {
    let r = pg.rack;
    if (pg.turn === p || r.phase === 'respot') return { phase: r.phase, next: r.next, free: r.free };
    let ph = r.phase, nx = r.next;
    if (ph === 'color') { ph = r.reds > 0 ? 'red' : 'clear'; nx = 2; }
    if (ph === 'red' && r.reds <= 0) { ph = 'clear'; nx = 2; }
    return { phase: ph, next: nx, free: false };
}
function pgSnkCanPot(v, p) {
    let r = pg.rack, w = pgSnkView(p);
    return (w.phase === 'red' && v === 1 && r.reds > 0)
        || (w.phase === 'color' && (v >= 2 || (v === 1 && r.reds > 0)))
        || ((w.phase === 'clear' || w.phase === 'respot') && v === w.next);
}
// Sıra başka oyuncudaysa: onun serisi biter, sıra bu oyuncuya geçer
function pgSnkTake(p) {
    let r = pg.rack;
    if (pg.turn === p) return;
    pgSnkCloseBreak();
    pgSnkNormalize(r);
    r.free = false;
    pg.turn = p;
    r.turnChanges++;
}
function pgSnkPot(v, p) {
    if (!pg || pg.finished) return;
    if (!pgSnkCanPot(v, p)) {
        let w = pgSnkView(p);
        let need = w.phase === 'red' ? 'Kırmızı' : w.phase === 'color' ? 'bir renk' : SNK[w.next].n;
        pgToast(`Sıradaki top: ${need}`); haptic('warning'); return;
    }
    pgAct(() => {
        pgSnkTake(p);
        let r = pg.rack;
        r.s[p] += v; r.brk += v; r.free = false;
        pg.stats[p].pots++;
        if (r.brk > pg.stats[p].hb) pg.stats[p].hb = r.brk;
        if (v === 1) { r.reds--; r.phase = 'color'; }
        else if (r.phase === 'color') { r.phase = r.reds > 0 ? 'red' : 'clear'; r.next = 2; }
        else if (r.phase === 'respot') { pgSnkFrameEnd(); }
        else if (v === 7) { pgSnkFrameEnd(); }
        else r.next++;
    });
    playScoreSound(); haptic('light');
}
function pgSnkFree(p) {
    pgAct(() => {
        let r = pg.rack;
        let v = r.phase === 'red' ? 1 : r.next;
        r.s[p] += v; r.brk += v; r.free = false;
        if (r.brk > pg.stats[p].hb) pg.stats[p].hb = r.brk;
        if (r.phase === 'red') r.phase = 'color';  // kırmızı yerine sayılır; kırmızı sayısı azalmaz
    });
    playScoreSound();
}
function pgSnkFoulDialog(p) {
    let w = pgSnkView(p);
    let min = w.phase === 'clear' || w.phase === 'respot' ? Math.max(4, w.next) : 4;
    pgFoulCfg = { p, pen: min, lost: 0, free: false, replay: false };
    pgRenderFoul();
    document.getElementById('pgDlg').style.display = 'flex';
}
function pgRenderFoul() {
    let r = pg.rack, c = pgFoulCfg, p = c.p, o = pgOther(p);
    let body = `
        <p><b>${escapeHtml(pgName(p))}</b> faul yaptı. Ceza puanı <b>${escapeHtml(pgName(o))}</b> oyuncusuna yazılır.</p>
        <div class="pg-pen">${[4, 5, 6, 7].map(v => `<button class="${c.pen === v ? 'on' : ''}" onclick="pgFoulCfg.pen=${v}; pgRenderFoul()">${v}</button>`).join('')}</div>
        <p style="font-size:11px; color:#999;">En az 4; ilgili top daha değerliyse onun değeri (mavi 5, pembe 6, siyah 7).</p>
        ${r.reds > 0 ? `<div class="setup-row"><div class="lbl">Faulde düşen kırmızı<small>Bunlar masaya geri konmaz</small></div>
            <div class="stepper"><button onclick="pgFoulCfg.lost=Math.max(0,pgFoulCfg.lost-1); pgRenderFoul()">−</button><div class="val">${c.lost}</div><button onclick="pgFoulCfg.lost=Math.min(${r.reds},pgFoulCfg.lost+1); pgRenderFoul()">+</button></div></div>` : ''}
        <div style="display:flex; gap:14px; flex-wrap:wrap">
        <label class="setup-check"><input type="checkbox" ${c.free ? 'checked' : ''} onchange="pgFoulCfg.free=this.checked"> Serbest top</label>
        <label class="setup-check"><input type="checkbox" ${c.replay ? 'checked' : ''} onchange="pgFoulCfg.replay=this.checked"> Faul yapan tekrar oynasın</label>
        </div>
        <button class="grid-btn" style="width:100%; justify-content:center; background:#b91c1c; border-color:#ff5555; margin-top:4px;" onclick="pgSnkFoulCommit()">FAUL YAZ: ${escapeHtml(pgName(o))} +${c.pen}</button>`;
    pgDialogRaw('FAUL', body);
}
function pgSnkFoulCommit() {
    closeModal('pgDlg');
    let c = pgFoulCfg, p = c.p, o = pgOther(p);
    pgAct(() => {
        pgSnkTake(p);
        let r = pg.rack;
        let lastBlack = (r.phase === 'clear' && r.next === 7) || r.phase === 'respot';
        r.s[o] += c.pen;
        pg.stats[p].fouls++;
        r.reds = Math.max(0, r.reds - (c.lost || 0));
        pgSnkCloseBreak();
        pgSnkNormalize(r);
        pg.turn = c.replay ? p : o;
        r.turnChanges++;
        r.free = !!c.free && !c.replay;
        if (lastBlack) pgSnkFrameEnd();
    });
    playMinusSound(); haptic('warning');
}
// Frame sonu: eşitlikte siyah yeniden konur
function pgSnkFrameEnd() {
    let r = pg.rack;
    if (r.s[1] === r.s[2]) {
        pgSnkCloseBreak();
        r.phase = 'respot'; r.next = 7; r.free = false;
        setTimeout(() => pgDialog('EŞİTLİK · SİYAH YENİDEN', `<p>Siyah kendi noktasına konur. Kurayı kazanan, beyazı D içinden yerleştirip ilk vuruşu kime yaptıracağını seçer. İlk sayı ya da faul frame'i bitirir.</p>`, [
            { label: `${escapeHtml(pgName(1))} oynuyor`, fn: () => pgAct(() => { pg.turn = 1; }) },
            { label: `${escapeHtml(pgName(2))} oynuyor`, fn: () => pgAct(() => { pg.turn = 2; }) }
        ]), 40);
        return;
    }
    pgRackWin(r.s[1] > r.s[2] ? 1 : 2);
}

// Rak / frame ver (pes)
function pgConcede() {
    closeModal('pgMenu');
    let u = PG_MODES[pg.mode].unit === 'FRAME' ? "frame'i" : 'rakı';
    pgDialog(`${u.toUpperCase()} KİM ALDI?`, `<p>Pes etme, maç dışı bir durum ya da elle düzeltme için.</p>`, [1, 2].map(p => ({
        cls: 'win', label: `${escapeHtml(pgName(p))} aldı`, fn: () => pgAct(() => {
            if (pg.mode === 'snooker' && pg.rack.s[p] <= pg.rack.s[pgOther(p)]) pg.rack.conceded = true;
            pgRackWin(p, 'concede');
        })
    })));
}

// ---------- GÖRÜNÜM ----------
function pgRender() {
    let el = document.getElementById('pgGameScreen');
    if (!el || !pg) return;
    let m = PG_MODES[pg.mode], snk = pg.mode === 'snooker';
    let cloth = snk ? '#0e5a2a' : (appState.clothColor || '#1e5b8a');
    let race = pg.raceTo > 0 ? (snk ? `${pg.raceTo * 2 - 1} FRAME'DE EN İYİ` : `${pg.raceTo}'E KADAR`) : 'LİMİTSİZ';
    let undoOk = pgHist.length > 0;
    el.innerHTML = `
    <div class="pg-table" style="--pgcloth:${cloth}">
        <div class="pg-pocket a"></div><div class="pg-pocket b"></div><div class="pg-pocket c"></div>
        <div class="pg-pocket d"></div><div class="pg-pocket e"></div><div class="pg-pocket f"></div>
        <div class="pg-top">
            <button class="pg-btn" onclick="pgExit()" title="Modlar"><i class="ic">${iconSvg('home')}</i></button>
            <div class="pg-title">${m.name}<small>${race} · ${m.unit} ${pg.rackNo}</small></div>
            ${link.role ? `<button class="link-badge ${link.role === 'host' || (link.peers && link.synced) ? 'ok' : 'wait'}" onclick="openLink()">${iconSvg('link')}<span>${link.role === 'host' ? link.peers : ''}</span></button>` : ''}
            <div class="sp"></div>
            <button class="pg-btn" onclick="pgUndo()" title="Geri Al" style="${undoOk ? '' : 'opacity:0.4'}"><i class="ic">${iconSvg('undo')}</i></button>
            <button class="pg-btn" onclick="pgOpenMenu()" title="Menü"><i class="ic">${iconSvg('menu')}</i></button>
        </div>
        <div class="pg-main">
            ${pgHalfHtml(1)}
            <div class="pg-mid">${snk ? pgSnkMidHtml() : pgPoolMidHtml()}</div>
            ${pgHalfHtml(2)}
        </div>
        ${snk ? '' : pgPoolStripHtml()}
    </div>`;
}

function pgHalfHtml(p) {
    let snk = pg.mode === 'snooker', r = pg.rack, turn = pg.turn === p && !pg.finished;
    let badges = [];
    let sub = '', foot = '';
    if (snk) {
        if (turn && r.brk > 0) badges.push(`<span class="pg-badge brk">🔥 SERİ ${r.brk}</span>`);
        else if (turn) badges.push(`<span class="pg-badge turn">SIRA SENDE</span>`);
        let diff = r.s[pgOther(p)] - r.s[p], rem = pgSnkRemaining(r);
        if (diff > rem && r.phase !== 'respot') badges.push(`<span class="pg-badge need">SNOOKER GEREKLİ · ${diff - rem}</span>`);
        sub = `<div class="pg-group"><span class="gname">FRAME</span><b style="font-size:18px">${pg.frames[p]}</b>${pg.stats[p].hb ? `<span class="gname" style="color:#aaa; margin-left:8px">EN İYİ SERİ ${pg.stats[p].hb}</span>` : ''}</div>`;
        let w = pgSnkView(p);
        let b = v => {
            let ok = pgSnkCanPot(v, p);
            let hot = ok && ((w.phase === 'red' && v === 1) || ((w.phase === 'clear' || w.phase === 'respot') && v === w.next));
            let label = v === 1 ? (w.phase === 'color' ? '+1' : '1') : v;
            return `<button class="snk-ball ${v === 1 ? 'red' : ''} ${ok ? '' : 'off'} ${hot ? 'on' : ''}" style="background:${SNK[v].g}" onclick="event.stopPropagation(); pgSnkPot(${v}, ${p})">${label}</button>`;
        };
        foot = `<div class="snk-side" onclick="event.stopPropagation()">
            <div class="snk-balls">${[1, 2, 3, 4, 5, 6, 7].map(b).join('')}</div>
            <div class="pg-acts">
                ${turn && r.free ? `<button class="pg-act gold" onclick="pgSnkFree(${p})">SERBEST TOP +${r.phase === 'red' ? 1 : r.next}</button>` : ''}
                <button class="pg-act foul" onclick="pgSnkFoulDialog(${p})">⚠ FAUL</button>
            </div></div>`;
    } else {
        if (turn) badges.push(`<span class="pg-badge turn">${r.isBreak ? '🎱 AÇILIŞ' : 'SIRA SENDE'}</span>`);
        if (r.bih === p) badges.push(`<span class="pg-badge hand">✋ TOP ELDE</span>`);
        if (turn && r.push) badges.push(`<span class="pg-badge hand">↗ PUSH OUT HAKKI</span>`);
        if (pg.mode !== '8' && r.fouls[p] >= 1) badges.push(`<span class="pg-badge ${r.fouls[p] >= 2 ? 'warn' : ''}">${r.fouls[p] >= 2 ? '⚠️ 2 FAUL · 3.de rakı kaybeder' : '1 faul'}</span>`);
        if (pg.mode === '8') {
            let g = r.groups[p];
            if (g) {
                sub = `<div class="pg-group"><span class="pg-gtag ${g}">${g === 'solid' ? 'DÜZ' : 'ÇİZGİLİ'} · ${pgGroupLeft(p)} KALDI</span></div>`;
                if (pgGroupLeft(p) === 0) badges.push(`<span class="pg-badge hand">🎱 SIRA 8'DE</span>`);
            } else {
                let pulse = r.potted.length > 0 ? 'pulse' : '';
                sub = `<div class="pg-group"><span class="gname">AÇIK MASA</span>
                    <button class="pg-gpick ${pulse}" onclick="event.stopPropagation(); pgSetGroup(${p}, 'solid')">DÜZ</button>
                    <button class="pg-gpick ${pulse}" onclick="event.stopPropagation(); pgSetGroup(${p}, 'stripe')">ÇİZGİLİ</button></div>`;
            }
        } else {
            sub = `<div class="pg-group">${r.potted.filter(b => r.by[b] === p).sort((a, b) => a - b).map(b => pgBall(b)).join('') || '<span class="gname" style="color:#777">—</span>'}</div>`;
        }
        foot = `<div class="pg-tap">👆 vuruşunu yazmak için dokun</div>`;
    }
    let big = snk ? r.s[p] : pg.frames[p];
    return `<div class="pg-half ${turn ? 'turn' : ''} ${snk ? 'snk' : ''}" onclick="pgSetTurn(${p})">
        <div class="pg-bgname">${escapeHtml(pgName(p))}</div>
        <div class="pg-name"><span>${escapeHtml(pgName(p))}</span></div>
        ${sub}
        <div class="pg-big">${big}</div>
        <div class="pg-badges">${badges.join('')}</div>
        ${foot}
    </div>`;
}

function pgPoolMidHtml() {
    let r = pg.rack, low = pgLowest();
    let h = '';
    if (pg.mode === '8') {
        h += `<div class="pg-chip"><small>MASADA</small><b>${pgOnTable().length}</b> top</div>`;
        if (!r.groups[1]) h += `<div class="pg-chip" style="color:#ffd166">AÇIK MASA</div>`;
    } else if (low) {
        h += `<div class="pg-chip pg-target"><small>VURULACAK TOP</small>${pgBall(low)}</div>`;
    }
    h += `<div class="pg-chip"><small>AÇILIŞ</small>${escapeHtml(pgName(pg.breaker))}</div>`;
    return h;
}
// Masada kalan toplar (sadece gösterim): orta delik araya girdiği için iki parça
function pgPoolStripHtml() {
    let r = pg.rack, M = PG_MODES[pg.mode].money, low = pgLowest();
    let rest = pgAllBalls().filter(b => b !== M), left, right;
    if (pg.mode === '8') {
        let g1 = r.groups[1] || 'solid';
        left = pgGroupBalls(g1); right = pgGroupBalls(g1 === 'solid' ? 'stripe' : 'solid');
    } else {
        let half = Math.ceil(rest.length / 2);
        left = rest.slice(0, half); right = rest.slice(half);
    }
    let ball = b => pgBall(b, r.potted.includes(b) ? 'gone' : (pg.mode !== '8' && b === low ? 'low' : ''));
    return `<div class="pg-strip left">${left.map(ball).join('')}</div>
            <div class="pg-strip-mid">${pgBall(M, r.potted.includes(M) ? 'gone' : 'money')}</div>
            <div class="pg-strip right">${right.map(ball).join('')}</div>`;
}

function pgSnkMidHtml() {
    let r = pg.rack, rem = pgSnkRemaining(r), diff = Math.abs(r.s[1] - r.s[2]);
    let on = r.phase === 'red' ? 'KIRMIZI' : r.phase === 'color' ? 'RENK' : SNK[r.next].n.toUpperCase();
    let onColor = r.phase === 'red' ? SNK[1].c : r.phase === 'color' ? '#fff' : SNK[r.next].c;
    return `
        <div class="pg-chip"><small>MASADA</small><b>${rem}</b></div>
        <div class="pg-chip"><small>FARK</small><b>${diff}</b></div>
        <div class="pg-chip" style="border-color:${onColor}"><small>SIRADAKİ</small><span style="color:${onColor === '#151515' ? '#fff' : onColor}">${r.phase === 'respot' ? 'SİYAH (son)' : on}</span></div>
        <div class="pg-chip"><small>KIRMIZI</small><b>${r.reds}</b></div>`;
}

// ---------- DİYALOG / MENÜ / KUTLAMA ----------
function pgDialogRaw(title, body) {
    document.getElementById('pgDlgTitle').innerText = title;
    document.getElementById('pgDlgBody').innerHTML = body;
    document.getElementById('pgDlg').style.display = 'flex';
}
let pgDlgFns = [];
function pgDialog(title, html, opts) {
    pgDlgFns = opts.map(o => o.fn);
    pgDialogRaw(title, `<div class="pg-dlg">${html}${opts.map((o, i) => `<button class="grid-btn ${o.cls || ''}" onclick="pgDlgPick(${i})"><span>${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</span></button>`).join('')}</div>`);
}
function pgDlgPick(i) { closeModal('pgDlg'); let f = pgDlgFns[i]; if (f) f(); }

function pgOpenMenu() {
    let u = pg.mode === 'snooker' ? "Frame'i ver" : 'Rakı ver';
    document.getElementById('pgMenuBody').innerHTML = `
        <button class="grid-btn" onclick="closeModal('pgMenu'); pgUndo()"><i class="ic">${iconSvg('undo')}</i>Geri Al</button>
        <button class="grid-btn" onclick="closeModal('pgMenu'); pgOpenRules(pg.mode)"><i class="ic">${iconSvg('book')}</i>Kurallar</button>
        <button class="grid-btn" onclick="closeModal('pgMenu'); openLink()"><i class="ic">${iconSvg('link')}</i>Bağlantı</button>
        <button class="grid-btn" onclick="closeModal('pgMenu'); pgOpenStats(true)"><i class="ic">${iconSvg('chart')}</i>Maç istatistiği</button>
        <button class="grid-btn" onclick="pgConcede()"><i class="ic">${iconSvg('plus')}</i>${u}</button>
        <button class="grid-btn" onclick="closeModal('pgMenu'); pgOpenSetup(pg.mode)"><i class="ic">${iconSvg('ball')}</i>Yeni maç</button>
        <button class="grid-btn" onclick="closeModal('pgMenu'); pgExit()"><i class="ic">${iconSvg('home')}</i>Modlar</button>
        <button class="grid-btn" style="color:#ff5555" onclick="closeModal('pgMenu'); pgEndMatchAsk()"><i class="ic">${iconSvg('reset')}</i>Maçı bitir</button>`;
    document.getElementById('pgMenu').style.display = 'flex';
}
function pgEndMatchAsk() {
    customConfirm('Maç bitirilsin mi? Skor olduğu gibi kaydedilir.', () => {
        pgAct(() => {
            pg.finished = true; pg.finishedAt = Date.now();
            pg.winner = pg.frames[1] === pg.frames[2] ? null : (pg.frames[1] > pg.frames[2] ? 1 : 2);
        });
        pgRecord(); pgOpenEnd();
    });
}
function pgExit() {
    pgHideCelebrate();
    showScreen('hub');
}
function pgHideCelebrate() {
    clearTimeout(pgCelebrate.t);
    let el = document.getElementById('pgCelebrate');
    if (el) el.classList.remove('show');
}

function pgCelebrate(c) {
    let el = document.getElementById('pgCelebrate');
    let unit = pg.mode === 'snooker' ? "FRAME'İ ALDI" : 'RAKI ALDI';
    let last = pg.log[pg.log.length - 1] || {};
    let extra = c.note === 'golden' ? '✨ ALTIN AÇILIŞ' : c.bnr ? '🔥 AÇ-BİTİR (BREAK & RUN)' : c.note === 'foul3' ? '3 ardışık faul' : c.note === 'loss8' ? '8 kural dışı girdi' : '';
    if (pg.mode === 'snooker' && last.s) extra = `${last.s[1]} - ${last.s[2]}` + (extra ? ' · ' + extra : '');
    el.innerHTML = `<div class="t">${unit}</div><div class="n">${escapeHtml(pgName(c.w))}</div>
        <div class="s">${c.w === 1 ? `<b>${pg.frames[1]}</b>` : pg.frames[1]} - ${c.w === 2 ? `<b>${pg.frames[2]}</b>` : pg.frames[2]}</div>
        ${extra ? `<div class="x">${extra}</div>` : ''}
        <div class="h">Sıradaki açılış: ${escapeHtml(pgName(pg.breaker))} · devam etmek için dokun</div>`;
    el.classList.add('show');
    playMatchWinSound(); haptic('success');
    clearTimeout(pgCelebrate.t);
    pgCelebrate.t = setTimeout(() => el.classList.remove('show'), 3500);
}
function pgToast(t) {
    let d = document.createElement('div');
    d.className = 'pg-toast'; d.textContent = t;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2300);
}

// ---------- MAÇ SONU / İSTATİSTİK ----------
function pgStatRows(m) {
    let s = m.stats, rows;
    if (m.mode === 'snooker') rows = [['En yüksek seri', 'hb'], ['50+ seri', 'fifty'], ['100+ seri', 'century'], ['Toplam puan', 'points'], ['Faul', 'fouls', true]];
    else {
        rows = [['Aç-bitir', 'bnr'], ['Açılışta aldığı rak', 'breakWins'], ['Sokulan top', 'pots'], ['Faul', 'fouls', true]];
        if (m.mode === '9') rows.splice(1, 0, ['Altın açılış', 'golden']);
    }
    return rows.map(([n, k, low]) => {
        let a = s[1][k] || 0, b = s[2][k] || 0;
        let best = a === b ? 0 : ((a > b) !== !!low ? 1 : 2);
        return `<tr><td style="${best === 1 ? 'color:#00e676' : ''}">${a}</td><td>${n}</td><td style="text-align:right; ${best === 2 ? 'color:#00e676' : ''}">${b}</td></tr>`;
    }).join('');
}
function pgStatsHtml(m, live, noTable) {
    let f = m.frames, w = m.winner;
    let mins = Math.round(((m.finishedAt || Date.now()) - (m.startedAt || Date.now())) / 60000);
    let frames = (m.log || []).map((e, i) => m.mode === 'snooker' && e.s
        ? `<span>${i + 1}: ${e.w === 1 ? `<b>${e.s[1]}</b>` : e.s[1]}-${e.w === 2 ? `<b>${e.s[2]}</b>` : e.s[2]}</span>`
        : `<span>${i + 1}: <b>${escapeHtml((m.names[e.w] || '').slice(0, 6))}</b>${e.bnr ? ' 🔥' : ''}${e.note === 'golden' ? ' ✨' : ''}</span>`).join('');
    return `
        <div class="pg-end-score">
            <div class="side" style="text-align:right">${escapeHtml(m.names[1])}</div>
            <div class="num ${w === 1 ? 'win' : ''}">${f[1]}</div><div style="color:#777; font-weight:900">–</div><div class="num ${w === 2 ? 'win' : ''}">${f[2]}</div>
            <div class="side" style="text-align:left">${escapeHtml(m.names[2])}</div>
        </div>
        <div style="color:#888; font-size:12px; text-align:center">${PG_MODES[m.mode].name} · ${live ? 'sürüyor · ' : ''}${mins} dk</div>
        ${frames ? `<div class="pg-frames-list">${frames}</div>` : ''}
        ${noTable ? '' : `<table class="stat-table">${pgStatRows(m)}</table>`}`;
}
function pgOpenEnd() {
    if (!pg) return;
    document.getElementById('pgEndBody').innerHTML = `<div class="match-end-grid"><div>
        <div class="match-end-trophy">🏆</div>
        <div class="match-end-winner">${pg.winner ? escapeHtml(pgName(pg.winner)) : 'BERABERE'}</div>
        ${pgStatsHtml(pg, false, true)}
        </div><div>
        <table class="stat-table">${pgStatRows(pg)}</table>
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button class="grid-btn" style="flex:1; padding:12px 0; font-size:15px" onclick="pgUndo()"><i class="ic">${iconSvg('undo')}</i>Geri Al</button>
            <button class="grid-btn" style="flex:1; padding:12px 0; font-size:15px" onclick="closeModal('pgEndModal'); pgExit()"><i class="ic">${iconSvg('home')}</i>Modlar</button>
        </div>
        <button class="grid-btn" style="width:100%; padding:14px 0; margin-top:10px; background:linear-gradient(to bottom,#ffd700,#daa520); color:#000" onclick="pgRematch()"><i class="ic">${iconSvg('repeat')}</i>Rövanş</button></div></div>`;
    document.getElementById('pgEndModal').style.display = 'flex';
}
function pgOpenStats(live) {
    document.getElementById('pgEndBody').innerHTML = `<h3 style="color:#ffd166; margin-bottom:8px">Maç İstatistiği</h3>${pgStatsHtml(pg, !pg.finished)}
        <button class="grid-btn" style="width:100%; padding:13px 0; margin-top:10px" onclick="closeModal('pgEndModal')">Kapat</button>`;
    document.getElementById('pgEndModal').style.display = 'flex';
}
function pgOpenHistory(mode) {
    let list = pgMatches.filter(m => !mode || m.mode === mode).slice().reverse();
    let h2h = {};
    list.forEach(m => {
        if (!m.winner) return;
        let key = [m.names[1], m.names[2]].sort().join(' – ');
        h2h[key] = h2h[key] || {};
        h2h[key][m.names[m.winner]] = (h2h[key][m.names[m.winner]] || 0) + 1;
    });
    document.getElementById('pgEndBody').innerHTML = `<h3 style="color:#ffd166; margin-bottom:10px">Geçmiş · ${mode ? PG_MODES[mode].name : 'Tümü'}</h3>
        ${Object.keys(h2h).length ? `<div class="h2h-box" style="text-align:left">${Object.entries(h2h).map(([k, v]) => `<div style="padding:4px 0; font-size:13px"><b>${escapeHtml(k)}</b>: ${Object.entries(v).map(([n, c]) => `${escapeHtml(n)} ${c}`).join(' · ')}</div>`).join('')}</div>` : ''}
        <div style="max-height:46vh; overflow-y:auto; text-align:left">${list.length ? list.map(m => `
            <div class="recent-row"><span class="mode-tag" style="font-size:10px; font-weight:900; color:var(--accent); min-width:56px">${PG_MODES[m.mode].name}</span>
            <div class="nm ${m.winner === 1 ? 'w' : ''}" style="text-align:right">${escapeHtml(m.names[1])}</div><div class="sc">${m.frames[1]} - ${m.frames[2]}</div>
            <div class="nm ${m.winner === 2 ? 'w' : ''}">${escapeHtml(m.names[2])}</div><div class="dt">${escapeHtml(shortDate(m.date))}</div></div>`).join('') : '<p style="color:#888; text-align:center">Henüz maç yok.</p>'}</div>
        <button class="grid-btn" style="width:100%; padding:13px 0; margin-top:12px" onclick="closeModal('pgEndModal')">Kapat</button>`;
    document.getElementById('pgEndModal').style.display = 'flex';
}

// ---------- MOD SEÇİMİ (ANA EKRAN) ----------
function renderHub() {
    let el = document.getElementById('hubScreen');
    if (!el) return;
    let live = m => pg && !pg.finished && pg.mode === m;
    let on5Live = typeof hasResumableMatch === 'function' && hasResumableMatch();
    let card = (mode, art, c1, c2, isLive) => `
        <div class="mode-card${isLive ? ' live' : ''}" style="--mc1:${c1}; --mc2:${c2}" onclick="${mode === 'on5' ? 'hubOpenOn5()' : `hubOpenMode('${mode}')`}">
            ${isLive ? '<span class="mc-live">● SÜRÜYOR</span>' : ''}
            <div class="mc-art">${art}</div>
            <div class="mc-name">${mode === 'on5' ? 'ON5' : PG_MODES[mode].name}</div>
            <div class="mc-sub">${mode === 'on5' ? 'Rulet bilardo · bizim oyun' : PG_MODES[mode].sub}</div>
        </div>`;
    let ball = n => `<div class="pool-ball b-${n}"><span>${n}</span></div>`;
    let snkArt = `<div class="mc-snk">${[1, 2, 3, 5, 7].map(v => `<span class="snk-dot" style="background:${SNK[v].g}"></span>`).join('')}</div>`;
    let resumes = [];
    if (pg && !pg.finished) resumes.push(`<div class="hub-resume" onclick="hubResumePg()">
        <div class="hr-top"><span>▶ DEVAM · ${PG_MODES[pg.mode].name}</span><span style="color:rgba(255,255,255,0.6)">${pg.mode === 'snooker' ? `Puan ${pg.rack.s[1]} - ${pg.rack.s[2]}` : `${PG_MODES[pg.mode].unit} ${pg.rackNo}`}</span></div>
        <div class="hr-sc"><div class="nm" style="text-align:right">${escapeHtml(pg.names[1])}</div><div class="st">${pg.frames[1]}</div><div style="color:#777">–</div><div class="st">${pg.frames[2]}</div><div class="nm">${escapeHtml(pg.names[2])}</div></div></div>`);
    if (on5Live) resumes.push(`<div class="hub-resume" onclick="resumeMatch()">
        <div class="hr-top"><span>▶ DEVAM · ON5</span><span style="color:rgba(255,255,255,0.6)">Sayı ${appState.data[1].score} - ${appState.data[2].score}</span></div>
        <div class="hr-sc"><div class="nm" style="text-align:right">${escapeHtml(getName(1))}</div><div class="st">${appState.data[1].set}</div><div style="color:#777">–</div><div class="st">${appState.data[2].set}</div><div class="nm">${escapeHtml(getName(2))}</div></div></div>`);
    let recent = pgMatches.slice(-3).reverse();
    let linkOk = link.role === 'host' || (link.peers && link.synced);
    el.innerHTML = `
    <div class="hub-wrap">
        <div class="hub-head">
            <div>
                <div class="brand" aria-label="Racko"><img class="brand-ball" src="racko-ball.png" alt="">RACKO</div>
                <div class="hub-tag">SKOR TABELASI · OYUN SEÇ</div>
            </div>
            <div class="hub-tools">
                <button class="hub-tool ${link.role ? (linkOk ? 'ok' : '') : ''}" onclick="openLink()"><i class="ic">${iconSvg('link')}</i>${link.role ? (link.role === 'host' ? `Ana cihaz · ${link.peers}` : (linkOk ? 'Bağlı' : 'Bağlanıyor…')) : 'Bağlan'}</button>
                <button class="hub-tool" onclick="pgOpenHistory()"><i class="ic">${iconSvg('chart')}</i>Geçmiş</button>
                <button class="hub-tool" onclick="pgOpenRules('8')"><i class="ic">${iconSvg('book')}</i>Kurallar</button>
            </div>
        </div>
        ${resumes.length ? `<div class="hub-row">${resumes.join('')}</div>` : ''}
        <div class="hub-modes">
            ${card('on5', '<img src="logo.png" alt="ON5">', '#2a78b3', '#0b2740', on5Live)}
            ${card('8', ball(8), '#3a3f4a', '#0f1218', live('8'))}
            ${card('9', ball(9), '#a07400', '#3a2a00', live('9'))}
            ${card('10', ball(10), '#1d5fb8', '#0a2147', live('10'))}
            ${card('snooker', snkArt, '#13703a', '#05301a', live('snooker'))}
        </div>
        ${recent.length ? `<div class="hub-recent"><div class="lbl">SON MAÇLAR</div>${recent.map(m => `
            <div class="recent-row"><span class="mode-tag">${PG_MODES[m.mode].name}</span>
            <div class="nm ${m.winner === 1 ? 'w' : ''}" style="text-align:right">${escapeHtml(m.names[1])}</div><div class="sc">${m.frames[1]} - ${m.frames[2]}</div>
            <div class="nm ${m.winner === 2 ? 'w' : ''}">${escapeHtml(m.names[2])}</div><div class="dt">${escapeHtml(shortDate(m.date))}</div></div>`).join('')}</div>` : ''}
    </div>`;
}
function hubOpenOn5() { showScreen('home'); }
function hubResumePg() { showScreen('pgGame'); }
function hubOpenMode(mode) {
    if (pg && !pg.finished && pg.mode === mode) {
        pgDialog(PG_MODES[mode].name, `<p>Süren bir ${PG_MODES[mode].name} maçı var: <b>${escapeHtml(pg.names[1])} ${pg.frames[1]} – ${pg.frames[2]} ${escapeHtml(pg.names[2])}</b></p>`, [
            { cls: 'win', label: '▶ Maça devam et', fn: () => showScreen('pgGame') },
            { label: 'Yeni maç kur', sub: 'Süren maç silinir', fn: () => pgOpenSetup(mode) }
        ]);
        return;
    }
    pgOpenSetup(mode);
}

// ---------- KURULUM ----------
function pgOpenSetup(mode) {
    let last = {};
    try { last = JSON.parse(localStorage.getItem(PG_KEY + '_last')) || {}; } catch (e) {}
    let names = last.names || { 1: getName(1), 2: getName(2) };
    pgSetupCfg = {
        mode, names: { 1: names[1], 2: names[2] },
        raceTo: last.mode === mode ? last.raceTo : (mode === 'snooker' ? 3 : 5),
        breakRule: last.breakRule || (mode === '8' ? 'winner' : 'alt'),
        reds: last.reds || 15,
        first: 'kura'
    };
    pgSetupSlot = 1;
    showScreen('pgSetup');
    pgRenderSetup();
}
function pgRenderSetup() {
    let c = pgSetupCfg, snk = c.mode === 'snooker';
    let opt = (key, val, label, sub) => `<button class="pgs-opt ${c[key] === val ? 'on' : ''}" onclick="pgSetupCfg.${key}=${JSON.stringify(val).replace(/"/g, "'")}; pgRenderSetup()">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
    let race = c.raceTo;
    document.getElementById('pgSetupScreen').innerHTML = `
    <div class="setup-wrap">
        <div class="setup-head">
            <button class="setup-back" onclick="showScreen('hub')">‹</button>
            <h2>YENİ MAÇ · ${PG_MODES[c.mode].name}</h2>
            <div style="flex:1"></div>
            <button class="hub-tool" onclick="pgOpenRules('${c.mode}')"><i class="ic">${iconSvg('book')}</i>Kurallar</button>
        </div>
        <div class="setup-grid">
            <section class="setup-card">
                <h4>👥 OYUNCULAR</h4>
                <div class="player-slots">
                    <div class="player-slot ${pgSetupSlot === 1 ? 'active' : ''}" onclick="pgSetupSlot=1; pgMarkSlots()" id="pgSlot1">
                        <div class="slot-label">1. OYUNCU (SOL)</div>
                        <input id="pgName1" maxlength="14" autocomplete="off" placeholder="İsim yaz" value="${escapeHtml(c.names[1] || '')}" onfocus="pgSetupSlot=1; pgMarkSlots()" oninput="pgSetupCfg.names[1]=this.value">
                    </div>
                    <button class="swap-btn" onclick="pgSetupCfg.names={1:pgSetupCfg.names[2],2:pgSetupCfg.names[1]}; pgRenderSetup()">⇄</button>
                    <div class="player-slot ${pgSetupSlot === 2 ? 'active' : ''}" onclick="pgSetupSlot=2; pgMarkSlots()" id="pgSlot2">
                        <div class="slot-label">2. OYUNCU (SAĞ)</div>
                        <input id="pgName2" maxlength="14" autocomplete="off" placeholder="İsim yaz" value="${escapeHtml(c.names[2] || '')}" onfocus="pgSetupSlot=2; pgMarkSlots()" oninput="pgSetupCfg.names[2]=this.value">
                    </div>
                </div>
                <div style="color:#888; font-size:12px; font-weight:bold; margin-top:12px">Kayıtlı oyuncular (dokun, seçili kutuya yazılsın)</div>
                <div class="chip-row">${knownPlayers.map((n, i) => `<button class="name-chip" onclick="pgPickName(${i})">${escapeHtml(n)}</button>`).join('')}</div>
            </section>
            <section class="setup-card">
                <h4>🏆 MAÇ FORMATI</h4>
                <div class="setup-row">
                    <div class="lbl">${snk ? 'Kazanılacak frame' : 'Kaça kadar (rak)'}<small>${snk ? (race > 0 ? `${race * 2 - 1} frame'de en iyi` : 'Limitsiz') : (race > 0 ? `${race} rak alan kazanır` : 'Limitsiz')}</small></div>
                    <div class="stepper"><button onclick="pgSetupCfg.raceTo=Math.max(0,pgSetupCfg.raceTo-1); pgRenderSetup()">−</button><div class="val">${race > 0 ? race : '∞'}</div><button onclick="pgSetupCfg.raceTo=Math.min(25,pgSetupCfg.raceTo+1); pgRenderSetup()">+</button></div>
                </div>
                <div class="preset-row">${(snk ? [1, 2, 3, 4, 5] : [3, 5, 7, 9, 11]).map(v => `<button class="preset ${race === v ? 'on' : ''}" onclick="pgSetupCfg.raceTo=${v}; pgRenderSetup()">${snk ? `${v * 2 - 1}'te en iyi` : v}</button>`).join('')}</div>
                ${snk ? `<div class="lbl" style="font-weight:bold; font-size:14px; color:#ddd; margin:8px 0 6px">Kırmızı sayısı</div>
                    <div class="pgs-modes">${opt('reds', 15, '15', 'Klasik')}${opt('reds', 10, '10', 'Kısa')}${opt('reds', 6, '6', '6 kırmızı')}</div>`
                : `<div class="lbl" style="font-weight:bold; font-size:14px; color:#ddd; margin:8px 0 6px">Sonraki rakı kim açar?</div>
                    <div class="pgs-modes">${opt('breakRule', 'winner', 'Kazanan açar')}${opt('breakRule', 'alt', 'Sırayla')}</div>`}
                <div class="lbl" style="font-weight:bold; font-size:14px; color:#ddd; margin:12px 0 6px">${snk ? 'İlk frame\'i kim açar?' : 'İlk açılış'}</div>
                <div class="pgs-modes">${opt('first', 'kura', '🪙 Kura')}${opt('first', 1, escapeHtml(c.names[1] || '1. oyuncu'))}${opt('first', 2, escapeHtml(c.names[2] || '2. oyuncu'))}</div>
            </section>
        </div>
        <div class="setup-footer"><button class="start-btn" onclick="pgStartFromSetup()">▶ MAÇI BAŞLAT</button></div>
    </div>`;
}
function pgMarkSlots() {
    [1, 2].forEach(n => { let s = document.getElementById('pgSlot' + n); if (s) s.classList.toggle('active', pgSetupSlot === n); });
}
function pgPickName(i) {
    let n = knownPlayers[i];
    let other = pgOther(pgSetupSlot);
    if (normName(pgSetupCfg.names[other]) === n) pgSetupCfg.names[other] = pgSetupCfg.names[pgSetupSlot];
    pgSetupCfg.names[pgSetupSlot] = n;
    pgSetupSlot = pgOther(pgSetupSlot);
    pgRenderSetup();
}
function pgStartFromSetup() {
    let c = pgSetupCfg;
    c.names[1] = (document.getElementById('pgName1').value || '').trim();
    c.names[2] = (document.getElementById('pgName2').value || '').trim();
    if (normName(c.names[1]) && normName(c.names[1]) === normName(c.names[2])) { customAlert('İki oyuncunun adı aynı olamaz.'); return; }
    pgStartMatch(c);
}

// ---------- KURALLAR ----------
// Kurallardaki diziliş çizimleri
function pgRackHtml(rows, note, center) {
    return `<div class="pg-rack">${rows.map(r => `<div class="pg-rack-row">${r.map(b => pgBall(b, b === center ? 'center' : '')).join('')}</div>`).join('')}
        <div class="pg-rack-note">${note}</div></div>`;
}
function pgSnkTableSvg() {
    let dot = (x, y, c, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>`;
    let reds = '';
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) reds += dot(392 + row * 16, 110 - row * 9.2 + i * 18.4, '#d32f2f', 8.6);
    return `<div class="pg-rack"><svg viewBox="0 0 520 220" style="width:100%; max-width:520px">
        <rect x="4" y="4" width="512" height="212" rx="14" fill="#5a3418"/>
        <rect x="18" y="18" width="490" height="184" rx="6" fill="#0e6b32"/>
        <line x1="120" y1="18" x2="120" y2="202" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        <path d="M120 75 A35 35 0 0 0 120 145" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        ${dot(120, 145, '#f6d10b')}${dot(120, 110, '#7a4a22')}${dot(120, 75, '#17a34a')}
        ${dot(260, 110, '#1f5fd6')}${dot(372, 110, '#f58fb6')}${reds}${dot(492, 110, '#151515')}
        ${dot(95, 118, '#fff', 8)}
        <text x="120" y="214" fill="#ddd" font-size="11" text-anchor="middle" font-weight="bold">BAŞ ÇİZGİSİ · D</text>
    </svg><div class="pg-rack-note">Baş çizgisinde (soldan bakınca D'nin üstünde) yeşil, ortada kahve, altında sarı · ortada mavi · pembenin hemen arkasında 15 kırmızı · en sonda siyah. Beyaz D içinden oynanır.</div></div>`;
}
const PG_RULES = {
    '8': `
        <div class="rule-section rule-summary"><h3>⚡ 30 Saniyede 8 Top</h3><ul>
            <li><strong>Amaç:</strong> Kendi grubunu (düz 1-7 ya da çizgili 9-15) bitirip sonra siyah 8'i çağırdığın deliğe sokmak.</li>
            <li><strong>Sıra:</strong> Kurallı atışta kendi grubundan top sokan devam eder; sokamazsan sıra geçer.</li>
            <li><strong>Faul:</strong> Rakip topu elde alır ve beyazı masada istediği yere koyar.</li>
            <li><strong>Kaybettiren:</strong> 8'i erken sokmak, 8 ile birlikte beyazı sokmak, 8'i yanlış deliğe sokmak ya da masadan çıkarmak.</li>
            <li><strong>Uygulamada:</strong> ON5'teki gibi kendi tarafına dokun → giren topları ve faulü işaretle → YAZ. Iskayı yazmana gerek yok; sırası gelen kendi vuruşunu yazar.</li>
        </ul></div>
        <div class="rule-section"><h3>🔺 1. Diziliş ve Açılış</h3>
        ${pgRackHtml([[1], [10, 2], [3, 8, 9], [12, 6, 15, 4], [5, 13, 7, 14, 11]], 'Örnek diziliş · 8 ortada, arka köşelerde bir düz (5) bir çizgili (11), diğerleri karışık. Tepe top ayak noktasında.', 8)}<ul>
            <li>15 top üçgene dizilir: tepe top ayak noktasında, 8 üçüncü sıranın ortasında, arka iki köşede biri düz biri çizgili.</li>
            <li>Açılış baş çizgisinin gerisinden (beyaz elde) yapılır. İlk açılış kura/lag ile belirlenir; sonraki rakları maç ayarına göre kazanan ya da sırayla açar.</li>
            <li><strong>Kurallı açılış:</strong> En az bir top girmeli ya da en az dört top banda gitmeli. Olmazsa rakip, masayı olduğu gibi oynar ya da yeniden dizdirip kendisi/aynı oyuncu açar.</li>
            <li><strong>Açılışta 8 girerse:</strong> Faul değildir; açan oyuncu 8'i ayak noktasına koydurup devam eder ya da yeniden dizip tekrar açar. (Beyaz da girerse rakip seçer ve topu elde başlar.)</li>
            <li><strong>Açılışta beyaz girerse ya da masadan top çıkarsa:</strong> Faul; rakip topu elde, baş çizgisinin gerisinden başlar.</li>
        </ul></div>
        <div class="rule-section"><h3>🎯 2. Açık Masa ve Grup Seçimi</h3><ul>
            <li>Açılıştan sonra masa <strong>açıktır</strong>: açılışta giren toplar grup belirlemez.</li>
            <li>Açık masada 8 hariç herhangi bir topa önce vurulabilir.</li>
            <li>Açılıştan sonra kurallı olarak ilk sokulan top, o oyuncunun grubunu belirler (düz ya da çizgili); rakip diğer grubu alır.</li>
            <li><em>Uygulamada:</em> açılıştan sonra ilk sokulan top grubu kendiliğinden atar. İstersen ismin altındaki DÜZ / ÇİZGİLİ ile elle de seçebilirsin.</li>
        </ul></div>
        <div class="rule-section"><h3>🎱 3. Oynanış</h3><ul>
            <li>Her atışta beyaz önce <strong>kendi grubundan</strong> bir topa değmeli; sonra bir top girmeli ya da (beyaz dahil) bir top banda gitmeli.</li>
            <li>Bariz olmayan atışlarda top ve delik çağrılır (8 her zaman çağrılır). Çağrılan top çağrılan deliğe girmezse sıra geçer.</li>
            <li>Rakibin topunu sokmak faul değildir ama sıra devam etmez (kendi topun da girmediyse).</li>
            <li>Grubunu bitiren oyuncu 8'i oynar.</li>
        </ul></div>
        <div class="rule-section"><h3>⚠️ 4. Fauller (rakip topu elde, masanın her yerine)</h3><ul>
            <li>Beyazın deliğe girmesi ya da masadan çıkması.</li>
            <li>Beyazın önce yanlış topa değmesi ya da hiçbir topa değmemesi.</li>
            <li>Değdikten sonra hiçbir topun girmemesi ve hiçbir topun banda gitmemesi.</li>
            <li>Bir topun masadan çıkması (renkli top dışarıda kalır; 8 çıkarsa rak kaybedilir).</li>
            <li>Topa iki kez vurmak, iki ayağın da yerden kesilmesi, topa elle/giysiyle dokunmak.</li>
        </ul></div>
        <div class="rule-section"><h3>🏁 5. Rakın Kazanılması / Kaybedilmesi</h3><ul>
            <li><strong>Kazanır:</strong> Grubunu bitirdikten sonra 8'i çağırdığı deliğe kurallı sokan.</li>
            <li><strong>Kaybeder:</strong> 8'i grubu bitmeden sokan, 8'i sokarken faul yapan (ör. beyaz da girer), 8'i çağırmadığı deliğe sokan, 8'i masadan çıkaran.</li>
            <li>8 Top'ta "üç ardışık faul" kuralı yoktur.</li>
        </ul></div>`,
    '9': `
        <div class="rule-section rule-summary"><h3>⚡ 30 Saniyede 9 Top</h3><ul>
            <li><strong>Amaç:</strong> 9'u kurallı sokan rakı alır. Belirlenen sayıda rakı ilk alan maçı kazanır.</li>
            <li><strong>Altın kural:</strong> Beyaz her atışta önce masadaki <strong>en küçük numaralı</strong> topa değmeli. Sonra herhangi bir top girerse devam edersin.</li>
            <li><strong>Kombinasyon serbest:</strong> En küçüğe değip 9'u sokarsan (açılışta bile) rakı kazanırsın.</li>
            <li><strong>3 ardışık faul</strong> rakı kaybettirir. Faulde rakip topu elde.</li>
            <li><strong>Uygulamada:</strong> kendi tarafına dokun → giren topları işaretle → YAZ. Iska yazılmaz. Yeşil halkalı top sıradaki en küçük toptur.</li>
        </ul></div>
        <div class="rule-section"><h3>🔷 1. Diziliş ve Açılış</h3>
        ${pgRackHtml([[1], [2, 3], [4, 9, 5], [6, 7], [8]], 'Elmas diziliş · 1 tepede (ayak noktasında), 9 ortada, diğerleri karışık.', 9)}<ul>
            <li>1-9 toplar elmas şeklinde dizilir: 1 tepede ayak noktasında, 9 ortada, diğerleri karışık.</li>
            <li>Açılışta beyaz önce 1'e değmeli; ya bir top girmeli ya da en az dört top banda gitmeli. Olmazsa faul: rakip topu elde.</li>
            <li><strong>Altın açılış:</strong> Kurallı açılışta 9 girerse açan rakı kazanır.</li>
            <li>Açılışta giren toplar (9 hariç) dışarıda kalır, açan oyuncu devam eder.</li>
        </ul></div>
        <div class="rule-section"><h3>↗️ 2. Push Out</h3><ul>
            <li>Sadece açılıştan <strong>hemen sonraki</strong> atışta yapılabilir ve önceden söylenir.</li>
            <li>Push out'ta beyazın en küçük topa ya da banda değmesi gerekmez (diğer faul kuralları geçerli). Giren toplar sayılmaz (9 girerse geri konur).</li>
            <li>Rakip, masayı olduğu gibi oynamayı ya da push yapan oyuncuya geri vermeyi seçer.</li>
            <li><em>Uygulamada:</em> push hakkı olan vuruşta yazma panelinde "Push out" seçeneği çıkar.</li>
        </ul></div>
        <div class="rule-section"><h3>⚠️ 3. Fauller (rakip topu elde, masanın her yerine)</h3><ul>
            <li>Beyazın önce en küçük topa değmemesi.</li>
            <li>Değdikten sonra hiçbir topun girmemesi ve hiçbir topun banda gitmemesi.</li>
            <li>Beyazın deliğe girmesi ya da masadan çıkması; renkli topun masadan çıkması.</li>
            <li>Topa iki kez vurmak, toplara elle dokunmak, ayakların yerden kesilmesi.</li>
            <li>Faulle giren toplar dışarıda kalır; <strong>9 faulle girerse ayak noktasına geri konur.</strong></li>
        </ul></div>
        <div class="rule-section"><h3>🚫 4. Üç Ardışık Faul</h3><ul>
            <li>Aynı oyuncu aynı rakta arada kurallı atış yapmadan üç kez üst üste faul yaparsa rakı kaybeder.</li>
            <li>İkinci faulden sonra oyuncu uyarılmalıdır. <em>Uygulamada 2. faulden sonra oyuncunun tarafında kırmızı uyarı çıkar, 3. faulde rak kendiliğinden rakibe yazılır.</em></li>
        </ul></div>`,
    '10': `
        <div class="rule-section rule-summary"><h3>⚡ 30 Saniyede 10 Top</h3><ul>
            <li><strong>Amaç:</strong> Çağrılan deliğe 10'u kurallı sokan rakı alır.</li>
            <li><strong>Çağrılı atış:</strong> Her atışta (açılış hariç) hangi top hangi deliğe söylenir.</li>
            <li><strong>Önce en küçük top:</strong> Beyaz her atışta önce masadaki en küçük numaralı topa değmeli.</li>
            <li><strong>Açılışta 10 girerse kazandırmaz:</strong> geri konur, oyun sürer.</li>
            <li><strong>3 ardışık faul</strong> rakı kaybettirir.</li>
        </ul></div>
        <div class="rule-section"><h3>🔺 1. Diziliş ve Açılış</h3>
        ${pgRackHtml([[1], [2, 3], [4, 10, 5], [6, 7, 8, 9]], 'Üçgen diziliş · 1 tepede (ayak noktasında), 10 üçüncü sıranın ortasında, diğerleri karışık.', 10)}<ul>
            <li>1-10 toplar üçgene dizilir: 1 tepede ayak noktasında, 10 üçüncü sıranın ortasında, diğerleri karışık.</li>
            <li>Açılışta beyaz önce 1'e değmeli; ya bir top girmeli ya da en az dört top banda gitmeli. Olmazsa faul: rakip topu elde.</li>
            <li>Açılışta 10 girerse ayak noktasına konur, açan oyuncu devam eder (top girdiyse).</li>
        </ul></div>
        <div class="rule-section"><h3>📣 2. Çağrılı Atış</h3><ul>
            <li>Top ve delik söylenir; bant/kombinasyon söylenmek zorunda değil.</li>
            <li>Çağrılan top çağrılan deliğe girerse oyuncu devam eder. Diğer giren toplar da dışarıda kalır.</li>
            <li><strong>Çağrı tutmazsa:</strong> sıra geçer; rakip masayı olduğu gibi oynar ya da geri verir. Yanlışlıkla giren toplar dışarıda kalır, 10 girdiyse geri konur.</li>
            <li>10 kombinasyonla da sokulabilir; çağrılmış olması yeterli. Çağrılmadan girerse geri konur, sıra geçer.</li>
            <li><strong>Güvenlik (safety):</strong> Oyuncu "safety" diyerek sırayı bilerek verebilir; giren top sayılmaz.</li>
        </ul></div>
        <div class="rule-section"><h3>↗️ 3. Push Out</h3><ul>
            <li>Açılıştan hemen sonraki atışta söylenerek yapılır; beyazın topa ya da banda değmesi gerekmez.</li>
            <li>Rakip masayı oynar ya da geri verir.</li>
        </ul></div>
        <div class="rule-section"><h3>⚠️ 4. Fauller (rakip topu elde)</h3><ul>
            <li>Önce en küçük topa değmemek, değdikten sonra top girmemesi ve banda gitmemesi.</li>
            <li>Beyazın deliğe girmesi / masadan çıkması, renkli topun masadan çıkması, iki kez vurma.</li>
            <li>10 faulle girerse geri konur. <strong>Üç ardışık faul rakı kaybettirir</strong> (2. faulden sonra uyarı).</li>
        </ul></div>`,
    'snooker': `
        <div class="rule-section rule-summary"><h3>⚡ 30 Saniyede Snooker</h3><ul>
            <li><strong>Toplar:</strong> 15 kırmızı (1'er), sarı 2, yeşil 3, kahve 4, mavi 5, pembe 6, siyah 7.</li>
            <li><strong>Sıra:</strong> Önce bir kırmızı, sonra istediğin bir renk (renk geri konur), sonra yine kırmızı… Kırmızılar bitince renkler sırayla: sarı → siyah.</li>
            <li><strong>Seri (break):</strong> Bir ziyarette toplanan puan. En yüksek mümkün seri 147.</li>
            <li><strong>Faul:</strong> En az 4 puan, ilgili top daha değerliyse onun değeri (en fazla 7) <strong>rakibe</strong> yazılır.</li>
            <li><strong>Frame:</strong> Masa bitince yüksek puanlı alır. Eşitlikte siyah yeniden konur.</li>
            <li><strong>Uygulamada:</strong> her oyuncu kendi tarafındaki topa dokunur; ıska yazılmaz, diğer oyuncu yazınca sıra ona geçer. Kalan puan ve fark kendiliğinden hesaplanır.</li>
        </ul></div>
        <div class="rule-section"><h3>🔴 1. Diziliş ve Açılış</h3>
        ${pgSnkTableSvg()}<ul>
            <li>Kırmızılar pembenin arkasında üçgende; sarı, kahve, yeşil baş tarafındaki D çizgisinde; mavi ortada, pembe üçgenin ucunda, siyah kendi noktasında.</li>
            <li>Açılışı yapan beyazı D içine koyar ve önce bir kırmızıya vurmalıdır. Frame'leri oyuncular sırayla açar.</li>
        </ul></div>
        <div class="rule-section"><h3>🎱 2. Oynanış</h3><ul>
            <li>Oynanacak top (ball on) kırmızıysa beyaz önce bir kırmızıya değmeli. Bir vuruşta birden fazla kırmızı girerse hepsi sayılır.</li>
            <li>Kırmızıdan sonra oyuncu bir renk seçer (söyler) ve önce ona vurur. Sokulan renk kendi noktasına geri konur.</li>
            <li>Masada kırmızı kalmayınca renkler değer sırasıyla sokulur ve artık geri konmaz.</li>
            <li>Top girmezse ziyaret biter, sıra rakibe geçer.</li>
            <li><strong>Snooker gerekli:</strong> Geride olan oyuncu için kalan puan farkı kapatmaya yetmiyorsa, frame'i kazanmak için rakibe faul yaptırması (snooker) gerekir.</li>
        </ul></div>
        <div class="rule-section"><h3>⚠️ 3. Fauller ve Cezalar</h3><ul>
            <li>Ceza <strong>en az 4 puandır</strong>; oynanacak top ya da faule karışan top (önce değilen, giren) daha değerliyse onun değeri: mavi 5, pembe 6, siyah 7.</li>
            <li>Örnekler: beyazın girmesi (en az 4), önce yanlış topa değmek, hiçbir topa değmemek, oynanacak olmayan topu sokmak, top masadan çıkarmak, iki kez vurmak, ayakların yerden kesilmesi.</li>
            <li>Bir vuruşta birden fazla faul varsa en yüksek ceza uygulanır.</li>
            <li>Faulde giren kırmızılar geri konmaz; renkler kendi noktasına konur.</li>
            <li>Faulden sonra rakip ya masayı olduğu gibi oynar ya da faul yapanı tekrar oynatır.</li>
            <li><strong>Iska (miss):</strong> Hakem, oyuncunun oynanacak topa vurmak için yeterli çaba göstermediğine karar verirse topları eski yerine koydurup tekrar oynatabilir. <em>Uygulamada faul olarak girilir; tekrar oynatılırsa "tekrar oynattı" işaretlenir.</em></li>
        </ul></div>
        <div class="rule-section"><h3>🆓 4. Serbest Top (Free Ball)</h3><ul>
            <li>Faulden sonra gelen oyuncu snookerlı kalırsa (oynanacak topun iki kenarına da doğrudan vuramıyorsa) herhangi bir topu oynanacak top yerine seçebilir.</li>
            <li>Serbest top, oynanacak topun değerini verir (kırmızı yerine 1, sarı yerine 2…) ve geri konur. Kırmızı yerine sokulduysa ardından renk oynanır.</li>
            <li><em>Uygulamada:</em> faul yazarken "Serbest top" işaretlenirse sıradaki oyuncuda SERBEST TOP düğmesi çıkar.</li>
        </ul></div>
        <div class="rule-section"><h3>🏁 5. Frame Sonu ve Maç</h3><ul>
            <li>Son siyah sokulunca (ya da son siyahta faul olunca) frame biter; yüksek puanlı kazanır.</li>
            <li><strong>Eşitlik:</strong> Siyah kendi noktasına konur, kura ile ilk oynayan belirlenir, beyaz D içinden oynanır. İlk sayı ya da ilk faul frame'i bitirir.</li>
            <li>Oyuncu frame'i pes edebilir (genelde kalan puan yetmeyince). <em>Uygulamada: Menü → Frame'i ver.</em></li>
            <li>Maç "X frame'de en iyi" şeklinde oynanır (ör. 5'te en iyi = 3 frame alan kazanır).</li>
            <li><strong>6 kırmızı</strong> sürümünde aynı kurallar 6 kırmızıyla oynanır (en yüksek seri 75).</li>
        </ul></div>`
};
function pgOpenRules(mode) {
    let tabs = ['8', '9', '10', 'snooker'].map(m => `<button class="pgs-opt ${m === mode ? 'on' : ''}" onclick="pgOpenRules('${m}')">${PG_MODES[m].name}</button>`).join('')
        + `<button class="pgs-opt" onclick="closeModal('pgRulesModal'); openRules()">ON5</button>`;
    document.getElementById('pgRulesTabs').innerHTML = tabs;
    document.getElementById('pgRulesBody').innerHTML = PG_RULES[mode] + `<p style="color:#777; font-size:12px; margin-top:6px">Kaynak: WPA Dünya Standart Kuralları (8, 9, 10 top) ve WPBSA Snooker Kuralları. Yerel/salon kuralları farklı olabilir.</p>`;
    document.getElementById('pgRulesBody').scrollTop = 0;
    document.getElementById('pgRulesModal').style.display = 'flex';
}

// ---------- HTML İSKELETİ ----------
document.body.insertAdjacentHTML('beforeend', `
    <div id="hubScreen" class="screen"></div>
    <div id="pgSetupScreen" class="screen"></div>
    <div id="pgGameScreen" class="screen"></div>
    <div id="pgCelebrate" onclick="this.classList.remove('show')"></div>
    <div id="pgShotModal" class="modal" style="padding:0; background:rgba(5,8,14,0.97)"><div class="shot-sheet" id="pgShotBody"></div></div>
    <div id="pgDlg" class="modal"><div class="modal-content" style="max-width:460px">
        <div class="modal-header"><h3 id="pgDlgTitle"></h3><button class="close-btn" onclick="closeModal('pgDlg')">X</button></div>
        <div id="pgDlgBody" style="text-align:left"></div>
    </div></div>
    <div id="pgMenu" class="modal"><div class="modal-content" style="max-width:520px">
        <div class="modal-header"><h3>Menü</h3><button class="close-btn" onclick="closeModal('pgMenu')">X</button></div>
        <div id="pgMenuBody" class="pg-menu"></div>
    </div></div>
    <div id="pgEndModal" class="modal"><div class="modal-content match-end-content" id="pgEndBody"></div></div>
    <div id="pgRulesModal" class="modal"><div class="modal-content" style="max-width:720px; max-height:88vh; text-align:left; line-height:1.5; padding:0; display:flex; flex-direction:column;">
        <div class="modal-header" style="padding:12px 18px; margin:0; flex-shrink:0; gap:10px; background:rgba(0,0,0,0.5); border-radius:12px 12px 0 0">
            <div id="pgRulesTabs" class="pgs-modes" style="flex:1"></div>
            <button class="close-btn" onclick="closeModal('pgRulesModal')">X</button>
        </div>
        <div id="pgRulesBody" style="overflow-y:auto; padding:18px 22px; flex:1"></div>
    </div></div>
`);
pgLoad();
