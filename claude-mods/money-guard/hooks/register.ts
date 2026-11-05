import type { Register } from 'claude-code'

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
    if (/money-rules\.md$/.test(String((e as any).file_path || '')) && !(r as any).deny && !(r as any).isError) lastRulesRead = Date.now()
    return r
  })

  // 3. Bloque les écritures d'argent sans relecture récente.
  on('tool.call', ($, e, next) => {
    const a = e as any
    const tool = String(a.tool)
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
      const f = String(a.file_path || a.notebook_path || '')
      if (MONEY_FILE.test(f) && stale()) return { deny: DENY(f) }
    } else if (tool === 'Bash') {
      const c = String(a.command || '')
      if (MONEY_FILE.test(c) && /(sed\s+-i|>\s*\S|tee\s|python3?\s|perl\s|cat\s*>|git\s+(apply|checkout\s+--))/.test(c) && stale()) return { deny: DENY('cette commande') }
      if (/flyctl\s+secrets|fly-deploy/.test(c) && stale()) return { deny: DENY('ce déploiement') }
    } else if (/^mcp__.*(execute_sql|apply_migration)$/.test(tool)) {
      const q = String(a.query || '')
      if (SQL_WRITE.test(q) && MONEY_TABLES.test(q) && stale()) return { deny: DENY('cette requête SQL') }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'money-guard : le garde-fou a échoué, action refusée par sécurité.' }))
}
