/** Konfliktfreie IDs ohne uebergreifende Laufzeit-Services (FA-850-Festlegung: UUID-Primkeys). */
export function makeId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
