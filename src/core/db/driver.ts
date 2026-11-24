/**
 * Treiber-Port (FA-851): die App kennt keine konkrete SQLite-Library.
 * Laufzeit: expo-sqlite-Treiber; Tests/CI: Node-Treiber (better-sqlite3).
 */
export interface DbDriver {
  execScript(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  close(): void;
}
