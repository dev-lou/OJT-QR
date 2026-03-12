'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Swal from 'sweetalert2'
import { createScanDebouncer, UUID_RE } from '@/utils/debounce'
import {
    successScanAlert, duplicateAlert, alreadyCheckedOutAlert,
    notCheckedInAlert, errorSaveAlert, invalidQrAlert, notFoundAlert
} from '@/utils/swal-configs'

export default function AdminScanner() {
    const router = useRouter()
    const [isAdmin, setIsAdmin] = useState(false)
    const [mode, setMode] = useState('time-in') // 'time-in' | 'time-out'
    const [sessionType, setSessionType] = useState('morning') // 'morning' | 'afternoon'
    const [overtime, setOvertime] = useState(false)
    const [isManualTime, setIsManualTime] = useState(false)
    const [manualTime, setManualTime] = useState('')
    const [scanning, setScanning] = useState(false)
    const [scanCount, setScanCount] = useState(0)
    const html5QrCodeRef = useRef(null)
    const processingRef = useRef(false)
    const debouncerRef = useRef(createScanDebouncer())
    const [menuOpen, setMenuOpen] = useState(false)

    // Audio beep (ported from AdminScanner.jsx)
    const audioCtxRef = useRef(null)
    const hasUserGestureRef = useRef(false)

    const ensureAudioReady = useCallback(async () => {
        try {
            if (!hasUserGestureRef.current) return null
            const ACClass = window.AudioContext || window.webkitAudioContext
            if (!ACClass) return null
            if (!audioCtxRef.current) audioCtxRef.current = new ACClass()
            const ctx = audioCtxRef.current
            if (ctx.state === 'suspended') await ctx.resume()
            return ctx
        } catch { return null }
    }, [])

    const playSuccessSound = useCallback(() => {
        try {
            const audio = new Audio('/success.mp3');
            audio.volume = 0.6;
            audio.play().catch(e => console.error("Audio play failed:", e));
        } catch (e) {
            console.error("Audio error:", e);
        }
    }, []);

    const playErrorSound = useCallback(() => {
        try {
            const audio = new Audio('/error.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.error("Audio play failed:", e));
        } catch (e) {
            console.error("Audio error:", e);
        }
    }, []);

    // Auth guard
    useEffect(() => {
        const adminLoggedIn = sessionStorage.getItem('admin_logged_in') === 'true'
        if (!adminLoggedIn) {
            router.replace('/admin/login')
            return
        }
        setIsAdmin(true)
    }, [router])

    // Audio unlock
    useEffect(() => {
        const unlockAudio = () => {
            hasUserGestureRef.current = true
            ensureAudioReady()
        }
        window.addEventListener('pointerdown', unlockAudio, { once: true })
        window.addEventListener('touchstart', unlockAudio, { once: true })
        return () => {
            window.removeEventListener('pointerdown', unlockAudio)
            window.removeEventListener('touchstart', unlockAudio)
            if (audioCtxRef.current?.close) audioCtxRef.current.close().catch(() => {})
        }
    }, [ensureAudioReady])

    // Scan handler
    const handleScan = useCallback(async (decodedText) => {
        if (processingRef.current) return
        processingRef.current = true

        const uuid = decodedText.trim()

        // Validate UUID format
        if (!UUID_RE.test(uuid)) {
            playErrorSound()
            await Swal.fire(invalidQrAlert())
            processingRef.current = false
            return
        }

        if (debouncerRef.current.isDuplicate(uuid, 3000)) {
            processingRef.current = false
            return
        }

        // Call scan API
        try {
            // Use manual time if toggled on and valid, else null
            let explicitTime = null
            if (isManualTime && manualTime) {
                // Construct Manila time ISO for today
                const now = new Date()
                const dateKey = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                explicitTime = new Date(`${dateKey}T${manualTime}:00+08:00`).toISOString()
            }

            const response = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid, mode, sessionType, overtime, explicitTime }),
            })

            if (!response.ok) {
                await Swal.fire(errorSaveAlert('Unknown'))
                processingRef.current = false
                return
            }

            const body = await response.json()
            const result = body?.results?.[0]

            if (!result) {
                await Swal.fire(errorSaveAlert('Unknown'))
                processingRef.current = false
                return
            }

            const name = result.name || 'Unknown'
            const sessionLabel = result.session === 'afternoon' ? 'Afternoon' : 'Morning'
            const timeLabel = isManualTime ? ' (Manual Time)' : ''

            switch (result.status) {
                case 'ok':
                    setScanCount(c => c + 1)
                    playSuccessSound()
                    await Swal.fire(successScanAlert(name, `${sessionLabel} ${mode === 'time-in' ? 'Check-in' : 'Check-out'}${timeLabel}`))
                    break
                case 'duplicate':
                case 'already_scanned_today':
                    playErrorSound()
                    await Swal.fire(duplicateAlert(name))
                    break
                case 'already_checked_out':
                    playErrorSound()
                    await Swal.fire(alreadyCheckedOutAlert(name))
                    break
                case 'invalid_time':
                    playErrorSound()
                    await Swal.fire({
                        title: 'Invalid Time!',
                        text: result.message || 'Cannot scan for this session at the current time.',
                        icon: 'error',
                        background: '#1f2937',
                        color: '#fff',
                        confirmButtonColor: '#c9a84c'
                    })
                    break
                case 'not_checked_in':
                    playErrorSound()
                    await Swal.fire(notCheckedInAlert(name))
                    break
                case 'missing':
                    playErrorSound()
                    await Swal.fire(notFoundAlert())
                    break
                default:
                    playErrorSound()
                    await Swal.fire(errorSaveAlert(name))
            }
        } catch (err) {
            console.error('Scan failed:', err)
            playErrorSound()
            await Swal.fire(errorSaveAlert('Network error'))
        }

        processingRef.current = false
    }, [mode, sessionType, overtime, isManualTime, manualTime, playSuccessSound, playErrorSound])

    // Keep handleScan ref fresh for the QR scanner callback
    const handleScanRef = useRef(handleScan)
    useEffect(() => { handleScanRef.current = handleScan }, [handleScan])

    // Start/stop scanner
    const startScanner = useCallback(async () => {
        if (html5QrCodeRef.current) return
        try {
            const { Html5Qrcode } = await import('html5-qrcode')
            const scanner = new Html5Qrcode('qr-reader')
            html5QrCodeRef.current = scanner

            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
                (decodedText) => handleScanRef.current(decodedText),
                () => {}
            )
            setScanning(true)
        } catch (err) {
            console.error('Camera error:', err)
            setScanning(false)
        }
    }, [])

    const stopScanner = useCallback(async () => {
        if (!html5QrCodeRef.current) return
        try {
            await html5QrCodeRef.current.stop()
            html5QrCodeRef.current.clear()
        } catch (e) { }
        html5QrCodeRef.current = null
        setScanning(false)
    }, [])

    useEffect(() => {
        return () => { stopScanner() }
    }, [stopScanner])

    const handleLogout = () => {
        stopScanner()
        sessionStorage.removeItem('admin_logged_in')
        localStorage.removeItem('admin_session')
        router.push('/admin/login')
    }

    if (!isAdmin) return null

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ maxWidth: '32rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>

                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'white', margin: 0 }}>QR Scanner</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.625rem', fontWeight: 600, margin: 0 }}>ADMIN PANEL</p>
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
                                    { label: 'Dashboard', path: '/admin/dashboard', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                                    { label: 'Monthly Reports', path: '/admin/reports', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
                                    { label: 'Manage Interns', path: '/admin/interns', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
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

                {/* Session Type & Mode Buttons (2x2 Grid) */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <button
                            onClick={() => { setSessionType('morning'); setMode('time-in') }}
                            style={{
                                padding: '0.75rem', borderRadius: '1rem', fontWeight: 800, fontSize: '0.875rem', transition: 'all 0.2s', border: '2px solid transparent',
                                background: sessionType === 'morning' && mode === 'time-in' ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                                color: sessionType === 'morning' && mode === 'time-in' ? 'white' : 'var(--text-muted)',
                                boxShadow: sessionType === 'morning' && mode === 'time-in' ? '0 8px 16px rgba(16,185,129,0.3)' : 'none'
                            }}
                        >
                            Morning In (AM)
                        </button>
                        <button
                            onClick={() => { setSessionType('morning'); setMode('time-out') }}
                            style={{
                                padding: '0.75rem', borderRadius: '1rem', fontWeight: 800, fontSize: '0.875rem', transition: 'all 0.2s', border: '2px solid transparent',
                                background: sessionType === 'morning' && mode === 'time-out' ? 'var(--warning)' : 'rgba(255,255,255,0.05)',
                                color: sessionType === 'morning' && mode === 'time-out' ? 'white' : 'var(--text-muted)',
                                boxShadow: sessionType === 'morning' && mode === 'time-out' ? '0 8px 16px rgba(245,158,11,0.3)' : 'none'
                            }}
                        >
                            Morning Out (AM)
                        </button>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button
                            onClick={() => { setSessionType('afternoon'); setMode('time-in') }}
                            style={{
                                padding: '0.75rem', borderRadius: '1rem', fontWeight: 800, fontSize: '0.875rem', transition: 'all 0.2s', border: '2px solid transparent',
                                background: sessionType === 'afternoon' && mode === 'time-in' ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                                color: sessionType === 'afternoon' && mode === 'time-in' ? 'white' : 'var(--text-muted)',
                                boxShadow: sessionType === 'afternoon' && mode === 'time-in' ? '0 8px 16px rgba(16,185,129,0.3)' : 'none'
                            }}
                        >
                            Afternoon In (PM)
                        </button>
                        <button
                            onClick={() => { setSessionType('afternoon'); setMode('time-out') }}
                            style={{
                                padding: '0.75rem', borderRadius: '1rem', fontWeight: 800, fontSize: '0.875rem', transition: 'all 0.2s', border: '2px solid transparent',
                                background: sessionType === 'afternoon' && mode === 'time-out' ? 'var(--warning)' : 'rgba(255,255,255,0.05)',
                                color: sessionType === 'afternoon' && mode === 'time-out' ? 'white' : 'var(--text-muted)',
                                boxShadow: sessionType === 'afternoon' && mode === 'time-out' ? '0 8px 16px rgba(245,158,11,0.3)' : 'none'
                            }}
                        >
                            Afternoon Out (PM)
                        </button>
                    </div>
                    
                    {/* Manual Late Time Entry */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: `1px solid ${isManualTime ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.05)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: isManualTime ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.1)', color: isManualTime ? '#60a5fa' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: isManualTime ? '#60a5fa' : 'white' }}>Late / Manual Time</span>
                            </div>
                            <button 
                                onClick={() => setIsManualTime(!isManualTime)}
                                style={{ width: '2.5rem', height: '1.25rem', borderRadius: '1rem', background: isManualTime ? '#3b82f6' : 'rgba(255,255,255,0.2)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', border: 'none', padding: 0 }}
                                aria-label="Toggle manual time"
                            >
                                <div style={{ width: '1rem', height: '1rem', borderRadius: '50%', background: 'white', position: 'absolute', top: '0.125rem', left: isManualTime ? 'calc(100% - 1.125rem)' : '0.125rem', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                            </button>
                        </div>
                        {isManualTime && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enter Time (Manila)</label>
                                <input 
                                    type="time" 
                                    value={manualTime}
                                    onChange={(e) => setManualTime(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'white', fontSize: '1rem', fontWeight: 600, fontFamily: 'inherit', colorScheme: 'dark' }}
                                />
                            </motion.div>
                        )}
                    </div>
                    
                    {/* Overtime Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', marginBottom: '1.5rem', border: `1px solid ${overtime ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.05)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: overtime ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)', color: overtime ? '#f87171' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: overtime ? '#f87171' : 'white' }}>Overtime Override</span>
                        </div>
                        <button 
                            onClick={() => setOvertime(!overtime)}
                            style={{ width: '2.5rem', height: '1.25rem', borderRadius: '1rem', background: overtime ? '#ef4444' : 'rgba(255,255,255,0.2)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', border: 'none', padding: 0 }}
                            aria-label="Toggle overtime"
                        >
                            <div style={{ width: '1rem', height: '1rem', borderRadius: '50%', background: 'white', position: 'absolute', top: '0.125rem', left: overtime ? 'calc(100% - 1.125rem)' : '0.125rem', transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                        </button>
                    </div>
                </motion.div>

                {/* Scan Count */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <span className="badge badge-gold" style={{ fontSize: '0.75rem', padding: '0.375rem 1rem' }}>
                        {scanCount} scans today
                    </span>
                </div>

                {/* Scanner Area */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', overflow: 'hidden', marginBottom: '1.5rem' }}>

                    <div id="qr-reader" style={{
                        width: '100%',
                        minHeight: scanning ? '300px' : '0',
                        background: '#000',
                        borderRadius: scanning ? '0' : '1.5rem',
                    }} />

                    {!scanning && (
                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                            <div style={{ width: '5rem', height: '5rem', margin: '0 auto 1.5rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(123,28,28,0.3)' }}>
                                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <circle cx="12" cy="13" r="3" />
                                </svg>
                            </div>
                            <h3 style={{ color: 'white', fontWeight: 800, fontSize: '1.125rem', marginBottom: '0.5rem' }}>Ready to Scan</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                Start the camera to scan intern QR codes for {mode === 'time-in' ? 'check-in' : 'check-out'}.
                            </p>
                        </div>
                    )}

                    <div style={{ padding: '1rem 1.5rem' }}>
                        <button onClick={scanning ? stopScanner : startScanner} className="btn-primary" style={{ width: '100%', padding: '1rem' }}>
                            {scanning ? (
                                <><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg> Stop Scanner</>
                            ) : (
                                <><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Start Scanner</>
                            )}
                        </button>
                    </div>
                </motion.div>
                <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem' }}>
                    <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                </div>
            </div>
        </div>
    )
}
