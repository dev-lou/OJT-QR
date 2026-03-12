'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'

export default function InternRegister() {
    const router = useRouter()
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!fullName.trim() || !username.trim() || !password) {
            setError('Please fill in all fields.')
            return
        }
        if (username.includes(' ')) {
            setError('Username cannot contain spaces.')
            return
        }
        if (password.length < 4) {
            setError('Password must be at least 4 characters.')
            return
        }

        setLoading(true)
        try {
            if (!supabase) throw new Error('Database is not configured.')

            const { data: existing } = await supabase
                .from('interns')
                .select('id')
                .eq('username', username.trim().toLowerCase())
                .maybeSingle()

            if (existing) throw new Error('Username is already taken.')

            const { data, error: dbError } = await supabase
                .from('interns')
                .insert([{
                    full_name: fullName.trim(),
                    username: username.trim().toLowerCase(),
                    password: password,
                }])
                .select('uuid')
                .single()

            if (dbError) throw dbError

            localStorage.setItem('intern_uuid', data.uuid)
            router.push('/intern/dashboard')
        } catch (err) {
            setError(err.message || 'Registration failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: '100%', maxWidth: '28rem', position: 'relative', zIndex: 10 }}
            >
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '4rem', height: '4rem', borderRadius: '1rem', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', marginBottom: '1.25rem', boxShadow: '0 8px 24px rgba(123,28,28,0.4)' }}>
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'white', letterSpacing: '-0.04em', lineHeight: 1, margin: '0 0 0.5rem' }}>OJT Registration</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>Create your intern account to start tracking hours</p>
                </div>

                {/* Form Card */}
                <div className="holographic-gold" style={{ padding: '1px', borderRadius: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                    <div className="glass-dark" style={{ padding: '2rem 1.75rem', borderRadius: '2rem' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Full Name</label>
                                <input className="input" autoFocus type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Username</label>
                                <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="Choose a unique username" autoCapitalize="none" />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 4 characters" style={{ paddingRight: '3rem' }} />
                                    <button type="button" onClick={() => setShowPassword(v => !v)} style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: 0 }}>
                                        {showPassword
                                            ? <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            : <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        }
                                    </button>
                                </div>
                            </div>



                            {error && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="alert alert-danger">
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    {error}
                                </motion.div>
                            )}

                            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'shimmer 2.5s infinite linear' }} />
                                {loading ? (
                                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" /><path fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (
                                    <>Create Account <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
                                )}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                                Already have an account?{' '}
                                <button onClick={() => router.push('/intern/login')} style={{ color: 'var(--gold-light)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
                                    Sign In
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
