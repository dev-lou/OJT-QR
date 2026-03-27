import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

// ─── helpers ────────────────────────────────────────────────────────────────

function getManilaDayKeyFromIso(iso) {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    } catch {
        return ''
    }
}

function getTodayManilaDayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

/** Returns 'morning' if hour < 12 Manila time, else 'afternoon' */
function getSessionFromIso(iso) {
    const h = Number(new Date(iso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
    return h < 12 ? 'morning' : 'afternoon'
}

/** Caps checkout time to exactly 12:00 PM (morning) or 6:00 PM (afternoon) Manila time */
function getCappedCheckoutTime(sessionSlot, actualTimeIso) {
    const actual = new Date(actualTimeIso)
    const capStr = getManilaDayKeyFromIso(actualTimeIso) // 'YYYY-MM-DD'
    
    if (sessionSlot === 'morning') {
        const noon = new Date(`${capStr}T12:00:00+08:00`)
        return actual > noon ? noon.toISOString() : actual.toISOString()
    } else {
        const sixPm = new Date(`${capStr}T18:00:00+08:00`)
        return actual > sixPm ? sixPm.toISOString() : actual.toISOString()
    }
}

function noRowsError(error) {
    const code = String(error?.code || '').toUpperCase()
    const message = String(error?.message || '').toLowerCase()
    return code === 'PGRST116' || message.includes('0 rows') || message.includes('no rows')
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request) {
    if (!supabaseAdmin) {
        return NextResponse.json(
            { error: 'Server misconfigured: database client unavailable.' },
            { status: 500 }
        )
    }

    let body
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { uuid, mode = 'time-in', sessionType = 'morning', overtime = false, explicitTime = null, entries } = body || {}

    // Support both single scan and batch modes
    const normalizedEntries = Array.isArray(entries)
        ? entries.map((entry, index) => ({
              idx: Number.isFinite(Number(entry?.idx)) ? Number(entry.idx) : index,
              uuid: String(entry?.uuid || '').trim(),
              mode: entry?.mode === 'time-out' ? 'time-out' : 'time-in',
              sessionType: entry?.sessionType || sessionType,
              overtime: entry?.overtime !== undefined ? entry?.overtime : overtime,
              explicitTime: entry?.explicitTime || explicitTime,
              queued_at: entry?.queued_at || null,
          }))
        : uuid
          ? [{ idx: 0, uuid: String(uuid).trim(), mode: mode === 'time-out' ? 'time-out' : 'time-in', sessionType, overtime, explicitTime, queued_at: null }]
          : null

    if (!Array.isArray(normalizedEntries)) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    try {
        const results = []

        for (const entry of normalizedEntries) {
            const trimmed = entry.uuid
            if (!trimmed) continue

            const referenceDayKey = getManilaDayKeyFromIso(entry.queued_at || entry.explicitTime || explicitTime) || getTodayManilaDayKey()
            const currentSession = entry.sessionType // trust the client explicitly ('morning' | 'afternoon')
            const actualTimeIso = entry.queued_at ? new Date(entry.queued_at).toISOString() : (entry.explicitTime ? new Date(entry.explicitTime).toISOString() : new Date().toISOString())

            // Look up intern
            const { data: intern, error: internErr } = await supabaseAdmin
                .from('interns')
                .select('id, full_name')
                .eq('uuid', trimmed)
                .single()

            if (internErr) {
                if (noRowsError(internErr)) {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'missing' })
                } else {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'error', message: internErr.message })
                }
                continue
            }

            if (!intern) {
                results.push({ idx: entry.idx, uuid: trimmed, status: 'missing' })
                continue
            }

            // Fetch ALL attendance records for this intern today
            const { data: todayRecords } = await supabaseAdmin
                .from('attendance')
                .select('id, time_in, time_out')
                .eq('intern_id', intern.id)
                .gte('time_in', `${referenceDayKey}T00:00:00+08:00`)
                .lte('time_in', `${referenceDayKey}T23:59:59.999+08:00`)
                .order('time_in', { ascending: true })

            const sessions = todayRecords || []
            // Derive session labels for existing records
            const sessionData = sessions.map(r => ({
                ...r,
                session: getSessionFromIso(r.time_in),
            }))

            const morningRecord = sessionData.find(r => r.session === 'morning') || null
            const afternoonRecord = sessionData.find(r => r.session === 'afternoon') || null
            const currentRecord = currentSession === 'morning' ? morningRecord : afternoonRecord

            if (entry.mode === 'time-in') {
                // ── CHECK-IN ──

                // Validation: Prevent wrong session choice based on actual time
                // (Only applies to normal QR scans. Manual time override skips this check).
                if (!entry.explicitTime) {
                    const actualHour = Number(new Date(actualTimeIso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                    if (currentSession === 'morning' && actualHour >= 12) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'invalid_time', message: 'Cannot scan for Morning session during Afternoon hours', session: currentSession, name: intern.full_name })
                        continue
                    }
                    if (currentSession === 'afternoon' && actualHour < 12) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'invalid_time', message: 'Cannot scan for Afternoon session during Morning hours', session: currentSession, name: intern.full_name })
                        continue
                    }
                }

                // Block if current session already has an open or completed record
                if (currentRecord) {
                    if (!currentRecord.time_out) {
                        // Already checked in for this session (open)
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'duplicate', name: intern.full_name, session: currentSession })
                    } else {
                        // Already completed this session
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'already_scanned_today', name: intern.full_name, session: currentSession })
                    }
                    continue
                }

                // Block if both sessions are already used up
                if (morningRecord && afternoonRecord) {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'already_scanned_today', name: intern.full_name, session: currentSession })
                    continue
                }

                // Insert new check-in
                const { error: insertErr } = await supabaseAdmin
                    .from('attendance')
                    .insert([{ intern_id: intern.id, time_in: actualTimeIso }])

                if (insertErr) {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'error', message: insertErr.message })
                } else {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'ok', name: intern.full_name, session: currentSession })
                }

            } else {
                // ── CHECK-OUT ──

                // Validation: Prevent wrong session choice based on actual time
                if (!entry.explicitTime) {
                    const actualHour = Number(new Date(actualTimeIso).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                    if (currentSession === 'morning' && actualHour >= 12) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'invalid_time', message: 'Cannot scan out for Morning session during Afternoon hours', session: currentSession, name: intern.full_name })
                        continue
                    }
                    if (currentSession === 'afternoon' && actualHour < 12) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'invalid_time', message: 'Cannot scan out for Afternoon session during Morning hours', session: currentSession, name: intern.full_name })
                        continue
                    }
                }

                if (!currentRecord) {
                    // Not checked in for current session
                    // Check if other session exists (to give better message)
                    const otherRecord = currentSession === 'morning' ? afternoonRecord : morningRecord
                    if (otherRecord && otherRecord.time_out) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'not_checked_in', name: intern.full_name, session: currentSession })
                    } else if (sessions.length === 0) {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'not_checked_in', name: intern.full_name, session: currentSession })
                    } else {
                        results.push({ idx: entry.idx, uuid: trimmed, status: 'not_checked_in', name: intern.full_name, session: currentSession })
                    }
                    continue
                }

                if (currentRecord.time_out) {
                    // Already checked out for this session
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'already_checked_out', name: intern.full_name, session: currentSession })
                    continue
                }

                // Close the session, applying overtime cap if needed
                const finalTimeOut = entry.overtime ? actualTimeIso : getCappedCheckoutTime(currentSession, actualTimeIso)

                const { error: updateErr } = await supabaseAdmin
                    .from('attendance')
                    .update({ time_out: finalTimeOut })
                    .eq('id', currentRecord.id)

                if (updateErr) {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'error', message: updateErr.message })
                } else {
                    results.push({ idx: entry.idx, uuid: trimmed, status: 'ok', name: intern.full_name, session: currentSession })
                }
            }
        }

        return NextResponse.json({ results })
    } catch (e) {
        console.error('scan handler failed', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
