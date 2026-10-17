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
  const w = /^(save|hapus|import|rekap|login)/.test(action); w ? busy(true) : bar(1);
  try {
    const r = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S && S.token, data }) });
    const j = await r.json();
    if (!j.success) { if (/Sesi berakhir/.test(j.message)) logout(); throw new Error(j.message); }
    if (w && action !== 'login') MEM = {};
    return j;
  } finally { w ? busy(false) : bar(0); }
}
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { notif(e.message || 'Terjadi kesalahan', 'err'); } };
let pend = 0, curPage = '', MEM = {}, BOOT = null, bootP = null, bootSeq = 0;
function bar(n) { pend += n ? 1 : -1; $('#bar').classList.toggle('on', pend > 0); }
// Data referensi (kelas, mapel, siswa) diambil sekali, disimpan di memori & browser → pindah menu instan
function bootData(force) {
  if (BOOT && !force) return Promise.resolve(BOOT);
  if (bootP && !force) return bootP;
  const seq = ++bootSeq;
  const p = api('bootstrap', {}).then(j => { if (seq === bootSeq) { BOOT = j.data; try { localStorage.setItem('siagu_boot', JSON.stringify({ email: S.user.email, data: BOOT })); } catch (e) {} } return j.data; });
  bootP = p; p.finally(() => { if (bootP === p) bootP = null; }).catch(() => {});
  return p;
}
// Stale-while-revalidate: tampilkan data tersimpan seketika, lalu segarkan di latar belakang
async function swr(action, data, render, still) {
  const k = action + JSON.stringify(data), hit = MEM[k];
  if (hit) render(hit, true);
  try {
    const j = await api(action, data); MEM[k] = j.data;
    if ((!hit || JSON.stringify(hit) !== JSON.stringify(j.data)) && (!still || still())) render(j.data, false);
  } catch (e) { if (!hit) throw e; }
}
const opts = (a, sel) => a.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
const chip = s => `<span class="chip ${s}">${{ H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' }[s]}</span>`;
function dl(b64, name) { const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + b64; a.download = name; a.click(); }
const na = m => Object.keys(W).reduce((t, k) => t + (Number(m[k]) || 0) * W[k], 0);
const pred = v => v >= 90 ? 'A' : v >= 85 ? 'A-' : v >= 80 ? 'B+' : v >= 75 ? 'B' : 'C';

// ---------- Auth & shell ----------
$('#loginForm').addEventListener('submit', safe(async e => {
  e.preventDefault();
  const btn = $('#lBtn'); btn.disabled = true; btn.textContent = 'Memproses...';
  try {
    const r = await api('login', { email: $('#lEmail').value, pin: $('#lPin').value });
    S = r.data; localStorage.setItem('siagu', JSON.stringify(S)); $('#lPin').value = ''; try { history.replaceState(null, '', '#dashboard'); } catch (e) { location.hash = '#dashboard'; } boot();
  } finally { btn.disabled = false; btn.textContent = 'Masuk'; }
}));
$('#eye').onclick = () => {
  const i = $('#lPin'), show = i.type === 'password';
  i.type = show ? 'text' : 'password'; $('#eye').classList.toggle('on', show);
  $('#eye').setAttribute('aria-label', show ? 'Sembunyikan PIN' : 'Tampilkan PIN'); i.focus();
};
function logout() { S = null; kelasCache = null; BOOT = null; MEM = {}; localStorage.removeItem('siagu'); localStorage.removeItem('siagu_boot'); boot(); }
$('#out').onclick = logout;
$('#menu').onclick = () => $('#side').classList.toggle('open');

const PAGES = { dashboard: ['🏠 Dashboard', pDash], jurnal: ['📖 Jurnal Mengajar & Presensi', pJurnal], nilai: ['📝 Penilaian Siswa / Gradebook', pNilai], siswa: ['🎓 Data Siswa & Direktori', pSiswa], rekap: ['🖨️ Rekap & Cetak PDF', pRekap], profil: ['👤 Profil & Sekolah', pProfil], pengaturan: ['⚙️ Pengaturan Data', pPengaturan] };

function boot() {
  $('#login').hidden = !!S; $('#app').hidden = !S;
  if (!S) return;
  $('#ta').textContent = `T.A. ${TAHUN_AJARAN} • Semester ${SEMESTER}`;
  meBox();
  try { const c = JSON.parse(localStorage.getItem('siagu_boot') || 'null'); if (c && c.email === S.user.email) BOOT = c.data; } catch (e) {}
  bootData(true).catch(() => {});
  route();
}
const route = safe(async () => {
  if (!S) return;
  const adm = S.user.peran === 'Admin';
  let k = location.hash.slice(1) || 'dashboard'; if (!PAGES[k] || (k === 'pengaturan' && !adm)) k = 'dashboard';
  const p = PAGES[k]; curPage = k;
  $('#view').innerHTML = '<div class="card sk"></div>';
  $('#nav').innerHTML = Object.entries(PAGES).filter(([id]) => id !== 'pengaturan' || adm).map(([id, v]) => `<a href="#${id}" class="${id === k ? 'on' : ''}">${v[0]}</a>`).join('');
  $('#side').classList.remove('open');
  await p[1]();
});
window.addEventListener('hashchange', route);

