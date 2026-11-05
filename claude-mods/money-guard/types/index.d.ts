export type MoneyActivity = { what: string; at: number } | null

declare module 'claude-code' {
  interface PluginState {
    'money-guard': { activity: MoneyActivity; rulesReadAt: number }
  }
}
