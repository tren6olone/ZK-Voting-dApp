'use client'
import Link from 'next/link'
import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { BrowserProvider, Eip1193Provider } from 'ethers'
import { motion, AnimatePresence } from 'framer-motion'

export default function RegisterDAO() {
  const { data: session, status } = useSession()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleLinkWallet = async () => {
    if (!isConnected || !walletProvider) return
    
    if (!linkedinUrl.includes("linkedin.com/in/")) {
      alert("Please enter a valid LinkedIn Profile URL (e.g., https://linkedin.com/in/username)")
      return
    }
    
    setIsSubmitting(true)

    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider)
      const signer = await ethersProvider.getSigner()
      const trueWalletAddress = await signer.getAddress()

      const message = "Link my LinkedIn account to this Web3 wallet."
      const signature = await signer.signMessage(message)

      // Dynamically import Identity to avoid Next.js SSR crypto bundling issues
      const { Identity } = await import("@semaphore-protocol/identity")
      const identity = new Identity(signature)
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
        setIsSuccess(true)
      } else {
        alert("Error: " + data.error)
      }
    } catch (error: unknown) {
      console.error("Signature/Identity failed:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to submit application."
      if (!errorMessage.includes('User rejected')) {
        alert(errorMessage)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Animation variants for the steps
  const stepVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } }
  }

  if (isSuccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-neutral-900/60 backdrop-blur-xl p-10 rounded-2xl border border-emerald-500/30 text-center max-w-lg shadow-[0_0_50px_rgba(52,211,153,0.15)]"
        >
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Application Submitted!</h2>
          <p className="text-neutral-400 mb-8 leading-relaxed">
            Your Web3 wallet and LinkedIn identity have been cryptographically linked. Please wait for a Governance Manager to approve your entry into the DAO.
          </p>
          <Link href="/" className="inline-block px-8 py-3 rounded-xl font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
            Return to Homepage
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="p-8 max-w-2xl mx-auto relative z-10 mt-10"
    >
      {/* Ambient Background Glows */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">
          Join the DAO
        </h1>
        <p className="text-neutral-400 mt-3 text-sm">
          Complete the steps below to securely link your professional identity to your Web3 wallet.
        </p>
      </div>

      <div className="bg-neutral-900/50 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-neutral-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <div className="space-y-8">
          
          {/* STEP 1: LINKEDIN */}
          <motion.div variants={stepVariants} initial="hidden" animate="visible" className={`relative p-6 rounded-2xl border transition-all ${session ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-neutral-950 border-neutral-800'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${session ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>1</span>
                  Verify Identity
                </h3>
                <p className="text-sm text-neutral-400 mt-1 ml-8">Authenticate using your LinkedIn account.</p>
              </div>
              {session ? (
                <span className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-xs font-bold border border-indigo-500/30 flex items-center gap-1">
                  ✓ Verified: {session.user?.name}
                </span>
              ) : (
                <button 
                  onClick={() => signIn('linkedin')}
                  disabled={status === "loading"}
                  className="bg-[#0A66C2] hover:bg-[#004182] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-lg"
                >
                  {status === "loading" ? "Loading..." : "Connect LinkedIn"}
                </button>
              )}
            </div>
          </motion.div>

          {/* STEP 2: WEB3 WALLET */}
          <AnimatePresence>
            {session && (
              <motion.div variants={stepVariants} initial="hidden" animate="visible" className={`relative p-6 rounded-2xl border transition-all ${isConnected ? 'bg-purple-500/5 border-purple-500/20' : 'bg-neutral-950 border-neutral-800'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${isConnected ? 'bg-purple-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>2</span>
                      Connect Wallet
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1 ml-8">Link your Web3 wallet for gasless voting.</p>
                  </div>
                  <div>
                    <appkit-button />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STEP 3: SUBMIT APPLICATION */}
          <AnimatePresence>
            {session && isConnected && (
              <motion.div variants={stepVariants} initial="hidden" animate="visible" className="relative p-6 rounded-2xl bg-neutral-950 border border-neutral-800">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs bg-emerald-500 text-white">3</span>
                  Finalize Application
                </h3>
                
                <div className="ml-8 space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-neutral-300 mb-2 tracking-wide">Public LinkedIn URL</label>
                    <input 
                      type="url"
                      placeholder="https://linkedin.com/in/your-profile"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-600 rounded-lg p-3.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-inner"
                      required
                    />
                    <p className="text-xs text-neutral-500 mt-2">
                      This helps managers manually verify your identity before adding you to the Merkle Tree.
                    </p>
                  </div>

                  <button 
                    onClick={handleLinkWallet}
                    disabled={isSubmitting || !linkedinUrl}
                    className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg transform ${
                      isSubmitting || !linkedinUrl
                      ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700 shadow-none" 
                      : "bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.02] shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/50"
                    }`}
                  >
                    {isSubmitting ? "Generating ZK Identity & Signing..." : "Sign & Submit Application"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </motion.div>
  )
}