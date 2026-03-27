'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase-browser'
import { formatManilaTime, formatManilaDate, formatHours, calculateHoursWorked } from '@/utils/time'
import CustomMonthPicker from '@/components/CustomMonthPicker'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export default function AdminReports() {
    const router = useRouter()
    const printRef = useRef(null)

    const [interns, setInterns] = useState([])
    const [selectedInternId, setSelectedInternId] = useState('')
    const [selectedIntern, setSelectedIntern] = useState(null)
    const [internSearch, setInternSearch] = useState('')
    const [internPickerOpen, setInternPickerOpen] = useState(false)
    const pickerRef = useRef(null)
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [dtrRows, setDtrRows] = useState([])
    const [loading, setLoading] = useState(false)
    const [loadingInterns, setLoadingInterns] = useState(true)
    const [menuOpen, setMenuOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    // Auth check
    useEffect(() => {
        const session = localStorage.getItem('admin_session')
        if (!session) router.replace('/admin/login')
    }, [router])

    // Close pickers on outside click
    useEffect(() => {
        const handler = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setInternPickerOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Load interns list
    useEffect(() => {
        if (!supabase) return
        supabase.from('interns').select('id, full_name, required_hours').order('full_name')
            .then(({ data }) => {
                setInterns(data || [])
                setLoadingInterns(false)
            })
    }, [])

    const generateDTR = useCallback(async () => {
        if (!selectedInternId || !selectedMonth || !supabase) return
        setLoading(true)

        try {
            // Parse month
            const [year, month] = selectedMonth.split('-').map(Number)
            const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
            const endDate = new Date(startDate)
            endDate.setMonth(endDate.getMonth() + 1)

            const intern = interns.find(i => i.id === Number(selectedInternId))
            setSelectedIntern(intern)

            // Fetch attendance for that intern within the month
            const { data: logs } = await supabase
                .from('attendance')
                .select('*')
                .eq('intern_id', selectedInternId)
                .gte('time_in', startDate.toISOString())
                .lt('time_in', endDate.toISOString())
                .order('time_in', { ascending: true })

            // Build DTR: one entry per day (handle multiple sessions in same day)
            const daysInMonth = new Date(year, month, 0).getDate()
            const rows = []

            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const dayLogs = (logs || []).filter(log => {
                    const localDate = new Date(log.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                    return localDate === dateKey
                })

                const date = new Date(`${dateKey}T12:00:00+08:00`)
                const dayName = date.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })
                const isWeekend = date.getDay() === 0 || date.getDay() === 6

                if (dayLogs.length === 0) {
                    rows.push({ date: dateKey, dayName, isWeekend, morning: null, afternoon: null, hours: 0 })
                } else {
                    // Separate by session (before/after 12 Manila time)
                    const morning = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) < 12) || null
                    const afternoon = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) >= 12) || null
                    const totalHrs = dayLogs.reduce((sum, log) => {
                        if (!log.time_in || !log.time_out) return sum
                        return sum + calculateHoursWorked(log.time_in, log.time_out)
                    }, 0)
                    rows.push({ date: dateKey, dayName, isWeekend, morning, afternoon, hours: totalHrs })
                }
            }

            setDtrRows(rows)
        } catch (err) {
            console.error('DTR generation error:', err)
        } finally {
            setLoading(false)
        }
    }, [selectedInternId, selectedMonth, interns])

    // Convert raw attendance state into CSV
    const handleExportCSV = async () => {
        if (!selectedMonth) return alert('Please select a month first.')
        setIsExporting(true)
        try {
            const [year, month] = selectedMonth.split('-').map(Number)
            const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
            const endDate = new Date(startDate)
            endDate.setMonth(endDate.getMonth() + 1)
            
            // Generate full query
            let query = supabase.from('attendance').select('*, interns(full_name)')
                .gte('time_in', startDate.toISOString())
                .lt('time_in', endDate.toISOString())
                .order('time_in', { ascending: true })

            // Filter if an intern is actually selected
            if (selectedInternId) {
                query = query.eq('intern_id', selectedInternId)
            }

            const { data, error } = await query
            if (error) throw error

            if (!data || data.length === 0) {
                alert('No attendance records found for this period.')
                setIsExporting(false)
                return
            }

            // Map and format for CSV
            const csvRows = [
                ['Intern Name', 'Date', 'Morning In', 'Morning Out', 'Afternoon In', 'Afternoon Out', 'Total Hours']
            ]

            // Group by intern and date locally
            const grouped = {}
            data.forEach(log => {
                const name = log.interns?.full_name || 'Unknown'
                const rawDate = new Date(log.time_in)
                const dateStr = rawDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                const key = `${name}_${dateStr}`

                if (!grouped[key]) grouped[key] = { name, dateStr, logs: [] }
                grouped[key].logs.push(log)
            })

            const now = new Date()
            const nowHr = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
            const todayKey = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

            Object.values(grouped).forEach(group => {
                const dayLogs = group.logs
                const morning = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) < 12) || null
                const afternoon = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) >= 12) || null
                
                const isPastDay = group.dateStr < todayKey
                const isStaleM = !morning?.time_out && morning?.time_in && (isPastDay || nowHr >= 13)
                const isStaleA = !afternoon?.time_out && afternoon?.time_in && isPastDay

                const mIn = morning?.time_in ? formatManilaTime(morning.time_in) : ''
                const mOut = morning?.time_out ? formatManilaTime(morning.time_out) : (isStaleM ? 'DID NOT TIME OUT' : (morning?.time_in ? 'ACTIVE' : ''))
                const aIn = afternoon?.time_in ? formatManilaTime(afternoon.time_in) : ''
                const aOut = afternoon?.time_out ? formatManilaTime(afternoon.time_out) : (isStaleA ? 'DID NOT TIME OUT' : (afternoon?.time_in ? 'ACTIVE' : ''))
                
                const totalHours = dayLogs.reduce((sum, log) => sum + (log.time_out ? calculateHoursWorked(log.time_in, log.time_out) : 0), 0)

                csvRows.push([
                    `"${group.name}"`, 
                    group.dateStr, 
                    mIn, mOut, aIn, aOut, 
                    totalHours > 0 ? totalHours.toFixed(2) : '0'
                ])
            })

            const csvContent = csvRows.map(e => e.join(",")).join("\n")
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            saveAs(blob, `Attendance_Export_${selectedMonth}.csv`)

        } catch (error) {
            console.error('Error exporting CSV:', error)
            alert('Failed to export CSV. See console.')
        } finally {
            setIsExporting(false)
        }
    }

    // Generate PDFs for all interns and zip them
    const handleExportZip = async () => {
        if (!selectedMonth) return alert('Please select a month first.')
        setIsExporting(true)
        
        try {
            const [year, month] = selectedMonth.split('-').map(Number)
            const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
            const endDate = new Date(startDate)
            endDate.setMonth(endDate.getMonth() + 1)
            const daysInMonth = new Date(year, month, 0).getDate()
            const monthLabelStr = new Date(`${selectedMonth}-01T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })

            // 1. Fetch all attendance for the month
            const { data: logs, error } = await supabase.from('attendance')
                .select('*, interns(id, full_name, required_hours)')
                .gte('time_in', startDate.toISOString())
                .lt('time_in', endDate.toISOString())
                .order('time_in', { ascending: true })
            if (error) throw error

            if (!logs || logs.length === 0) {
                alert('No attendance records found to Zip.')
                setIsExporting(false)
                return
            }

            // 2. Setup Zip
            const zip = new JSZip()
            const folder = zip.folder(`DTR_${selectedMonth}`)

            // 3. Group by intern
            const internMap = {}
            logs.forEach(log => {
                const iId = log.intern_id
                if (!internMap[iId]) {
                    internMap[iId] = {
                        info: log.interns,
                        logs: []
                    }
                }
                internMap[iId].logs.push(log)
            })

            // Base font sizes optimized for 144 DPI scaling
            const FONT_BASE = 14
            
            // Loop through each intern, build their HTML dynamically, and screenshot it
            for (const [internId, data] of Object.entries(internMap)) {
                // Determine rows
                const rows = []
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const dayLogs = data.logs.filter(l => new Date(l.time_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === dateKey)
                    const date = new Date(`${dateKey}T12:00:00+08:00`)
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6
                    
                    if (dayLogs.length === 0) {
                        rows.push({ d, dateKey, isWeekend, morning: null, afternoon: null, hours: 0 })
                    } else {
                        const morning = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) < 12) || null
                        const afternoon = dayLogs.find(l => Number(new Date(l.time_in).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) >= 12) || null
                        const totalHrs = dayLogs.reduce((sum, log) => sum + (log.time_out ? calculateHoursWorked(log.time_in, log.time_out) : 0), 0)
                        rows.push({ d, dateKey, isWeekend, morning, afternoon, hours: totalHrs })
                    }
                }
                
                const totalMonthHours = rows.reduce((sum, r) => sum + r.hours, 0)
                const daysPresent = rows.filter(r => r.morning || r.afternoon).length

                // Safely build table rows string bypassing React
                const tableRowsHtml = rows.filter(r => !r.isWeekend).map(row => {
                    const hasAny = row.morning || row.afternoon
                    const bg = hasAny ? '#fafff8' : '#fff'
                    const dateStr = new Date(`${row.dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
                    const dayNameStr = new Date(`${row.dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })
                    
                    const now = new Date()
                    const nowHr = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                    const todayKey = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                    const isPastDay = row.dateKey < todayKey
                    const isStaleM = !row.morning?.time_out && row.morning?.time_in && (isPastDay || nowHr >= 13)
                    const isStaleA = !row.afternoon?.time_out && row.afternoon?.time_in && isPastDay

                    const mIn = row.morning?.time_in ? formatManilaTime(row.morning.time_in) : '—'
                    const mOut = row.morning?.time_out ? formatManilaTime(row.morning.time_out) : (isStaleM ? '<span style="color:#ef4444;font-size:8px">MISSING</span>' : (row.morning?.time_in ? '•' : '—'))
                    const aIn = row.afternoon?.time_in ? formatManilaTime(row.afternoon.time_in) : '—'
                    const aOut = row.afternoon?.time_out ? formatManilaTime(row.afternoon.time_out) : (isStaleA ? '<span style="color:#ef4444;font-size:8px">MISSING</span>' : (row.afternoon?.time_in ? '•' : '—'))
                    const hrStr = row.hours > 0 ? formatHours(row.hours) : '—'
                    const statusStr = (row.morning && row.afternoon) ? '<span style="color:#166534;font-weight:700">FULL</span>' : (hasAny ? '<span style="color:#92400e;font-weight:700">HALF</span>' : '<span style="color:#ccc">ABSENT</span>')
                    
                    return `
                        <tr>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; font-weight: 600">${dayNameStr}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}">${dateStr}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; color: ${row.morning?.time_in ? '#166534': ''}">${mIn}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; color: ${row.morning?.time_out ? '#92400e': ''}">${mOut}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; color: ${row.afternoon?.time_in ? '#1e40af': ''}">${aIn}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; color: ${row.afternoon?.time_out ? '#6b21a8': ''}">${aOut}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; font-weight:700; color:#7B1C1C">${hrStr}</td>
                            <td style="border: 1px solid #bbb; padding: 4px; background:${bg}; font-size:10px">${statusStr}</td>
                        </tr>
                    `
                }).join('')

                // Create ghost element
                const ghostDiv = document.createElement('div')
                // Scale everything up 1.5x for crisper 2D canvas recording
                ghostDiv.style.position = 'fixed'
                ghostDiv.style.top = '-9999px' // Hide offscreen
                ghostDiv.style.left = '0'
                ghostDiv.style.width = '210mm'
                ghostDiv.style.background = 'white'
                ghostDiv.style.color = '#111'
                ghostDiv.style.fontFamily = '"Times New Roman", Times, serif'
                ghostDiv.style.padding = '18mm 14mm'
                ghostDiv.style.boxSizing = 'border-box'
                ghostDiv.style.zIndex = '-99'
                
                ghostDiv.innerHTML = `
                    <div style="border-bottom: 3px double #7B1C1C; padding-bottom: 8px; margin-bottom: 8px; text-align: center;">
                        <div style="font-size: 11px; color: #666; letter-spacing: 0.1em; text-transform: uppercase;">Republic of the Philippines</div>
                        <div style="font-size: 18px; font-weight: 900; color: #000080; letter-spacing: 0.03em; text-transform: uppercase; line-height: 1.2;">Iloilo State University of Fisheries</div>
                        <div style="font-size: 18px; font-weight: 900; color: #000080; letter-spacing: 0.03em; text-transform: uppercase; line-height: 1.2;">Science and Technology</div>
                        <div style="font-size: 13px; font-weight: 700; color: #7B1C1C; letter-spacing: 0.05em; margin-top: 2px;">College of Information and Communication Technology (CICT)</div>
                        <div style="font-size: 11px; color: #666; margin-top: 2px;">Dingle Campus | Website: isufst.edu.ph | (033) 337-1544 / (+63) 963-463-8274</div>
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 14.5px; font-weight: 800; color: #222; letter-spacing: 0.12em; text-transform: uppercase;">― Daily Time Record ―</div>
                        <div style="font-size: 10px; color: #888; letter-spacing: 0.05em;">On-the-Job Training • ${monthLabelStr}</div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; border: 1.5px solid #7B1C1C; margin: 8px 0; background: white;">
                        <div style="padding: 5px 8px; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc;">
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Name of Trainee</div>
                            <div style="font-size: 15px; font-weight: 700; color: #111;">${data.info.full_name}</div>
                        </div>
                        <div style="padding: 5px 8px; border-bottom: 1px solid #ccc;">
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Period Covered</div>
                            <div style="font-size: 15px; font-weight: 700; color: #111;">${monthLabelStr}</div>
                        </div>
                        <div style="padding: 5px 8px; border-right: 1px solid #ccc;">
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Total Days Present</div>
                            <div style="font-size: 15px; font-weight: 700; color: #111;">${daysPresent} days</div>
                        </div>
                        <div style="padding: 5px 8px;">
                            <div style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Total Hours Rendered</div>
                            <div style="font-size: 15px; font-weight: 700; color: #7B1C1C;">${formatHours(totalMonthHours)} <span style="font-size: 11px; font-weight: 400; color: #666;">/ ${data.info.required_hours}h req</span></div>
                        </div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; text-align: center;">
                        <thead>
                            <tr style="background: #7B1C1C; color: white;">
                                <th style="border: 1px solid #7B1C1C; border-bottom: none; padding: 4px; font-size: 11px; background: #7B1C1C; color: white;">Day</th>
                                <th style="border: 1px solid #7B1C1C; border-bottom: none; padding: 4px; font-size: 11px; width: 60px; background: #7B1C1C; color: white;">Date</th>
                                <th colspan="2" style="border: 1px solid #7B1C1C; padding: 4px; font-size: 11px; color: #fde68a; background: #7B1C1C;">MORNING</th>
                                <th colspan="2" style="border: 1px solid #7B1C1C; padding: 4px; font-size: 11px; color: #93c5fd; background: #7B1C1C;">AFTERNOON</th>
                                <th style="border: 1px solid #7B1C1C; border-bottom: none; padding: 4px; font-size: 11px; background: #7B1C1C; color: white;">Hours</th>
                                <th style="border: 1px solid #7B1C1C; border-bottom: none; padding: 4px; font-size: 11px; background: #7B1C1C; color: white;">Status</th>
                            </tr>
                            <tr style="background: #8B2C2C;">
                                <th style="border: 1px solid #7B1C1C; border-top: none; padding: 0; background: #7B1C1C;"></th>
                                <th style="border: 1px solid #7B1C1C; border-top: none; padding: 0; background: #7B1C1C;"></th>
                                <th style="border: 1px solid #7B1C1C; padding: 4px; font-size: 10px; color: #fde68a; background: #8B2C2C;">In</th>
                                <th style="border: 1px solid #7B1C1C; padding: 4px; font-size: 10px; color: #fde68a; background: #8B2C2C;">Out</th>
                                <th style="border: 1px solid #7B1C1C; padding: 4px; font-size: 10px; color: #93c5fd; background: #8B2C2C;">In</th>
                                <th style="border: 1px solid #7B1C1C; padding: 4px; font-size: 10px; color: #93c5fd; background: #8B2C2C;">Out</th>
                                <th style="border: 1px solid #7B1C1C; border-top: none; padding: 0; background: #7B1C1C;"></th>
                                <th style="border: 1px solid #7B1C1C; border-top: none; padding: 0; background: #7B1C1C;"></th>
                            </tr>
                        </thead>
                        <tbody>${tableRowsHtml}</tbody>
                        <tfoot>
                            <tr style="background: #fef9ed;">
                                <td colspan="6" style="border-top: 2px solid #7B1C1C; padding: 5px; font-weight: 800; text-align: right; font-size: 12px; color: #7B1C1C;">MONTHLY TOTAL:</td>
                                <td style="border-top: 2px solid #7B1C1C; padding: 5px; font-weight: 900; font-size: 14px; color: #7B1C1C;">${formatHours(totalMonthHours)}</td>
                                <td style="border-top: 2px solid #7B1C1C; padding: 5px; font-weight: 700; font-size: 11px; color: #7B1C1C;">${daysPresent}d</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div style="font-size: 11px; color: #444; font-style: italic; padding: 8px 0 0 0; border-top: 1px solid #ddd; margin-top: 4px;">
                        I certify on my honor that the above is a true and correct report of the hours of work performed,
                        record of which was made daily at the time of arrival and departure from office.
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 25px; padding-top: 10px; border-top: 1.5px solid #7B1C1C;">
                        <div style="text-align: center;">
                            <div style="border-bottom: 1px solid #333; margin-bottom: 4px; height: 35px;"></div>
                            <div style="font-size: 13px; font-weight: 700; color: #111;">${data.info.full_name}</div>
                            <div style="font-size: 10px; color: #666;">Signature of Trainee</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="border-bottom: 1px solid #333; margin-bottom: 4px; height: 35px;"></div>
                            <div style="font-size: 13px; font-weight: 700; color: #111;">___________________</div>
                            <div style="font-size: 10px; color: #666;">Immediate Supervisor</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="border-bottom: 1px solid #333; margin-bottom: 4px; height: 35px;"></div>
                            <div style="font-size: 13px; font-weight: 700; color: #111;">___________________</div>
                            <div style="font-size: 10px; color: #666;">OJT Coordinator</div>
                        </div>
                    </div>
                `
                document.body.appendChild(ghostDiv)
                
                // Render Canvas
                const canvas = await html2canvas(ghostDiv, { scale: 2, useCORS: true, logging: false })
                const imgData = canvas.toDataURL('image/jpeg', 0.95)
                
                // Build jsPDF instance
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
                
                // Calculate dimensions
                const pdfWidth = pdf.internal.pageSize.getWidth()
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width
                
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
                
                // Add to Zip Buffer
                const safeName = data.info.full_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
                folder.file(`${safeName}_dtr_${selectedMonth}.pdf`, pdf.output('blob'))
                
                // Cleanup
                document.body.removeChild(ghostDiv)
            }

            // Generate ZIP file and trigger download
            const content = await zip.generateAsync({ type: 'blob' })
            saveAs(content, `ISUFST_DTRs_${selectedMonth}.zip`)

        } catch (error) {
            console.error('Error Zipping PDFs:', error)
            alert('An error occurred during bulk generation. Check console.')
        } finally {
            setIsExporting(false)
        }
    }

    const totalMonthHours = dtrRows.reduce((sum, r) => sum + r.hours, 0)
    const daysPresent = dtrRows.filter(r => r.timeIn).length

    const handlePrint = async () => {
        const element = document.getElementById('print-area')
        if (!element) return
        
        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false })
            const imgData = canvas.toDataURL('image/jpeg', 0.95)
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
            
            const safeName = selectedIntern?.full_name?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'employee'
            pdf.save(`${safeName}_dtr_${selectedMonth}.pdf`)
        } catch (error) {
            console.error('Error generating PDF:', error)
            alert('Failed to generate PDF.')
        }
    }

    const monthLabel = selectedMonth
        ? new Date(`${selectedMonth}-01T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
        : ''

    return (
        <>
            {/* ─── Professional Print CSS ─── */}
            <style>{`
                @page {
                    size: A4 portrait;
                    margin: 0;
                }

                /* — Global Professional DTR Layout (Screen & Print) — */
                .dtr-print-wrapper {
                    background: white;
                    color: #111;
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 10.5pt;
                    max-width: 210mm;
                    margin: 0 auto;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    padding: 18mm 14mm;
                }

                .dtr-gov-header {
                    background: white;
                    border: none;
                    border-radius: 0;
                    border-bottom: 3px double #7B1C1C;
                    padding: 0 0 8px 0;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    text-align: center;
                }

                .dtr-meta-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    border: 1.5px solid #7B1C1C;
                    margin: 8px 0;
                    background: white;
                    color: #111;
                }
                .dtr-meta-cell {
                    padding: 5px 8px;
                    border-right: 1px solid #ccc;
                    border-bottom: 1px solid #ccc;
                }
                .dtr-meta-cell:nth-child(even) { border-right: none; }
                .dtr-meta-label { font-size: 7pt; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
                .dtr-meta-value { font-size: 10.5pt; font-weight: 700; color: #111; }
                .dtr-meta-value.gold { color: #7B1C1C; }

                .dtr-screen-table-wrap {
                    background: white;
                    border: none;
                    border-radius: 0;
                    overflow: visible;
                }

                .dtr-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 8.5pt;
                    font-family: 'Times New Roman', Times, serif;
                    margin-bottom: 8px;
                }
                .dtr-table thead tr { background: #7B1C1C !important; color: white !important; }
                .dtr-table th {
                    border: 1px solid #7B1C1C;
                    padding: 4px 5px;
                    text-align: center;
                    font-size: 7.5pt;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    background: #7B1C1C !important;
                    color: white !important;
                }
                .dtr-table td { border: 1px solid #bbb; padding: 3.5px 5px; text-align: center; color: #111; }
                .dtr-row-day td { background: #fafff8 !important; color: #111 !important; }
                .dtr-row-absent td { background: white !important; color: #ccc !important; }
                .dtr-table tfoot td {
                    background: #fef9ed !important;
                    font-weight: 700;
                    border-top: 2px solid #7B1C1C;
                    color: #7B1C1C !important;
                }

                .dtr-cert-block {
                    background: white;
                    border: none;
                    font-size: 8pt;
                    color: #444;
                    font-style: italic;
                    padding: 8px 0 0 0;
                    border-top: 1px solid #ddd;
                    margin-top: 4px;
                }

                .dtr-sig-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 20px;
                    margin-top: 20px;
                    padding-top: 10px;
                    border-top: 1.5px solid #7B1C1C;
                }
                .dtr-sig-block { text-align: center; }
                .dtr-sig-line { border-bottom: 1px solid #333; margin-bottom: 4px; height: 30px; }
                .dtr-sig-name { font-size: 9pt; font-weight: 700; color: #111; }
                .dtr-sig-label { font-size: 7pt; color: #666; }

                .dtr-print-footer {
                    display: block;
                    margin-top: 10px;
                    text-align: center;
                    font-size: 7pt;
                    color: #aaa;
                    border-top: 1px solid #eee;
                    padding-top: 5px;
                    font-family: 'Times New Roman', Times, serif;
                }

                /* — Print overrides (removing screen bounds) — */
                @media print {
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    body * { visibility: hidden !important; }
                    #print-area, #print-area * { visibility: visible !important; }
                    #print-area {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        padding: 14mm 14mm !important;
                        box-sizing: border-box !important;
                        background: white !important;
                        color: #111 !important;
                    }
                    .dtr-print-wrapper {
                        box-shadow: none !important;
                        padding: 0 !important;
                        max-width: none !important;
                    }
                    .no-print { display: none !important; }
                }

                    .dtr-print-wrapper { background: white; color: #111; font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; }

                    .dtr-gov-header {
                        background: white;
                        border: none;
                        border-radius: 0;
                        border-bottom: 3px double #7B1C1C;
                        padding: 0 0 8px 0;
                        margin-bottom: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        text-align: center;
                    }

                    .dtr-meta-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        border: 1.5px solid #7B1C1C;
                        margin: 8px 0;
                        background: white;
                    }
                    .dtr-meta-cell {
                        padding: 5px 8px;
                        border-right: 1px solid #ccc;
                        border-bottom: 1px solid #ccc;
                    }
                    .dtr-meta-cell:nth-child(even) { border-right: none; }
                    .dtr-meta-label { font-size: 7pt; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
                    .dtr-meta-value { font-size: 10.5pt; font-weight: 700; color: #111; }
                    .dtr-meta-value.gold { color: #7B1C1C; }

                    .dtr-screen-table-wrap {
                        background: white;
                        border: none;
                        border-radius: 0;
                        overflow: visible;
                    }

                    .dtr-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 8.5pt;
                        font-family: 'Times New Roman', Times, serif;
                        margin-bottom: 8px;
                    }
                    .dtr-table thead tr {
                        background: #7B1C1C !important;
                        color: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .dtr-table th {
                        border: 1px solid #7B1C1C;
                        padding: 4px 5px;
                        text-align: center;
                        font-size: 7.5pt;
                        font-weight: 700;
                        letter-spacing: 0.04em;
                        background: #7B1C1C !important;
                        color: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .dtr-table td { border: 1px solid #bbb; padding: 3.5px 5px; text-align: center; }
                    .dtr-row-weekend td { background: #f7f7f7 !important; color: #bbb !important; }
                    .dtr-row-day td { background: #fafff8 !important; color: #111 !important; }
                    .dtr-row-absent td { background: white !important; color: #ccc !important; }
                    .dtr-table tfoot td {
                        background: #fef9ed !important;
                        font-weight: 700;
                        border-top: 2px solid #7B1C1C;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    .dtr-cert-block {
                        background: white;
                        border: none;
                        font-size: 8pt;
                        color: #444;
                        font-style: italic;
                        padding: 8px 0 0 0;
                        border-top: 1px solid #ddd;
                        margin-top: 4px;
                    }

                    .dtr-sig-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr;
                        gap: 20px;
                        margin-top: 20px;
                        padding-top: 10px;
                        border-top: 1.5px solid #7B1C1C;
                    }
                    .dtr-sig-block { text-align: center; }
                    .dtr-sig-line { border-bottom: 1px solid #333; margin-bottom: 4px; height: 30px; }
                    .dtr-sig-name { font-size: 9pt; font-weight: 700; color: #111; }
                    .dtr-sig-label { font-size: 7pt; color: #666; }

                    .dtr-print-footer {
                        display: block;
                        margin-top: 10px;
                        text-align: center;
                        font-size: 7pt;
                        color: #aaa;
                        border-top: 1px solid #eee;
                        padding-top: 5px;
                        font-family: 'Times New Roman', Times, serif;
                    }
                }
            `}</style>

            <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', padding: '1rem 1.25rem', position: 'relative' }}>
                <div style={{ maxWidth: '56rem', margin: '0 auto', position: 'relative', zIndex: 10 }}>

                    {/* Header */}
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingTop: '0.5rem' }}
                        className="no-print">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0.5rem', borderRadius: '0.75rem', cursor: 'pointer', display: 'flex' }}>
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div>
                                <h1 style={{ fontSize: '1.125rem', fontWeight: 900, color: 'white', margin: 0 }}>Monthly Reports</h1>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Daily Time Record (DTR) Generator</p>
                            </div>
                        </div>

                        {/* Burger Menu */}
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setMenuOpen(v => !v)}
                                style={{ background: menuOpen ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${menuOpen ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, color: 'white', padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                aria-label="Menu">
                                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            {menuOpen && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, background: 'linear-gradient(160deg, rgba(20,30,50,0.98), rgba(30,41,59,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.25rem', padding: '0.625rem', minWidth: '210px', zIndex: 50, boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.08)', backdropFilter: 'blur(20px)' }}>
                                    <div style={{ padding: '0.5rem 0.875rem 0.625rem', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '0.375rem' }}>
                                        <p style={{ fontSize: '0.625rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Navigation</p>
                                    </div>
                                    {[
                                        { label: 'Dashboard', path: '/admin/dashboard', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                                        { label: 'Manage Interns', path: '/admin/interns', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                                        { label: 'QR Scanner', path: '/admin/scanner', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 14h3m0 3v3m-6 0h3" /></svg> },
                                        { label: 'Intern Portal', path: '/intern/login', icon: <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                                    ].map(item => (
                                        <button key={item.path} onClick={() => { setMenuOpen(false); router.push(item.path) }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'left', transition: 'all 0.15s' }}
                                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'white' }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}>
                                            <span style={{ color: 'var(--gold)', display: 'flex' }}>{item.icon}</span>
                                            {item.label}
                                        </button>
                                    ))}
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0.375rem 0' }} />
                                    <button onClick={() => { localStorage.removeItem('admin_session'); sessionStorage.removeItem('admin_logged_in'); router.push('/admin/login') }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'left', transition: 'all 0.15s' }}
                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Controls */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '1.5rem', padding: '1.25rem', marginBottom: '1.5rem' }}
                        className="no-print">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--gold)" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <p style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Generate & Export DTR</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
                             {/* Intern Searchable Picker */}
                            <div style={{ flex: 2, minWidth: '200px' }} ref={pickerRef}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    Intern
                                </label>

                                {/* Selected pill or search input */}
                                {selectedInternId && selectedIntern ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.875rem', borderRadius: '0.875rem', border: '1.5px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.06)' }}>
                                        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'linear-gradient(135deg, var(--maroon), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <span style={{ fontSize: '0.6875rem', fontWeight: 900, color: 'white' }}>
                                                {selectedIntern.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                        <span style={{ fontWeight: 700, color: 'white', fontSize: '0.9375rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedIntern.full_name}</span>
                                        <button onClick={() => { setSelectedInternId(''); setSelectedIntern(null); setInternSearch(''); setDtrRows([]) }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '0.25rem', borderRadius: '50%', transition: 'color 0.15s' }}
                                            onMouseOver={e => e.currentTarget.style.color = '#f87171'}
                                            onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
                                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'relative' }}>
                                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.35)" strokeWidth={2} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input
                                                type="text"
                                                placeholder="Search intern name..."
                                                value={internSearch}
                                                onFocus={() => setInternPickerOpen(true)}
                                                onChange={e => { setInternSearch(e.target.value); setInternPickerOpen(true) }}
                                                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '0.875rem', border: `1.5px solid ${internPickerOpen ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`, background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.9375rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                            />
                                        </div>
                                        {internPickerOpen && (
                                            <div style={{ position: 'absolute', top: 'calc(100% + 0.375rem)', left: 0, right: 0, background: 'linear-gradient(160deg, rgba(18,27,44,0.99), rgba(28,38,56,0.99))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', overflow: 'hidden', zIndex: 50, boxShadow: '0 16px 40px rgba(0,0,0,0.6)', maxHeight: '220px', overflowY: 'auto' }}>
                                                {loadingInterns ? (
                                                    <div style={{ padding: '1.25rem', textAlign: 'center' }}>
                                                        <div style={{ width: 24, height: 24, border: '2px solid rgba(201,168,76,0.2)', borderTopColor: 'var(--gold)', borderRadius: '50%', margin: '0 auto' }} className="animate-spin" />
                                                    </div>
                                                ) : (() => {
                                                    const filtered = interns.filter(i => i.full_name.toLowerCase().includes(internSearch.toLowerCase()))
                                                    return filtered.length === 0 ? (
                                                        <div style={{ padding: '1rem', textAlign: 'center' }}>
                                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', margin: 0 }}>No interns found</p>
                                                        </div>
                                                    ) : filtered.map((intern, idx) => (
                                                        <button key={intern.id}
                                                            onClick={() => { setSelectedInternId(String(intern.id)); setSelectedIntern(intern); setInternSearch(''); setInternPickerOpen(false) }}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background 0.12s' }}
                                                            onMouseOver={e => e.currentTarget.style.background = 'rgba(201,168,76,0.07)'}
                                                            onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                        >
                                                            <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(123,28,28,0.8), rgba(201,168,76,0.6))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <span style={{ fontSize: '0.625rem', fontWeight: 900, color: 'white' }}>
                                                                    {intern.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p style={{ fontWeight: 700, color: 'white', fontSize: '0.875rem', margin: 0 }}>{intern.full_name}</p>
                                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', margin: 0 }}>{intern.required_hours || 600}h required</p>
                                                            </div>
                                                        </button>
                                                    ))
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Month Picker — Custom */}
                            <div style={{ flex: 1, minWidth: '160px', position: 'relative' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" /></svg>
                                    Month
                                </label>
                                <CustomMonthPicker 
                                    selectedMonth={selectedMonth}
                                    onChange={setSelectedMonth}
                                />
                            </div>
                            {/* Generate Button */}
                            <div style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
                                <button onClick={generateDTR} disabled={!selectedInternId || !selectedMonth || loading}
                                    className="btn-primary" style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap', opacity: (!selectedInternId || !selectedMonth) ? 0.5 : 1 }}>
                                    {loading ? (
                                        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" /><path fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                    ) : (
                                        <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Generate</>
                                    )}
                                </button>
                            </div>
                            {/* Export Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', width: '100%', marginTop: '0.5rem' }}>
                                <button onClick={handleExportCSV} disabled={isExporting}
                                    style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap' }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Export CSV Log
                                </button>
                                <button onClick={handleExportZip} disabled={isExporting}
                                    style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.05)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isExporting ? 'not-allowed' : 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap', opacity: isExporting ? 0.6 : 1 }}
                                    onMouseOver={e => e.currentTarget.style.background = isExporting ? 'rgba(255,255,255,0.05)' : 'rgba(201,168,76,0.1)'} onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                                    {isExporting ? (
                                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                    ) : (
                                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    )}
                                    {isExporting ? 'Packaging Zip...' : 'Download All DTR (.zip)'}
                                </button>
                            </div>
                        </div>
                    </motion.div>

                    {/* DTR Table */}
                    {dtrRows.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} id="print-area">
                            <div className="dtr-print-wrapper">

                                {/* ── ISUFST Gov-Style Header ── */}
                                <div className="dtr-gov-header">
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.625rem', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Republic of the Philippines</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#000080', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.2 }}>Iloilo State University of Fisheries</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#000080', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.2 }}>Science and Technology</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7B1C1C', letterSpacing: '0.05em', marginTop: 2 }}>College of Information and Communication Technology (CICT)</div>
                                        <div style={{ fontSize: '0.625rem', color: '#666', marginTop: 2 }}>Dingle Campus &nbsp;|&nbsp; Website: isufst.edu.ph &nbsp;|&nbsp; (033) 337-1544 / (+63) 963-463-8274</div>
                                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee', fontSize: '0.8125rem', fontWeight: 800, color: '#222', letterSpacing: '0.12em', textTransform: 'uppercase' }}>― Daily Time Record ―</div>
                                        <div style={{ fontSize: '0.5625rem', color: '#888', letterSpacing: '0.05em' }}>On-the-Job Training &nbsp;•&nbsp; {monthLabel}</div>
                                    </div>
                                </div>

                                {/* ── Meta Grid ── */}
                                <div className="dtr-meta-grid">
                                    <div className="dtr-meta-cell">
                                        <div className="dtr-meta-label">Name of Trainee</div>
                                        <div className="dtr-meta-value">{selectedIntern?.full_name}</div>
                                    </div>
                                    <div className="dtr-meta-cell">
                                        <div className="dtr-meta-label">Period Covered</div>
                                        <div className="dtr-meta-value">{monthLabel}</div>
                                    </div>
                                    <div className="dtr-meta-cell">
                                        <div className="dtr-meta-label">Total Days Present</div>
                                        <div className="dtr-meta-value">{daysPresent} day{daysPresent !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div className="dtr-meta-cell">
                                        <div className="dtr-meta-label">Total Hours Rendered</div>
                                        <div className="dtr-meta-value gold">{formatHours(totalMonthHours)} <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.7 }}>/ {selectedIntern?.required_hours || 600}h required</span></div>
                                    </div>
                                </div>

                                {/* ── Main Table ── */}
                                <div className="dtr-screen-table-wrap">
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="dtr-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '30px', background: '#7B1C1C', color: 'white', borderBottom: 'none' }}>Day</th>
                                                    <th style={{ width: '56px', background: '#7B1C1C', color: 'white', borderBottom: 'none' }}>Date</th>
                                                    <th colSpan={2} style={{ color: '#fde68a', background: '#7B1C1C' }}>MORNING</th>
                                                    <th colSpan={2} style={{ color: '#93c5fd', background: '#7B1C1C' }}>AFTERNOON</th>
                                                    <th style={{ width: '56px', background: '#7B1C1C', color: 'white', borderBottom: 'none' }}>Hours</th>
                                                    <th style={{ width: '52px', background: '#7B1C1C', color: 'white', borderBottom: 'none' }}>Status</th>
                                                </tr>
                                                <tr>
                                                    <th style={{ background: '#7B1C1C', borderTop: 'none' }}></th>
                                                    <th style={{ background: '#7B1C1C', borderTop: 'none' }}></th>
                                                    <th style={{ background: '#8B2C2C', color: '#fde68a', fontSize: '0.5625rem' }}>In</th>
                                                    <th style={{ background: '#8B2C2C', color: '#fde68a', fontSize: '0.5625rem' }}>Out</th>
                                                    <th style={{ background: '#8B2C2C', color: '#93c5fd', fontSize: '0.5625rem' }}>In</th>
                                                    <th style={{ background: '#8B2C2C', color: '#93c5fd', fontSize: '0.5625rem' }}>Out</th>
                                                    <th style={{ background: '#7B1C1C', borderTop: 'none' }}></th>
                                                    <th style={{ background: '#7B1C1C', borderTop: 'none' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const now = new Date()
                                                    const nowHr = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
                                                    const todayKey = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

                                                    return dtrRows.filter(row => !row.isWeekend).map((row) => {
                                                        const hasAny = row.morning || row.afternoon
                                                        const rowClass = hasAny ? 'dtr-row-day' : 'dtr-row-absent'
                                                        
                                                        const isStaleM = !row.morning?.time_out && row.morning?.time_in && (row.date < todayKey || nowHr >= 13)
                                                        const isStaleA = !row.afternoon?.time_out && row.afternoon?.time_in && row.date < todayKey

                                                        return (
                                                            <tr key={row.date} className={rowClass}>
                                                                <td style={{ fontWeight: 600 }}>{row.dayName}</td>
                                                                <td style={{ fontWeight: hasAny ? 700 : 400, whiteSpace: 'nowrap' }}>
                                                                    {new Date(`${row.date}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}
                                                                </td>
                                                                <td style={{ color: row.morning?.time_in ? '#166534' : undefined }}>
                                                                    {row.morning?.time_in ? formatManilaTime(row.morning.time_in) : '—'}
                                                                </td>
                                                                <td style={{ color: row.morning?.time_out ? '#92400e' : undefined }}>
                                                                    {row.morning?.time_out ? formatManilaTime(row.morning.time_out) : isStaleM ? (
                                                                        <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 700 }}>MISSING</span>
                                                                    ) : row.morning?.time_in ? '•' : '—'}
                                                                </td>
                                                                <td style={{ color: row.afternoon?.time_in ? '#1e40af' : undefined }}>
                                                                    {row.afternoon?.time_in ? formatManilaTime(row.afternoon.time_in) : '—'}
                                                                </td>
                                                                <td style={{ color: row.afternoon?.time_out ? '#6b21a8' : undefined }}>
                                                                    {row.afternoon?.time_out ? formatManilaTime(row.afternoon.time_out) : isStaleA ? (
                                                                        <span style={{ color: '#ef4444', fontSize: '0.625rem', fontWeight: 700 }}>MISSING</span>
                                                                    ) : row.afternoon?.time_in ? '•' : '—'}
                                                                </td>
                                                            <td style={{ fontWeight: 700, color: row.hours > 0 ? '#7B1C1C' : undefined }}>
                                                                {row.hours > 0 ? formatHours(row.hours) : '—'}
                                                            </td>
                                                                <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
                                                                    {row.morning && row.afternoon ? (
                                                                        <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#166534' }}>FULL</span>
                                                                    ) : hasAny ? (
                                                                        <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#92400e' }}>HALF</span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.5625rem', color: '#ccc' }}>ABSENT</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })
                                                })()}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan={6} style={{ fontWeight: 800, textAlign: 'right', fontSize: '0.8125rem' }}>MONTHLY TOTAL:</td>
                                                    <td style={{ fontWeight: 900, textAlign: 'center', fontSize: '1rem' }}>{formatHours(totalMonthHours)}</td>
                                                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>{daysPresent}d</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* ── Certification ── */}
                                    <div className="dtr-cert-block">
                                        I certify on my honor that the above is a true and correct report of the hours of work performed,
                                        record of which was made daily at the time of arrival and departure from office.
                                    </div>

                                    {/* ── Signature Grid ── */}
                                    <div className="dtr-sig-grid">
                                        <div className="dtr-sig-block">
                                            <div className="dtr-sig-line"></div>
                                            <div className="dtr-sig-name">{selectedIntern?.full_name}</div>
                                            <div className="dtr-sig-label">Signature of Trainee</div>
                                        </div>
                                        <div className="dtr-sig-block">
                                            <div className="dtr-sig-line"></div>
                                            <div className="dtr-sig-name">___________________</div>
                                            <div className="dtr-sig-label">Immediate Supervisor</div>
                                        </div>
                                        <div className="dtr-sig-block">
                                            <div className="dtr-sig-line"></div>
                                            <div className="dtr-sig-name">___________________</div>
                                            <div className="dtr-sig-label">OJT Coordinator</div>
                                        </div>
                                    </div>

                                    {/* ── Print Footer (hidden on screen) ── */}
                                    <div className="dtr-print-footer">
                                        ISUFST Dingle Campus &nbsp;•&nbsp; CICT Department &nbsp;•&nbsp; isufst.edu.ph &nbsp;•&nbsp; OJT Attendance System
                                    </div>

                                    {/* Print Button */}
                                    <div data-html2canvas-ignore="true" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }} className="no-print">
                                        <button onClick={handlePrint} disabled={loading} className="btn-primary" style={{ padding: '0.75rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.9375rem', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            {loading ? 'Downloading...' : 'Download / Export PDF'}
                                        </button>
                                    </div>

                                </div>{/* end dtr-screen-table-wrap */}
                            </div>{/* end dtr-print-wrapper */}
                        </motion.div>
                    )}

                    {/* Empty State */}
                    {dtrRows.length === 0 && !loading && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                            <div style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--gold)" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h3 style={{ color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>No Report Generated</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Select an intern and a month above, then click Generate.</p>
                        </motion.div>
                    )}

                    <div style={{ marginTop: '3rem', textAlign: 'center', paddingBottom: '2rem' }} className="no-print">
                        <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.15)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Designed and developed by Lou Vincent Baroro</p>
                    </div>
                </div>
            </div>
        </>
    )
}
