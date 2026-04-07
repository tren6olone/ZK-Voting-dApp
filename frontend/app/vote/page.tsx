'use client'
import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider } from 'ethers';
import { useProposals } from "./hooks/useProposals";
import { generateZKVoteProof } from "./services/zk.service";
import { submitVoteToRelayer, finalizeProposalTally } from "./services/vote.service";
import { ProposalCard } from "./components/ProposalCard";
import { VoteType } from "./types";
import { motion } from "framer-motion";

interface TallyResults {
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
}

export default function VotingDashboard() {
  const { isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  const { proposals, isLoading, timeDrift, totalMembers } = useProposals(isConnected, walletProvider as Eip1193Provider);
  
  const [votingId, setVotingId] = useState<number | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<number | null>(null);

  const handleVote = async (id: number, type: VoteType) => {
    if (!walletProvider) return;
    setVotingId(id);
    try {
      const provider = new BrowserProvider(walletProvider as Eip1193Provider);
      const zkData = await generateZKVoteProof(await provider.getSigner(), id, type);
      const result = await submitVoteToRelayer(id, zkData);
      
      if (result.success) {
        alert(`Success! Relayer paid for your vote. TX: ${result.txHash}`);
        window.location.reload();
      }
    } catch (error: unknown) {
      console.error("Voting failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
      
      // RESTORED: Precise Error Handling
      if (errObj.code === 'ACTION_REJECTED' || errorMessage.includes('User rejected')) {
        alert("Signature cancelled. You must sign the message to generate your ZK Identity.");
      } else if (errorMessage.includes("already used") || errorMessage.includes("Proof already used")) {
        alert("✋ Double Vote Prevented: The Zero-Knowledge contract proves you have already voted on this proposal.");
      } else if (errorMessage.includes("index '-1'") || errorMessage.includes("does not exist in this tree")) {
        alert("🚫 Access Denied: Your wallet's ZK Identity was not found in the approved Merkle Tree. You must be a verified member to vote.");
      } else {
        alert(`Failed to cast vote: ${errorMessage}`);
      }
    } finally {
      setVotingId(null);
    }
  };

 const handleFinalize = async (id: number): Promise<TallyResults | null> => {
     setIsFinalizing(id);
     try {
       const res = await finalizeProposalTally(id, totalMembers);
       
       // If the backend returns success AND has the results object
       if (res.success && res.results) {
         // Force them into clean JavaScript numbers
         return {
           yesVotes: Number(res.results.yesVotes) || 0,
           noVotes: Number(res.results.noVotes) || 0,
           abstainVotes: Number(res.results.abstainVotes) || 0
         };
       } else {
         console.error("Oracle Error or missing results:", res.error);
         return null; // Force it to show the Retry button if data is missing
       }
     } catch (e: unknown) {
       console.error("Failed to trigger tally:", e);
       return null;
     } finally {
       setIsFinalizing(null);
     }
   };
  
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-5xl mx-auto relative z-10">
      <div className="absolute top-0 right-10 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      <div className="mb-10 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">Active Proposals</h1>
        <p className="text-neutral-400 mt-2 text-sm">Cast your gasless, zero-knowledge votes below.</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <div className="text-neutral-400 font-medium animate-pulse tracking-wide">Syncing Blockchain Data...</div>
        </div>
      ) : proposals.length === 0 ? (
        // RESTORED: Empty State
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16 text-neutral-400 bg-neutral-900/30 backdrop-blur-md rounded-2xl border border-white/5">
          No proposals found on the blockchain.
        </motion.div>
      ) : (
        <div className="grid gap-8">
          {proposals.map(p => (
            <ProposalCard 
              key={p.id}
              proposal={p}
              totalMembers={totalMembers}
              currentTime={Math.floor(Date.now() / 1000) + timeDrift}
              onVote={handleVote}
              onFinalize={handleFinalize}
              isVoting={votingId === p.id}
              isFinalizing={isFinalizing === p.id}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}