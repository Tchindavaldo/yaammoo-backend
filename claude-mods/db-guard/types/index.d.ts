export type ProdActivity = { what: string; at: number } | null

declare module 'claude-code' {
  interface PluginState {
    'db-guard': { activity: ProdActivity; rulesReadAt: number }
  }
}
