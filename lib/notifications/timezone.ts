// Pure timezone conversion - no Supabase, no 'use client'/'use server'. Only
// needed by Phase 2 (the cron dispatcher has no browser clock, unlike
// useMealReminders.ts which reads the browser's own local Date directly -
// see lib/notifications/schedule.ts's nowMinutesLocal). Uses the native
// Intl API (built into Node 20+, no moment-timezone/date-fns-tz dependency)
// which is DST-aware by construction - every IANA zone's offset is resolved
// by the runtime's own tz database, never computed by hand here.

export interface LocalDateTimeParts {
  dateString: string // "YYYY-MM-DD" in the target timezone
  minutesSinceMidnight: number // 0-1439 in the target timezone
}

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = PARTS_FORMATTER_CACHE.get(timeZone)
  if (!formatter) {
    // Throws on an invalid IANA name (e.g. a corrupted/garbage stored
    // value) - callers decide the fallback (see localDateTimeInTimeZone).
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    PARTS_FORMATTER_CACHE.set(timeZone, formatter)
  }
  return formatter
}

// The wall-clock date and time-of-day in an arbitrary IANA timezone, for an
// instant given as a UTC Date. Never assumes UTC itself - a null/invalid/
// unrecognized timezone falls back to UTC explicitly (not silently), which
// callers should treat as reduced-confidence (see admin.ts).
export function localDateTimeInTimeZone(instant: Date, timeZone: string | null): LocalDateTimeParts {
  const zone = timeZone || 'UTC'
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = formatterFor(zone).formatToParts(instant)
  } catch {
    parts = formatterFor('UTC').formatToParts(instant)
  }

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '00'
  // hour12:false formats midnight as "24" in some ICU versions - normalize
  // to the 0-23 range isMealReminderDue/nowMinutesLocal already expect.
  const hour = Number(get('hour')) % 24

  return {
    dateString: `${get('year')}-${get('month')}-${get('day')}`,
    minutesSinceMidnight: hour * 60 + Number(get('minute'))
  }
}
