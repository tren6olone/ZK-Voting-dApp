import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Expand the bypass to include ALL heavy Zero-Knowledge & Cryptography libraries
  serverExternalPackages: [
    "firebase-admin", 
    "eth-crypto", 
    "ethers",
    "snarkjs", // <-- This is usually the main culprit causing the NftJsonAsset crash!
    "@semaphore-protocol/proof",
    "@semaphore-protocol/group",
    "@semaphore-protocol/identity",
    "ffjavascript"
  ],

  // 2. The Web3 dApp Fallback: Tells the frontend to stop looking for backend Node.js files
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
      };
    }
    return config;
  },

  // 3. Your Existing Image Settings (Untouched)
  images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'lh3.googleusercontent.com', 
        },
        {
          protocol: 'https',
          hostname: 'media.licdn.com', 
        },
        {
          protocol: 'https',
          hostname: 'avatars.githubusercontent.com', 
        }
      ],
    }
};

export default nextConfig;