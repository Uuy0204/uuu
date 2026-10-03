import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

const interfaces = (() => { try { return networkInterfaces(); } catch { return {}; } })();
const localAddresses = Object.values(interfaces)
  .flatMap((interfaces) => interfaces ?? [])
  .filter((address) => address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'export',
  trailingSlash: true,
  allowedDevOrigins: ['localhost', '127.0.0.1', ...localAddresses],
  images: { unoptimized: true },
};

export default nextConfig;
