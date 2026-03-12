'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'react-qr-code'
import { supabase } from '@/lib/supabase-browser'
import { calculateTotalOjtHours, formatHours, formatManilaTime, formatManilaDate } from '@/utils/time'
import CustomMonthPicker from '@/components/CustomMonthPicker'

export default function InternDashboard() {
    const router = useRouter()
    const [uuid, setUuid] = useState(null)
    const [intern, setIntern] = useState(null)
    const [attendance, setAttendance] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('qr') // 'qr' | 'logs'
    const [filterType, setFilterType] = useState('month') // 'day', 'month', 'all'
    const [filterDate, setFilterDate] = useState('') // Daily filter for logbook
    const [filterMonth, setFilterMonth] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 10
    
    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editForm, setEditForm] = useState({ full_name: '', username: '', password: '' })
    const [isSaving, setIsSaving] = useState(false)

    // Leave Modal State
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [leaveForm, setLeaveForm] = useState({ date: '', reason: '' })
    const [isSubmittingLeave, setIsSubmittingLeave] = useState(false)
    const [leaveRequests, setLeaveRequests] = useState([])

    useEffect(() => {
        const stored = localStorage.getItem('intern_uuid')
        if (!stored) {
            router.replace('/intern/login')
            return
        }
        setUuid(stored)
    }, [router])

    const fetchData = useCallback(async () => {
        if (!uuid || !supabase) return
        setLoading(true)
        try {
            const [{ data: internData }, { data: attendanceData }] = await Promise.all([
                supabase.from('interns').select('*').eq('uuid', uuid).single(),
                supabase.from('attendance').select('*')
                    .eq('intern_id', (await supabase.from('interns').select('id').eq('uuid', uuid).single()).data?.id)
                    .order('time_in', { ascending: false }),
            ])
            
            if (internData) {
                setIntern(internData)
                // Fetch leave requests using the intern's actual ID
                const { data: leaveData } = await supabase
                    .from('leave_requests')
                    .select('*')
                    .eq('intern_id', internData.id)
                    .order('created_at', { ascending: false })
                setLeaveRequests(leaveData || [])
            }
            setAttendance(attendanceData || [])
        } catch (err) {
            console.error('Failed to load data:', err)
        } finally {
            setLoading(false)
        }
    }, [uuid])

    useEffect(() => {
        if (uuid) fetchData()
    }, [uuid, fetchData])

    const handleLogout = () => {
        localStorage.removeItem('intern_uuid')
        router.push('/intern/login')
    }

    const openEditModal = () => {
        setEditForm({
            full_name: intern?.full_name || '',
            username: intern?.username || '',
            password: '' // Keep password empty initially
        })
        setIsEditModalOpen(true)
    }

    const handleUpdateInfo = async (e) => {
        e.preventDefault()
        if (!uuid) return
        setIsSaving(true)

        try {
            const updates = {
                full_name: editForm.full_name,
                username: editForm.username,
                updated_at: new Date().toISOString()
            }
            if (editForm.password.trim() !== '') {
                updates.password = editForm.password
            }

            const { error } = await supabase
                .from('interns')
                .update(updates)
                .eq('uuid', uuid)

            if (error) throw error

            // Update local state instantly
            setIntern(prev => ({ ...prev, full_name: updates.full_name, username: updates.username }))
            setIsEditModalOpen(false)
            
            // Re-import sweetalert dynamically for client side here if needed, or use a simple alert
            const Swal = (await import('sweetalert2')).default
            Swal.fire({
                title: 'Profile Updated!',
                text: 'Your information has been successfully saved.',
                icon: 'success',
                background: '#1a1f2c',
                color: '#fff',
                confirmButtonColor: '#C9A84C',
                customClass: { popup: 'luxury-swal-popup', confirmButton: 'luxury-swal-confirm' }
            })
        } catch (error) {
            console.error('Error updating info:', error)
            alert('Failed to update info. Try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleSubmitLeave = async (e) => {
        e.preventDefault()
        if (!intern || !leaveForm.date || !leaveForm.reason.trim()) return
        
        setIsSubmittingLeave(true)
        try {
            const { data, error } = await supabase.from('leave_requests').insert([{
                intern_id: intern.id,
                date_of_leave: leaveForm.date,
                reason: leaveForm.reason.trim(),
                status: 'pending'
            }]).select()

            if (error) throw error

            // Add the new request to UI state
            if (data && data.length > 0) {
                setLeaveRequests(prev => [data[0], ...prev])
            }
            
            setIsLeaveModalOpen(false)
            setLeaveForm({ date: '', reason: '' })
            
            const Swal = (await import('sweetalert2')).default
            Swal.fire({
                title: 'Request Sent',
                text: 'Your leave request has been submitted to the admin for review.',
                icon: 'success',
                background: '#1a1f2c',
                color: '#fff',
                confirmButtonColor: '#C9A84C'
            })
        } catch (error) {
            console.error('Leave submit error:', error)
            alert('Failed to submit leave request. Try again.')
        } finally {
            setIsSubmittingLeave(false)
        }
    }

    // Memoized: only recalculate when attendance changes (saves CPU on low-end phones)
    const totalHours = useMemo(() => calculateTotalOjtHours(attendance), [attendance])
    const requiredHours = intern?.required_hours || 600
    const progressPercent = useMemo(() => Math.min((totalHours / requiredHours) * 100, 100), [totalHours, requiredHours])

    // SVG Donut Setup
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    // Monthly stats (memoized)
    const { thisMonthHours, thisMonthName, thisMonthDays } = useMemo(() => {
        const thisMonthKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7)
        const logs = attendance.filter(row => {
            if (!row.time_in) return false
            return new Date(row.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).startsWith(thisMonthKey)
        })
        return {
            thisMonthHours: calculateTotalOjtHours(logs),
            thisMonthName: new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }),
            thisMonthDays: new Set(logs.map(r => new Date(r.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))).size
        }
    }, [attendance])

    if (loading || !intern) {
        return (
            <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '28rem', background: 'var(--bg-secondary)', borderRadius: '2rem', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
                        <div className="skeleton-pulse" style={{ width: '4.5rem', height: '4.5rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', marginBottom: '1rem' }} />
                        <div className="skeleton-pulse" style={{ width: '180px', height: '1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
                        <div className="skeleton-pulse" style={{ width: '120px', height: '0.875rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.25rem' }} />
                        
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <div className="skeleton-pulse" style={{ width: '80px', height: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem' }} />
                            <div className="skeleton-pulse" style={{ width: '80px', height: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem' }} />
                        </div>
                    </div>

                    <div className="skeleton-pulse" style={{ width: '220px', height: '220px', margin: '0 auto', background: 'rgba(255,255,255,0.03)', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }} />
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ maxWidth: '48rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>

                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                    style={{ maxWidth: '28rem', margin: '0 auto 1.5rem auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(123,28,28,0.3)' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'white', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>OJT Tracker</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.625rem', fontWeight: 600, margin: 0 }}>ATTENDANCE SYSTEM</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0.5rem 0.875rem', borderRadius: '0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                        Sign Out
                    </button>
                </motion.div>

                {/* Hours Progress Card (Donut Chart) */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
                    style={{ maxWidth: '28rem', margin: '0 auto 1.25rem auto', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    
                    <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                            <motion.circle 
                                cx="50" cy="50" r={radius} fill="none" 
                                stroke="var(--gold)" strokeWidth="8" 
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                initial={{ strokeDashoffset: circumference }}
                                animate={{ strokeDashoffset }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                            />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{Math.round(progressPercent)}%</span>
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>OJT Progress</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{formatHours(totalHours)}</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>/ {requiredHours}h</span>
                        </div>
                        <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: progressPercent >= 100 ? 'var(--success)' : 'var(--text-secondary)', margin: 0 }}>
                            {progressPercent >= 100 ? '🎉 Requirements completed!' : `${(requiredHours - totalHours).toFixed(1)} hours remaining`}
                        </p>
                    </div>
                </motion.div>

                {/* This Month Summary */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
                    style={{ maxWidth: '28rem', margin: '0 auto 1.25rem auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                    <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: '1rem', padding: '0.875rem 1rem' }}>
                        <p style={{ fontSize: '0.5625rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.25rem' }}>This Month</p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 900, color: 'white', margin: '0 0 0.125rem', lineHeight: 1 }}>{formatHours(thisMonthHours)}</p>
                        <p style={{ fontSize: '0.625rem', color: 'var(--text-muted)', margin: 0 }}>{thisMonthName}</p>
                    </div>
                    <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '1rem', padding: '0.875rem 1rem' }}>
                        <p style={{ fontSize: '0.5625rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.25rem' }}>Days Present</p>
                        <p style={{ fontSize: '1.375rem', fontWeight: 900, color: 'white', margin: '0 0 0.125rem', lineHeight: 1 }}>{thisMonthDays}</p>
                        <p style={{ fontSize: '0.625rem', color: 'var(--text-muted)', margin: 0 }}>this month</p>
                    </div>
                </motion.div>

                {/* Tab Toggle */}
                <div style={{ maxWidth: '28rem', margin: '0 auto 1.25rem auto', display: 'flex', gap: '0.5rem' }}>
                    {[
                        { key: 'qr', label: 'My QR Code', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" /><path d="M20 14v3h-3" /><path d="M14 20h3v-3" /></svg> },
                        { key: 'logs', label: 'Attendance Log', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                padding: '0.75rem', borderRadius: '1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem',
                                fontFamily: 'inherit', transition: 'all 0.2s',
                                background: activeTab === tab.key ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1.5px solid ${activeTab === tab.key ? 'var(--gold)' : 'var(--border)'}`,
                                color: activeTab === tab.key ? 'var(--gold)' : 'var(--text-muted)',
                            }}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'qr' ? (
                        <motion.div key="qr" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ maxWidth: '28rem', margin: '0 auto' }}>
                            {/* QR Pass Card */}
                            <div className="holographic-gold" style={{ padding: '1px', borderRadius: '2rem', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)', marginBottom: '1.5rem' }}>
                                <div className="glass-dark" style={{ padding: '1.75rem 1.5rem', borderRadius: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', position: 'relative' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <span style={{ fontSize: '0.625rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.3em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>OJT Intern</span>
                                        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>{intern?.full_name}</h1>
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                        <div style={{ padding: '0.875rem', background: 'white', borderRadius: '1.5rem', boxShadow: '0 0 30px rgba(201,168,76,0.2)' }}>
                                            <QRCode value={uuid} size={160} level="H" bgColor="#ffffff" fgColor="#0f172a" />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        <span className="badge" style={{ background: 'var(--maroon)', color: 'white', border: 'none' }}>Intern Pass</span>
                                    </div>

                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                                        Present this QR code to the admin scanner to check in or out.
                                    </p>

                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', width: '100%' }}>
                                        <button onClick={openEditModal} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.625rem 0', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            Edit Info
                                        </button>
                                        <button onClick={() => setIsLeaveModalOpen(true)} style={{ flex: 1.5, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', padding: '0.625rem 0', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}
                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(59,130,246,0.15)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}>
                                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            Request Leave
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Leave Requests Log */}
                            {leaveRequests.length > 0 && (
                                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--gold)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Leave Requests</p>
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {leaveRequests.map((req) => (
                                            <div key={req.id} style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>{new Date(`${req.date_of_leave}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.reason}</p>
                                                    {req.admin_notes && (
                                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#f87171', fontStyle: 'italic', background: 'rgba(239,68,68,0.1)', padding: '0.375rem 0.5rem', borderRadius: '0.375rem' }}>Note: {req.admin_notes}</p>
                                                    )}
                                                </div>
                                                <div style={{ flexShrink: 0, marginLeft: '1rem' }}>
                                                    {req.status === 'pending' && <span className="badge badge-warning">Pending</span>}
                                                    {req.status === 'approved' && <span className="badge badge-success">Approved</span>}
                                                    {req.status === 'rejected' && <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>Rejected</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {/* Attendance Log */}
                            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem' }}>
                                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>My Attendance Log</p>
                                        <span className="badge badge-gold">{new Set(attendance.map(r => new Date(r.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }))).size} days</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        {/* Segmented Filter Control */}
                                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '0.875rem', gap: '0.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            {['day', 'month', 'all'].map(type => (
                                                <button key={type} 
                                                    onClick={() => { setFilterType(type); setCurrentPage(1); }}
                                                    style={{ 
                                                        padding: '0.375rem 0.875rem', 
                                                        borderRadius: '0.625rem', 
                                                        background: filterType === type ? 'rgba(201,168,76,0.15)' : 'transparent', 
                                                        color: filterType === type ? 'var(--gold)' : 'rgba(255,255,255,0.5)', 
                                                        border: filterType === type ? '1px solid rgba(201,168,76,0.2)' : '1px solid transparent',
                                                        fontSize: '0.75rem', 
                                                        fontWeight: 700, 
                                                        cursor: 'pointer', 
                                                        transition: 'all 0.2s',
                                                        textTransform: 'capitalize'
                                                    }}>
                                                    {type === 'day' ? 'Daily' : type === 'month' ? 'Monthly' : 'All Time'}
                                                </button>
                                            ))}
                                        </div>

                                        {filterType === 'day' && (
                                            <input
                                                type="date"
                                                value={filterDate}
                                                onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                                                style={{ 
                                                    padding: '0.375rem 0.875rem', 
                                                    borderRadius: '0.75rem', 
                                                    border: `1.5px solid ${filterDate ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, 
                                                    background: 'rgba(0,0,0,0.3)', 
                                                    color: filterDate ? 'white' : 'rgba(255,255,255,0.4)', 
                                                    fontSize: '0.8125rem', 
                                                    fontWeight: 600,
                                                    fontFamily: 'inherit',
                                                    outline: 'none',
                                                    colorScheme: 'dark',
                                                    height: '34px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            />
                                        )}

                                        {filterType === 'month' && (
                                            <div style={{ width: '160px' }}>
                                                <CustomMonthPicker 
                                                    selectedMonth={filterMonth}
                                                    onChange={(val) => { setFilterMonth(val); setCurrentPage(1); }}
                                                    size="small"
                                                    align="right"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {attendance.length === 0 ? (
                                    <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                                        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} style={{ margin: '0 auto 1rem' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No attendance records yet</p>
                                    </div>
                                ) : (() => {
                                    // Group records by date
                                    const grouped = {}
                                    attendance.forEach(row => {
                                        const dateKey = new Date(row.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                                        if (!grouped[dateKey]) grouped[dateKey] = []
                                        grouped[dateKey].push(row)
                                    })
                                    let sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

                                    if (filterType === 'day' && filterDate) {
                                        sortedDates = sortedDates.filter(d => d === filterDate)
                                    } else if (filterType === 'month' && filterMonth) {
                                        sortedDates = sortedDates.filter(d => d.startsWith(filterMonth))
                                    }

                                    if (sortedDates.length === 0) {
                                        return (
                                            <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No logs found for the selected filter.</p>
                                            </div>
                                        )
                                    }

                                    // Pagination Logic
                                    const totalPages = Math.ceil(sortedDates.length / ITEMS_PER_PAGE)
                                    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
                                    const paginatedDates = sortedDates.slice(startIndex, startIndex + ITEMS_PER_PAGE)

                                    return (
                                        <div style={{ maxHeight: '28rem', overflowY: 'auto' }}>
                                            <table className="responsive-log-table">
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>AM In</th>
                                                        <th>AM Out</th>
                                                        <th>PM In</th>
                                                        <th>PM Out</th>
                                                        <th>Total Hours</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedDates.map((dateKey) => {
                                                        const dayRecords = grouped[dateKey]
                                                        const morning = dayRecords.find(r => {
                                                            const h = Number(new Date(r.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                                            return h < 12
                                                        }) || null
                                                        const afternoon = dayRecords.find(r => {
                                                            const h = Number(new Date(r.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                                            return h >= 12
                                                        }) || null

                                                        const dateLabel = new Date(`${dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Manila' })
                                                        const totalDayHours = dayRecords.reduce((sum, r) => {
                                                            if (!r.time_in || !r.time_out) return sum
                                                            return sum + (new Date(r.time_out) - new Date(r.time_in)) / 3600000
                                                        }, 0)

                                                        return (
                                                            <tr key={dateKey}>
                                                                <td data-label="Date">
                                                                    <div style={{ fontWeight: 800, color: 'white' }}>{dateLabel}</div>
                                                                </td>
                                                                <td data-label="AM In">
                                                                    {morning?.time_in ? <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>{formatManilaTime(morning.time_in)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                                </td>
                                                                <td data-label="AM Out">
                                                                    {morning?.time_out ? <span className="badge badge-warning" style={{ fontSize: '0.625rem' }}>{formatManilaTime(morning.time_out)}</span> : morning?.time_in ? <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 800 }}>● Active</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                                </td>
                                                                <td data-label="PM In">
                                                                    {afternoon?.time_in ? <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '0.375rem', background: 'rgba(96,165,250,0.12)', color: 'rgba(96,165,250,0.9)' }}>{formatManilaTime(afternoon.time_in)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                                </td>
                                                                <td data-label="PM Out">
                                                                    {afternoon?.time_out ? <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '0.375rem', background: 'rgba(96,165,250,0.08)', color: 'rgba(96,165,250,0.7)' }}>{formatManilaTime(afternoon.time_out)}</span> : afternoon?.time_in ? <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 800 }}>● Active</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                                </td>
                                                                <td data-label="Total Hours">
                                                                    <span style={{ fontWeight: 800, color: totalDayHours > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                                                                        {totalDayHours > 0 ? formatHours(totalDayHours) : '—'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                    {totalPages > 0 && (
                                                        <tr>
                                                            <td colSpan="6" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                        Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, sortedDates.length)} of {sortedDates.length} entries
                                                                    </span>
                                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                        <button 
                                                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                                            disabled={currentPage === 1}
                                                                            style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border)', background: currentPage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.1)', color: currentPage === 1 ? 'var(--text-muted)' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}
                                                                        >
                                                                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                                                        </button>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'white', margin: '0 0.25rem' }}>
                                                                            {currentPage} / {totalPages}
                                                                        </span>
                                                                        <button 
                                                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                                            disabled={currentPage === totalPages}
                                                                            style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border)', background: currentPage === totalPages ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.1)', color: currentPage === totalPages ? 'var(--text-muted)' : 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}
                                                                        >
                                                                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                })()}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Edit Profile Modal */}
                {/* Edit Profile Modal */}
                <AnimatePresence>
                    {isEditModalOpen && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEditModalOpen(false)}
                                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} />
                            
                            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                style={{ position: 'relative', width: '100%', maxWidth: '24rem', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
                                
                                <div style={{ padding: '1.5rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>Edit Profile</h3>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Update your personal information</p>
                                    </div>
                                    <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <form onSubmit={handleUpdateInfo} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label className="input-label" style={{ fontSize: '0.6875rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>Full Name</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <svg style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            <input type="text" required placeholder="Juan Dela Cruz"
                                                style={{ width: '100%', padding: '0.875rem 1.25rem 0.875rem 2.875rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'white', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit' }}
                                                onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.previousSibling.style.color = 'var(--gold)' }}
                                                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.previousSibling.style.color = 'var(--text-muted)' }}
                                                value={editForm.full_name} onChange={e => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label className="input-label" style={{ fontSize: '0.6875rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>Username</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <svg style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)', transition: 'color 0.2s' }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                                            <input type="text" required placeholder="jdelacruz"
                                                style={{ width: '100%', padding: '0.875rem 1.25rem 0.875rem 2.875rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'white', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit' }}
                                                onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.previousSibling.style.color = 'var(--gold)' }}
                                                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.previousSibling.style.color = 'var(--text-muted)' }}
                                                value={editForm.username} onChange={e => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label className="input-label" style={{ fontSize: '0.6875rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>New Password</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <svg style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)', transition: 'color 0.2s' }} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            <input type="password" placeholder="Leave blank to keep current"
                                                style={{ width: '100%', padding: '0.875rem 1.25rem 0.875rem 2.875rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'white', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit' }}
                                                onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.previousSibling.style.color = 'var(--gold)' }}
                                                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.previousSibling.style.color = 'var(--text-muted)' }}
                                                value={editForm.password} onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <button type="button" onClick={() => setIsEditModalOpen(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 700, fontSize: '0.875rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Cancel</button>
                                        <button type="submit" disabled={isSaving} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, var(--gold), #b48e36)', color: '#111', fontWeight: 800, fontSize: '0.875rem', border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(201,168,76,0.3)' }}>
                                            {isSaving ? (
                                                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            ) : (
                                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            )}
                                            {isSaving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Request Leave Modal */}
                <AnimatePresence>
                    {isLeaveModalOpen && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsLeaveModalOpen(false)}
                                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} />
                            
                            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                style={{ position: 'relative', width: '100%', maxWidth: '24rem', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
                                
                                <div style={{ padding: '1.5rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to bottom, rgba(59,130,246,0.08), transparent)' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>Request Leave</h3>
                                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Submit an excused absence</p>
                                    </div>
                                    <button onClick={() => setIsLeaveModalOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <form onSubmit={handleSubmitLeave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label className="input-label" style={{ fontSize: '0.6875rem', color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>Date of Leave</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <input type="date" required 
                                                style={{ width: '100%', padding: '0.875rem 1.25rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'white', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit' }}
                                                onFocus={e => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.previousSibling.style.color = '#60a5fa' }}
                                                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.previousSibling.style.color = 'var(--text-muted)' }}
                                                value={leaveForm.date} onChange={e => setLeaveForm(prev => ({ ...prev, date: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label className="input-label" style={{ fontSize: '0.6875rem', color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>Reason / Note</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <textarea required placeholder="Briefly state the reason for absence..." rows={3}
                                                style={{ width: '100%', padding: '0.875rem 1.25rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'white', fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit', resize: 'none' }}
                                                onFocus={e => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.previousSibling.style.color = '#60a5fa' }}
                                                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.previousSibling.style.color = 'var(--text-muted)' }}
                                                value={leaveForm.reason} onChange={e => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <button type="button" onClick={() => setIsLeaveModalOpen(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 700, fontSize: '0.875rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>Cancel</button>
                                        <button type="submit" disabled={isSubmittingLeave} style={{ flex: 1.5, padding: '0.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', fontWeight: 800, fontSize: '0.875rem', border: 'none', cursor: isSubmittingLeave ? 'not-allowed' : 'pointer', opacity: isSubmittingLeave ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                                            {isSubmittingLeave ? (
                                                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                            ) : (
                                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                            )}
                                            {isSubmittingLeave ? 'Sending...' : 'Submit Request'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem' }}>
                    <p style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                </div>
            </div>
        </div>
    )
}
