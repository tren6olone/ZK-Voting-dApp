'use client'

import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract, keccak256, toUtf8Bytes } from 'ethers';
import { motion } from "framer-motion";

const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const PROPOSAL_ABI = [
  "function createProposal(bytes32 _contentHash, bytes calldata _serverTicket) external",
  "event ProposalCreated(uint256 indexed id, address indexed creator, bytes32 contentHash, uint256 endTime)"
];

export default function CreateProposal() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [email, setEmail] = useState(""); 
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !walletProvider || !address) {
      alert("Please connect your Web3 wallet first.");
      return;
    }

    setIsSubmitting(true);

    try {
      // STEP 1: Generate the Gas-Efficient Content Hash
      const rawString = title + "|" + description;
      const contentHash = keccak256(toUtf8Bytes(rawString));

      // STEP 2: Ask the Next.js API for the Cryptographic Ticket
      const ticketResponse = await fetch('/api/generate-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: email,
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

      // STEP 3: Pop up MetaMask to submit the Hash + Ticket to the Blockchain
      alert("Ticket verified! Please confirm the MetaMask transaction to create your proposal on-chain.");

      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, PROPOSAL_ABI, signer);

      const tx = await contract.createProposal(contentHash, ticketData.ticket);

      alert("Transaction submitted! Waiting for the blockchain to mine it...");
      await tx.wait(); 

      alert("SUCCESS! 🚀 Proposal permanently created on the blockchain!");

      setTitle("");
      setDescription("");
      setEmail("");

    } catch (error: unknown) {
      console.error("Proposal creation failed:", error);
      alert("Transaction failed or rejected by contract. Check console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-8 max-w-3xl mx-auto relative z-10"
    >
      {/* Ambient Background Glows */}
      <div className="absolute top-10 left-10 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">
          Submit Proposal
        </h1>
        <p className="text-neutral-400 mt-2 text-sm">
          Cryptographically anchor your idea to the Ethereum blockchain.
        </p>
      </div>

      {/* Form Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-neutral-900/50 backdrop-blur-xl p-8 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-neutral-800 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Email Input */}
          <div>
            <label className="block text-sm font-bold text-neutral-300 mb-2 tracking-wide">
              Registered Email <span className="text-neutral-500 font-normal">(For Verification)</span>
            </label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-inner"
              placeholder="e.g., satoshi@ethereum.org"
            />
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-sm font-bold text-neutral-300 mb-2 tracking-wide">
              Proposal Title
            </label>
            <input 
              type="text" 
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-inner"
              placeholder="e.g., Allocate 5 ETH to Marketing"
            />
          </div>

          {/* Description Input */}
          <div>
            <label className="block text-sm font-bold text-neutral-300 mb-2 tracking-wide">
              Detailed Description
            </label>
            <textarea 
              required
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-600 rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-inner resize-none"
              placeholder="Explain why the DAO should vote for this initiative..."
            />
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={isSubmitting || !isConnected}
            className={`w-full mt-4 py-4 rounded-xl font-bold text-white transition-all transform shadow-lg ${
              isSubmitting || !isConnected
              ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700 shadow-none" 
              : "bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:scale-[1.02] border border-indigo-500/50"
            }`}
          >
            {isSubmitting ? "Generating Ticket & Confirming Tx..." : "Sign & Submit Proposal"}
          </button>
          
          {!isConnected && (
            <p className="text-center text-xs text-red-400 mt-2 font-medium">
              You must connect your Web3 wallet to create a proposal.
            </p>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}