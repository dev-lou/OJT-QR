'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'
import CustomMonthPicker from '@/components/CustomMonthPicker'
import CustomDatePicker from '@/components/CustomDatePicker'
import ManageAttendanceModal from '@/components/ManageAttendanceModal'
import { calculateTotalOjtHours, formatHours, formatManilaTime, formatManilaDate } from '@/utils/time'
import { confirmDeleteAlert, confirmActionAlert } from '@/utils/swal-configs'
import Swal from 'sweetalert2'

export default function AdminDashboard() {
    const router = useRouter()
    const [admin, setAdmin] = useState(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [filterType, setFilterType] = useState('day') // 'day', 'month', 'all'
    const [filterDate, setFilterDate] = useState('') // Daily filter for logbook
    const [filterMonth, setFilterMonth] = useState('') // Monthly filter for logbook
    const [currentPage, setCurrentPage] = useState(1) // Pagination state
    const ITEMS_PER_PAGE = 10
    const [stats, setStats] = useState({
        totalInterns: 0,
        activeCheckIns: 0,
        totalHoursStr: '0h 0m',
        checkedInToday: 0,
        checkedOutToday: 0,
        allLogs: [],
        pendingLeaves: []
    })
    const [menuOpen, setMenuOpen] = useState(false)
    const [isManageModalOpen, setIsManageModalOpen] = useState(false)
    const [selectedInternForManage, setSelectedInternForManage] = useState(null)

    useEffect(() => {
        const storedStr = localStorage.getItem('admin_session')
        if (!storedStr) {
            router.replace('/admin/login')
            return
        }
        try {
            const session = JSON.parse(storedStr)
            setAdmin(session)
        } catch (e) {
            router.replace('/admin/login')
        }
    }, [router])

    const handleOpenManage = (internId, internName) => {
        setSelectedInternForManage({ id: internId, full_name: internName })
        setIsManageModalOpen(true)
    }

    const fetchAnalytics = useCallback(async () => {
        if (!supabase) return
        try {
            // 1. Get total interns
            const { count: internCount } = await supabase
                .from('interns')
                .select('*', { count: 'exact', head: true })
            const totalInterns = internCount || 0

            // 2. Get active check-ins (time_out is null)
            const { count: activeCount } = await supabase
                .from('attendance')
                .select('*', { count: 'exact', head: true })
                .is('time_out', null)

            // 3. Prepare filters for the logbook fetch
            let query = supabase
                .from('attendance')
                .select('*, interns(full_name)')
                .order('time_in', { ascending: false })

            if (filterType === 'day' && filterDate) {
                const start = `${filterDate}T00:00:00+08:00`
                const end = `${filterDate}T23:59:59.999+08:00`
                query = query.gte('time_in', start).lte('time_in', end)
            } else if (filterType === 'month' && filterMonth) {
                const start = `${filterMonth}-01T00:00:00+08:00`
                // Simple way to get the end of month or start of next month
                const nextMonth = new Date(filterMonth + '-02');
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                const endMonthKey = nextMonth.toISOString().slice(0, 7);
                const end = `${endMonthKey}-01T00:00:00+08:00`
                query = query.gte('time_in', start).lt('time_in', end)
            } else if (filterType === 'all') {
                // For "All Time", we show the most recent 1000 rows
                query = query.limit(1000)
            }

            const { data: logData } = await query

            // 4. Fetch Pending Leave Requests
            const { data: pendingRequests } = await supabase
                .from('leave_requests')
                .select('*, interns(full_name)')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })

            // 5. Calculate today's stats (Manila time) - ALWAYS based on today regardless of filter
            const manilaTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
            
            // We need a separate quick fetch for today's stats if the current filter isn't today
            let todayLogs = []
            const isFilterToday = filterType === 'day' && filterDate === manilaTodayStr
            
            if (isFilterToday && logData) {
                todayLogs = logData
            } else {
                const startToday = `${manilaTodayStr}T00:00:00+08:00`
                const endToday = `${manilaTodayStr}T23:59:59.999+08:00`
                const { data: todayRes } = await supabase
                    .from('attendance')
                    .select('intern_id, time_in, time_out')
                    .gte('time_in', startToday)
                    .lte('time_in', endToday)
                todayLogs = todayRes || []
            }

            let morningInCount = new Set()
            let morningOutCount = new Set()
            let afternoonInCount = new Set()
            let afternoonOutCount = new Set()

            todayLogs.forEach(log => {
                const logHr = Number(new Date(log.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                if (logHr < 12) {
                    morningInCount.add(log.intern_id);
                    if (log.time_out) morningOutCount.add(log.intern_id);
                } else {
                    afternoonInCount.add(log.intern_id);
                    if (log.time_out) afternoonOutCount.add(log.intern_id);
                }
            })

            setStats({
                totalInterns,
                morningIn: morningInCount.size,
                morningOut: morningOutCount.size,
                afternoonIn: afternoonInCount.size,
                afternoonOut: afternoonOutCount.size,
                allLogs: logData || [],
                pendingLeaves: pendingRequests || []
            })
        } catch (err) {
            console.error('Error fetching analytics:', err)
        } finally {
            setLoading(false)
        }
    }, [filterType, filterDate, filterMonth])

    useEffect(() => {
        if (admin) {
            fetchAnalytics()
        }
    }, [admin, fetchAnalytics])

    const handleLogout = () => {
        localStorage.removeItem('admin_session')
        sessionStorage.removeItem('admin_logged_in')
        router.push('/admin/login')
    }

    const handleUpdateLeaveStatus = async (id, newStatus) => {
        if (!supabase) return
        
        const actionLabel = newStatus === 'approved' ? 'Approve' : 'Reject'
        const result = await Swal.fire(confirmActionAlert(
            `${actionLabel} Leave Request?`,
            `Are you sure you want to <span style="color: ${newStatus === 'approved' ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${actionLabel}</span> this leave request?`,
            `Yes, ${actionLabel}`,
            newStatus === 'approved' ? 'question' : 'warning'
        ))
        if (!result.isConfirmed) return

        setActionLoading(true)
        try {
            // Optional: You could add a prompt here to collect rejection reasons or notes
            let adminNotes = ''
            if (newStatus === 'rejected') {
                const reason = prompt('Optional: Provide a reason for rejecting this leave request:')
                if (reason !== null && reason.trim() !== '') {
                    adminNotes = reason.trim()
                }
            }

            const { error } = await supabase
                .from('leave_requests')
                .update({ status: newStatus, admin_notes: adminNotes || null, updated_at: new Date().toISOString() })
                .eq('id', id)

            if (error) throw error

            // Optimistically update the local state list to remove the acted-upon request
            setStats(prev => ({
                ...prev,
                pendingLeaves: prev.pendingLeaves.filter(req => req.id !== id)
            }))

            const Swal = (await import('sweetalert2')).default
            Swal.fire({
                title: 'Success',
                text: `Request has been ${newStatus}.`,
                icon: 'success',
                background: '#1a1f2c',
                color: '#fff',
                confirmButtonColor: '#C9A84C',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            })
        } catch (error) {
            console.error('Error updating leave status:', error)
            alert('Failed to update request. Please try again.')
        } finally {
            setActionLoading(false)
        }
    }

    if (loading || !admin) {
        return (
            <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1.5rem', overflow: 'hidden' }}>
                <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
                    
                    {/* Skeleton Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="skeleton-pulse" style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                            <div>
                                <div className="skeleton-pulse" style={{ width: '120px', height: '1.25rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.25rem', marginBottom: '0.5rem' }} />
                                <div className="skeleton-pulse" style={{ width: '160px', height: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.25rem' }} />
                            </div>
                        </div>
                    </div>

                    {/* Skeleton Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton-pulse" style={{ height: '100px', background: 'rgba(255,255,255,0.03)', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }} />
                        ))}
                    </div>

                    {/* Skeleton Logbook */}
                    <div className="skeleton-pulse" style={{ height: '400px', background: 'rgba(255,255,255,0.03)', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }} />
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ maxWidth: '64rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>

                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(123,28,28,0.3)' }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', letterSpacing: '0.02em', margin: 0 }}>Administrator</h2>
                            <p style={{ color: 'var(--gold)', fontSize: '0.75rem', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>OJT System Analytics</p>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button 
                            onClick={() => setMenuOpen(!menuOpen)} 
                            style={{ background: menuOpen ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${menuOpen ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, color: 'white', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            aria-label="Menu"
                        >
                            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        
                        {menuOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: -8, scale: 0.97 }} 
                                animate={{ opacity: 1, y: 0, scale: 1 }} 
                                style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, background: 'linear-gradient(160deg, rgba(20,30,50,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.25rem', padding: '0.625rem', minWidth: '220px', boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.08)', zIndex: 50, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(20px)' }}
                            >
                                <div style={{ padding: '0.5rem 0.875rem 0.625rem', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '0.375rem' }}>
                                    <p style={{ fontSize: '0.625rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Navigation</p>
                                </div>
                                {[
                                    { label: 'Monthly Reports', path: '/admin/reports', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
                                    { label: 'Manage Interns', path: '/admin/interns', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                                    { label: 'Printable IDs', path: '/admin/ids', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg> },
                                    { label: 'QR Scanner', path: '/admin/scanner', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 14h3m0 3v3m-6 0h3" /></svg> },
                                    { label: 'Intern Portal', path: '/intern/login', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                                ].map(item => (
                                    <button key={item.path}
                                        onClick={() => { setMenuOpen(false); router.push(item.path) }}
                                        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.75)', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.15s' }}
                                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'white' }}
                                        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
                                    >
                                        <span style={{ color: 'var(--gold)', display: 'flex' }}>{item.icon}</span>
                                        {item.label}
                                    </button>
                                ))}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0.375rem 0' }} />
                                <button 
                                    onClick={handleLogout}
                                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#f87171', padding: '0.625rem 0.875rem', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.15s' }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    Sign Out
                                </button>
                            </motion.div>
                        )}
                    </div>
                </motion.div>

                {/* Dashboard Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    
                    {/* Stat Card 1: Morning Checked In Today */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '1rem', background: 'rgba(52,211,153,0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Morning Check-In</p>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>
                                {stats.morningIn} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalInterns}</span>
                            </h3>
                        </div>
                    </motion.div>

                    {/* Stat Card 2: Morning Checked Out Today */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '1rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Morning Check-Out</p>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>
                                {stats.morningOut} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalInterns}</span>
                            </h3>
                        </div>
                    </motion.div>

                    {/* Stat Card 3: Afternoon Checked In Today */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '1rem', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Afternoon Check-In</p>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>
                                {stats.afternoonIn} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalInterns}</span>
                            </h3>
                        </div>
                    </motion.div>

                    {/* Stat Card 4: Afternoon Checked Out Today */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '1rem', background: 'rgba(234,179,8,0.15)', color: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Afternoon Check-Out</p>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>
                                {stats.afternoonOut} <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ {stats.totalInterns}</span>
                            </h3>
                        </div>
                    </motion.div>

                    {/* Stat Card 5: Pending Excused Leave Requests */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: '4rem', height: '4rem', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />
                        <div style={{ width: '3rem', height: '3rem', borderRadius: '1rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                <circle cx="12" cy="14" r="2" fill="currentColor" />
                            </svg>
                        </div>
                        <div style={{ zIndex: 1 }}>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Pending Requests</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>
                                    {stats.pendingLeaves.length}
                                </h3>
                                {stats.pendingLeaves.length > 0 && (
                                    <span className="badge badge-warning" style={{ padding: '0.125rem 0.375rem', fontSize: '0.625rem' }}>Action required</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', gridColumn: '1 / -1' }}>

                    {/* Pending Requests Block */}
                    {stats.pendingLeaves.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', overflow: 'hidden', gridColumn: '1 / -1' }}>
                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59,130,246,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'white', margin: 0 }}>Review Leave Requests</h3>
                                </div>
                                <span className="badge badge-gold">{stats.pendingLeaves.length} Pending</span>
                            </div>

                            <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '1rem 1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {stats.pendingLeaves.map((req) => (
                                        <div key={req.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 800, color: 'white' }}>{req.interns?.full_name}</h4>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-muted)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                    <span style={{ fontSize: '0.8125rem', color: '#60a5fa', fontWeight: 600 }}>{new Date(`${req.date_of_leave}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '0.5rem', borderLeft: '3px solid #60a5fa' }}>{req.reason}</p>
                                            </div>
                                            
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0, width: '100%', maxWidth: 'max-content' }}>
                                                <button onClick={() => handleUpdateLeaveStatus(req.id, 'rejected')} disabled={actionLoading} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.625rem 1rem', borderRadius: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', flex: 1, minWidth: '100px', textAlign: 'center' }}
                                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}>
                                                    Reject
                                                </button>
                                                <button onClick={() => handleUpdateLeaveStatus(req.id, 'approved')} disabled={actionLoading} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', padding: '0.625rem 1.25rem', borderRadius: '0.75rem', fontSize: '0.8125rem', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem', flex: 1, minWidth: '120px' }}
                                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}>
                                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                    Approve
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Logbook Section */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'white', margin: 0 }}>System Logbook</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>All attendance records</p>
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
                                    <div style={{ width: '160px', height: '34px' }}>
                                        <CustomDatePicker
                                            selectedDate={filterDate}
                                            onChange={(val) => {
                                                setFilterDate(val);
                                                setCurrentPage(1);
                                            }}
                                            size="small"
                                            align="right"
                                        />
                                    </div>
                                )}

                                {filterType === 'month' && (
                                    <div style={{ width: '160px' }}>
                                        <CustomMonthPicker 
                                            selectedMonth={filterMonth}
                                            onChange={(val) => {
                                                setFilterMonth(val);
                                                setCurrentPage(1);
                                            }}
                                            size="small"
                                            align="right"
                                        />
                                    </div>
                                )}

                                <button onClick={fetchAnalytics} style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(123,28,28,0.1))', border: '1px solid rgba(201,168,76,0.25)', color: 'var(--gold)', padding: '0.45rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 800, transition: 'all 0.2s', height: '34px' }}
                                    onMouseOver={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(123,28,28,0.2))'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                                    onMouseOut={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(123,28,28,0.1))'; e.currentTarget.style.transform = 'none' }}
                                >
                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {stats.allLogs.length === 0 ? (
                            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} style={{ margin: '0 auto 1rem' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No attendance records found.</p>
                            </div>
                        ) : (
                            <div className="table-responsive" style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, borderRadius: '0 0 1.5rem 1.5rem' }}>
                                <table className="responsive-log-table">
                                    <thead>
                                        <tr>
                                            <th>Intern Name</th>
                                            <th>Date</th>
                                            <th>AM In</th>
                                            <th>AM Out</th>
                                            <th>PM In</th>
                                            <th>PM Out</th>
                                            <th>Duration</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            // Group logs by Intern + Date
                                            const groupedLogs = {}
                                            
                                            // Apply selected filter to logs
                                            const filteredLogs = stats.allLogs;

                                            if (filteredLogs.length === 0) {
                                                return (
                                                    <tr>
                                                        <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                            No logs found for the selected filter.
                                                        </td>
                                                    </tr>
                                                )
                                            }

                                            filteredLogs.forEach(log => {
                                                const dateKey = new Date(log.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                                                const key = `${log.intern_id}_${dateKey}`
                                                if (!groupedLogs[key]) {
                                                    groupedLogs[key] = {
                                                        internName: log.interns?.full_name || 'Unknown',
                                                        dateKey: dateKey,
                                                        dateLabel: new Date(`${dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }),
                                                        records: []
                                                    }
                                                }
                                                groupedLogs[key].records.push(log)
                                            })

                                            const sortedGroups = Object.values(groupedLogs).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
                                            
                                            // Pagination Logic
                                            const totalPages = Math.ceil(sortedGroups.length / ITEMS_PER_PAGE)
                                            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
                                            const paginatedGroups = sortedGroups.slice(startIndex, startIndex + ITEMS_PER_PAGE)

                                            const now = new Date()
                                            const nowHr = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                            const todayKey = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

                                            return (
                                                <>
                                                {paginatedGroups.map((group, i) => {
                                                const morning = group.records.find(r => {
                                                    const h = Number(new Date(r.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                                    return h < 12
                                                }) || null
                                                const afternoon = group.records.find(r => {
                                                    const h = Number(new Date(r.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                                    return h >= 12
                                                }) || null

                                                const totalDayHours = group.records.reduce((sum, r) => {
                                                    if (!r.time_in || !r.time_out) return sum
                                                    return sum + (new Date(r.time_out) - new Date(r.time_in)) / 3600000
                                                }, 0)

                                                const isPastDay = group.dateKey < todayKey
                                                const isStaleMorning = !morning?.time_out && morning?.time_in && (isPastDay || nowHr >= 13)
                                                const isStaleAfternoon = !afternoon?.time_out && afternoon?.time_in && isPastDay

                                                return (
                                                    <tr key={`${group.internName}_${group.dateKey}_${i}`}>
                                                        <td data-label="Intern Name">
                                                            <div style={{ fontWeight: 800, color: 'white' }}>{group.internName}</div>
                                                        </td>
                                                        <td data-label="Date">
                                                            <span style={{ color: 'var(--text-secondary)' }}>{group.dateLabel}</span>
                                                        </td>
                                                        <td data-label="AM In">
                                                            {morning?.time_in ? <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>{formatManilaTime(morning.time_in)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                        </td>
                                                        <td data-label="AM Out">
                                                             {morning?.time_out ? (
                                                                 morning.time_out === morning.time_in ? (
                                                                    <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', background: 'rgba(239,68,68,0.1)', padding: '0.2rem 0.4rem', borderRadius: '0.375rem' }}>Did Not Time Out</span>
                                                                 ) : (
                                                                    <span className="badge badge-warning" style={{ fontSize: '0.625rem' }}>{formatManilaTime(morning.time_out)}</span>
                                                                 )
                                                             ) : isStaleMorning ? (
                                                                 <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', background: 'rgba(239,68,68,0.1)', padding: '0.2rem 0.4rem', borderRadius: '0.375rem' }}>Did Not Time Out</span>
                                                             ) : morning?.time_in ? (
                                                                 <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 800 }}>● Active</span>
                                                             ) : (
                                                                 <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                             )}
                                                        </td>
                                                        <td data-label="PM In">
                                                            {afternoon?.time_in ? <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '0.375rem', background: 'rgba(96,165,250,0.12)', color: 'rgba(96,165,250,0.9)' }}>{formatManilaTime(afternoon.time_in)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                                        </td>
                                                        <td data-label="PM Out">
                                                            {afternoon?.time_out ? (
                                                                afternoon.time_out === afternoon.time_in ? (
                                                                    <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', background: 'rgba(239,68,68,0.1)', padding: '0.2rem 0.4rem', borderRadius: '0.375rem' }}>Did Not Time Out</span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.625rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '0.375rem', background: 'rgba(96,165,250,0.08)', color: 'rgba(96,165,250,0.7)' }}>{formatManilaTime(afternoon.time_out)}</span>
                                                                )
                                                            ) : isStaleAfternoon ? (
                                                                <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', background: 'rgba(239,68,68,0.1)', padding: '0.2rem 0.4rem', borderRadius: '0.375rem' }}>Did Not Time Out</span>
                                                            ) : afternoon?.time_in ? (
                                                                <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 800 }}>● Active</span>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                            )}
                                                        </td>
                                                        <td data-label="Duration">
                                                            <span style={{ fontWeight: 800, color: totalDayHours > 0 ? 'white' : 'var(--text-muted)' }}>
                                                                {totalDayHours > 0 ? formatHours(totalDayHours) : '—'}
                                                            </span>
                                                        </td>
                                                        <td data-label="Actions">
                                                            <button onClick={() => handleOpenManage(group.records[0].intern_id, group.internName)}
                                                                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--gold)', padding: '0.35rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(201,168,76,0.2)'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'rgba(201,168,76,0.1)'}
                                                            >
                                                                Manage
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                            {/* Pagination Controls Row */}
                                            {totalPages > 0 && (
                                                <tr>
                                                    <td colSpan="8" style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, sortedGroups.length)} of {sortedGroups.length} entries
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
                                            </>
                                            )
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>

                </div>

                <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem' }}>
                    <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                </div>
            </div>
            {/* Manage Attendance Modal */}
            {isManageModalOpen && (
                <ManageAttendanceModal
                    intern={selectedInternForManage}
                    onClose={() => setIsManageModalOpen(false)}
                    onRefresh={fetchAnalytics}
                />
            )}
        </div>
    )
}
