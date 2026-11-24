import BetterSqlite3 from 'better-sqlite3';
import type { DbDriver } from './driver';

/**
 * Node-Implementierung des DbDriver-Ports fuer L1/L2-Tests (Test-Katalog: better-sqlite3
 * als kompatibler Treiber fuer expo-sqlite-Schema-Tests, TC-DBC).
 */
export class NodeDriver implements DbDriver {
  private readonly db: BetterSqlite3.Database;

  constructor(dbFile: string | ':memory:') {
    this.db = new BetterSqlite3(dbFile);
    this.db.pragma('foreign_keys = ON');
  }

  execScript(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}
