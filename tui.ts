// tui.ts — plugin TUI token-tracker: toast per pesan assistant selesai (tanpa JSX)

import { Plugin } from "@opencode/plugin/tui"
import { formatCost, formatTokens } from "./lib.ts"

type Msg = {
  id: string
  type?: string
  tokens?: { input?: number; output?: number }
  cost?: number
}

export default Plugin.define({
  id: "token-tracker.tui",
  setup(context: any) {
    // Sesi -> id pesan yang sudah di-toast (hindari toast ganda saat event ter-publish ulang)
    const toasted = new Map<string, Set<string>>()
    // Sesi -> total berjalan (token, cost) pesan yang sudah di-toast
    const totals = new Map<string, { tokens: number; cost: number }>()

    const stop = context.data.listen(async (raw: { details?: Record<string, unknown> }) => {
      try {
        const details = raw?.details ?? {}
        const type = String(details.type ?? "")
        if (!/message|execution|idle/.test(type)) return

        const data = (details.data ?? {}) as Record<string, unknown>
        const sessionId =
          typeof data.sessionID === "string"
            ? data.sessionID
            : typeof details.sessionID === "string"
              ? details.sessionID
              : (data.info as Record<string, unknown> | undefined)?.sessionID
        if (typeof sessionId !== "string") return

        await context.data.session.message.sync(sessionId)
        const messages: Msg[] = context.data.session.message.list(sessionId) as Msg[]

        let done = toasted.get(sessionId)
        if (!done) {
          done = new Set()
          toasted.set(sessionId, done)
        }
        let t = totals.get(sessionId)
        if (!t) {
          t = { tokens: 0, cost: 0 }
          totals.set(sessionId, t)
        }

        for (const msg of messages) {
          if (msg?.type !== "assistant") continue
          const tokens = msg.tokens
          if (!tokens || typeof tokens.input !== "number") continue
          if (done.has(msg.id)) continue
          done.add(msg.id)
          const total = (tokens.input ?? 0) + (tokens.output ?? 0)
          const cost = typeof msg.cost === "number" ? msg.cost : 0
          t.tokens += total
          t.cost += cost
          context.ui.toast.show({
            title: `${formatTokens(total)} token dipakai`,
            message: `${formatCost(cost)} | sesi ini ${formatTokens(t.tokens)} token`,
            variant: "info",
          })
        }
      } catch {
        // never-throw: toast tidak boleh mengganggu TUI
      }
    })

    return () => stop()
  },
})