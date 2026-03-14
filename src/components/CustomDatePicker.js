'use client'
import { useState, useRef, useEffect } from 'react'

export default function CustomDatePicker({
    selectedDate,
    onChange,
    placeholder = 'Select date...',
    align = 'left',
    size = 'default',
    width = '100%',
    dropDirection = 'top' // 'top' or 'bottom'
}) {
    const [open, setOpen] = useState(false)
    const pickerRef = useRef(null)
    
    // Internal state for navigation
    const [viewDate, setViewDate] = useState(() => {
        return selectedDate ? new Date(selectedDate) : new Date()
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

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
    }
    
    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
    }

    let displayLabel = placeholder
    if (selectedDate) {
        displayLabel = new Date(selectedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
    }

    const isSmall = size === 'small'

    // Generate Calendar Grid
    const currentYear = viewDate.getFullYear()
    const currentMonth = viewDate.getMonth()
    
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay()
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    
    const today = new Date()
    const isToday = (d) => today.getDate() === d && today.getMonth() === currentMonth && today.getFullYear() === currentYear
    
    const selDateObj = selectedDate ? new Date(selectedDate) : null
    const isSelected = (d) => selDateObj && selDateObj.getDate() === d && selDateObj.getMonth() === currentMonth && selDateObj.getFullYear() === currentYear

    const days = []
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(null) // Empty slots before the 1st
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i)
    }

    return (
        <div style={{ position: 'relative', width }} ref={pickerRef}>
            <button
                onClick={() => {
                    setOpen(!open)
                    if (!open && selectedDate) setViewDate(new Date(selectedDate))
                }}
                style={{
                    width: '100%',
                    padding: isSmall ? '0.5rem 0.875rem' : '0.75rem 1rem',
                    borderRadius: isSmall ? '0.75rem' : '0.875rem',
                    border: `1.5px solid ${selectedDate ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
                    background: 'rgba(0,0,0,0.3)',
                    color: selectedDate ? 'white' : 'rgba(255,255,255,0.35)',
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
                        className={`date-picker-popup align-${align}`}
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
                        minWidth: '260px',
                        boxSizing: 'border-box'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                        <button onClick={handlePrevMonth}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', width: '2rem', height: '2rem', borderRadius: '0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: 'white', letterSpacing: '0.02em', display: 'flex', gap: '0.3rem' }}>
                            <span>{viewDate.toLocaleString('default', { month: 'short' })}</span>
                            <span>{viewDate.getFullYear()}</span>
                        </div>
                        <button onClick={handleNextMonth}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', width: '2rem', height: '2rem', borderRadius: '0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.375rem', marginBottom: '0.5rem' }}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                            <div key={d} style={{ textAlign: 'center', fontSize: '0.625rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                                {d}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.375rem' }}>
                        {days.map((day, idx) => {
                            if (!day) return <div key={`empty-${idx}`} />
                            const active = isSelected(day)
                            const current = isToday(day)

                            return (
                                <button
                                    key={day}
                                    onClick={() => {
                                        const y = viewDate.getFullYear()
                                        const m = String(viewDate.getMonth() + 1).padStart(2, '0')
                                        const d = String(day).padStart(2, '0')
                                        onChange(`${y}-${m}-${d}`)
                                        setOpen(false)
                                    }}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        padding: 0, margin: 0, boxSizing: 'border-box', minWidth: 0,
                                        borderRadius: '0.5rem',
                                        fontSize: '0.8125rem', fontWeight: active ? 800 : 600,
                                        border: active ? '1px solid rgba(201,168,76,0.5)' : current ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                                        background: active ? 'var(--gold)' : current ? 'rgba(255,255,255,0.1)' : 'transparent',
                                        color: active ? '#111' : 'rgba(255,255,255,0.85)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseOver={e => {
                                        if(!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                                    }}
                                    onMouseOut={e => {
                                        if(!active) e.currentTarget.style.background = current ? 'rgba(255,255,255,0.1)' : 'transparent'
                                    }}
                                >
                                    {day}
                                </button>
                            )
                        })}
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: '0.875rem', paddingTop: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                        <button
                            onClick={() => { onChange(''); setOpen(false) }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onMouseOver={e => e.currentTarget.style.color = 'white'}
                            onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => {
                                const t = new Date()
                                const y = t.getFullYear()
                                const m = String(t.getMonth() + 1).padStart(2, '0')
                                const d = String(t.getDate()).padStart(2, '0')
                                onChange(`${y}-${m}-${d}`)
                                setOpen(false)
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                            onMouseOver={e => e.currentTarget.style.textShadow = '0 0 10px rgba(201,168,76,0.5)'}
                            onMouseOut={e => e.currentTarget.style.textShadow = 'none'}
                        >
                            Today
                        </button>
                    </div>

                </div>
                </>
            )}

            <style jsx>{`
                .align-left { left: 0; }
                .align-right { right: 0; }
                @media (max-width: 768px) {
                    .date-picker-popup {
                        position: fixed !important;
                        top: 50% !important;
                        left: 50% !important;
                        bottom: auto !important;
                        right: auto !important;
                        transform: translate(-50%, -50%) !important;
                        z-index: 9999 !important;
                        width: max-content !important;
                        max-width: 95vw !important;
                        box-sizing: border-box !important;
                    }
                }
            `}</style>
        </div>
    )
}