# token-tracker

Plugin OpenCode (V2) pelacak token & biaya. Semua output Bahasa Indonesia.

- **Server** (`index.ts`): mencatat setiap pesan assistant selesai ke
  `~/.config/opencode/logs/token-tracker/tokens.jsonl` (append-only, dedupe by messageId).
- **TUI** (`tui.ts`): toast `N token dipakai` setiap pesan AI selesai.
- **Command** `/usage`: laporan token & biaya sesi ini + hari ini.

## Struktur

- `lib.ts` — fungsi murni (format, parse jsonl, ringkas, laporan) — diuji `node --test test/lib.test.ts`.
- `index.ts` — plugin server (subscribe event → reconcile → JSONL; command `/usage`).
- `tui.ts` — plugin TUI (toast), tanpa JSX.

## Pemasangan ulang di perangkat baru (tanpa dibuat ulang)

### Opsi A — offline (tarball direktori)
Gunakan `token-tracker-0.1.0.tgz` (hasilkan ulang kapan saja dengan `npm pack`):

1. Salin/ekstrak ke mana pun, mis. `~/.config/opencode/plugins/token-tracker`.
2. Pastikan sudah masuk daftar `"plugins"` di `opencode.json`:
   `"file:///data/data/com.termux/files/home/.config/opencode/plugins/token-tracker"`
3. `cd <dir-plugin> && npm install` (memasang dependensi `@opencode/plugin`).
4. `opencode service restart`.

### Opsi B — remote git (produksi)
1. Push repo ini ke git host (mis. GitHub). Pastikan `package.json` ikut ter-commit
   (sudah). Jangan commit `node_modules/` (ada di `.gitignore`).
2. Di perangkat baru: `opencode plugin add token-tracker@git+https://host/user/token-tracker`.
   Installer meng-clone lalu memasang dependensi otomatis.

Log tetap dibuat di `~/.config/opencode/logs/token-tracker/tokens.jsonl` (per pengguna).

## Operasional

- Restart setelah mengubah plugin: `opencode service restart`.
- Log: `~/.config/opencode/logs/token-tracker/tokens.jsonl`.
- Format baris: `LogEntry` (lihat `lib.ts`).