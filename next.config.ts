import type { NextConfig } from 'next';

const config: NextConfig = {
  allowedDevOrigins: process.env.PUBLIC_BASE_URL ? [new URL(process.env.PUBLIC_BASE_URL).hostname] : [],
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
