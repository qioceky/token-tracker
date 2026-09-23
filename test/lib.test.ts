import { test } from "node:test"
import assert from "node:assert/strict"
import { buildReport, formatCost, formatTokens, parseLogLine, readLogFile, startOfToday, summarizeEntries } from "../lib.ts"
import type { LogEntry } from "../lib.ts"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("formatTokens", () => {
  assert.equal(formatTokens(0), "0")
  assert.equal(formatTokens(999), "999")
  assert.equal(formatTokens(1000), "1k")
  assert.equal(formatTokens(1234), "1.2k")
  assert.equal(formatTokens(1500000), "1.5M")
  assert.equal(formatTokens(-5), "0") // nilai negatif diflatkan
})

test("formatCost", () => {
  assert.equal(formatCost(0), "$0")
  assert.equal(formatCost(0.0023), "$0.0023")
  assert.equal(formatCost(0.1234), "$0.123")
  assert.equal(formatCost(1.5), "$1.50")
  assert.equal(formatCost(NaN), "$0")
})

test("startOfToday", () => {
  const now = new Date("2026-09-23T14:30:00.000Z")
  const start = new Date(startOfToday(now))
  // awal hari lokal: tidak boleh di masa depan, harus jam 00:00:00.000 tanggal lokal yang sama
  assert.ok(start.getTime() <= now.getTime())
  assert.equal(start.getHours(), 0)
  assert.equal(start.getMinutes(), 0)
  assert.equal(start.getSeconds(), 0)
  assert.equal(start.getMilliseconds(), 0)
  assert.equal(start.getDate(), now.getDate())
})

test("parseLogLine: baris valid", () => {
  const line = JSON.stringify({ type: "tokens", ts: 1750000000000, sessionId: "s1", messageId: "m1", model: "gpt-4", input: 100, output: 20, reasoning: 5, cacheRead: 3, cacheWrite: 7, cost: 0.001 })
  const e = parseLogLine(line)
  assert.ok(e)
  assert.equal(e.sessionId, "s1")
  assert.equal(e.messageId, "m1")
  assert.equal(e.input, 100)
  assert.equal(e.cost, 0.001)
})

test("parseLogLine: input buruk", () => {
  assert.equal(parseLogLine(""), null)
  assert.equal(parseLogLine("   "), null)
  assert.equal(parseLogLine("{invalid json"), null)
  assert.equal(parseLogLine(JSON.stringify({ type: "other" })), null)
  assert.equal(parseLogLine(JSON.stringify({ type: "tokens", sessionId: "s1" })), null) // tanpa messageId
  assert.equal(parseLogLine(JSON.stringify({ type: "tokens", messageId: "m1" })), null) // tanpa sessionId
})

test("summarizeEntries: filter sesi + since", () => {
  const entries: LogEntry[] = [
    { type: "tokens", ts: 1000, sessionId: "a", messageId: "a1", input: 10, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0.01 },
    { type: "tokens", ts: 2000, sessionId: "b", messageId: "b1", input: 5, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0.02 },
    { type: "tokens", ts: 3000, sessionId: "a", messageId: "a2", input: 3, output: 0, reasoning: 1, cacheRead: 2, cacheWrite: 4, cost: 0.03 },
  ]
  const sA = summarizeEntries(entries, { sessionId: "a" })
  assert.equal(sA.input, 13)
  assert.equal(sA.output, 2)
  assert.equal(sA.reasoning, 1)
  assert.equal(sA.cacheRead, 2)
  assert.equal(sA.cacheWrite, 4)
  assert.equal(sA.cost, 0.04)
  assert.equal(sA.messageCount, 2)
  const sinceB = summarizeEntries(entries, { since: 2000 })
  assert.equal(sinceB.messageCount, 2)
})

test("readLogFile: lewati baris malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-"))
  const file = join(dir, "tokens.jsonl")
  writeFileSync(file, ["{bad", JSON.stringify({ type: "tokens", ts: 1, sessionId: "s", messageId: "m", input: 1, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }), "", "x"].join("\n"))
  const entries = readLogFile(file)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].messageId, "m")
})

test("readLogFile: file tidak ada", () => {
  assert.deepEqual(readLogFile("/nonexistent/path.jsonl"), [])
})

test("buildReport: berisi baris sesi + hari ini", () => {
  const entries: LogEntry[] = [
    { type: "tokens", ts: Date.UTC(2026, 8, 23, 1, 0, 0), sessionId: "s1", messageId: "m1", input: 1000, output: 500, reasoning: 100, cacheRead: 0, cacheWrite: 0, cost: 0.01 },
  ]
  const report = buildReport(entries, "s1", new Date("2026-09-23T10:00:00.000Z"))
  assert.match(report, /Sesi ini/)
  assert.match(report, /Hari ini \(semua sesi\)/)
  assert.match(report, /1\.5k/) // 1000+500 token sesi
  assert.match(report, /biaya: \$[\d.]+\s*\| 1 pesan/)
})
