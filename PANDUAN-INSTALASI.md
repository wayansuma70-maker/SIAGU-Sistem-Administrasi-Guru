# Panduan Instalasi SIAGU

## A. Backend (Google Apps Script) — berkas `Kode.gs`
1. Buka https://script.google.com → **Proyek Baru**.
2. Ganti nama `Code.gs` menjadi `Kode`, hapus isi lama, paste seluruh isi `Kode.gs`.
3. Pilih fungsi **setupAppEnvironment** → ▶ Run → izinkan akses Drive, Sheets, dan Gmail. **Jalankan SEKALI saja.**
4. Buka Google Drive: folder `📁 SIAGU` dan spreadsheet `🗃️ Database — SIAGU` sudah terbuat.
5. Buka sheet **Users**: ganti email contoh dengan email guru dan admin sebenarnya (peran `Admin` atau `Guru`; kolom `kelas` boleh beberapa, pisahkan koma, contoh `X TKJ 1, X TKJ 2`). Isi sheet **Siswa** dengan data siswa.
6. Ganti PIN bawaan (123456): jalankan di editor `setPin('email@sekolah.sch.id','PIN-baru')` (ketik di fungsi sementara lalu Run).
7. **Deploy → New deployment → Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy → **salin URL `/exec`**.
8. Setiap mengubah `Kode.gs`, deploy ulang: Deploy → Manage deployments → ✏️ → Version: New version.

## B. Frontend (GitHub Pages)
1. Ekstrak ZIP. Folder hasil ekstraksi (`siagu-frontend`) **adalah folder yang di-`git init`**. Jangan masuk lebih dalam, jangan naik satu level.
2. Buka `js/config.js`, ganti `ISI_URL_EXEC_DI_SINI` dengan URL `/exec` dari langkah A.7.
3. Di folder itu `dir` (Windows) atau `ls -la` harus menampilkan `index.html`, `css`, `js`.
4. Push ke GitHub (repo Public, tanpa README/.gitignore saat dibuat):
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```
5. Repo → Settings → Pages → Deploy from a branch → `main` / `(root)` → Save. Situs: `https://USERNAME.github.io/NAMA-REPO/`.
6. Update berikutnya: `git add .` → `git commit -m "pesan"` → `git push`, lalu Ctrl+Shift+R.

## C. Uji
Buka situs → login `guru@sekolah.sch.id` + PIN → isi jurnal → cek sheet **Jurnal** dan **Kehadiran**, foto di Drive `Uploads` → coba Gradebook dan Rekap PDF.
