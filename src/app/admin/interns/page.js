'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'
import { calculateTotalOjtHours, formatHours } from '@/utils/time'
import Swal from 'sweetalert2'
import { confirmDeleteAlert, confirmUpdateAlert } from '@/utils/swal-configs'
import ManageAttendanceModal from '@/components/ManageAttendanceModal'

export default function AdminInterns() {
    const router = useRouter()
    const [interns, setInterns] = useState([])
    const [loading, setLoading] = useState(true)
    const [menuOpen, setMenuOpen] = useState(false)
    const [editingIntern, setEditingIntern] = useState(null)
    const [editHours, setEditHours] = useState('')
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 10
    
    // Manage Attendance
    const [managingAttendanceIntern, setManagingAttendanceIntern] = useState(null)

    // Auth check
    useEffect(() => {
        const session = localStorage.getItem('admin_session')
        if (!session) router.replace('/admin/login')
    }, [router])

    const fetchInterns = useCallback(async () => {
        if (!supabase) return
        setLoading(true)
        try {
            // Get all interns
            const { data: internData } = await supabase
                .from('interns')
                .select('*')
                .order('full_name')

            // Get all attendance to compute total hours per intern
            const { data: attendanceData } = await supabase
                .from('attendance')
                .select('intern_id, time_in, time_out')

            const internList = (internData || []).map(intern => {
                const logs = (attendanceData || []).filter(a => a.intern_id === intern.id)
                const totalHours = calculateTotalOjtHours(logs)
                const requiredHours = intern.required_hours || 600
                return {
                    ...intern,
                    totalHours,
                    requiredHours,
                    progressPercent: Math.min((totalHours / requiredHours) * 100, 100),
                    sessionsCount: logs.length,
                }
            })

            setInterns(internList)
        } catch (err) {
            console.error('Failed to load interns:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchInterns() }, [fetchInterns])

    const handleEditSave = async () => {
        if (!editingIntern || !supabase) return
        const hrs = parseInt(editHours)
        if (isNaN(hrs) || hrs < 1) return

        const result = await Swal.fire(confirmUpdateAlert(editingIntern.full_name, 'required hours'))
        if (!result.isConfirmed) return
        setSaving(true)
        try {
            await supabase.from('interns').update({ required_hours: hrs }).eq('id', editingIntern.id)
            setInterns(prev => prev.map(i => i.id === editingIntern.id ? { ...i, requiredHours: hrs, progressPercent: Math.min((i.totalHours / hrs) * 100, 100) } : i))
            setEditingIntern(null)
        } catch (err) {
            console.error('Save failed:', err)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (intern) => {
        if (!supabase) return
        const result = await Swal.fire(confirmDeleteAlert(intern.full_name))
        if (!result.isConfirmed) return
        
        setDeletingId(intern.id)
        try {
            await supabase.from('attendance').delete().eq('intern_id', intern.id)
            await supabase.from('interns').delete().eq('id', intern.id)
            setInterns(prev => prev.filter(i => i.id !== intern.id))
        } catch (err) {
            console.error('Delete failed:', err)
        } finally {
            setDeletingId(null)
        }
    }

    const filtered = useMemo(() =>
        interns.filter(i => i.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    , [interns, searchQuery])

    // Reset pagination on search change
    useEffect(() => { setCurrentPage(1) }, [searchQuery])

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
    const paginatedInterns = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }, [filtered, currentPage])

    const totalHoursAll = interns.reduce((sum, i) => sum + i.totalHours, 0)
    const completedCount = interns.filter(i => i.progressPercent >= 100).length

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem 1.25rem', position: 'relative' }}>
            <div style={{ maxWidth: '56rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>

                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.75rem', cursor: 'pointer', display: 'flex' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 900, color: 'white', margin: 0 }}>Manage Interns</h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>{interns.length} registered interns</p>
                        </div>
                    </div>

                    {/* Burger Menu */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setMenuOpen(v => !v)}
                            style={{ background: menuOpen ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${menuOpen ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, color: 'white', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            aria-label="Menu">
                            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        {menuOpen && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, background: 'linear-gradient(160deg, rgba(20,30,50,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.25rem', padding: '0.625rem', minWidth: '210px', zIndex: 50, boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.08)', backdropFilter: 'blur(20px)' }}>
                                <div style={{ padding: '0.5rem 0.875rem 0.625rem', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '0.375rem' }}>
                                    <p style={{ fontSize: '0.625rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Navigation</p>
                                </div>
                                {[
                                    { label: 'Dashboard', path: '/admin/dashboard', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                                    { label: 'Monthly Reports', path: '/admin/reports', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
                                    { label: 'Printable IDs', path: '/admin/ids', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg> },
                                    { label: 'QR Scanner', path: '/admin/scanner', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 14h3m0 3v3m-6 0h3" /></svg> },
                                    { label: 'Intern Portal', path: '/intern/login', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                                ].map(item => (
                                    <button key={item.path} onClick={() => { setMenuOpen(false); router.push(item.path) }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'left', transition: 'all 0.15s' }}
                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'white' }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}>
                                        <span style={{ color: 'var(--gold)', display: 'flex' }}>{item.icon}</span>
                                        {item.label}
                                    </button>
                                ))}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0.375rem 0' }} />
                                <button onClick={() => { localStorage.removeItem('admin_session'); sessionStorage.removeItem('admin_logged_in'); router.push('/admin/login') }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'left', transition: 'all 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Summary Stats */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {[
                        { label: 'Total Interns', value: interns.length, icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, color: 'var(--gold)' },
                        { label: 'Completed OJT', value: completedCount, icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>, color: 'var(--success)' },
                        { label: 'Hours Logged', value: formatHours(totalHoursAll), icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, color: 'var(--info)' },
                    ].map(stat => (
                        <div key={stat.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: stat.color }}>{stat.icon}</div>
                            <p style={{ fontSize: '1.25rem', fontWeight: 900, color: stat.color, margin: '0 0 0.125rem' }}>{stat.value}</p>
                            <p style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{stat.label}</p>
                        </div>
                    ))}
                </motion.div>

                {/* Search */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ marginBottom: '1rem' }}>
                    <input
                        className="input"
                        type="text"
                        placeholder="🔍  Search intern by name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ height: '2.75rem', fontSize: '0.875rem' }}
                    />
                </motion.div>

                {/* Intern List */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton-pulse" style={{ height: '110px', background: 'rgba(255,255,255,0.03)', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }} />
                        ))}
                    </div>
                                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} style={{ margin: '0 auto 1rem', display: 'block' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No interns found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <motion.div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {paginatedInterns.map((intern, idx) => (
                                <motion.div key={intern.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.25rem', padding: '1rem 1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                                <h3 style={{ fontWeight: 800, color: 'white', margin: 0, fontSize: '0.9375rem' }}>{intern.full_name}</h3>
                                                {intern.progressPercent >= 100 && (
                                                    <span className="badge badge-success" style={{ fontSize: '0.5625rem' }}>✓ Completed</span>
                                                )}
                                            </div>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
                                                @{intern.username} • {intern.sessionsCount} sessions
                                            </p>

                                            {/* Progress */}
                                            <div style={{ marginBottom: '0.375rem' }}>
                                                <div className="progress-bar">
                                                    <div className="progress-bar-fill" style={{ width: `${intern.progressPercent}%` }} />
                                                </div>
                                            </div>
                                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', margin: 0 }}>
                                                <span style={{ color: 'white' }}>{formatHours(intern.totalHours)}</span> of {intern.requiredHours}h required ({intern.progressPercent.toFixed(1)}%)
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                                            <button onClick={() => setManagingAttendanceIntern(intern)}
                                                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                                Logs
                                            </button>
                                            <button onClick={() => { setEditingIntern(intern); setEditHours(String(intern.requiredHours)) }}
                                                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                Edit
                                            </button>
                                            <button onClick={() => handleDelete(intern)} disabled={deletingId === intern.id}
                                                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.375rem', opacity: deletingId === intern.id ? 0.5 : 1 }}>
                                                {deletingId === intern.id ? (
                                                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                ) : (
                                                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                )}
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>

                        {/* Pagination UI */}
                        {totalPages > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '1.25rem', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                    Showing <span style={{ color: 'white' }}>{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> to <span style={{ color: 'white' }}>{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of <span style={{ color: 'white' }}>{filtered.length}</span> interns
                                </span>
                                
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border)', background: currentPage === 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.1)', color: currentPage === 1 ? 'var(--text-muted)' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}
                                    >
                                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0.5rem' }}>
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
                        )}
                    </div>
                )}

                {/* Edit Modal */}
                <AnimatePresence>
                    {editingIntern && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1.5rem' }}>
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.75rem', width: '100%', maxWidth: '24rem' }}>
                                <h3 style={{ fontWeight: 800, color: 'white', marginBottom: '0.375rem' }}>Edit Required Hours</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>{editingIntern.full_name}</p>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Required Hours</label>
                                <input
                                    className="input"
                                    type="number"
                                    min="1"
                                    value={editHours}
                                    onChange={e => setEditHours(e.target.value)}
                                    style={{ marginBottom: '1rem' }}
                                />
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button onClick={() => setEditingIntern(null)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                                    <button onClick={handleEditSave} disabled={saving} className="btn-primary" style={{ flex: 1 }}>
                                        {saving ? 'Saving…' : 'Save Changes'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                 </AnimatePresence>


                {/* Manage Attendance Modal */}
                <ManageAttendanceModal
                    intern={managingAttendanceIntern}
                    onClose={() => setManagingAttendanceIntern(null)}
                    onRefresh={() => fetchInterns()}
                />

                <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem' }}>
                    <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                </div>
            </div>
        </div>
    )
}
