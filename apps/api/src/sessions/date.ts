/**
 * Session date (technical-prd §3): "date defaults to today" means today in
 * the center's local timezone (Asia/Jerusalem, MVP is single-center), NOT
 * the server/UTC date — they disagree for part of every evening.
 */
const SESSION_TIME_ZONE = 'Asia/Jerusalem'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SESSION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' for `now` (defaults to the current instant), in Jerusalem local time. */
export function todayInJerusalem(now: Date = new Date()): string {
  return formatter.format(now)
}
