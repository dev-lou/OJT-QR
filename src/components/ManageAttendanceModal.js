'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'
import Swal from 'sweetalert2'
import { confirmDeleteAlert, confirmUpdateAlert } from '@/utils/swal-configs'

export default function ManageAttendanceModal({ intern, onClose, onRefresh }) {
    const [selectedDate, setSelectedDate] = useState('')
    const [loading, setLoading] = useState(true)

    // Morning Session State
    const [morningRecord, setMorningRecord] = useState(null)
    const [morningIn, setMorningIn] = useState('')
    const [morningOut, setMorningOut] = useState('')

    // Afternoon Session State
    const [afternoonRecord, setAfternoonRecord] = useState(null)
    const [afternoonIn, setAfternoonIn] = useState('')
    const [afternoonOut, setAfternoonOut] = useState('')

    // Initialize with today's date in Manila Time
    useEffect(() => {
        if (!intern) return
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
        setSelectedDate(today)
    }, [intern])

    // Fetch records when the date changes
    useEffect(() => {
        if (!intern || !selectedDate) return
        fetchDateRecords()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intern, selectedDate])

    const fetchDateRecords = async () => {
        setLoading(true)
        
        // Reset states
        setMorningRecord(null); setMorningIn(''); setMorningOut('')
        setAfternoonRecord(null); setAfternoonIn(''); setAfternoonOut('')

        try {
            // Fetch records strictly within the selected Manila date
            const startOfDate = `${selectedDate}T00:00:00+08:00`
            const endOfDate = `${selectedDate}T23:59:59.999+08:00`

            const { data } = await supabase
                .from('attendance')
                .select('*')
                .eq('intern_id', intern.id)
                .gte('time_in', startOfDate)
                .lte('time_in', endOfDate)
                .order('time_in', { ascending: true })

            if (data && data.length > 0) {
                // Determine session based on the hour of time_in
                for (const row of data) {
                    const localIn = new Date(row.time_in)
                    const hr = Number(localIn.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                    
                    if (hr < 12) {
                        setMorningRecord(row)
                        setMorningIn(localIn.toTimeString().slice(0, 5))
                        if (row.time_out) {
                            const localOut = new Date(row.time_out)
                            setMorningOut(localOut.toTimeString().slice(0, 5))
                        }
                    } else {
                        setAfternoonRecord(row)
                        setAfternoonIn(localIn.toTimeString().slice(0, 5))
                        if (row.time_out) {
                            const localOut = new Date(row.time_out)
                            setAfternoonOut(localOut.toTimeString().slice(0, 5))
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load logs:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveSession = async (sessionType) => {
        const isMorning = sessionType === 'morning'
        const timeIn = isMorning ? morningIn : afternoonIn
        const timeOut = isMorning ? morningOut : afternoonOut
        const recordId = isMorning ? morningRecord?.id : afternoonRecord?.id

        if (!timeIn) {
            return Swal.fire({ title: 'Missing Time In', text: 'You must provide a Time In to save the session.', icon: 'error', background: '#1f2937', color: '#fff', confirmButtonColor: '#c9a84c' })
        }

        const result = await Swal.fire(confirmUpdateAlert(isMorning ? 'Morning Session' : 'Afternoon Session', 'attendance'))
        if (!result.isConfirmed) return

        // --- Validate constraints ---
        const inHour = parseInt(timeIn.split(':')[0], 10)
        if (isMorning && inHour >= 12) {
            return Swal.fire({ title: 'Invalid Time', text: 'Morning session Time In must be before 12:00 PM.', icon: 'error', background: '#1f2937', color: '#fff', confirmButtonColor: '#c9a84c' })
        }
        if (!isMorning && inHour < 12) {
            return Swal.fire({ title: 'Invalid Time', text: 'Afternoon session Time In must be 12:00 PM or later.', icon: 'error', background: '#1f2937', color: '#fff', confirmButtonColor: '#c9a84c' })
        }

        // Construct ISO
        const inIso = new Date(`${selectedDate}T${timeIn}:00+08:00`).toISOString()
        const outIso = timeOut ? new Date(`${selectedDate}T${timeOut}:00+08:00`).toISOString() : null

        try {
            if (recordId) {
                // Update
                const { error } = await supabase.from('attendance').update({ time_in: inIso, time_out: outIso }).eq('id', recordId)
                if (error) throw error
            } else {
                // Insert
                const { error } = await supabase.from('attendance').insert([{ intern_id: intern.id, time_in: inIso, time_out: outIso }])
                if (error) throw error
            }
            
            // Success
            await Swal.fire({ title: 'Saved!', icon: 'success', customClass: { popup: 'luxury-swal-popup', confirmButton: 'luxury-swal-btn' }, confirmButtonColor: '#10b981', background: '#1f2937', color: '#fff', timer: 1500, showConfirmButton: false })
            fetchDateRecords()
            if (onRefresh) onRefresh()
        } catch (err) {
            Swal.fire({ title: 'Error Saving', text: err.message, icon: 'error', background: '#1f2937', color: '#fff', confirmButtonColor: '#c9a84c' })
        }
    }

    const handleDeleteSession = async (sessionType) => {
        const record = sessionType === 'morning' ? morningRecord : afternoonRecord
        if (!record) return

        const result = await Swal.fire(confirmDeleteAlert(`${sessionType === 'morning' ? 'Morning' : 'Afternoon'} Session`))
        if (result.isConfirmed) {
            await supabase.from('attendance').delete().eq('id', record.id)
            fetchDateRecords()
            if (onRefresh) onRefresh()
        }
    }

    if (!intern) return null

    return (
        <AnimatePresence>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                    onClick={onClose}
                />
                
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    style={{ position: 'relative', background: 'linear-gradient(160deg, rgba(14,22,38,0.98), rgba(24,34,52,0.98))', border: '1px solid var(--border)', borderRadius: '1.5rem', width: '100%', maxWidth: '30rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
                    
                    {/* Header */}
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                        <div>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'white', margin: 0 }}>Attendance Logs</h2>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>{intern.full_name}</p>
                        </div>
                        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.6)', width: '2rem', height: '2rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                        
                        {/* Date Picker */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                Target Date
                            </label>
                            <input 
                                type="date" 
                                className="input" 
                                value={selectedDate} 
                                onChange={e => setSelectedDate(e.target.value)} 
                                style={{ padding: '0.75rem', fontSize: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', fontWeight: 600, width: '100%', color: 'white', letterSpacing: '0.05em' }} 
                            />
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                                <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C', borderRadius: '50%', margin: '0 auto' }} />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                
                                {/* ---------------- MORNING SESSION BLOCK ---------------- */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(to bottom, #6ee7b7, #10b981)' }} />
                                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'white', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--success)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        Morning Session (AM)
                                        {morningRecord && <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: '0.5625rem' }}>Logged</span>}
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Time In</label>
                                            <input type="time" className="input" value={morningIn} onChange={e => setMorningIn(e.target.value)} style={{ padding: '0.625rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', color: morningIn ? 'white' : 'var(--text-muted)' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Time Out</label>
                                            <input type="time" className="input" value={morningOut} onChange={e => setMorningOut(e.target.value)} style={{ padding: '0.625rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', color: morningOut ? 'white' : 'var(--text-muted)' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        {morningRecord && (
                                            <button onClick={() => handleDeleteSession('morning')} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', flex: 1 }}>
                                                Delete
                                            </button>
                                        )}
                                        <button onClick={() => handleSaveSession('morning')} className="btn-primary" style={{ flex: morningRecord ? 2 : 1, padding: '0.625rem', fontSize: '0.75rem' }}>
                                            {morningRecord ? 'Update Session' : 'Save Session'}
                                        </button>
                                    </div>
                                </div>

                                {/* ---------------- AFTERNOON SESSION BLOCK ---------------- */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(to bottom, #fde047, #f59e0b)' }} />
                                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'white', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                                        Afternoon Session (PM)
                                        {afternoonRecord && <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.5625rem' }}>Logged</span>}
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Time In</label>
                                            <input type="time" className="input" value={afternoonIn} onChange={e => setAfternoonIn(e.target.value)} style={{ padding: '0.625rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', color: afternoonIn ? 'white' : 'var(--text-muted)' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Time Out</label>
                                            <input type="time" className="input" value={afternoonOut} onChange={e => setAfternoonOut(e.target.value)} style={{ padding: '0.625rem', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', color: afternoonOut ? 'white' : 'var(--text-muted)' }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        {afternoonRecord && (
                                            <button onClick={() => handleDeleteSession('afternoon')} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', flex: 1 }}>
                                                Delete
                                            </button>
                                        )}
                                        <button onClick={() => handleSaveSession('afternoon')} className="btn-primary" style={{ flex: afternoonRecord ? 2 : 1, padding: '0.625rem', fontSize: '0.75rem' }}>
                                            {afternoonRecord ? 'Update Session' : 'Save Session'}
                                        </button>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
