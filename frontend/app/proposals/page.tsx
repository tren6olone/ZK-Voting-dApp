'use client'

import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract, keccak256, toUtf8Bytes } from 'ethers';
import { motion, AnimatePresence } from "framer-motion";

const PROPOSAL_CONTRACT_ADDRESS = "0x890c4696889172E6A8895390489F0b7f6cA51128";

const PROPOSAL_ABI = [
  "function createProposal(bytes32 _contentHash, bytes calldata _serverTicket) external",
  "event ProposalCreated(uint256 indexed id, address indexed creator, bytes32 contentHash, uint256 endTime)"
];

export default function CreateProposal() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  // New Auth States
  const [hasAccess, setHasAccess] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Form States (No more email!)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

// --- STEP 1: THE EIP-712 SIGNATURE GATE ---
  const handleUnlockAccess = async () => {
    if (!isConnected || !walletProvider || !address) {
      alert("Please connect your Web3 wallet first.");
      return;
    }

    setIsUnlocking(true);
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const network = await ethersProvider.getNetwork();
      
      // We use the exact same Domain structure as your smart contract
      const domain = { 
        name: "ZKVoting", 
        version: "1", 
        chainId: network.chainId, 
        verifyingContract: PROPOSAL_CONTRACT_ADDRESS // Use the local proposal contract address
      };
      
      // Define a strict, structural login type
      const types = { 
        WorkspaceLogin: [ 
          { name: "action", type: "string" }, 
          { name: "timestamp", type: "uint256" } 
        ] 
      };
      
      const timestamp = Date.now();
      const value = { action: "Authenticate", timestamp: timestamp };
      
      // Prompt MetaMask for a beautiful, structured EIP-712 gasless signature
      const signature = await signer.signTypedData(domain, types, value);

      const res = await fetch('/api/verify-proposal-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address, 
          timestamp, 
          signature, 
          chainId: Number(network.chainId) 
        })
      });

      const data = await res.json();

      if (data.success) {
        setHasAccess(true); 
      } else {
        throw new Error(data.error || "Server denied access.");
      }
    } catch (error: unknown) {
      console.error("Authentication failed:", error);
      alert("Verification failed. You must sign the structured message to access the workspace.");
    } finally {
      setIsUnlocking(false);
    }
  };

  // --- STEP 2: SUBMIT THE ACTUAL PROPOSAL ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletProvider || !address) return;
    setIsSubmitting(true);

    try {
      const rawString = title + "|" + description;
      const contentHash = keccak256(toUtf8Bytes(rawString));

      // Note: Make sure your /api/generate-ticket no longer requires an 'email' field!
      const ticketResponse = await fetch('/api/generate-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: address,
          title: title,              
          description: description,  
          contentHash: contentHash   
        })
      });

      const ticketData = await ticketResponse.json();

      if (!ticketData.success) {
        alert("API Error: " + ticketData.error);
        setIsSubmitting(false);
        return;
      }

      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, PROPOSAL_ABI, signer);

      alert("Ticket verified! Please confirm the gas transaction to anchor your proposal.");
      const tx = await contract.createProposal(contentHash, ticketData.ticket);

      await tx.wait(); 

      alert("SUCCESS! 🚀 Proposal permanently created on the blockchain!");
      setTitle("");
      setDescription("");
      setHasAccess(false); // Lock the workspace again after success

    } catch (error: unknown) {
      console.error("Proposal creation failed:", error);
      alert("Transaction failed. Check console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-[80vh] flex flex-col items-center justify-center p-8 relative z-10">
      
      {/* Deep Web3 Ambient Glows */}
      <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -z-10 pointer-events-none mix-blend-screen" />
      <div className="fixed bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] -z-10 pointer-events-none mix-blend-screen" />

      <div className="max-w-3xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-200 to-indigo-500 tracking-tighter mb-4">
            Governance Workspace
          </h1>
          <p className="text-neutral-400 font-medium tracking-wide">
            Cryptographically anchor your initiatives to the Ethereum blockchain.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!hasAccess ? (
            /* --- LOCKED STATE: THE SIGNATURE GATE --- */
            <motion.div 
              key="gate"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              className="bg-[#0a0a0e]/80 backdrop-blur-2xl p-10 rounded-3xl border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center relative overflow-hidden flex flex-col items-center"
            >
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">Editor Locked</h2>
              <p className="text-neutral-500 text-sm mb-8 max-w-md">
                DAO proposals require cryptographic authentication. Please sign a gasless message to prove ownership of your wallet.
              </p>

              <button 
                onClick={handleUnlockAccess}
                disabled={isUnlocking || !isConnected}
                className="relative group overflow-hidden rounded-xl bg-indigo-600 px-8 py-4 font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] disabled:opacity-50 disabled:hover:scale-100"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center gap-2">
                  {isUnlocking ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Awaiting Signature...
                    </>
                  ) : (
                    "Sign to Unlock Workspace"
                  )}
                </span>
              </button>
            </motion.div>

          ) : (
            /* --- UNLOCKED STATE: THE PROPOSAL EDITOR --- */
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="bg-[#0a0a0e]/90 backdrop-blur-2xl p-8 md:p-10 rounded-3xl border border-indigo-500/20 shadow-[0_0_50px_rgba(79,70,229,0.15)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%] animate-gradient" />
              
              <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                <h2 className="text-2xl font-bold text-white">Draft Proposal</h2>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-mono">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Authenticated: {address?.slice(0,6)}...{address?.slice(-4)}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Proposal Title</label>
                  <input 
                    type="text" 
                    required maxLength={100}
                    value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-white text-lg rounded-xl p-4 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-neutral-700"
                    placeholder="e.g., AIP-14: Allocate 5 ETH to Core Marketing"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Detailed Specification</label>
                  <textarea 
                    required rows={8}
                    value={description} onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-white rounded-xl p-4 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-neutral-700 resize-none font-mono text-sm leading-relaxed"
                    placeholder="## Summary&#10;Explain the core initiative...&#10;&#10;## Motivation&#10;Why is this necessary?&#10;&#10;## Execution&#10;Step 1..."
                  />
                </div>

                <div className="pt-4 flex items-center gap-4">
                  <button type="button" onClick={() => setHasAccess(false)} className="px-6 py-4 rounded-xl text-neutral-400 hover:text-white font-bold transition-colors">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 py-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50"
                  >
                    {isSubmitting ? "Generating Proof & Executing Tx..." : "Deploy Proposal On-Chain"}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}