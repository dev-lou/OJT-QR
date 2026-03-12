// ─── Debounce utility for QR scanning ─────────────────────────────────────────
// Ported from isufst_qr/AdminScanner.jsx recentScansRef pattern

/**
 * Creates a scan debouncer that prevents the same QR code
 * from being processed multiple times within a time window.
 *
 * @returns {{ isDuplicate: (uuid: string, windowMs?: number) => boolean }}
 */
export function createScanDebouncer() {
    const recentScans = {}

    return {
        /**
         * Returns true if this uuid was scanned within the last `windowMs` milliseconds.
         * Automatically records the scan timestamp for future checks.
         */
        isDuplicate(uuid, windowMs = 3000) {
            const now = Date.now()
            if (recentScans[uuid] && now - recentScans[uuid] < windowMs) {
                return true
            }
            recentScans[uuid] = now
            return false
        },

        /** Clear all tracked scans */
        reset() {
            Object.keys(recentScans).forEach((k) => delete recentScans[k])
        },
    }
}

/**
 * UUID v4 format validator (ported from old project)
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * XSS-safe HTML escaping (ported from old project)
 */
export function escapeHtml(s) {
    if (!s) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
