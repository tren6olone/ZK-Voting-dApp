import type { NextConfig } from "next";
/** @type {import('next').NextConfig} */

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["firebase-admin", "eth-crypto", "ethers"],
  images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'lh3.googleusercontent.com', // Google profile pictures
        },
        {
          protocol: 'https',
          hostname: 'media.licdn.com', // LinkedIn profile pictures
        },
        {
          protocol: 'https',
          hostname: 'avatars.githubusercontent.com', // for Reown/AppKit icons
        }
      ],
    }
};

export default nextConfig;
