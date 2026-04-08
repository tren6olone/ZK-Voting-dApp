'use client'

import { createAppKit } from '@reown/appkit/react'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { mainnet, sepolia, hardhat } from '@reown/appkit/networks'

// 1. Get projectId from env
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID

if (!projectId) {
  throw new Error('Project ID is not defined')
}

// 2. Set up the metadata for your dApp
const metadata = {
  name: 'ZK Voting DAO',
  description: 'Gasless Zero-Knowledge Voting System',
  url: 'https://zkvoting-dapp.vercel.app', 
  icons: ['https://avatars.githubusercontent.com/u/179229932']
}

// 3. Create the AppKit instance
createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia], // Use sepolia for your testnet
  metadata,
  projectId,
  features: { analytics: true }
})

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}