// ---------- Dashboard ----------
async function pDash() {
  const h = new Date().getHours(), sapa = h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 19 ? 'Sore' : 'Malam';
  const st = (t, v) => `<div class="card stat"><small>${t}</small><b>${v}</b></div>`;
  const draw = d => {
    const k = d.kehadiran, tot = (k.H + k.S + k.I + k.A) || 1, p = d.pengampu || { kelas: [], mapel: [] }, adm = S.user.peran === 'Admin';
    $('#view').innerHTML = `
    <section class="hero"><div><h1>Selamat ${sapa}, ${esc(S.user.nama)} 👋</h1><p>${d.jurnalHariIni} jurnal sudah diisi hari ini.</p></div>
      <div><a class="btn white" href="#jurnal">+ Isi Jurnal Sekarang</a> <a class="btn out" href="#rekap">Rekap</a></div></section>
    <div class="card sec"><h2>${adm ? '🏫 Kelas & Mata Pelajaran Sekolah' : '🏫 Kelas & Mata Pelajaran yang Saya Ampu'}</h2>
      <div class="chips" style="margin-top:14px">${p.kelas.map(c => `<a class="kc" href="#jurnal"><b>${esc(c.nama)}</b><small>${c.siswa} siswa</small></a>`).join('') || `<span class="mu">${adm ? 'Belum ada kelas. Tambahkan di Pengaturan Data → Kelas & Mapel.' : 'Belum ada kelas yang diampu. Hubungi admin untuk menetapkannya.'}</span>`}</div>
      <p class="mu" style="margin:16px 0 8px"><b>Mata pelajaran</b></p>
      <div class="chips">${p.mapel.map(m => `<span class="badge">${esc(m)}</span>`).join('') || '<span class="mu">Belum ada mata pelajaran yang diampu.</span>'}</div></div>
    <div class="grid4">${st('Jurnal Hari Ini', d.jurnalHariIni)}${st('Tingkat Kehadiran', d.hadirPct + '%')}${st('Nilai Masuk Semester Ini', d.nilaiTotal)}${st('Dokumen PDF Terbit', d.pdfTotal)}</div>
    <div class="grid2">
      <div class="card"><h2>Grafik Kehadiran Hari Ini</h2><br>
        ${['H', 'S', 'I', 'A'].map(s => `<div>${chip(s)} <b>${k[s]}</b> siswa<div class="bar"><i style="width:${k[s] / tot * 100}%;background:${{ H: '#047857', S: '#B45309', I: '#1D4ED8', A: '#B91C1C' }[s]}"></i></div></div>`).join('')}</div>
      <div class="card"><h2>Jurnal Terbaru</h2><div class="scroll"><table><tr><th>Tanggal</th><th>Kelas</th><th>Materi</th></tr>
        ${d.recent.map(j => `<tr><td>${esc(j.tanggal)}</td><td>${esc(j.kelas)}</td><td>${esc(j.materi)}</td></tr>`).join('') || '<tr><td colspan="3" class="mu">Belum ada jurnal.</td></tr>'}</table></div></div>
    </div>`;
  };
  await swr('dashboard', {}, draw, () => curPage === 'dashboard');
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
const noClass = () => { $('#view').innerHTML = `<div class="card"><h2>Belum ada kelas yang diampu</h2><p class="mu">${S.user.peran === 'Admin' ? 'Tambahkan kelas di Pengaturan Data → Kelas & Mapel.' : 'Hubungi admin untuk menetapkan kelas dan mata pelajaran yang Anda ampu.'}</p></div>`; };
async function pJurnal() {
  const B = await bootData(), kl = B.kelas, mp = B.mapel; let fotos = [], pres = {}, siswa = [];
  if (!kl.length) return noClass();
  $('#view').innerHTML = `<div class="pg"><div><h1>Formulir Jurnal Mengajar & Presensi</h1><p class="mu">Isi proses pembelajaran, presensi, dan unggah foto kegiatan.</p></div></div>
  <form id="jf"><div class="card sec"><h2>1. Informasi Pembelajaran</h2><div class="row2">
    <label>Tanggal<input type="date" id="jt" value="${today()}" required></label>
    <label>Kelas<select id="jk">${opts(kl)}</select></label>
    <label>Mata Pelajaran${mp.length ? `<select id="jm">${opts(mp)}</select>` : '<input id="jm" required>'}</label>
    <label>Jam Pelajaran<input id="jj" placeholder="Jam ke 1-2 (07.30-09.00)" required></label></div>
    <label>Materi / Pokok Bahasan<input id="jmt" required></label>
    <div class="row2"><label>Kegiatan Pembelajaran<textarea id="jg" required></textarea></label><label>Catatan / Hambatan (opsional)<textarea id="jc"></textarea></label></div></div>
  <div class="card sec"><h2>2. Dokumentasi Kegiatan</h2><div class="drop" id="dz">📷 Pilih foto kegiatan (maks. 3, dikompres otomatis)</div>
    <input type="file" id="ff" accept="image/*" multiple hidden><div class="thumbs" id="th"></div></div>
  <div class="card sec"><div class="pg"><h2>3. Presensi Roll-Call</h2><button type="button" class="btn sm" id="allH">Tandai Semua Hadir</button></div>
    <div id="pt" class="scroll"></div></div>
  <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><label style="margin:0"><input type="checkbox" id="je" checked style="width:auto;height:auto"> Kirim tanda terima ke email guru</label><span class="grow"></span><button class="btn" type="submit">Simpan Jurnal & Kirim Presensi</button></div></form>`;
  const drawP = () => {
    $('#pt').innerHTML = siswa.length ? `<table><tr><th>No</th><th>Nama & NIS</th><th>Status</th><th>Keterangan</th></tr>${siswa.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.nama)}</b><br><small class="mu">NIS ${s.nis}</small></td>
      <td><span class="sb">${['H', 'S', 'I', 'A'].map(x => `<button type="button" data-n="${s.nis}" data-s="${x}" class="${pres[s.nis].s === x ? 'on' : ''}">${x}</button>`).join('')}</span></td>
      <td><input data-k="${s.nis}" value="${esc(pres[s.nis].k)}" placeholder="-"></td></tr>`).join('')}</table>` : '<p class="mu">Belum ada siswa aktif di kelas ini. Admin dapat menambahkannya di Pengaturan Data.</p>';
  };
  const loadS = () => { siswa = B.siswa.filter(s => s.kelas === $('#jk').value && s.status !== 'Nonaktif'); pres = {}; siswa.forEach(s => pres[s.nis] = { s: 'H', k: '' }); drawP(); };
  $('#jk').onchange = loadS; loadS();
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
  const B = await bootData(), kl = B.kelas, mp = B.mapel; let siswa = [], val = {}, dirty = false;
  if (!kl.length) return noClass();
  $('#view').innerHTML = `<div class="pg"><div><h1>Buku Nilai Siswa (Gradebook)</h1><p class="mu">Nilai divalidasi 0–100. NA = TP1×20% + TP2×20% + UH1×25% + UTS×35%.</p></div></div>
  <div class="card sec"><div class="row2"><label>Kelas<select id="nk">${opts(kl)}</select></label><label>Mata Pelajaran${mp.length ? `<select id="nm">${opts(mp)}</select>` : '<input id="nm">'}</label></div></div>
  <div class="grid4" id="ns"></div><div class="card sec scroll" id="nt"></div><button class="btn" id="nsv">Simpan Semua Nilai ke Google Sheets</button>`;
  const draw = () => {
    const nas = siswa.map(s => na(val[s.nis])), has = nas.length;
    const avg = has ? nas.reduce((a, b) => a + b, 0) / has : 0, tun = nas.filter(v => v >= KKM).length;
    $('#ns').innerHTML = [['Rata-rata Kelas', avg.toFixed(1)], ['Nilai Tertinggi', has ? Math.max(...nas).toFixed(1) : '-'], ['Nilai Terendah', has ? Math.min(...nas).toFixed(1) : '-'], [`Ketuntasan (KKM ${KKM})`, has ? Math.round(tun / has * 100) + '%' : '-']]
      .map(([t, v]) => `<div class="card stat"><small>${t}</small><b>${v}</b></div>`).join('');
    $('#nt').innerHTML = siswa.length ? `<table><tr><th>No</th><th>NIS</th><th>Nama</th>${Object.keys(W).map(k => `<th>${k}</th>`).join('')}<th>NA</th><th>Predikat</th><th>Status</th></tr>${siswa.map((s, i) => { const v = na(val[s.nis]);
      return `<tr><td>${i + 1}</td><td>${s.nis}</td><td><b>${esc(s.nama)}</b></td>${Object.keys(W).map(k => `<td><input class="gi ${Number(val[s.nis][k]) < KKM && val[s.nis][k] !== '' ? 'low' : ''}" type="number" min="0" max="100" data-n="${s.nis}" data-j="${k}" value="${val[s.nis][k]}"></td>`).join('')}
      <td><b>${v.toFixed(1)}</b></td><td>${pred(v)}</td><td><span class="chip ${v >= KKM ? 'ok' : 'wr'}">${v >= KKM ? 'Tuntas' : 'Perlu Remedial'}</span></td></tr>`; }).join('')}</table>` : '<p class="mu">Belum ada siswa aktif di kelas ini.</p>';
  };
  const sel = () => $('#nk').value + '|' + $('#nm').value;
  const load = safe(async () => {
    dirty = false; const key = sel();
    await swr('getNilai', { kelas: $('#nk').value, mapel: $('#nm').value }, d => {
      if (dirty || key !== sel() || curPage !== 'nilai') return;
      siswa = d.siswa; val = {}; siswa.forEach(s => { val[s.nis] = { TP1: '', TP2: '', UH1: '', UTS: '' }; });
      d.nilai.forEach(n => { if (val[n.nis]) val[n.nis][n.jenis] = n.nilai; }); draw();
    });
  });
  $('#nk').onchange = load; $('#nm').onchange = load; load();
  $('#nt').onchange = e => { const i = e.target; if (i.dataset.n) { dirty = true; val[i.dataset.n][i.dataset.j] = i.value; draw(); } };
  $('#nsv').onclick = safe(async () => {
    const rows = []; siswa.forEach(s => Object.keys(W).forEach(j => { if (val[s.nis][j] !== '') rows.push({ nis: s.nis, jenis: j, nilai: val[s.nis][j] }); }));
    const r = await api('saveNilai', { kelas: $('#nk').value, mapel: $('#nm').value, semester: `${SEMESTER} ${TAHUN_AJARAN}`, rows }); notif(r.message); dirty = false;
  });
}

// ---------- Data Siswa & Guru (tambah / edit / hapus untuk Admin) ----------
function modal(title, body, onSave) {
  const o = document.createElement('div'); o.className = 'ov';
  o.innerHTML = `<form class="card md"><h2>${title}</h2><br>${body}<div class="acts"><button type="button" class="btn out" data-x>Batal</button><button class="btn" type="submit">Simpan</button></div></form>`;
  document.body.appendChild(o);
  const f = $('form', o), close = () => o.remove();
  $('[data-x]', o).onclick = close;
  f.onsubmit = safe(async e => { e.preventDefault(); await onSave(f); close(); });
}
function readPdf(i) {
  return new Promise((res, rej) => {
    const f = i.files[0]; if (!f) return res(null);
    if (!/\.pdf$/i.test(f.name)) return rej(new Error('Berkas harus berformat PDF.'));
    if (f.size > 5 * 1024 * 1024) return rej(new Error('PDF maksimal 5 MB.'));
    const r = new FileReader(); r.onload = () => res({ name: f.name, data: r.result.split(',')[1] }); r.readAsDataURL(f);
  });
}
const pdfLink = l => l ? `<a href="${esc(l)}" target="_blank" rel="noopener">📄 Lihat</a>` : '-';
const actBtns = id => `<button class="ghost" data-a="e" data-i="${esc(id)}">✏️ Edit</button><button class="ghost" style="color:var(--er)" data-a="d" data-i="${esc(id)}">🗑️ Hapus</button>`;
const selOpt = (a, v) => a.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');

async function pSiswa() {
  $('#view').innerHTML = `<div class="pg"><div><h1>Data Siswa & Direktori</h1><p class="mu">Cari berdasarkan nama, NIS, atau kelas.</p></div></div><div id="pn"></div>`;
  await siswaPanel($('#pn'));
}
async function siswaPanel(el, fresh) {
  const adm = S.user.peran === 'Admin', B = await bootData(fresh), all = B.siswa, kl = B.kelas;
  el.innerHTML = `<div class="card"><div class="row2"><label>Cari<input id="sq" placeholder="Nama atau NIS..."></label><label>Kelas<select id="sk"><option value="">Semua</option>${opts(kl)}</select></label></div>
    ${adm ? '<button class="btn sm" id="sadd">+ Tambah Siswa</button>' : ''}<div class="scroll" id="st"></div></div>`;
  const draw = () => {
    const q = $('#sq').value.toLowerCase(), k = $('#sk').value;
    const f = all.filter(s => (!k || s.kelas === k) && (String(s.nis).includes(q) || String(s.nama).toLowerCase().includes(q)));
    $('#st').innerHTML = `<table><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th>JK</th><th>Status</th><th>Berkas</th>${adm ? '<th>Aksi</th>' : ''}</tr>${f.map(s =>
      `<tr><td>${s.nis}</td><td><b>${esc(s.nama)}</b></td><td>${esc(s.kelas)}</td><td>${esc(s.jk)}</td><td><span class="chip ${s.status === 'Aktif' ? 'H' : 'A'}">${esc(s.status)}</span></td><td>${pdfLink(s.link_pdf)}</td>${adm ? `<td style="white-space:nowrap">${actBtns(s.nis)}</td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="mu">Tidak ada data.</td></tr>'}</table>`;
  };
  const form = s => modal(s ? 'Edit Siswa' : 'Tambah Siswa', `<div class="row2">
    <label>NIS<input name="nis" required value="${esc(s?.nis)}"></label><label>Nama Lengkap<input name="nama" required value="${esc(s?.nama)}"></label>
    <label>Kelas<input name="kelas" list="kls" required value="${esc(s?.kelas)}" placeholder="contoh: X TKJ 1"><datalist id="kls">${kl.map(k => `<option value="${esc(k)}">`).join('')}</datalist></label>
    <label>Jenis Kelamin<select name="jk"><option value="L" ${s?.jk === 'L' ? 'selected' : ''}>Laki-laki (L)</option><option value="P" ${s?.jk === 'P' ? 'selected' : ''}>Perempuan (P)</option></select></label>
    <label>Status<select name="status">${selOpt(['Aktif', 'Nonaktif'], s?.status)}</select></label>
    <label>Berkas PDF (opsional, maks. 5 MB)<input type="file" name="pdf" accept="application/pdf"></label></div>
    ${s?.link_pdf ? `<p class="mu">Berkas saat ini: ${pdfLink(s.link_pdf)} — pilih file baru untuk menggantinya.</p>` : ''}`,
  async f => {
    const e = f.elements, pdf = await readPdf(e.pdf);
    const r = await api('saveSiswa', { oldNis: s ? s.nis : '', nis: e.nis.value.trim(), nama: e.nama.value.trim(), kelas: e.kelas.value.trim(), jk: e.jk.value, status: e.status.value, pdf });
    notif(r.message); await siswaPanel(el, true);
  });
  $('#sq').oninput = draw; $('#sk').onchange = draw; draw();
  if (adm) {
    $('#sadd').onclick = () => form();
    $('#st').onclick = safe(async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const s = all.find(x => String(x.nis) === b.dataset.i);
      if (b.dataset.a === 'e') form(s);
      else if (confirm(`Hapus siswa ${s.nama} (NIS ${s.nis})? Tindakan ini tidak dapat dibatalkan.`)) { notif((await api('hapusSiswa', { nis: s.nis })).message); await siswaPanel(el, true); }
    });
  }
}
async function guruPanel(el, fresh) {
  const B = await bootData(fresh), all = (await api('getGuru', {})).data.guru;
  el.innerHTML = `<div class="card"><button class="btn sm" id="gadd">+ Tambah Guru</button><div class="scroll"><table><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Mapel</th><th>Kelas</th><th>Status</th><th>Berkas</th><th>Aksi</th></tr>${all.map(g =>
    `<tr><td><b>${esc(g.nama)}</b><br><small class="mu">${esc(g.nip)}</small></td><td>${esc(g.email)}</td><td>${esc(g.peran)}</td><td>${esc(g.mapel)}</td><td>${esc(g.kelas)}</td><td><span class="chip ${g.status === 'Aktif' ? 'H' : 'A'}">${esc(g.status)}</span></td><td>${pdfLink(g.link_pdf)}</td><td style="white-space:nowrap">${actBtns(g.email)}</td></tr>`).join('')}</table></div></div>`;
  const form = g => modal(g ? 'Edit Guru' : 'Tambah Guru', `<div class="row2">
    <label>Nama Lengkap<input name="nama" required value="${esc(g?.nama)}"></label><label>Email<input name="email" type="email" required value="${esc(g?.email)}"></label>
    <label>Peran<select name="peran">${selOpt(['Guru', 'Admin'], g?.peran)}</select></label><label>NIP<input name="nip" value="${esc(g?.nip)}"></label>

    <label>Status<select name="status">${selOpt(['Aktif', 'Nonaktif'], g?.status)}</select></label>
    <label>PIN ${g ? '(kosongkan jika tidak diganti)' : '(min. 4 karakter)'}<input name="pin" type="password" autocomplete="new-password" ${g ? '' : 'required'}></label></div>
    ${chk('kelas', '🏫 Kelas yang diampu', B.kelas, g?.kelas)}${chk('mapel', '📚 Mata pelajaran yang diampu', B.mapel, g?.mapel)}
    <label>Berkas PDF (opsional, maks. 5 MB)<input type="file" name="pdf" accept="application/pdf"></label>
    ${g?.link_pdf ? `<p class="mu">Berkas saat ini: ${pdfLink(g.link_pdf)}</p>` : ''}`,
  async f => {
    const e = f.elements, pdf = await readPdf(e.pdf);
    const r = await api('saveGuru', { oldEmail: g ? g.email : '', email: e.email.value, nama: e.nama.value, peran: e.peran.value, nip: e.nip.value, mapel: picks(f, 'mapel'), kelas: picks(f, 'kelas'), status: e.status.value, pin: e.pin.value, pdf });
    notif(r.message); await guruPanel(el, true);
  });
  $('#gadd').onclick = () => form();
  $('table', el).onclick = safe(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const g = all.find(x => x.email === b.dataset.i);
    if (b.dataset.a === 'e') form(g);
    else if (confirm(`Hapus guru ${g.nama} (${g.email})? Tindakan ini tidak dapat dibatalkan.`)) { notif((await api('hapusGuru', { email: g.email })).message); await guruPanel(el, true); }
  });
}
// ---------- Kelas & Mapel (master data, Admin) ----------
const splitL = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const chk = (n, t, all, sel) => { const s = splitL(sel); return `<div class="chkg"><b>${t}</b><div>${all.length ? all.map(x => `<label class="ck"><input type="checkbox" name="${n}" value="${esc(x)}" ${s.includes(x) ? 'checked' : ''}> ${esc(x)}</label>`).join('') : '<span class="mu">Belum ada data. Tambahkan di tab Kelas & Mapel.</span>'}</div></div>`; };
const picks = (f, n) => [...f.querySelectorAll(`input[name=${n}]:checked`)].map(i => i.value).join(', ');
async function masterPanel(el) {
  const d = (await api('getMaster', {})).data;
  const card = (t, tipe, ico, list) => `<div class="card sec"><h2>${ico} ${t}</h2>
    <form class="mf" data-tipe="${tipe}"><input name="nama" required placeholder="${tipe === 'kelas' ? 'contoh: X TKJ 1' : 'contoh: Matematika Wajib'}"><button class="btn">+ Tambah</button></form>
    <div class="chips">${list.map(x => `<span class="mi"><b>${esc(x.nama)}</b><small>${tipe === 'kelas' ? `${x.siswa} siswa • ${x.guru} guru` : `${x.guru} guru`}</small><button type="button" class="ghost" data-del="${tipe}" data-n="${esc(x.nama)}" title="Hapus">🗑️</button></span>`).join('') || '<span class="mu">Belum ada data.</span>'}</div></div>`;
  el.innerHTML = `<div class="grid2">${card('Daftar Kelas', 'kelas', '🏫', d.kelas)}${card('Daftar Mata Pelajaran', 'mapel', '📚', d.mapel)}</div>
    <p class="mu">Kelas dan mapel ini dipilih saat menetapkan <b>kelas & mapel yang diampu</b> pada tab Data Guru. Item yang masih dipakai siswa atau guru tidak dapat dihapus.</p>`;
  $$('.mf', el).forEach(f => f.onsubmit = safe(async e => { e.preventDefault(); const r = await api('saveMaster', { tipe: f.dataset.tipe, nama: f.elements.nama.value }); notif(r.message); await bootData(true); await masterPanel(el); }));
  $$('[data-del]', el).forEach(b => b.onclick = safe(async () => {
    if (!confirm(`Hapus ${b.dataset.del} "${b.dataset.n}"?`)) return;
    const r = await api('hapusMaster', { tipe: b.dataset.del, nama: b.dataset.n }); notif(r.message); await bootData(true); await masterPanel(el);
  }));
}

