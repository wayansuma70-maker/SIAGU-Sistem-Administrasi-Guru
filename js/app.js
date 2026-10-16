// SIAGU — Frontend (vanilla JS). Semua data lewat fetch ke GAS_URL.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE');
const W = { TP1: .2, TP2: .2, UH1: .25, UTS: .35 };
let S = JSON.parse(localStorage.getItem('siagu') || 'null');
let kelasCache = null;

// ---------- Helpers ----------
function notif(m, t = 'ok') { const n = $('#notif'); n.textContent = m; n.className = 'notif ' + t + ' show'; setTimeout(() => n.classList.remove('show'), 3500); }
function busy(b) { $('#loading').style.display = b ? 'flex' : 'none'; }
async function api(action, data = {}) {
  busy(true);
  try {
    const r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S && S.token, data }) });
    const j = await r.json();
    if (!j.success) { if (/Sesi berakhir/.test(j.message)) logout(); throw new Error(j.message); }
    return j;
  } finally { busy(false); }
}
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { notif(e.message || 'Terjadi kesalahan', 'err'); } };
async function kelasList() { if (!kelasCache) kelasCache = (await api('siswa', {})).data.kelas; return kelasCache; }
const opts = (a, sel) => a.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
const chip = s => `<span class="chip ${s}">${{ H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' }[s]}</span>`;
function dl(b64, name) { const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + b64; a.download = name; a.click(); }
const na = m => Object.keys(W).reduce((t, k) => t + (Number(m[k]) || 0) * W[k], 0);
const pred = v => v >= 90 ? 'A' : v >= 85 ? 'A-' : v >= 80 ? 'B+' : v >= 75 ? 'B' : 'C';

// ---------- Auth & shell ----------
$('#loginForm').addEventListener('submit', safe(async e => {
  e.preventDefault();
  const r = await api('login', { email: $('#lEmail').value, pin: $('#lPin').value });
  S = r.data; localStorage.setItem('siagu', JSON.stringify(S)); boot();
}));
function logout() { S = null; kelasCache = null; localStorage.removeItem('siagu'); boot(); }
$('#out').onclick = logout;
$('#menu').onclick = () => $('#side').classList.toggle('open');

const PAGES = { dashboard: ['🏠 Dashboard', pDash], jurnal: ['📖 Jurnal Mengajar & Presensi', pJurnal], nilai: ['📝 Penilaian Siswa / Gradebook', pNilai], siswa: ['🎓 Data Siswa & Direktori', pSiswa], rekap: ['🖨️ Rekap & Cetak PDF', pRekap] };

function boot() {
  $('#login').hidden = !!S; $('#app').hidden = !S;
  if (!S) return;
  $('#ta').textContent = `T.A. ${TAHUN_AJARAN} • Semester ${SEMESTER}`;
  $('#me').innerHTML = `<b>${esc(S.user.nama)}</b><br>${esc(S.user.peran)}${S.user.mapel ? ' • ' + esc(S.user.mapel) : ''}`;
  route();
}
const route = safe(async () => {
  const k = (location.hash.slice(1) || 'dashboard'), p = PAGES[k] || PAGES.dashboard;
  $('#nav').innerHTML = Object.entries(PAGES).map(([id, v]) => `<a href="#${id}" class="${id === (PAGES[k] ? k : 'dashboard') ? 'on' : ''}">${v[0]}</a>`).join('');
  $('#side').classList.remove('open');
  await p[1]();
});
window.addEventListener('hashchange', route);

