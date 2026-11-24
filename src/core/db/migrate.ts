import type { DbDriver } from './driver';

export interface MigrationStep {
  name: string;
  sql: string;
}

export function schemaVersionOf(steps: MigrationStep[]): string {
  const last = steps.at(-1);
  if (!last) throw new Error('Keine Migrationen vorhanden (FA-850)');
  const m = /^(\d{4})_/.exec(last.name);
  const version = m?.[1];
  if (!version) throw new Error(`Migration ohne Versionspraefix: ${last.name}`);
  return version;
}

/** Spielt Migrationen je in einer Transaktion ein und setzt db_meta.schema_version (FA-850). */
export function applyMigrations(driver: DbDriver, steps: MigrationStep[]): string {
  for (const step of steps) {
    driver.execScript(`BEGIN;\n${step.sql}\nCOMMIT;`);
  }
  const version = schemaVersionOf(steps);
  setMeta(driver, 'schema_version', version);
  return version;
}

export function setMeta(driver: DbDriver, schluessel: string, wert: string): void {
  driver.run(
    'INSERT INTO db_meta (schluessel, wert) VALUES (?, ?) ' +
    'ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert',
    [schluessel, wert],
  );
}

/** Seed-Dateien sind idempotent (INSERT OR IGNORE, FA-852/853); setzt db_meta.seed_version. */
export function applySeeds(driver: DbDriver, steps: MigrationStep[], seedVersion: string): void {
  for (const step of steps) {
    driver.execScript(`BEGIN;\n${step.sql}\nCOMMIT;`);
  }
  setMeta(driver, 'seed_version', seedVersion);
}
