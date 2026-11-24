import type { SQLiteDatabase } from 'expo-sqlite';
import type { DbDriver } from './driver';

/**
 * Laufzeit-Treiber auf Basis von expo-sqlite (FA-850/851, Stack §3.2).
 * Wird nur in der App instantiert; L1/L2-Tests nutzen NodeDriver (better-sqlite3).
 */
export class ExpoDriver implements DbDriver {
  private constructor(private readonly db: SQLiteDatabase) {}

  static from(db: SQLiteDatabase): ExpoDriver {
    const driver = new ExpoDriver(db);
    driver.db.execSync('PRAGMA foreign_keys = ON');
    return driver;
  }

  execScript(sql: string): void {
    this.db.execSync(sql);
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.runSync(sql, params as never);
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.getAllSync(sql, params as never) as T[];
  }

  close(): void {
    this.db.closeSync();
  }
}