// ---------- Dashboard ----------
async function pDash() {
  const d = (await api('dashboard')).data, k = d.kehadiran, tot = (k.H + k.S + k.I + k.A) || 1;
  const h = new Date().getHours(), sapa = h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 19 ? 'Sore' : 'Malam';
  const st = (t, v) => `<div class="card stat"><small>${t}</small><b>${v}</b></div>`;
  $('#view').innerHTML = `
  <section class="hero"><div><h1>Selamat ${sapa}, ${esc(S.user.nama)} 👋</h1><p>${d.jurnalHariIni} jurnal sudah diisi hari ini.</p></div>
    <div><a class="btn white" href="#jurnal">+ Isi Jurnal Sekarang</a> <a class="btn out" href="#rekap">Rekap</a></div></section>
  <div class="grid4">${st('Jurnal Hari Ini', d.jurnalHariIni)}${st('Tingkat Kehadiran', d.hadirPct + '%')}${st('Nilai Masuk Semester Ini', d.nilaiTotal)}${st('Dokumen PDF Terbit', d.pdfTotal)}</div>
  <div class="grid2">
    <div class="card"><h2>Grafik Kehadiran Hari Ini</h2><br>
      ${['H', 'S', 'I', 'A'].map(s => `<div>${chip(s)} <b>${k[s]}</b> siswa<div class="bar"><i style="width:${k[s] / tot * 100}%;background:${{ H: '#047857', S: '#B45309', I: '#1D4ED8', A: '#B91C1C' }[s]}"></i></div></div>`).join('')}</div>
    <div class="card"><h2>Jurnal Terbaru</h2><div class="scroll"><table><tr><th>Tanggal</th><th>Kelas</th><th>Materi</th></tr>
      ${d.recent.map(j => `<tr><td>${esc(j.tanggal)}</td><td>${esc(j.kelas)}</td><td>${esc(j.materi)}</td></tr>`).join('') || '<tr><td colspan="3" class="mu">Belum ada jurnal.</td></tr>'}</table></div></div>
  </div>`;
}

