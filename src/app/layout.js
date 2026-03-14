import './globals.css'

export const metadata = {
  title: 'OJT Attendance System — ISUFST Dingle Campus',
  description: 'On-the-Job Training attendance tracker with QR scanning for intern hour tracking | CICT Department',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OJT Tracker',
  },
}

// Separate viewport export per Next.js 14+ recommendation
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f172a',
}


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Google Fonts for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load only needed weights; display=swap prevents invisible text */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap"
        />
      </head>
      <body>
        <div className="glow-ambient-top" aria-hidden="true" />
        <div className="glow-ambient-bottom" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
