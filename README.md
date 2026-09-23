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

## Operasional

- Restart setelah mengubah plugin: `opencode service restart`.
- Log: `~/.config/opencode/logs/token-tracker/tokens.jsonl`.
- Format baris: `LogEntry` (lihat `lib.ts`).