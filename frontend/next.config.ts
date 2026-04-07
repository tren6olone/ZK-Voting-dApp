import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Tell Turbopack to safely ignore ALL cryptography and ZK libraries
  serverExternalPackages: [
    "firebase-admin", 
    "eth-crypto", 
    "ethers",
    "snarkjs", 
    "@semaphore-protocol/proof",
    "@semaphore-protocol/group",
    "@semaphore-protocol/identity",
    "ffjavascript"
  ],

  // 2. Your Existing Image Settings (Untouched)
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