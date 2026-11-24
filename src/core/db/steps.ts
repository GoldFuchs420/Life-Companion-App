import fs from 'node:fs';
import path from 'node:path';
import type { MigrationStep } from './migrate';

export function loadSteps(folder: string): MigrationStep[] {
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(folder, name), 'utf-8') }));
}
