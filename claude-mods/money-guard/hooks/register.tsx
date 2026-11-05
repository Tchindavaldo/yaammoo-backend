import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { MoneyActivity } from '../types'

// money-guard — Yaammoo. L'argent est réel : les règles sont dans le prompt
// système à CHAQUE tour, et toute écriture qui touche l'argent est refusée sans
// relecture récente de architecture/money-rules.md (backend yaammoo).

const RULES_CANDIDATES = [
  'architecture/money-rules.md',
  'yaammoo-backend/architecture/money-rules.md',
  '../yaammoo-backend/architecture/money-rules.md',
  '/home/user/yaammoo-backend/architecture/money-rules.md',
]
const READ_TTL_MS = 15 * 60 * 1000

// Fichiers d'argent (backend + frontend).
const MONEY_FILE =
  /(src\/services\/(pricing|wallet)\/|settleDelivery|settlementPrecheck|creditMerchant|creditDriver|postTransaction|mwVerdict|webhookMobilewallet|mobilewalletService|validatePaymentAmount|paymentAggregator|mobileNetwork|(transactions|orderSettlements|orderDeliveries|withdrawals|platformTransfers|pendingPayments)\.repo|settings\.keys|architecture\/(money-rules|pricing[^/]*|wallet|payment[^/]*|app-errors)\.md|src\/features\/(wallet|checkout|payment|cart|bonus)\/|money-rules)/i

// Tables d'argent : toute écriture SQL dessus exige la relecture.
const MONEY_TABLES = /\b(transactions|order_settlements|order_deliveries|withdrawals|pending_payments|transaction_settlements|platform_revenues|settings_pricing|settings_withdrawal|settings_delivery|platform_transfer_locks|app_errors)\b/i
const SQL_WRITE = /\b(insert|update|delete|alter|drop|truncate|create)\b/i

let lastRulesRead = 0
const COMPACT_AT_PERCENT = 29
const activity = atom({ plugin: 'money-guard', key: 'activity' } as const, null as MoneyActivity)
const rulesReadAt = atom({ plugin: 'money-guard', key: 'rulesReadAt' } as const, 0)

async function loadRules($: any): Promise<string | null> {
  for (const p of RULES_CANDIDATES) {
    try {
      if (await $.fs.exists(p)) return await $.fs.read(p)
    } catch {}
  }
  return null
}

const stale = () => Date.now() - lastRulesRead > READ_TTL_MS
const DENY = (what: string) =>
  `money-guard : ${what} touche à l'ARGENT. Relis d'abord architecture/money-rules.md EN ENTIER avec Read (relecture exigée toutes les 15 min), puis recommence.`

export const register: Register = on => {
  // 1. Règles argent dans le prompt système, à chaque requête.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const rules = await loadRules($)
    const text = rules
      ? `# ARGENT — RÈGLES OBLIGATOIRES (mod money-guard)\nCe projet manipule de l'argent RÉEL. Aucun chiffre d'argent de mémoire : relire settings_* en base et le code source avant chaque chiffre. Toute modification d'argent exige la relecture de architecture/money-rules.md.\n\n${rules}`
      : `# ARGENT — RÈGLES OBLIGATOIRES (mod money-guard)\narchitecture/money-rules.md introuvable : ne donne AUCUN chiffre d'argent et ne modifie AUCUN fichier d'argent avant de l'avoir retrouvé et lu.`
    return { sections: [...composed.sections, { id: 'money-guard:rules', text, scope: 'session' as const }] }
  })

  // 2. Mémorise la relecture de money-rules.md.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    if (/money-rules\.md$/.test(String((e as any).file_path || '')) && !(r as any).deny && !(r as any).isError) {
      lastRulesRead = Date.now()
      await update($, rulesReadAt, () => lastRulesRead)
    }
    return r
  })

  // 3. Bloque les écritures d'argent sans relecture récente.
  on('tool.call', async ($, e, next) => {
    const a = e as any
    const tool = String(a.tool)
    let money: string | null = null
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
      const f = String(a.file_path || a.notebook_path || '')
      if (MONEY_FILE.test(f)) money = f
    } else if (tool === 'Bash') {
      const c = String(a.command || '')
      if (MONEY_FILE.test(c) && /(sed\s+-i|>\s*\S|tee\s|python3?\s|perl\s|cat\s*>|git\s+(apply|checkout\s+--))/.test(c)) money = 'commande sur un fichier d\'argent'
      else if (/flyctl\s+(secrets|deploy)|fly-deploy/.test(c)) money = 'déploiement / secret Fly'
    } else if (/^mcp__.*(execute_sql|apply_migration)$/.test(tool)) {
      const q = String(a.query || '')
      if (SQL_WRITE.test(q) && MONEY_TABLES.test(q)) money = 'écriture SQL sur une table d\'argent'
    } else if (tool === 'mcp__github__actions_run_trigger') money = 'déclenchement de workflow'
    if (!money) return next(e)
    await update($, activity, () => ({ what: money as string, at: Date.now() }))
    if (stale()) return { deny: DENY(money) }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'money-guard : le garde-fou a échoué, action refusée par sécurité.' }))

  // 4. Bandeau ROUGE au-dessus du prompt pendant un travail sur l'argent (30 min).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const act = await read($, activity)
    if (!act || Date.now() - act.at > 30 * 60 * 1000) return next(e)
    const readAt = await read($, rulesReadAt)
    const { Box, Text } = $.ui.resolve(e)
    const readLine = readAt ? `money-rules.md relu il y a ${Math.round((Date.now() - readAt) / 60000)} min` : 'money-rules.md PAS relu'
    return (
      <Box borderStyle="round" borderColor="red" paddingX={1}>
        <Text color="red" bold>ARGENT RÉEL — {act.what}</Text>
        <Text color="red"> · {readLine}</Text>
      </Box>
    )
  })

  // 5. Compactage automatique : dès que le contexte atteint 29 %, mesuré après
  //    chaque tour (session.measure) ET à l'envoi d'un message (filet).
  let compacting = false
  const maybeCompact = async ($: any, percent: number | undefined) => {
    if (compacting || (percent ?? 0) < COMPACT_AT_PERCENT) return
    compacting = true
    try {
      $.ui.toast(`Contexte à ${Math.round(percent ?? 0)} % : compactage automatique`)
      await $.session.compact({ instructions: "Garder : règles argent (money-rules.md), décisions de l'utilisateur, branches et déploiements en cours, travail en cours et prochaines étapes." })
    } catch (err: any) {
      $.ui.toast(`Compactage automatique en échec : ${err?.message ?? err}`)
    } finally {
      compacting = false
    }
  }
  on('session.measure', async ($, e, next) => {
    const out = next(e)
    maybeCompact($, e.context?.percent)
    return out
  })
  on('prompt.submit', async ($, e, next) => {
    try {
      const { context } = await $.session.usage()
      await maybeCompact($, context?.percent)
    } catch {}
    return next(e)
  })
}
