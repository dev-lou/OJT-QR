'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'
import QRCode from 'react-qr-code'

export default function AdminPrintIDs() {
    const router = useRouter()
    const [interns, setInterns] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const session = localStorage.getItem('admin_session')
        if (!session) router.replace('/admin/login')
    }, [router])

    useEffect(() => {
        if (!supabase) return
        supabase.from('interns').select('*').order('full_name')
            .then(({ data }) => {
                setInterns(data || [])
                setLoading(false)
            })
    }, [])

    const handlePrint = () => {
        window.print()
    }

    return (
        <>
            {/* ─── Professional Print CSS for ID Cards ─── */}
            <style>{`
                @page {
                    size: letter portrait;
                    margin: 0.5in;
                }

                @media print {
                    html, body {
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body * { visibility: hidden !important; }
                    #print-area, #print-area * { visibility: visible !important; }
                    #print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .no-print { display: none !important; }
                    
                    .id-grid {
                        display: grid !important;
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 0.25in !important;
                        page-break-inside: avoid;
                    }

                    .id-card {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        box-shadow: none !important;
                        border: 1px solid #ccc !important;
                    }
                }
            `}</style>

            <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem 1.25rem', position: 'relative' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    
                    {/* Header */}
                    <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer' }}>
                                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0 }}>Printable Intern IDs</h1>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Standard 2.125" x 3.375" layout for printing</p>
                            </div>
                        </div>
                        <button onClick={handlePrint} disabled={loading} className="btn-primary" style={{ padding: '0.75rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            Print Cards
                        </button>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                            <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid rgba(201,168,76,0.2)', borderTopColor: 'var(--gold)', borderRadius: '50%' }} />
                        </div>
                    ) : (
                        <div id="print-area">
                            <div className="id-grid" style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(3.375in, 1fr))', 
                                gap: '1.5rem',
                                justifyContent: 'center'
                            }}>
                                {interns.map((intern) => (
                                    <div key={intern.id} className="id-card" style={{
                                        width: '3.375in',   // Standard CR80 ID Card dimensions swapped for vertical
                                        height: '2.125in',  // Horizontal alignment is usually easier for lanyards
                                        background: 'white',
                                        borderRadius: '0.25rem',
                                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        position: 'relative',
                                        border: '1px solid #ccc',
                                        margin: '0 auto'
                                    }}>
                                        {/* Left Side: Branding & Info */}
                                        <div style={{ flex: 1, padding: '0.2in', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '2px dashed #eee' }}>
                                            <div>
                                                <div style={{ fontSize: '0.35in', fontWeight: 900, color: '#7B1C1C', lineHeight: 1, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>ISUFST</div>
                                                <div style={{ fontSize: '0.1in', fontWeight: 700, color: '#666', marginTop: '2px' }}>DINGLE CAMPUS | CICT </div>
                                                <div style={{ fontSize: '0.08in', color: '#b48e36', fontWeight: 800, marginTop: '2px', letterSpacing: '0.05em' }}>OJT TRAINEE PASS</div>
                                            </div>
                                            
                                            <div style={{ marginTop: 'auto' }}>
                                                <div style={{ fontSize: '0.18in', fontWeight: 800, color: '#111', lineHeight: 1.1, wordWrap: 'break-word' }}>
                                                    {intern.full_name}
                                                </div>
                                                <div style={{ fontSize: '0.09in', fontWeight: 600, color: '#777', textTransform: 'uppercase', marginTop: '4px' }}>
                                                    ID: {intern.uuid ? intern.uuid.split('-')[0] : 'N/A'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: QR Code Area */}
                                        <div style={{ width: '1.2in', background: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.1in' }}>
                                            <div style={{ background: 'white', padding: '0.05in', borderRadius: '4px', border: '1px solid #eee' }}>
                                                <QRCode value={intern.uuid || 'N/A'} size={80} level="M" />
                                            </div>
                                            <div style={{ fontSize: '0.07in', color: '#aaa', marginTop: '0.05in', textAlign: 'center', fontWeight: 600 }}>SCAN TO LOG</div>
                                        </div>

                                        {/* Colored Accent Strip */}
                                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '0.05in', background: '#7B1C1C' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
