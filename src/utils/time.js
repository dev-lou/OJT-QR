// ─── Time utilities for Manila timezone + OJT hours calculation ───────────────
// Ported from isufst_qr/AdminScanner.jsx + new OJT-specific helpers

/**
 * Returns today's date key in Manila timezone (YYYY-MM-DD format)
 */
export function getTodayManilaDayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

/**
 * Returns the Manila-timezone date key for any ISO timestamp
 */
export function getManilaDayKeyFromIso(iso) {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    } catch {
        return ''
    }
}

/**
 * Returns UTC start/end bounds for today in Manila timezone.
 * Ported from AdminScanner.jsx getManilaDayBoundsUTC()
 */
export function getManilaDayBoundsUTC() {
    try {
        const now = new Date()
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(now)

        const year = parts.find((p) => p.type === 'year')?.value
        const month = parts.find((p) => p.type === 'month')?.value
        const day = parts.find((p) => p.type === 'day')?.value

        if (!year || !month || !day) throw new Error('Unable to resolve Manila day')

        const base = `${year}-${month}-${day}`
        return {
            todayStartUTC: new Date(`${base}T00:00:00+08:00`).toISOString(),
            todayEndUTC: new Date(`${base}T23:59:59.999+08:00`).toISOString(),
        }
    } catch {
        const fallbackStart = new Date()
        fallbackStart.setHours(0, 0, 0, 0)
        const fallbackEnd = new Date()
        fallbackEnd.setHours(23, 59, 59, 999)
        return {
            todayStartUTC: fallbackStart.toISOString(),
            todayEndUTC: fallbackEnd.toISOString(),
        }
    }
}

/**
 * Calculates decimal hours between two ISO timestamps.
 * E.g. 06:00 AM to 06:00 PM = 12.0
 *
 * @param {string} timeIn  - ISO timestamp
 * @param {string} timeOut - ISO timestamp
 * @returns {number} Decimal hours (e.g. 8.5)
 */
export function calculateHoursWorked(timeIn, timeOut) {
    if (!timeIn || !timeOut) return 0
    const start = new Date(timeIn)
    const end = new Date(timeOut)
    const diffMs = end.getTime() - start.getTime()
    if (diffMs <= 0) return 0
    return diffMs / (1000 * 60 * 60)
}

/**
 * Sums up all completed sessions' durations from an array of attendance rows.
 *
 * @param {Array<{time_in: string, time_out: string|null}>} rows
 * @returns {number} Total decimal hours (e.g. 48.75)
 */
export function calculateTotalOjtHours(rows) {
    if (!Array.isArray(rows)) return 0
    return rows.reduce((sum, row) => {
        if (!row.time_in || !row.time_out) return sum
        return sum + calculateHoursWorked(row.time_in, row.time_out)
    }, 0)
}

/**
 * Formats decimal hours as "Xh Ym" string
 * @param {number} hours - e.g. 8.5
 * @returns {string} e.g. "8h 30m"
 */
export function formatHours(hours) {
    if (!hours || hours <= 0) return '0h 0m'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}h ${m}m`
}

/**
 * Formats an ISO date string to Manila time display
 * @param {string} iso
 * @returns {string} e.g. "03:15 PM"
 */
export function formatManilaTime(iso) {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Manila',
        })
    } catch {
        return '—'
    }
}

/**
 * Formats an ISO date string to Manila date display
 * @param {string} iso
 * @returns {string} e.g. "Mar 12, 2026"
 */
export function formatManilaDate(iso) {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'Asia/Manila',
        })
    } catch {
        return '—'
    }
}

/**
 * Check if a Supabase error means "no rows found"
 */
export function isNoRowsError(error) {
    const code = String(error?.code || '').toUpperCase()
    const message = String(error?.message || '').toLowerCase()
    return code === 'PGRST116' || message.includes('0 rows') || message.includes('no rows') || message.includes('contains 0 rows')
}