async function pPengaturan() {
  $('#view').innerHTML = `<div class="pg"><div><h1>Pengaturan Data</h1><p class="mu">Kelola data siswa dan guru: tambah, ubah, hapus, dan unggah berkas PDF.</p></div></div>
    <div class="tabs"><button class="btn" data-t="s">🎓 Data Siswa</button><button class="btn out" data-t="g">👩‍🏫 Data Guru</button><button class="btn out" data-t="m">🏫 Kelas & Mapel</button><button class="btn out" data-t="x">📥 Import Excel</button></div><div id="pn"></div>`;
  const go = async t => { $$('.tabs button').forEach(b => b.className = 'btn' + (b.dataset.t === t ? '' : ' out')); await ({ s: siswaPanel, g: guruPanel, m: masterPanel, x: importPanel }[t])($('#pn')); };
  $$('.tabs button').forEach(b => b.onclick = safe(() => go(b.dataset.t)));
  await go('s');
}

// ---------- Import Excel & Template ----------
const TPL = {
  siswa: { f: 'Template_Data_Siswa.xlsx', h: ['NIS', 'Nama', 'Kelas', 'JK', 'Status'], x: [['240199', 'Contoh Siswa', 'X TKJ 1', 'L', 'Aktif']], api: 'importSiswa', n: 'Siswa', info: 'NIS, Nama, Kelas wajib. JK: L/P. Status: Aktif/Nonaktif. NIS yang sudah ada akan diperbarui.' },
  guru: { f: 'Template_Data_Guru.xlsx', h: ['Email', 'Nama', 'Peran', 'NIP', 'Mapel', 'Kelas', 'Status', 'PIN'], x: [['guru.baru@sekolah.sch.id', 'Contoh Guru, S.Pd.', 'Guru', '198001012005011001', 'Matematika', 'X TKJ 1, X TKJ 2', 'Aktif', '123456']], api: 'importGuru', n: 'Guru', info: 'Email, Nama wajib. Peran: Guru/Admin. Kelas & Mapel dipisah koma (nama harus sama dengan Daftar Kelas/Mapel). PIN wajib untuk akun baru. Kolom kosong pada akun lama = data lama tidak diubah.' }
};
const needX = () => { if (typeof XLSX === 'undefined') throw new Error('Pustaka Excel belum termuat. Periksa koneksi internet lalu muat ulang.'); };
function downloadTpl(t) {
  needX(); const c = TPL[t], wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([c.h, ...c.x]);
  if (t === 'guru') ws['!cols'] = c.h.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Data'); XLSX.writeFile(wb, c.f);
}
async function readXlsx(file) {
  needX(); const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
    .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])))
    .filter(r => Object.values(r).some(v => v !== ''));
}
async function importPanel(el) {
  const data = {};
  el.innerHTML = Object.keys(TPL).map(t => `<div class="card sec"><h2>Import Data ${TPL[t].n} dari Excel</h2><p class="mu">${TPL[t].info}</p>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn out" data-t="${t}">⬇️ Unduh Template</button>
    <input type="file" accept=".xlsx,.xls" data-f="${t}" style="width:auto"><button class="btn" data-i="${t}" disabled>Import</button><span class="mu" id="inf-${t}"></span></div></div>`).join('');
  $$('[data-t]', el).forEach(b => b.onclick = safe(async () => downloadTpl(b.dataset.t)));
  $$('[data-f]', el).forEach(i => i.onchange = safe(async () => {
    const t = i.dataset.f; data[t] = i.files[0] ? await readXlsx(i.files[0]) : null;
    $('#inf-' + t).textContent = data[t] ? `${data[t].length} baris siap diimpor` : ''; $(`[data-i=${t}]`, el).disabled = !(data[t] && data[t].length);
  }));
  $$('[data-i]', el).forEach(b => b.onclick = safe(async () => {
    const t = b.dataset.i; if (!confirm(`Impor ${data[t].length} baris data ${TPL[t].n.toLowerCase()}?`)) return;
    const r = await api(TPL[t].api, { rows: data[t] }); notif(r.message); kelasCache = null; bootData(true).catch(() => {}); data[t] = null; $('#inf-' + t).textContent = '✓ ' + r.message; b.disabled = true;
  }));
}

