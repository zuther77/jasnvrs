import type { IsoDate, IsoTimestamp, UtcClock } from '../api/types'

const LOCALE = 'en-GB'
const DAY_ZONE = 'Europe/London'

const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const oneDecimalFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatMw(value: number): string {
  return `${integerFormat.format(value)} MW`
}

/** True minus sign (U+2212), explicit plus for positive values. */
export function formatSignedNumber(value: number, fractionDigits = 0): string {
  const absolute = formatNumber(Math.abs(value), fractionDigits)
  if (value > 0) return `+${absolute}`
  if (value < 0) return `−${absolute}`
  return absolute
}

export function formatMwSigned(value: number): string {
  return `${formatSignedNumber(value)} MW`
}

export function formatGwh(mwh: number): string {
  return `${oneDecimalFormat.format(mwh / 1000)} GWh`
}

export function formatPct(value: number): string {
  return `${oneDecimalFormat.format(value)}%`
}

export function formatPctSigned(value: number): string {
  return `${formatSignedNumber(value, 1)}%`
}

function toUtcNoon(isoDate: IsoDate): Date {
  return new Date(`${isoDate}T12:00:00Z`)
}

const fullDayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: DAY_ZONE,
})

const shortDayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: DAY_ZONE,
})

const axisDayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: DAY_ZONE,
})

/** `Mon 5 Jan 2026` — anchored at noon UTC so the London calendar date never shifts. */
export function formatDay(iso: IsoDate): string {
  return fullDayFormat.format(toUtcNoon(iso))
}

/** `31 Jan 2026` */
export function formatDayShort(iso: IsoDate): string {
  return shortDayFormat.format(toUtcNoon(iso))
}

/** `5 Jan` — chart axis label. */
export function formatDayAxis(iso: IsoDate): string {
  return axisDayFormat.format(toUtcNoon(iso))
}

const hourFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: DAY_ZONE,
})

const utcHourFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/** `05:00` in Europe/London (GMT for the January window). */
export function formatHour(iso: IsoTimestamp): string {
  return hourFormat.format(new Date(iso))
}

/** `09:50` in UTC, used for the gate-closure cutoff. */
export function formatHourUtc(iso: IsoTimestamp): string {
  return utcHourFormat.format(new Date(iso))
}

/** `09:30 UTC` from an API clock field. */
export function formatUtcClock(clock: UtcClock): string {
  return `${clock} UTC`
}

/** `26 Oct 2026 17:04 UTC` */
export function formatTimestamp(iso: IsoTimestamp): string {
  const date = new Date(iso)
  const dayPart = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  const timePart = new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date)
  return `${dayPart} ${timePart} UTC`
}

/** `13 GW` above 10,000 MW, otherwise `9,500 MW`. */
export function formatMwAxis(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${integerFormat.format(value / 1000)}\u00A0GW`
  }
  return `${integerFormat.format(value)}\u00A0MW`
}

/** `0–6 h` */
export function formatHorizon(start: number, end: number): string {
  return `${start}–${end} h`
}

/** `05:00` label for an integer hour of day. */
export function formatHourOfDay(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** `05:00–05:59` */
export function formatHourSpan(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59`
}

export function formatIssueTime(clock: UtcClock): string {
  return `${clock} UTC`
}
