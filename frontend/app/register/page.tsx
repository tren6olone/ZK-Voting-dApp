'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { BrowserProvider, Eip1193Provider } from 'ethers'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image';


export default function RegisterDAO() {
  const { data: session, status } = useSession()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  // URL Redirect Logic
  const [countdown, setCountdown] = useState(5)
  const [redirectTriggered, setRedirectTriggered] = useState(false)
  
  // @ts-expect-error - reading the custom provider we added
    const authProvider = session?.provider; 
    
    const isGoogle = authProvider === 'google';
    const isLinkedIn = authProvider === 'linkedin';
  
  useEffect(() => {
    if (isLinkedIn && !redirectTriggered && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isLinkedIn && !redirectTriggered && countdown === 0) {
      window.open('https://www.linkedin.com/in/', '_blank');
      setRedirectTriggered(true);
    }
  }, [isLinkedIn, countdown, redirectTriggered]);

  const validateLinkedInUrl = (url: string) => {
    setLinkedinUrl(url);
    if (!url.includes('linkedin.com/in/')) {
        setUrlError('Must be a valid LinkedIn profile URL.');
        return;
    }
    // Name validation (basic subset check)
    const nameParts = session?.user?.name?.toLowerCase().split(' ') || [];
    const urlLower = url.toLowerCase();
    const hasNameMatch = nameParts.some(part => part.length > 2 && urlLower.includes(part));
    
    if (!hasNameMatch) {
        setUrlError(`URL doesn't seem to match your name (${session?.user?.name}). Please verify.`);
    } else {
        setUrlError('');
    }
  };

  const handleLinkWallet = async () => {
    if (!isConnected || !walletProvider) return
    if (isLinkedIn && urlError) {
      alert("Please provide a valid matching LinkedIn URL.");
      return;
    }
    
    setIsSubmitting(true)

    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider)
      const signer = await ethersProvider.getSigner()
      const trueWalletAddress = await signer.getAddress()

      const message = "Associating this social account to this Web3 wallet."
      const signature = await signer.signMessage(message)

      const { Identity } = await import("@semaphore-protocol/identity")
      const identity = new Identity(signature)
      const identityCommitment = identity.commitment.toString()

      const response = await fetch('/api/link-wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            signature,
            publicAddress: trueWalletAddress,
            linkedinUrl: isLinkedIn ? linkedinUrl : "",
            identityCommitment,
            profileImage: session?.user?.image || "",
            // NEW: Send the exact provider to the backend
            authProvider: isGoogle ? "Google" : "LinkedIn" 
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
            Your Web3 wallet and identity have been cryptographically linked. Please wait for a Governance Manager to approve your entry.
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
          
          {/* STEP 1: AUTH */}
          <motion.div variants={stepVariants} initial="hidden" animate="visible" className={`relative p-6 rounded-2xl border transition-all ${session ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-neutral-950 border-neutral-800'}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${session ? 'bg-indigo-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>1</span>
                  Verify Identity
                </h3>
                <p className="text-sm text-neutral-400 mt-1 ml-8">Authenticate using a social provider.</p>
              </div>
              {session ? (
                <div className="flex items-center gap-3">
                  {session.user?.image && <Image src={session.user.image} alt="Avatar" width={32} height={32} className="w-8 h-8 rounded-full border border-indigo-500/30 object-cover" />}
                  <span className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-xs font-bold border border-indigo-500/30">
                    ✓ Verified: {session.user?.name}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => signIn('linkedin')} disabled={status === "loading"} className="bg-[#0A66C2] hover:bg-[#004182] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg">
                    LinkedIn
                  </button>
                  <button onClick={() => signIn('google')} disabled={status === "loading"} className="bg-white hover:bg-gray-200 text-neutral-900 px-4 py-2 rounded-lg text-sm font-bold shadow-lg">
                    Google
                  </button>
                </div>
              )}
            </div>
          </motion.div>

          {/* STEP 1.5: LINKEDIN URL CAPTURE */}
          <AnimatePresence>
            {isLinkedIn && (
              <motion.div variants={stepVariants} initial="hidden" animate="visible" className="relative p-6 rounded-2xl bg-neutral-950 border border-blue-500/20">
                <h3 className="text-md font-bold text-white mb-2">LinkedIn Verification</h3>
                <p className="text-sm text-neutral-400 mb-4">
                  For manager verification, please provide your profile URL. <br/>
                  {countdown > 0 ? (
                    <span className="text-blue-400 font-bold">Opening your profile in {countdown}s...</span>
                  ) : (
                    <a href="https://www.linkedin.com/in/" target="_blank" className="text-blue-400 underline">Open LinkedIn manually</a>
                  )}
                </p>
                
                {/* Visual mockup of what to copy */}
                <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-700 mb-4 font-mono text-xs text-neutral-500">
                  <span className="text-neutral-400">Copy this URL:</span> https://www.linkedin.com/in/<span className="text-white font-bold bg-blue-500/20 px-1 rounded">your-name-123</span>
                </div>

                <input 
                  type="url"
                  placeholder="Paste your URL here..."
                  value={linkedinUrl}
                  onChange={(e) => validateLinkedInUrl(e.target.value)}
                  className={`w-full bg-neutral-900 border text-white placeholder-neutral-600 rounded-lg p-3 focus:outline-none transition-all ${urlError ? 'border-red-500' : 'border-neutral-800 focus:border-blue-500'}`}
                  required
                />
                {urlError && <p className="text-xs text-red-400 mt-2 font-semibold">{urlError}</p>}
              </motion.div>
            )}
          </AnimatePresence>
          
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
                    <p className="text-sm text-neutral-400 mt-1 ml-8">Link your Web3 wallet for voting.</p>
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
                  <button 
                    onClick={handleLinkWallet}
                    disabled={isSubmitting || (isLinkedIn && !!urlError)}
                    className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg transform hover:scale-[1.02] ${
                      isSubmitting || (isLinkedIn && !!urlError)
                      ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700 shadow-none" 
                      : "bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/50"
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