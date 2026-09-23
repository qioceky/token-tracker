// index.ts — plugin server token-tracker (OpenCode V2 Plugin API)

import { Plugin } from "@opencode/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { buildReport, parseLogLine, readLogFile, TOKEN_LOG_FILE } from "./lib.ts"
import type { LogEntry } from "./lib.ts"

const LOG_FILE = TOKEN_LOG_FILE

// Sesi -> id pesan yang sudah tercatat di log (dimuat dari JSONL saat startup)
const logged = new Map<string, Set<string>>()

// Tipe event yang menandakan ada kemajuan pesan/eksekusi; reconcile aman dipicu berulang (dedupe by messageId)
const RECONCILE_RE = /message|execution|idle/

function loadLoggedIds(): void {
  for (const e of readLogFile(LOG_FILE)) {
    let set = logged.get(e.sessionId)
    if (!set) {
      set = new Set()
      logged.set(e.sessionId, set)
    }
    set.add(e.messageId)
  }
}

function appendEntry(entry: Omit<LogEntry, "type">): void {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, JSON.stringify({ type: "tokens", ...entry }) + "\n")
  } catch {
    // never-throw: jangan pernah mengganggu server karena bug log
  }
}

function extractSessionID(event: unknown): string | undefined {
  const e = (event ?? {}) as { properties?: Record<string, unknown>; data?: Record<string, unknown>; sessionID?: string }
  return (
    (e.properties?.sessionID as string) ??
    (e.data?.sessionID as string) ??
    ((e.properties?.info as Record<string, unknown> | undefined)?.sessionID as string | undefined) ??
    e.sessionID
  )
}

async function reconcile(ctx: any, sessionId: string): Promise<void> {
  try {
    const messages = await ctx.session.context({ sessionID: sessionId })
    let set = logged.get(sessionId)
    if (!set) {
      set = new Set()
      logged.set(sessionId, set)
    }
    for (const msg of messages ?? []) {
      if (msg?.type !== "assistant") continue
      const tokens = msg?.tokens as
        | { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
        | undefined
      if (!tokens || typeof tokens.input !== "number") continue
      if (set.has(msg.id)) continue
      set.add(msg.id)
      const completed = msg?.time?.completed ?? msg?.time?.created ?? Date.now()
      appendEntry({
        ts: typeof completed === "number" ? completed : Date.now(),
        sessionId,
        messageId: msg.id,
        agent: typeof msg.agent === "string" ? msg.agent : undefined,
        model: typeof msg.model?.id === "string" ? msg.model.id : undefined,
        provider: typeof msg.model?.providerID === "string" ? msg.model.providerID : undefined,
        input: tokens.input ?? 0,
        output: tokens.output ?? 0,
        reasoning: tokens.reasoning ?? 0,
        cacheRead: tokens.cache?.read ?? 0,
        cacheWrite: tokens.cache?.write ?? 0,
        cost: typeof msg.cost === "number" ? msg.cost : 0,
      })
    }
  } catch (err) {
    console.warn("[token-tracker] reconcile gagal:", err instanceof Error ? err.message : err)
  }
}

export default Plugin.define({
  id: "token-tracker",
  async setup(ctx) {
    loadLoggedIds()

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const type = String((event as { type?: unknown })?.type ?? "")
          const sessionId = extractSessionID(event)
          if (!sessionId) continue
          if (type === "session.idle" || RECONCILE_RE.test(type)) {
            await reconcile(ctx, sessionId)
          }
        }
      } catch (err) {
        console.warn("[token-tracker] event stream berhenti:", err instanceof Error ? err.message : err)
      }
    })()

    await ctx.command.transform((editor) => {
      editor.add({
        name: "usage",
        description: "Tampilkan pemakaian token & biaya sesi ini dan hari ini",
        execute: async ({ sessionID, prompt, delivery }) => {
          try {
            const text = buildReport(readLogFile(LOG_FILE), sessionID, new Date())
            await ctx.session.prompt({ ...prompt, sessionID, text, delivery })
          } catch (err) {
            console.warn("[token-tracker] /usage gagal:", err instanceof Error ? err.message : err)
          }
        },
      })
    })

    return () => controller.abort()
  },
})