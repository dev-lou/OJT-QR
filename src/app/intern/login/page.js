'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'

export default function InternLogin() {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!username.trim() || !password) {
            setError('Please enter your username and password.')
            return
        }
        setLoading(true)
        try {
            if (!supabase) throw new Error('Database is not configured.')

            const { data, error: dbError } = await supabase
                .from('interns')
                .select('uuid, full_name')
                .eq('username', username.trim().toLowerCase())
                .eq('password', password)
                .single()

            if (dbError || !data) {
                throw new Error('Incorrect username or password.')
            }

            localStorage.setItem('intern_uuid', data.uuid)
            router.push('/intern/dashboard')
        } catch (err) {
            setError(err.message || 'Login failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                style={{ width: '100%', maxWidth: '26rem', position: 'relative', zIndex: 10 }}
            >
                {/* Logo Section */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '5rem', height: '5rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', margin: '0 auto 1.5rem', boxShadow: '0 0 40px rgba(201,168,76,0.2)', border: '3px solid rgba(201,168,76,0.3)' }}>
                            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </motion.div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1, margin: '0 0 0.5rem' }}>OJT Portal</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 500 }}>Sign in to track your training hours</p>
                </div>

                {/* Card */}
                <div className="holographic-gold" style={{ padding: '1px', borderRadius: '2rem', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.6)' }}>
                    <div className="glass-dark" style={{ padding: '2.5rem 2rem', borderRadius: '2rem' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>Username</label>
                                <input
                                    className="input"
                                    autoFocus
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                                    placeholder="Enter your username"
                                    autoCapitalize="none"
                                    autoComplete="username"
                                    style={{ height: '3.25rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="input"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        style={{ height: '3.25rem', paddingRight: '3.5rem' }}
                                    />
                                    <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0 }}>
                                        {showPassword
                                            ? <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            : <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        }
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="alert alert-danger">
                                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    {error}
                                </motion.div>
                            )}

                            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '1.125rem', fontSize: '1.125rem' }}>
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'shimmer 2.5s infinite linear' }} />
                                {loading ? (
                                    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" /><path fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (
                                    <>Sign In <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                                )}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
                                Don&apos;t have an account?{' '}
                                <button onClick={() => router.push('/intern/register')} style={{ color: 'var(--gold-light)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
                                    Register Now
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                </div>
            </motion.div>
        </div>
    )
}
