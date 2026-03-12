/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  // Enable gzip compression for all responses
  compress: true,

  // Remove the X-Powered-By header (minor security + removes unnecessary bytes)
  poweredByHeader: false,

  // Tree-shake large packages to only import what's used
  experimental: {
    optimizePackageImports: ['framer-motion', 'sweetalert2'],
  },
};

export default nextConfig;
