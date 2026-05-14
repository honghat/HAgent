import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  reactCompiler: false, // Tạm tắt để tránh leak RAM trên v16
  devIndicators: false,
  allowedDevOrigins: ['hatai.io.vn'],
  experimental: {
    // Giới hạn số lượng worker để tránh treo máy trên M4
    cpus: 4,
  },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['node-ssh', 'ssh2', 'cpu-features', 'sshcrypto', 'prisma', '@prisma/client'],
};

export default nextConfig;
