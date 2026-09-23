// lib.ts — fungsi murni token-tracker (tanpa import OpenCode, unit-testable)

import { existsSync, readFileSync } from "node:fs"

export interface LogEntry {
  type: "tokens"
  ts: number
  sessionId: string
  messageId: string
  agent?: string
  model?: string
  provider?: string
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

export interface Summary {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  messageCount: number
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0
}

function emptySummary(): Summary {
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messageCount: 0 }
}

export function formatTokens(n: number): string {
  const v = Math.max(0, Math.floor(toNum(n)))
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(v)
}

export function formatCost(cost: number): string {
  const v = toNum(cost)
  if (v === 0) return "$0"
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

export function startOfToday(now: Date): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
  if (raw.type !== "tokens") return null
  if (typeof raw.sessionId !== "string" || typeof raw.messageId !== "string") return null
  return {
    type: "tokens",
    ts: toNum(raw.ts) || Date.now(),
    sessionId: raw.sessionId,
    messageId: raw.messageId,
    agent: typeof raw.agent === "string" ? raw.agent : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    provider: typeof raw.provider === "string" ? raw.provider : undefined,
    input: toNum(raw.input),
    output: toNum(raw.output),
    reasoning: toNum(raw.reasoning),
    cacheRead: toNum(raw.cacheRead),
    cacheWrite: toNum(raw.cacheWrite),
    cost: toNum(raw.cost),
  }
}

export function summarizeEntries(entries: readonly LogEntry[], opts: { sessionId?: string; since?: number } = {}): Summary {
  const sum = emptySummary()
  for (const e of entries) {
    if (opts.sessionId && e.sessionId !== opts.sessionId) continue
    if (opts.since !== undefined && e.ts < opts.since) continue
    sum.input += e.input
    sum.output += e.output
    sum.reasoning += e.reasoning
    sum.cacheRead += e.cacheRead
    sum.cacheWrite += e.cacheWrite
    sum.cost += e.cost
    sum.messageCount += 1
  }
  return sum
}

export function readLogFile(path: string): LogEntry[] {
  try {
    if (!existsSync(path)) return []
    return readFileSync(path, "utf8")
      .split("\n")
      .map(parseLogLine)
      .filter((e): e is LogEntry => e !== null)
  } catch {
    return []
  }
}

export function buildReport(entries: readonly LogEntry[], sessionId: string, now: Date): string {
  const session = summarizeEntries(entries, { sessionId })
  const today = summarizeEntries(entries, { since: startOfToday(now) })
  return [
    "── Token Tracker ──",
    "Sesi ini",
    `  token: ${formatTokens(session.input + session.output)}  (input ${formatTokens(session.input)} | output ${formatTokens(session.output)} | reasoning ${formatTokens(session.reasoning)})`,
    `  cache: baca ${formatTokens(session.cacheRead)} | tulis ${formatTokens(session.cacheWrite)}`,
    `  biaya: ${formatCost(session.cost)} | ${session.messageCount} pesan`,
    "Hari ini (semua sesi)",
    `  token: ${formatTokens(today.input + today.output)} | biaya: ${formatCost(today.cost)}`,
  ].join("\n")
}