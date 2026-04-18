import { createClient } from '@supabase/supabase-browser'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCount() {
    const { count, error } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
    
    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Total Attendance Rows:', count)
    }
}

checkCount()
