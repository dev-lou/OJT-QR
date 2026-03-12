'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const internUuid = localStorage.getItem('intern_uuid')
    if (internUuid) {
      router.replace('/intern/dashboard')
    } else {
      router.replace('/intern/login')
    }
  }, [router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(201,168,76,0.2)', borderTopColor: '#C9A84C', borderRadius: '50%' }} className="animate-spin" />
    </div>
  )
}