// ---------- Profil & Sekolah ----------
function meBox() { $('#me').innerHTML = `<b>${esc(S.user.nama)}</b><br>${esc(S.user.peran)}${S.sekolah ? '<br><span class="mu">' + esc(S.sekolah) + '</span>' : ''}<br><small class="mu">SIAGU v6</small>`; }
const saveS = () => localStorage.setItem('siagu', JSON.stringify(S));
let KOP = null; // null | 'DEL' | {name,mime,data,prev}
function readKop(file) {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) return rej(new Error('Kop harus berupa gambar PNG atau JPG.'));
    const fr = new FileReader(), img = new Image();
    fr.onload = () => { img.onload = () => {
      const r = Math.min(1, 1400 / img.width), c = document.createElement('canvas'); c.width = img.width * r; c.height = img.height * r;
      const x = c.getContext('2d'); let mime = file.type, u;
      const paint = () => { if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL(mime, .85); };
      u = paint(); if (u.length > 880000) { mime = 'image/jpeg'; u = paint(); }
      if (u.length > 880000) return rej(new Error('Gambar kop terlalu besar. Perkecil ukurannya.'));
      res({ name: 'kop', mime, data: u.split(',')[1], prev: u });
    }; img.onerror = () => rej(new Error('Gambar tidak dapat dibaca.')); img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
async function pProfil() {
  const adm = S.user.peran === 'Admin', dis = adm ? '' : 'disabled';
  await swr('getProfil', {}, d => { const me = d.me, sk = d.sekolah;
  $('#view').innerHTML = `<div class="pg"><div><h1>Profil & Sekolah</h1><p class="mu">Data ini dipakai pada kop surat dan tanda tangan PDF.</p></div></div>
  <div class="grid2"><form class="card" id="pf"><h2>Profil Saya</h2><br>
    <label>Email (tidak dapat diubah)<input value="${esc(me.email)}" disabled></label>
    <label>Nama Lengkap<input name="nama" required value="${esc(me.nama)}"></label>
    <label>NIP<input name="nip" value="${esc(me.nip)}"></label>
    <label>PIN Lama (isi hanya jika ingin ganti PIN)<input name="pl" type="password" autocomplete="current-password"></label>
    <label>PIN Baru (min. 4 karakter)<input name="pb" type="password" autocomplete="new-password"></label>
    <button class="btn">Simpan Profil</button></form>
  <form class="card" id="sf"><h2>Profil Sekolah</h2><br>
    <label>Nama Sekolah<input name="ns" ${dis} value="${esc(sk.nama_sekolah)}" placeholder="SMK Negeri 1 Jakarta"></label>
    <label>Alamat Sekolah<textarea name="al" ${dis}>${esc(sk.alamat)}</textarea></label>
    <label>Nama Kepala Sekolah<input name="kp" ${dis} value="${esc(sk.kepsek)}"></label>
    <label>NIP Kepala Sekolah<input name="nk" ${dis} value="${esc(sk.nip_kepsek)}"></label>
    <div class="kop"><b>Kop Sekolah (gambar)</b><p class="mu" style="margin:4px 0">Dicetak di bagian atas semua PDF. Disarankan PNG/JPG, lebar ≥ 1200 px, berisi logo, nama, dan alamat sekolah.</p>
      <div id="kopPrev" class="kopbox">${sk.kop_id ? 'Memuat kop...' : 'Belum ada kop. PDF memakai nama & alamat sekolah berupa teks.'}</div>
      ${adm ? `<input type="file" id="kopFile" accept="image/png,image/jpeg">${sk.kop_id ? '<button type="button" class="btn out sm" id="kopDel">Hapus Kop</button>' : ''}` : ''}</div>
    ${adm ? '<button class="btn">Simpan Profil Sekolah</button>' : '<p class="mu">Hanya Admin yang dapat mengubah profil sekolah.</p>'}</form></div>`;
  KOP = null;
  if (sk.kop_id) swr('getKop', {}, k => { const b = $('#kopPrev'); if (b && !KOP) b.innerHTML = k.kop ? `<img src="${k.kop}" alt="Kop sekolah">` : 'Kop tidak dapat dimuat.'; }, () => curPage === 'profil').catch(() => {});
  if (adm) {
    $('#kopFile').onchange = safe(async e => { const f = e.target.files[0]; if (!f) return; KOP = await readKop(f); $('#kopPrev').innerHTML = `<img src="${KOP.prev}" alt="Kop baru">`; });
    const del = $('#kopDel'); if (del) del.onclick = () => { KOP = 'DEL'; $('#kopPrev').textContent = 'Kop akan dihapus setelah Anda menekan "Simpan Profil Sekolah".'; };
  }
  $('#pf').onsubmit = safe(async e => {
    e.preventDefault(); const f = e.target.elements;
    const r = await api('saveProfil', { nama: f.nama.value, nip: f.nip.value, pinLama: f.pl.value, pinBaru: f.pb.value });
    S.user.nama = r.data.nama; saveS(); meBox(); f.pl.value = f.pb.value = ''; notif(r.message);
  });
  if (adm) $('#sf').onsubmit = safe(async e => {
    e.preventDefault(); const f = e.target.elements;
    const k = KOP && KOP !== 'DEL' ? { name: KOP.name, mime: KOP.mime, data: KOP.data } : undefined;
    const r = await api('saveSekolah', { nama_sekolah: f.ns.value, alamat: f.al.value, kepsek: f.kp.value, nip_kepsek: f.nk.value, kop: k, hapusKop: KOP === 'DEL' });
    S.sekolah = r.data.nama_sekolah; saveS(); meBox(); notif(r.message); KOP = null; await pProfil();
  });
  }, () => curPage === 'profil');
}

// ---------- Rekap PDF ----------
async function pRekap() {
  const B = await bootData(), kl = B.kelas, d = new Date(); d.setDate(1);
  $('#view').innerHTML = `<div class="pg"><div><h1>Pusat Laporan & Rekapitulasi PDF</h1><p class="mu">PDF dibuat otomatis dan disimpan di Google Drive.</p></div></div>
  <div class="card"><div class="row2"><label>Jenis Dokumen<select id="rj"><option value="jurnal">Rekap Jurnal Harian</option><option value="nilai">Daftar Nilai</option></select></label>
    <label>Kelas<select id="rk">${opts(kl)}</select></label>
    <label>Dari<input type="date" id="rd" value="${d.toLocaleDateString('sv-SE')}"></label><label>Sampai<input type="date" id="rs" value="${today()}"></label></div>
    <label>Mata Pelajaran (untuk Daftar Nilai)${B.mapel.length ? `<select id="rm">${opts(B.mapel)}</select>` : '<input id="rm">'}</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="re" style="width:auto;height:auto"> Kirim juga ke email saya via Gmail</label>
    <button class="btn" id="rg">Generate & Unduh PDF</button></div>`;
  $('#rg').onclick = safe(async () => {
    const r = await api('rekapPdf', { jenis: $('#rj').value, kelas: $('#rk').value, mapel: $('#rm').value, dari: $('#rd').value, sampai: $('#rs').value, kirimEmail: $('#re').checked });
    dl(r.data.pdf, r.data.name); notif('PDF dibuat & tersimpan di Drive.');
  });
}

const NEED_API = 6; // versi backend minimum
async function cekBackend() {
  try {
    const j = await (await fetch(GAS_URL)).json();
    if (!(j.version >= NEED_API)) throw 0;
  } catch (e) {
    $('#warn').hidden = false;
    $('#warn').innerHTML = '⚠️ <b>Backend Google Apps Script belum diperbarui</b> atau belum bisa dijangkau, sehingga menu Profil, Edit/Hapus, dan Import belum berfungsi. Buka Apps Script → <b>Deploy → Manage deployments → ✏️ → Version: New version → Deploy</b>, lalu muat ulang halaman ini (Ctrl+Shift+R).';
  }
}
boot();
cekBackend();
