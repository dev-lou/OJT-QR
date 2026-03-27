// ─── SweetAlert2 Configurations ──────────────────────────────────────────────
// EXACT copies from isufst_qr/AdminScanner.jsx — do NOT change UI behavior
import { escapeHtml } from './debounce'

const BASE_POPUP = {
    background: '#1e293b',
    color: '#ffffff',
    backdrop: 'rgba(15,23,42,0.85)',
    padding: '2rem',
    allowOutsideClick: false,
    iconColor: 'var(--gold)',
    customClass: { popup: 'luxury-swal-popup', confirmButton: 'luxury-swal-btn', cancelButton: 'luxury-swal-cancel' },
    buttonsStyling: false,
}

/** Green ✓ — User Successfully Scanned */
export function successScanAlert(name, action = 'Check-in') {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        icon: 'success',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">User Successfully Scanned!</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div style="font-size: 1rem; font-weight: 800; color: #C9A84C; margin-bottom: 0.25rem;">${safeName}</div>
            <div style="margin-bottom: 0.2rem;"><span style="color: rgba(255,255,255,0.55);">Action:</span> <span style="font-weight: 700; color: #ffffff;">${action}</span></div>
            <div><span style="color: rgba(255,255,255,0.55);">Status:</span> <span style="font-weight: 700; color: #10b981;">Synced to database ✓</span></div>
        </div>`,
        confirmButtonText: 'Scan Next',
        confirmButtonColor: '#10b981',
    }
}

/** Yellow — Already checked in today */
export function duplicateAlert(name) {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        icon: 'warning',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Already checked in today</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div style="font-size: 1rem; font-weight: 800; color: #C9A84C; margin-bottom: 0.25rem;">${safeName}</div>
            <div><span style="color: rgba(255,255,255,0.55);">Details:</span> <span style="font-weight: 700; color: #f59e0b;">This user is already checked in for today.</span></div>
        </div>`,
        confirmButtonText: 'Scan Next',
        confirmButtonColor: '#f59e0b',
    }
}

/** Yellow — Already checked out today */
export function alreadyCheckedOutAlert(name) {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        icon: 'warning',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Already checked out today</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div style="font-size: 1rem; font-weight: 800; color: #C9A84C; margin-bottom: 0.25rem;">${safeName}</div>
            <div><span style="color: rgba(255,255,255,0.55);">Details:</span> <span style="font-weight: 700; color: #f59e0b;">This user already completed check-out for today.</span></div>
        </div>`,
        confirmButtonText: 'SCAN NEXT',
        confirmButtonColor: '#f59e0b',
    }
}

/** Yellow — No active check-in found */
export function notCheckedInAlert(name) {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        icon: 'warning',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">No active check-in found</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div style="font-size: 1rem; font-weight: 800; color: #C9A84C; margin-bottom: 0.25rem;">${safeName}</div>
            <div><span style="color: rgba(255,255,255,0.55);">Details:</span> <span style="font-weight: 700; color: #f59e0b;">Check-in is required before check-out.</span></div>
        </div>`,
        confirmButtonText: 'SCAN NEXT',
        confirmButtonColor: '#f59e0b',
    }
}

/** Orange — Save failed / queued for retry */
export function errorSaveAlert(name) {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        icon: 'info',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Save failed — queued for retry</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div style="font-size: 1rem; font-weight: 800; color: #C9A84C; margin-bottom: 0.25rem;">${safeName}</div>
            <div><span style="color: rgba(255,255,255,0.55);">Status:</span> <span style="font-weight: 700; color: #f59e0b;">Database error — saved to retry queue.</span></div>
        </div>`,
        confirmButtonText: 'SCAN NEXT',
        confirmButtonColor: '#f59e0b',
    }
}

/** Red — Invalid QR code */
export function invalidQrAlert() {
    return {
        ...BASE_POPUP,
        icon: 'error',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Invalid QR code</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem;">This is not a valid attendance QR code.</div>`,
        confirmButtonText: 'SCAN NEXT',
        confirmButtonColor: '#ef4444',
    }
}

/** Red — Intern not found */
export function notFoundAlert() {
    return {
        ...BASE_POPUP,
        icon: 'error',
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Intern not found</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div>Please verify that this QR is registered in the attendance system.</div>
        </div>`,
        confirmButtonText: 'SCAN NEXT',
        confirmButtonColor: '#ef4444',
    }
}

/** Red — Delete Confirmation */
export function confirmDeleteAlert(name) {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Delete ${safeName}?</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div><span style="color: #ef4444; font-weight: 700;">Warning:</span> This action cannot be undone. All related records will be permanently removed.</div>
        </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
    }
}

/** Yellow — Update Confirmation */
export function confirmUpdateAlert(name, item = 'record') {
    const safeName = escapeHtml(name)
    return {
        ...BASE_POPUP,
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">Update ${item}?</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div>Are you sure you want to save changes to <span style="color: var(--gold); font-weight: 700;">${safeName}</span>?</div>
        </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, update it',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#C9A84C',
    }
}

/** Blue/Generic — Generic Action Confirmation */
export function confirmActionAlert(title, text, confirmText = 'Yes, proceed', icon = 'question') {
    return {
        ...BASE_POPUP,
        title: `<span style="color: white; font-weight: 800; font-size: 1.1rem;">${title}</span>`,
        html: `<div style="color: rgba(255,255,255,0.86); font-size: 0.95rem; margin-top: 0.4rem; line-height: 1.5; text-align: left;">
            <div>${text}</div>
        </div>`,
        icon: icon,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Cancel',
        confirmButtonColor: icon === 'error' ? '#ef4444' : icon === 'success' ? '#10b981' : '#60a5fa',
    }
}
