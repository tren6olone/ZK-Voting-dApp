'use client'

import { useState } from 'react'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { BrowserProvider, Eip1193Provider } from 'ethers'

export default function WalletConnectGate() {
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const handleLinkWallet = async () => {
    if (!isConnected || !walletProvider) return
    
    if (!linkedinUrl.includes("linkedin.com/in/")) {
      alert("Please enter your LinkedIn Profile URL (e.g., https://linkedin.com/in/username)")
      return
    }
    
    setIsSubmitting(true)

    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider)
      const signer = await ethersProvider.getSigner()

      // FIX #3 — get the true wallet address directly from the signer
      const trueWalletAddress = await signer.getAddress()

      const message = "Link my LinkedIn account to this Web3 wallet."
      const signature = await signer.signMessage(message)

      // FIX #7 — dynamically import Identity to avoid Next.js crypto bundling issues
      const { Identity } = await import("@semaphore-protocol/identity")

      // Generate deterministic Semaphore identity
      const identity = new Identity(signature)

      // Extract identity commitment
      const identityCommitment = identity.commitment.toString()

      const response = await fetch('/api/link-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signature,
          publicAddress: trueWalletAddress,
          linkedinUrl,
          identityCommitment
        })
      })

      const data = await response.json()

      if (data.success) {
        alert("Success! Your profile is now pending manager approval.")
        setLinkedinUrl('')
      } else {
        alert("Error: " + data.error)
      }

    } catch (error) {
      console.error("Signature/Identity failed:", error)
      alert("Failed to submit application.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8 border rounded-lg shadow-sm bg-white mt-6">
      <h2 className="text-xl font-bold black-text">Step 2: Submit Identity Proof</h2>
      
      <div className="w-full max-w-sm flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-700">Public LinkedIn URL</label>
        <input 
          type="url"
          placeholder="https://linkedin.com/in/your-profile"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-black"
          required
        />
        <p className="text-xs text-gray-500">
          This will be publicly visible to managers for manual verification.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full border-t pt-6 mt-2">
        <label className="text-sm font-semibold text-gray-700">Connect Web3 Wallet</label>
        <appkit-button />
        
        {isConnected && (
          <button 
            onClick={handleLinkWallet}
            disabled={isSubmitting}
            className={`px-6 py-2 w-full max-w-sm text-white rounded-md transition font-medium ${
              isSubmitting ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:bg-gray-800"
            }`}
          >
            {isSubmitting ? "Submitting..." : "Sign & Submit for Review"}
          </button>
        )}
      </div>
    </div>
  )
}