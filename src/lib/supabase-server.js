import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

let supabaseAdmin = null

if (supabaseUrl && serviceRoleKey) {
    try {
        supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    } catch (err) {
        console.error('[supabase-server] createClient failed:', err)
    }
}

export { supabaseAdmin }
