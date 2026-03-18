import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(request) {
    try {
        if (!supabaseAdmin) {
            return NextResponse.json(
                { error: 'Server configuration error.' },
                { status: 500 }
            )
        }

        const body = await request.json()
        const { email, password } = body

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required.' },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from('admins')
            .select('id, email')
            .eq('email', email.trim().toLowerCase())
            .eq('password', password)
            .single()

        if (error || !data) {
            return NextResponse.json(
                { error: 'Invalid email or password.' },
                { status: 401 }
            )
        }

        return NextResponse.json({ user: { id: data.id, email: data.email } }, { status: 200 })
    } catch (err) {
        console.error('Admin login error:', err)
        return NextResponse.json(
            { error: 'Internal server error.' },
            { status: 500 }
        )
    }
}
