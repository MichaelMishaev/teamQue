/** Daily operational-day boundary. Business time is always Jerusalem time;
 * conversion is derived with Intl so DST transitions never rely on a fixed
 * UTC offset. */
const TIME_ZONE = 'Asia/Jerusalem'
export const DAILY_RESET_HOUR = 5
export const DAILY_RESET_WARNING_SEC = 30 * 60

const localPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function localParts(instant: Date): LocalParts {
  const values = new Map(localPartsFormatter.formatToParts(instant).map((part) => [part.type, part.value]))
  const read = (name: keyof LocalParts): number => {
    const value = values.get(name)
    if (value === undefined) throw new Error(`Intl omitted ${name}`)
    return Number(value)
  }
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') }
}

function ymd(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

/** Convert a Jerusalem-local calendar date at 05:00 to its UTC instant. */
export function jerusalemResetAtForLocalDate(localDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) throw new Error('localDate must be YYYY-MM-DD')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const desiredWallMs = Date.UTC(year, month - 1, day, DAILY_RESET_HOUR, 0, 0)
  let guessMs = desiredWallMs

  // Two passes are sufficient even around DST because 05:00 is never in the
  // skipped/repeated transition hour in Asia/Jerusalem.
  for (let pass = 0; pass < 2; pass += 1) {
    const observed = localParts(new Date(guessMs))
    const observedWallMs = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second)
    guessMs += desiredWallMs - observedWallMs
  }
  return new Date(guessMs)
}

/** The reset strictly after `now` (today before 05:00, otherwise tomorrow). */
export function nextJerusalemDailyResetAt(now: Date = new Date()): Date {
  const parts = localParts(now)
  const todayReset = jerusalemResetAtForLocalDate(ymd(parts))
  if (now.getTime() < todayReset.getTime()) return todayReset
  const tomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
  return jerusalemResetAtForLocalDate(ymd({ year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate() }))
}

/** Today's 05:00 boundary, whether it is before or after `now`. */
export function currentJerusalemDailyResetAt(now: Date = new Date()): Date {
  return jerusalemResetAtForLocalDate(ymd(localParts(now)))
}

/** Whole seconds until reset during the 30-minute warning window. */
export function dailyResetWarningSeconds(resetAt: Date, now: Date = new Date()): number | null {
  const remainingMs = resetAt.getTime() - now.getTime()
  if (remainingMs <= 0 || remainingMs > DAILY_RESET_WARNING_SEC * 1000) return null
  return Math.ceil(remainingMs / 1000)
}
