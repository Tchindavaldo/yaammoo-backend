import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { ProdActivity } from '../types'

// db-guard — Yaammoo. La base yaammoo (projet vcuskusfywrigdrkgnur) est celle
// des VRAIS CLIENTS. Les règles sont dans le prompt système à CHAQUE tour, tout
// appel prod exige une relecture récente de architecture/prod-db-rules.md, et
// les actions destructrices sont refusées. Double les hooks du dépôt
// (.claude/hooks/prod-db-guard.sh), qui restent la couche garantie et posent
// la validation utilisateur (ask) sur chaque écriture.

const PROD_REF = 'vcuskusfywrigdrkgnur'
const RULES_CANDIDATES = [
  'architecture/prod-db-rules.md',
  'yaammoo-backend/architecture/prod-db-rules.md',
  '../yaammoo-backend/architecture/prod-db-rules.md',
  '/home/user/yaammoo-backend/architecture/prod-db-rules.md',
]
const READ_TTL_MS = 15 * 60 * 1000

const DESTRUCTIVE_SQL = /\b(drop\s+(database|schema|table|owned|role|user|policy|trigger|function|extension|publication)|truncate\b|pg_terminate_backend|pg_cancel_backend|alter\s+(role|user|system|database)|disable\s+(row\s+level\s+security|trigger)|no\s+force\s+row|lo_import|lo_export|pg_read_file|pg_ls_dir|dblink|session_replication_role|security\s+definer)\b|copy\s.*(program|\sto\s)/i
const deleteNoWhere = (t: string) => /delete\s+from\s/i.test(t) && !/delete\s+from\s[\s\S]*\swhere\s/i.test(t)
const ADMIN_PATH = /\/(pause|restore|unpause|upgrade|api-keys|secrets|branches|network-restrictions|network-bans|ssl-enforcement|custom-hostname|vanity-subdomain|billing|readonly|jit|postgrest|config\/|functions|storage|organizations|backups|transfer|members|oauth)/i
const MANUAL_TOKEN = /authorization:|bearer\s|sbp_[a-z0-9]|apikey:|x-api-key|service_role/i
const BAD_METHOD = /(-X|--request)\s*['"]?(DELETE|PATCH|PUT)/i
const SQL_WRITE = /\b(insert|update|delete|alter|create|drop|grant|revoke|merge|call|do|reindex|vacuum|cluster|refresh)\b/i

let lastRulesRead = 0
const activity = atom({ plugin: 'db-guard', key: 'activity' } as const, null as ProdActivity)
const rulesReadAt = atom({ plugin: 'db-guard', key: 'rulesReadAt' } as const, 0)

async function loadRules($: any): Promise<string | null> {
  for (const p of RULES_CANDIDATES) {
    try {
      if (await $.fs.exists(p)) return await $.fs.read(p)
    } catch {}
  }
  return null
}

const stale = () => Date.now() - lastRulesRead > READ_TTL_MS
const DENY = (what: string) => `db-guard : ${what} — BASE DE PROD yaammoo (vrais clients). Refusé (architecture/prod-db-rules.md).`

// Renvoie { target, sql } si l'appel vise la prod, sinon null.
function prodCall(a: any): { what: string; text: string; sql: boolean } | null {
  const tool = String(a.tool)
  if (tool === 'Bash') {
    const c = String(a.command || '')
    if (!/api\.supabase\.com/i.test(c) && !c.includes(PROD_REF)) return null
    return { what: 'appel API de gestion Supabase (prod)', text: c, sql: /\/database\/(query|migrations)/i.test(c) }
  }
  if (tool.startsWith('mcp__') && String(a.project_id || '') === PROD_REF) {
    const sql = /(execute_sql|apply_migration)$/.test(tool)
    return { what: `outil MCP ${tool} sur la prod`, text: sql ? String(a.query || '') : tool, sql }
  }
  return null
}

export const register: Register = on => {
  // 1. Règles prod dans le prompt système, à chaque requête.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const rules = await loadRules($)
    const text = rules
      ? `# BASE DE PROD — RÈGLES OBLIGATOIRES (mod db-guard)\nLa base yaammoo (projet ${PROD_REF}, compte yaammoo@) est celle des VRAIS CLIENTS. Annonce chaque requête en une phrase (quoi + pourquoi). Aucune écriture sans l'accord explicite de l'utilisateur pour CETTE requête. Relis architecture/prod-db-rules.md avant tout appel prod.\n\n${rules}`
      : `# BASE DE PROD — RÈGLES OBLIGATOIRES (mod db-guard)\narchitecture/prod-db-rules.md introuvable : n'effectue AUCUN appel à la base de prod (${PROD_REF}) avant de l'avoir retrouvé et lu.`
    return { sections: [...composed.sections, { id: 'db-guard:rules', text, scope: 'session' as const }] }
  })

  // 2. Mémorise la relecture de prod-db-rules.md.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const r = await next(e)
    if (/prod-db-rules\.md$/.test(String((e as any).file_path || '')) && !(r as any).deny && !(r as any).isError) {
      lastRulesRead = Date.now()
      await update($, rulesReadAt, () => lastRulesRead)
    }
    return r
  })

  // 3. Garde-fou : relecture exigée, actions destructrices refusées.
  on('tool.call', async ($, e, next) => {
    const a = e as any
    const call = prodCall(a)
    if (!call) return next(e)
    await update($, activity, () => ({ what: call.what, at: Date.now() }))
    const t = call.text
    if (stale()) return { deny: DENY('architecture/prod-db-rules.md non relu dans les 15 dernières minutes') }
    if (String(a.tool).startsWith('mcp__') && !call.sql && !/(list_|get_project|get_advisors|get_logs|search_docs|generate_typescript_types)/.test(String(a.tool)))
      return { deny: DENY(`outil d'administration MCP (${a.tool})`) }
    const mgmt = /api\.supabase\.com/i.test(t)
    // Appel à la seule base de test : hors périmètre prod.
    if (String(a.tool) === 'Bash' && mgmt && !t.includes(PROD_REF)) return next(e)
    // Prod visée hors API de gestion (machine Fly, stockage) : le hook shell
    // demande la validation de l'utilisateur ; seules les suppressions sont refusées.
    if (String(a.tool) === 'Bash' && !mgmt) {
      if (/drop\s+(database|schema|table)|truncate\b|delete\s+from|\.remove\(|emptyBucket|deleteBucket|-X\s*['"]?DELETE/i.test(t))
        return { deny: DENY('suppression ou SQL destructif hors API de gestion') }
      $.ui.toast('BASE DE PROD : commande hors API de gestion — validation requise')
      return next(e)
    }
    if (String(a.tool) === 'Bash') {
      if (MANUAL_TOKEN.test(t)) return { deny: DENY("jeton envoyé à la main (le proxy l'injecte)") }
      if (BAD_METHOD.test(t)) return { deny: DENY('méthode DELETE/PATCH/PUT') }
      if (ADMIN_PATH.test(t)) return { deny: DENY('endpoint de gestion du compte/projet') }
      if ((t.match(/(^|[^\w])(curl|wget|http|httpie|xh)\s/gi) || []).length > 1) return { deny: DENY('plusieurs clients HTTP (relais des données prod)') }
    }
    if (call.sql) {
      if (DESTRUCTIVE_SQL.test(t)) return { deny: DENY('SQL destructif, système ou contournant la sécurité') }
      if (deleteNoWhere(t)) return { deny: DENY('DELETE sans WHERE') }
      if (/update\s+[\w."]+\s+set\s/i.test(t) && !/update\s+[\w."]+\s+set\s[\s\S]*\swhere\s/i.test(t)) return { deny: DENY('UPDATE sans WHERE') }
      if (SQL_WRITE.test(t)) $.ui.toast('BASE DE PROD : écriture SQL — validation requise')
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'db-guard : le garde-fou a échoué, action refusée par sécurité.' }))

  // 4. Bandeau ROUGE au-dessus du prompt pendant un travail sur la prod (30 min).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const act = await read($, activity)
    if (!act || Date.now() - act.at > 30 * 60 * 1000) return next(e)
    const readAt = await read($, rulesReadAt)
    const { Box, Text } = $.ui.resolve(e)
    const readLine = readAt ? `prod-db-rules.md relu il y a ${Math.round((Date.now() - readAt) / 60000)} min` : 'prod-db-rules.md PAS relu'
    return (
      <Box borderStyle="round" borderColor="red" paddingX={1}>
        <Text color="red" bold>BASE DE PROD — VRAIS CLIENTS — {act.what}</Text>
        <Text color="red"> · {readLine}</Text>
      </Box>
    )
  })
}
