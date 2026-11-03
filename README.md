# ECO-BYTE Premium — Google Apps Script + Google Sheets + Gemini AI

## Isi paket
- `Index.html`: dashboard premium yang dihidangkan oleh Google Apps Script.
- `Home.html`: halaman depan premium untuk ditanam (embed) ke Google Sites; tombolnya membuka dashboard.
- `Code.gs`: backend, autentikasi PIN, penyimpanan data, rekap admin, dan integrasi Gemini API.
- `appsscript.json`: konfigurasi proyek Apps Script.

## Model AI yang dipilih
Paket menggunakan `gemini-3.1-flash-lite` sebagai pilihan awal hemat biaya untuk rekomendasi singkat. Ketersediaan, batas gratis, dan harga dapat berubah; periksa halaman harga resmi Gemini API. Jika memakai tier gratis, baca ketentuan pemrosesan data Google sebelum mengirim data siswa. Jangan kirim NISN, alamat, nomor telepon, data kesehatan, atau informasi sensitif.

## Instalasi
1. Masuk ke https://script.google.com/ dengan akun Google milik madrasah/pengelola.
2. Buat **New project**.
3. Ganti isi `Code.gs` dengan isi file `Code.gs` dari paket ini.
4. Klik **+** → **HTML**, beri nama persis `Index`, lalu salin isi `Index.html`.
5. Buka **Project Settings** dan aktifkan **Show "appsscript.json" manifest file in editor**. Ganti manifest dengan `appsscript.json` dari paket (atau pastikan timezone Asia/Jakarta dan scope spreadsheet/external request ada).
6. Pilih fungsi `setupEcoByte` di dropdown fungsi, lalu klik **Run**. Setujui izin Google Sheets dan koneksi eksternal.
7. Buka **Execution log**. Salin URL spreadsheet, `ADMIN_PIN`, dan `STUDENT_PIN`. Kode admin bersifat rahasia; kode siswa boleh dibagikan kepada kelas yang menggunakan aplikasi.
8. Di **Project Settings → Script Properties**, tambahkan:
   - `GEMINI_API_KEY` = API key dari Google AI Studio.
   - (Opsional) `OWNER_EMAIL` = alamat Gmail pemilik proyek untuk fungsi pengambilan URL spreadsheet.
9. Untuk mendapatkan API key, buka https://aistudio.google.com/app/apikey. Jangan pernah memasukkan API key ke `Index.html`.
10. Pilih **Deploy → New deployment → Web app**.
11. **Execute as:** Me (akun pengelola). **Who has access:** pilih cakupan paling terbatas yang cocok dengan akun siswa. Jika siswa tidak memakai akun Google dalam domain yang sama, deployment “Anyone” dapat diperlukan; kode PIN pada paket ini menjadi penghalang aplikasi, tetapi bukan pengganti identitas Google yang kuat.
12. Klik Deploy, selesaikan otorisasi, lalu buka URL Web App yang berakhiran `/exec`.
13. Untuk halaman depan Google Sites, gunakan URL `URL_WEB_APP/exec?page=home`. Untuk membuka dashboard langsung, gunakan `URL_WEB_APP/exec` atau `URL_WEB_APP/exec?page=app`.
14. Di Google Sites pilih **Insert → Embed → By URL**, tempel URL `.../exec?page=home`, lalu atur ukuran embed dan publish situs.
15. Setelah perubahan kode, buka **Deploy → Manage deployments → Edit** dan pilih versi baru, lalu deploy ulang. Jangan membuka `Index.html` secara langsung dari file lokal karena `google.script.run` hanya tersedia di aplikasi yang dihidangkan Apps Script.


## Cara penggunaan
- Siswa membuka URL `/exec`, memasukkan nama, kelas, dan `STUDENT_PIN`.
- Saat menekan **Hitung & Analisis Data**, data audit dikirim ke sheet `Audit`.
- Saat mengirim LKPD, jawaban dikirim ke sheet `LKPD`.
- Saat menilai kuis, jawaban dan skor dikirim ke sheet `Kuis`.
- Tombol rekomendasi AI memanggil Gemini melalui server; respons dan metrik disimpan di sheet `AI`.
- Guru masuk dengan `ADMIN_PIN` untuk melihat rekap dan mengekspor CSV.

## Keamanan dan batasan penting
- PIN siswa bersifat bersama, sehingga sistem ini belum memverifikasi identitas siswa secara individual; siswa yang mengetahui PIN dapat mengisi nama lain. Untuk identitas yang kuat, batasi deployment ke akun Google madrasah atau kembangkan daftar akun/kelas yang diizinkan.
- `ADMIN_PIN` harus dijaga rahasia. Jangan membagikannya kepada siswa.
- Apps Script dan Sheets memiliki kuota. Untuk pemakaian satu madrasah dengan volume ringan cocok sebagai awal, tetapi bukan pengganti backend enterprise.
- Data pada Sheets menjadi data sekolah. Batasi akses spreadsheet kepada petugas berwenang dan atur retensi/penghapusan sesuai kebijakan sekolah.
- AI hanya menghasilkan saran pembelajaran; angka karbon dalam dashboard adalah estimasi edukatif dan perlu diverifikasi, bukan pengukuran ilmiah.
- Integrasi ini memerlukan tindakan Anda untuk membuat proyek, mengotorisasi izin, memasang API key, dan melakukan deployment. Paket tidak dapat otomatis masuk ke akun Google Anda dari chat.

## Troubleshooting
- **AI belum aktif**: pastikan `GEMINI_API_KEY` ada di Script Properties, key aktif, kuota tersedia, dan model dapat diakses.
- **Sesi berakhir**: login kembali; token sesi kedaluwarsa sekitar 6 jam.
- **Data tidak tersimpan**: buka aplikasi dari URL `/exec`, bukan file lokal; cek Execution log dan izin Google Sheets.
- **Model tidak ditemukan**: periksa nama model terbaru pada dokumentasi Gemini API, ubah `MODEL_NAME` di `Code.gs`, lalu deploy versi baru.
