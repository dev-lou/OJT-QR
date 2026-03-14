'use client'
import { useState, useRef, useEffect } from 'react'

export default function CustomMonthPicker({
    selectedMonth,
    onChange,
    placeholder = 'Select month...',
    align = 'left',
    size = 'default',
    width = '100%',
    dropDirection = 'top' // 'top' or 'bottom'
}) {
    const [open, setOpen] = useState(false)
    const pickerRef = useRef(null)
    const [pickerYear, setPickerYear] = useState(() => {
        return selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear()
    })

    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        const handler = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth() // 0-indexed
    const selYear = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : null
    const selMon = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : null // 0-indexed

    let displayLabel = placeholder
    if (selectedMonth) {
        displayLabel = new Date(`${selectedMonth}-01T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
    }

    const isSmall = size === 'small'

    return (
        <div style={{ position: 'relative', width }} ref={pickerRef}>
            <button 
                onClick={() => { 
                    setOpen(!open); 
                    setPickerYear(selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear()) 
                }}
                style={{ 
                    width: '100%', 
                    padding: isSmall ? '0.5rem 0.875rem' : '0.75rem 1rem', 
                    borderRadius: isSmall ? '0.75rem' : '0.875rem', 
                    border: `1.5px solid ${selectedMonth ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, 
                    background: 'rgba(0,0,0,0.3)', 
                    color: selectedMonth ? 'white' : 'rgba(255,255,255,0.35)', 
                    fontWeight: 700, 
                    fontSize: isSmall ? '0.8125rem' : '0.9375rem', 
                    fontFamily: 'inherit', 
                    cursor: 'pointer', 
                    textAlign: 'left', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    transition: 'border-color 0.2s',
                    whiteSpace: 'nowrap'
                }}
            >
                <span>{displayLabel}</span>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.4)" strokeWidth={2} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <>
                    {/* Mobile Backdrop */}
                    {isMobile && (
                        <div
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.5)',
                                zIndex: 9998,
                                backdropFilter: 'blur(2px)'
                            }}
                            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                        />
                    )}
                    <div
                        className={`month-picker-popup align-${align}`}
                    style={{
                        position: 'absolute',
                        [isMobile ? 'bottom' : 'top']: 'calc(100% + 0.375rem)',
                        background: 'linear-gradient(160deg, rgba(14,22,38,0.99), rgba(24,34,52,0.99))',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '1.25rem',
                        padding: '1rem',
                        zIndex: 100,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(20px)',
                        minWidth: '240px',
                        boxSizing: 'border-box'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                        <button onClick={() => setPickerYear(y => y - 1)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', width: '2rem', height: '2rem', borderRadius: '0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span style={{ fontWeight: 800, color: 'white', fontSize: '1rem', letterSpacing: '0.02em' }}>{pickerYear}</span>
                        <button onClick={() => setPickerYear(y => y + 1)} disabled={pickerYear >= nowYear}
                            style={{ background: pickerYear >= nowYear ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: pickerYear >= nowYear ? 'rgba(255,255,255,0.2)' : 'white', width: '2rem', height: '2rem', borderRadius: '0.625rem', cursor: pickerYear >= nowYear ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseOver={e => { if (pickerYear < nowYear) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                            onMouseOut={e => e.currentTarget.style.background = pickerYear >= nowYear ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)'}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.375rem' }}>
                        {MONTHS.map((m, idx) => {
                            const isFuture = pickerYear > nowYear || (pickerYear === nowYear && idx > nowMonth)
                            const isSelected = selYear === pickerYear && selMon === idx
                            const isCurrentMonth = pickerYear === nowYear && idx === nowMonth
                            return (
                                <button key={m} disabled={isFuture}
                                    onClick={() => {
                                        const val = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`
                                        onChange(val)
                                        setOpen(false)
                                    }}
                                    style={{
                                        padding: '0.5rem 0.25rem', 
                                        borderRadius: '0.625rem', 
                                        border: isSelected ? '1.5px solid var(--gold)' : isCurrentMonth ? '1.5px solid rgba(255,255,255,0.15)' : '1.5px solid transparent',
                                        background: isSelected ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.03)',
                                        color: isFuture ? 'rgba(255,255,255,0.15)' : isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.8)',
                                        fontWeight: isSelected ? 800 : 600, 
                                        fontSize: '0.8125rem', 
                                        cursor: isFuture ? 'not-allowed' : 'pointer', 
                                        transition: 'all 0.12s', 
                                        fontFamily: 'inherit'
                                    }}
                                    onMouseOver={e => { if (!isFuture && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                                    onMouseOut={e => { if (!isFuture && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                >
                                    {m}
                                </button>
                            )
                        })}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <button onClick={() => { onChange(''); setOpen(false) }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', transition: 'color 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.color = '#f87171'}
                            onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
                            Clear
                        </button>
                        <button onClick={() => {
                            const now = new Date()
                            onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
                            setOpen(false)
                        }}
                            style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', transition: 'color 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.color = 'white'}
                            onMouseOut={e => e.currentTarget.style.color = 'var(--gold)'}>
                            This month
                        </button>
                    </div>
                </div>
                </>
            )}
        </div>
    )
}