// ---------- Jurnal & Presensi ----------
function compress(file) {
  return new Promise(res => {
    const fr = new FileReader(), img = new Image();
    fr.onload = () => { img.onload = () => {
      const r = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * r; c.height = img.height * r; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const u = c.toDataURL('image/jpeg', .7);
      res({ name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: u.split(',')[1], prev: u });
    }; img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
async function pJurnal() {
  const kl = await kelasList(); let fotos = [], pres = {}, siswa = [];
  $('#view').innerHTML = `<div class="pg"><div><h1>Formulir Jurnal Mengajar & Presensi</h1><p class="mu">Isi proses pembelajaran, presensi, dan unggah foto kegiatan.</p></div></div>
  <form id="jf"><div class="card sec"><h2>1. Informasi Pembelajaran</h2><div class="row2">
    <label>Tanggal<input type="date" id="jt" value="${today()}" required></label>
    <label>Kelas<select id="jk">${opts(kl)}</select></label>
    <label>Mata Pelajaran<input id="jm" value="${esc(S.user.mapel || '')}" required></label>
    <label>Jam Pelajaran<input id="jj" placeholder="Jam ke 1-2 (07.30-09.00)" required></label></div>
    <label>Materi / Pokok Bahasan<input id="jmt" required></label>
    <div class="row2"><label>Kegiatan Pembelajaran<textarea id="jg" required></textarea></label><label>Catatan / Hambatan (opsional)<textarea id="jc"></textarea></label></div></div>
  <div class="card sec"><h2>2. Dokumentasi Kegiatan</h2><div class="drop" id="dz">📷 Pilih foto kegiatan (maks. 3, dikompres otomatis)</div>
    <input type="file" id="ff" accept="image/*" multiple hidden><div class="thumbs" id="th"></div></div>
  <div class="card sec"><div class="pg"><h2>3. Presensi Roll-Call</h2><button type="button" class="btn sm" id="allH">Tandai Semua Hadir</button></div>
    <div id="pt" class="scroll"></div></div>
  <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><label style="margin:0"><input type="checkbox" id="je" checked style="width:auto;height:auto"> Kirim tanda terima ke email guru</label><span class="grow"></span><button class="btn" type="submit">Simpan Jurnal & Kirim Presensi</button></div></form>`;
  const drawP = () => {
    $('#pt').innerHTML = `<table><tr><th>No</th><th>Nama & NIS</th><th>Status</th><th>Keterangan</th></tr>${siswa.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.nama)}</b><br><small class="mu">NIS ${s.nis}</small></td>
      <td><span class="sb">${['H', 'S', 'I', 'A'].map(x => `<button type="button" data-n="${s.nis}" data-s="${x}" class="${pres[s.nis].s === x ? 'on' : ''}">${x}</button>`).join('')}</span></td>
      <td><input data-k="${s.nis}" value="${esc(pres[s.nis].k)}" placeholder="-"></td></tr>`).join('')}</table>`;
  };
  const loadS = safe(async () => { siswa = (await api('siswa', { kelas: $('#jk').value })).data.siswa; pres = {}; siswa.forEach(s => pres[s.nis] = { s: 'H', k: '' }); drawP(); });
  $('#jk').onchange = loadS; await loadS();
  $('#pt').onclick = e => { const b = e.target.closest('button[data-s]'); if (b) { pres[b.dataset.n].s = b.dataset.s; drawP(); } };
  $('#pt').oninput = e => { if (e.target.dataset.k) pres[e.target.dataset.k].k = e.target.value; };
  $('#allH').onclick = () => { siswa.forEach(s => pres[s.nis].s = 'H'); drawP(); };
  $('#dz').onclick = () => $('#ff').click();
  $('#ff').onchange = safe(async e => { fotos = await Promise.all([...e.target.files].slice(0, 3).map(compress)); $('#th').innerHTML = fotos.map(f => `<img src="${f.prev}">`).join(''); });
  $('#jf').onsubmit = safe(async e => {
    e.preventDefault();
    const data = { tanggal: $('#jt').value, kelas: $('#jk').value, mapel: $('#jm').value, jam: $('#jj').value, materi: $('#jmt').value, kegiatan: $('#jg').value, catatan: $('#jc').value,
      kirimEmail: $('#je').checked, fotos: fotos.map(({ name, mime, data }) => ({ name, mime, data })), presensi: siswa.map(s => ({ nis: s.nis, status: pres[s.nis].s, ket: pres[s.nis].k })) };
    const r = await api('saveJurnal', data); notif(r.message); location.hash = '#dashboard';
  });
}

// ---------- Gradebook ----------
async function pNilai() {
  const kl = await kelasList(); let siswa = [], val = {};
  $('#view').innerHTML = `<div class="pg"><div><h1>Buku Nilai Siswa (Gradebook)</h1><p class="mu">Nilai divalidasi 0–100. NA = TP1×20% + TP2×20% + UH1×25% + UTS×35%.</p></div></div>
  <div class="card sec"><div class="row2"><label>Kelas<select id="nk">${opts(kl)}</select></label><label>Mata Pelajaran<input id="nm" value="${esc(S.user.mapel || '')}"></label></div></div>
  <div class="grid4" id="ns"></div><div class="card sec scroll" id="nt"></div><button class="btn" id="nsv">Simpan Semua Nilai ke Google Sheets</button>`;
  const draw = () => {
    const nas = siswa.map(s => na(val[s.nis]));
    const has = nas.length; const avg = has ? nas.reduce((a, b) => a + b, 0) / has : 0, tun = nas.filter(v => v >= KKM).length;
    $('#ns').innerHTML = [['Rata-rata Kelas', avg.toFixed(1)], ['Nilai Tertinggi', has ? Math.max(...nas).toFixed(1) : '-'], ['Nilai Terendah', has ? Math.min(...nas).toFixed(1) : '-'], [`Ketuntasan (KKM ${KKM})`, has ? Math.round(tun / has * 100) + '%' : '-']]
      .map(([t, v]) => `<div class="card stat"><small>${t}</small><b>${v}</b></div>`).join('');
    $('#nt').innerHTML = `<table><tr><th>No</th><th>NIS</th><th>Nama</th>${Object.keys(W).map(k => `<th>${k}</th>`).join('')}<th>NA</th><th>Predikat</th><th>Status</th></tr>${siswa.map((s, i) => { const v = na(val[s.nis]);
      return `<tr><td>${i + 1}</td><td>${s.nis}</td><td><b>${esc(s.nama)}</b></td>${Object.keys(W).map(k => `<td><input class="gi ${Number(val[s.nis][k]) < KKM && val[s.nis][k] !== '' ? 'low' : ''}" type="number" min="0" max="100" data-n="${s.nis}" data-j="${k}" value="${val[s.nis][k]}"></td>`).join('')}
      <td><b>${v.toFixed(1)}</b></td><td>${pred(v)}</td><td><span class="chip ${v >= KKM ? 'ok' : 'wr'}">${v >= KKM ? 'Tuntas' : 'Perlu Remedial'}</span></td></tr>`; }).join('')}</table>`;
  };
  const load = safe(async () => {
    const d = (await api('getNilai', { kelas: $('#nk').value, mapel: $('#nm').value })).data; siswa = d.siswa; val = {};
    siswa.forEach(s => { val[s.nis] = { TP1: '', TP2: '', UH1: '', UTS: '' }; });
    d.nilai.forEach(n => { if (val[n.nis]) val[n.nis][n.jenis] = n.nilai; }); draw();
  });
  $('#nk').onchange = load; $('#nm').onchange = load; await load();
  $('#nt').onchange = e => { const i = e.target; if (i.dataset.n) { val[i.dataset.n][i.dataset.j] = i.value; draw(); } };
  $('#nsv').onclick = safe(async () => {
    const rows = []; siswa.forEach(s => Object.keys(W).forEach(j => { if (val[s.nis][j] !== '') rows.push({ nis: s.nis, jenis: j, nilai: val[s.nis][j] }); }));
    const r = await api('saveNilai', { kelas: $('#nk').value, mapel: $('#nm').value, semester: `${SEMESTER} ${TAHUN_AJARAN}`, rows }); notif(r.message);
  });
}

// ---------- Data Siswa ----------
async function pSiswa() {
  const kl = await kelasList(); let all = (await api('siswa', {})).data.siswa;
  $('#view').innerHTML = `<div class="pg"><div><h1>Data Siswa & Direktori</h1><p class="mu">Cari berdasarkan nama, NIS, atau kelas.</p></div></div>
  <div class="card"><div class="row2"><label>Cari<input id="sq" placeholder="Nama atau NIS..."></label><label>Kelas<select id="sk"><option value="">Semua</option>${opts(kl)}</select></label></div><div class="scroll" id="st"></div></div>`;
  const draw = () => { const q = $('#sq').value.toLowerCase(), k = $('#sk').value;
    const f = all.filter(s => (!k || s.kelas === k) && (String(s.nis).includes(q) || s.nama.toLowerCase().includes(q)));
    $('#st').innerHTML = `<table><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>JK</th><th>Status</th></tr>${f.map(s => `<tr><td>${s.nis}</td><td><b>${esc(s.nama)}</b></td><td>${esc(s.kelas)}</td><td>${esc(s.jk)}</td><td><span class="chip H">${esc(s.status)}</span></td></tr>`).join('')}</table>`; };
  $('#sq').oninput = draw; $('#sk').onchange = draw; draw();
}

// ---------- Rekap PDF ----------
async function pRekap() {
  const kl = await kelasList(), d = new Date(); d.setDate(1);
  $('#view').innerHTML = `<div class="pg"><div><h1>Pusat Laporan & Rekapitulasi PDF</h1><p class="mu">PDF dibuat otomatis dan disimpan di Google Drive.</p></div></div>
  <div class="card"><div class="row2"><label>Jenis Dokumen<select id="rj"><option value="jurnal">Rekap Jurnal Harian</option><option value="nilai">Daftar Nilai</option></select></label>
    <label>Kelas<select id="rk">${opts(kl)}</select></label>
    <label>Dari<input type="date" id="rd" value="${d.toLocaleDateString('sv-SE')}"></label><label>Sampai<input type="date" id="rs" value="${today()}"></label></div>
    <label>Mata Pelajaran (untuk Daftar Nilai)<input id="rm" value="${esc(S.user.mapel || '')}"></label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="re" style="width:auto;height:auto"> Kirim juga ke email saya via Gmail</label>
    <button class="btn" id="rg">Generate & Unduh PDF</button></div>`;
  $('#rg').onclick = safe(async () => {
    const r = await api('rekapPdf', { jenis: $('#rj').value, kelas: $('#rk').value, mapel: $('#rm').value, dari: $('#rd').value, sampai: $('#rs').value, kirimEmail: $('#re').checked });
    dl(r.data.pdf, r.data.name); notif('PDF dibuat & tersimpan di Drive.');
  });
}

boot();
