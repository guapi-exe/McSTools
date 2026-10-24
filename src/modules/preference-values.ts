// Earlier versions stored the literal string "null" for an unset font size.
// Keep malformed/legacy persisted values out of numeric template formatters.
export function storedFileSize(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0
  const number = typeof value === 'number' ? value : Number(value.trim())
  return Number.isFinite(number) && number >= 0 ? number : 0
}
