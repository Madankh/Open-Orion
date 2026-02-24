import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: "standalone",
  
  poweredByHeader: false,
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.curiositylab.fun',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'apipy.curiositylab.fun',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**',
      },

      ...(isDev ? [
        {
          protocol: 'http' as const,
          hostname: 'localhost',
          port: '8000',
          pathname: '/**',
        },
        {
          protocol: 'http' as const,
          hostname: 'localhost',
          port: '5000',
          pathname: '/**',
        },
      ] : []),
    ],
  },

  // async headers() {
  //   return [
  //     {
  //       source: '/:path*',
  //       headers: [
  //       {
  //         key: 'Content-Security-Policy',
  //         value: `
  //           default-src 'self';
  //           script-src 'self' ${isDev ? "'unsafe-eval'" : ""} 'unsafe-inline' blob: https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net https://cdn.paddle.com https://public.profitwell.com https://www.youtube.com https://s.ytimg.com;
  //           connect-src 'self' blob: https://api.curiositylab.fun https://apipy.curiositylab.fun wss://apipy.curiositylab.fun ${isDev ? 'ws://localhost:8000' : ''} https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://cdn.jsdelivr.net https://*.paddle.com https://*.profitwell.com https://vendors.paddle.com https://checkout.paddle.com https://buy.paddle.com https://www.youtube.com;
  //           img-src 'self' data: https: ${isDev ? 'http://localhost:8000 http://localhost:5000' : ''};
  //           style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.paddle.com;
  //           font-src 'self' data: https://cdn.jsdelivr.net https://cdn.tldraw.com;
  //           frame-src 'self' https://sandbox-checkout.paddle.com https://checkout.paddle.com https://buy.paddle.com https://www.youtube.com https://www.youtube-nocookie.com;
  //           worker-src 'self' blob:;
  //           object-src 'none';
  //           base-uri 'self';
  //           form-action 'self' https://checkout.paddle.com https://buy.paddle.com;
  //           frame-ancestors 'none';
  //           upgrade-insecure-requests;
  //         `.replace(/\s{2,}/g, ' ').trim()
  //       },
  //         {
  //           key: 'X-Content-Type-Options',
  //           value: 'nosniff'
  //         },
  //         {
  //           key: 'X-Frame-Options',
  //           value: 'DENY'
  //         },
  //         {
  //           key: 'X-XSS-Protection',
  //           value: '1; mode=block'
  //         },
  //         {
  //           key: 'Referrer-Policy',
  //           value: 'strict-origin-when-cross-origin'
  //         },
  //         {
  //           key: 'Permissions-Policy',
  //           value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  //         },
  //         ...(isProd ? [{
  //           key: 'Strict-Transport-Security',
  //           value: 'max-age=31536000; includeSubDomains; preload'
  //         }] : []),
  //       ],
  //     },
  //     {
  //       source: '/api/:path*',
  //       headers: [
  //         {
  //           key: 'Cache-Control',
  //           value: 'no-store, max-age=0'
  //         },
  //         {
  //           key: 'X-Content-Type-Options',
  //           value: 'nosniff'
  //         },
  //       ],
  //     },
  //   ];
  // },


};

export default nextConfig;