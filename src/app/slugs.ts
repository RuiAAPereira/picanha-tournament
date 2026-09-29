/** Lowercase, accents stripped, anything else outside [a-z0-9] collapsed to `-`. */
export const slugify = (text: string) => text
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

/** `YYYYMMDD-HHmmss` read straight from the ISO instant (UTC), so it never depends on the machine's zone. */
function stamp(at: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(at)
  if (!parts) throw new Error('A data não está no formato ISO.')
  const [, year, month, day, hour, minute, second] = parts
  return `${year}${month}${day}-${hour}${minute}${second}`
}

export const tournamentIdFor = (name: string, at: string) => `${slugify(name) || 'torneio'}-${stamp(at)}`

/** `base`, or `base-2`, `base-3`… when taken; the chosen id is added to `taken`. */
export function claimUniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let suffix = 2; taken.has(id); suffix++) id = `${base}-${suffix}`
  taken.add(id)
  return id
}

/** A bare file name; the storage layer resolves it inside `data/backups`. */
export const backupFileName = (name: string, at: string) => `${tournamentIdFor(name, at)}.sqlite`
