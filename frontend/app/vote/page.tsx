'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract, keccak256 } from 'ethers';
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import EthCrypto from "eth-crypto";
import { motion, useMotionValue, useTransform, animate, Variants } from "framer-motion";

const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const READ_ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id, address creator, bytes32 contentHash, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, uint256 endTime, bool isTallied, bytes32 ballotsHash)",
  "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)" 
];

interface Proposal {
  id: number;
  creator: string;
  contentHash: string;
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  endTime: number;
  isTallied: boolean;
  title?: string;
  description?: string;
  votesCast?: number; 
}

// --- NEW: Animated Number Counter Component ---
function AnimatedCounter({ to }: { to: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));

  useEffect(() => {
    const controls = animate(count, to, { duration: 1.5, ease: "easeOut" });
    return controls.stop;
  }, [count, to]);

  return <motion.span>{rounded}</motion.span>;
}

// --- ANIMATION VARIANTS ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring", stiffness: 70, damping: 15 }
  }
};

export default function VotingDashboard() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState<number | null>(null);
  const [timeDrift, setTimeDrift] = useState<number>(0);
  
  const [totalMembers, setTotalMembers] = useState<number>(1); 

  useEffect(() => {
    const fetchProposals = async () => {
      if (!isConnected || !walletProvider) return;
      try {
        const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
        
        const latestBlock = await ethersProvider.getBlock("latest");
        if (latestBlock) {
          const pcTime = Math.floor(Date.now() / 1000);
          setTimeDrift(latestBlock.timestamp - pcTime);
        }

        const groupRes = await fetch('/api/get-group');
        const { commitments } = await groupRes.json();
        setTotalMembers(commitments.length > 0 ? commitments.length : 1);

        const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, READ_ABI, ethersProvider);
        const count = await contract.proposalCount();
        const countNumber = Number(count);
        const fetchedProposals: Proposal[] = [];
        const hashesToFetch: string[] = [];
        
        for (let i = 1; i <= countNumber; i++) {
          const p = await contract.proposals(i);
          
          const filter = contract.filters.EncryptedVoteRecorded(i);
          const logs = await contract.queryFilter(filter);

          fetchedProposals.push({
            id: Number(p.id),
            creator: p.creator,
            contentHash: p.contentHash,
            yesVotes: Number(p.yesVotes),
            noVotes: Number(p.noVotes),
            abstainVotes: Number(p.abstainVotes),
            endTime: Number(p.endTime),
            isTallied: p.isTallied,
            votesCast: logs.length 
          });
          hashesToFetch.push(p.contentHash);
        }

        if (hashesToFetch.length > 0) {
          const metaRes = await fetch('/api/proposals-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes: hashesToFetch })
          });
          const metaData = await metaRes.json();

          if (metaData.success) {
            fetchedProposals.forEach(p => {
              const firebaseDoc = metaData.metadata[p.contentHash];
              if (firebaseDoc) {
                p.title = firebaseDoc.title;
                p.description = firebaseDoc.description;
              }
            });
          }
        }

        setProposals(fetchedProposals.reverse());
      } catch (error) {
        console.error("Failed to fetch proposals:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProposals();
  }, [isConnected, walletProvider]);
  
  const handleVote = async (proposalId: number, voteType: 'YES' | 'NO' | 'ABSTAIN') => {
    if (!isConnected || !walletProvider || !address) return;
    setIsVoting(proposalId);
  
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
  
      const signature = await signer.signMessage("Associating this social account to this Web3 wallet.");
      const identity = new Identity(signature);
  
      const groupRes = await fetch('/api/get-group');
      const { commitments } = await groupRes.json();
      const group = new Group(commitments.map((c: string) => BigInt(c)));
  
      const ORACLE_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
      const ORACLE_PUBLIC_KEY = EthCrypto.publicKeyByPrivateKey(ORACLE_PRIVATE_KEY);
  
      const encryptedObject = await EthCrypto.encryptWithPublicKey(ORACLE_PUBLIC_KEY, voteType);
      
      const rawHex = EthCrypto.cipher.stringify(encryptedObject);
      const encryptedVoteHex = rawHex.startsWith('0x') ? rawHex : `0x${rawHex}`;
      
      const payloadHash = keccak256(encryptedVoteHex);
      const signalHash = BigInt(payloadHash); 
  
      const fullProof = await generateProof(identity, group, signalHash, BigInt(proposalId));
  
      alert("Proof Generated! Sending to Relayer for Gasless Submission...");
  
      const response = await fetch('/api/relayer-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId,
          nullifierHash: fullProof.nullifier.toString(),
          encryptedVote: encryptedVoteHex, 
          proof: fullProof.points,
          merkleTreeDepth: fullProof.merkleTreeDepth
        })
      });
  
      const result = await response.json();
  
      if (result.success) {
        alert(`Success! Relayer paid for your vote. TX: ${result.txHash}`);
        window.location.reload();
      } else {
        throw new Error(result.error);
      }
  
    } catch (error: unknown) {
      console.error("Voting failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
      
      if (errObj.code === 'ACTION_REJECTED' || errorMessage.includes('User rejected')) {
        alert("Signature cancelled. You must sign the message to generate your ZK Identity.");
        return;
      }
      if (errorMessage.includes("already used") || errorMessage.includes("Proof already used")) {
        alert("✋ Double Vote Prevented: The Zero-Knowledge contract proves you have already voted on this proposal.");
      } else if (errorMessage.includes("index '-1'") || errorMessage.includes("does not exist in this tree")) {
        alert("🚫 Access Denied: Your wallet's ZK Identity was not found in the approved Merkle Tree. You must be a verified member to vote.");
      } else {
        alert(`Failed to cast vote: ${errorMessage}`);
      }
    } finally {
      setIsVoting(null);
    }
  };

  const handleFinalize = async (proposalId: number) => {
    try {
      alert("Triggering the Tally Server to decrypt and count votes...");
      const response = await fetch('/api/finalize-tally', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId })
      });
      const data = await response.json();

      if (data.success) {
        alert(`Tally Complete!\nYes: ${data.results.yesVotes}\nNo: ${data.results.noVotes}\nAbstain: ${data.results.abstainVotes}\nTX: ${data.txHash}`);
        window.location.reload();
      } else {
        alert("Failed to finalize: " + data.error);
      }
    } catch (error) {
      console.error("Finalize error:", error);
      alert("Failed to trigger the Oracle. Check console.");
    }
  };
  
  const getAdjustedNow = () => Math.floor(Date.now() / 1000) + timeDrift;

  const getTimeRemaining = (endTimeUnix: number) => {
    const diff = endTimeUnix - getAdjustedNow();
    if (diff <= 0) return "Voting Closed";
    
    const days = Math.floor(diff / (3600 * 24));
    const hours = Math.floor((diff % (3600 * 24)) / 3600);
    return `${days}d ${hours}h remaining`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-8 max-w-5xl mx-auto relative z-10"
    >
      {/* Ambient Background Glows */}
      <div className="absolute top-0 right-10 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">
            Active Proposals
          </h1>
          <p className="text-neutral-400 mt-2 text-sm">
            Cast your gasless, zero-knowledge votes below.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <div className="text-neutral-400 font-medium animate-pulse tracking-wide">Syncing Blockchain Data...</div>
        </div>
      ) : proposals.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center py-16 text-neutral-400 bg-neutral-900/30 backdrop-blur-md rounded-2xl border border-white/5"
        >
          No proposals found on the blockchain.
        </motion.div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-8"
        >
          {proposals.map((p) => {
            const isTimeExpired = getAdjustedNow() >= p.endTime;
            const is100PercentVoted = p.votesCast === totalMembers;
            const isVotingOpen = (!isTimeExpired && !is100PercentVoted) && !p.isTallied;

            const participationPercent = Math.min(((p.votesCast || 0) / totalMembers) * 100, 100);

            return (
              <motion.div 
                variants={cardVariants}
                key={p.id} 
                className="bg-neutral-900/60 backdrop-blur-xl p-8 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.3)] border border-neutral-800 text-white relative overflow-hidden"
              >
                {/* Proposal Top Accent Line */}
                <div className={`absolute top-0 left-0 w-full h-1 ${isVotingOpen ? 'bg-gradient-to-r from-green-500 to-emerald-400' : p.isTallied ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gradient-to-r from-red-500 to-rose-500'}`} />

                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                  <div className="w-full md:w-2/3">
                    <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
                      {p.title ? p.title : `Proposal #${p.id}`}
                    </h2>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-xs font-mono bg-neutral-800 text-neutral-300 px-2 py-1 rounded-md border border-neutral-700">
                        By: <span className="text-indigo-400">{p.creator.slice(0, 6)}...{p.creator.slice(-4)}</span>
                      </span>
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                        <svg className="w-3 h-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        {isTimeExpired ? "Voting Closed" : getTimeRemaining(p.endTime)}
                      </span>
                    </div>
                    
                    {/* Animated Progress Bar */}
                    <div className="mt-6 mb-2 pr-4">
                      <div className="flex justify-between text-xs text-neutral-400 mb-2 font-bold uppercase tracking-widest">
                        <span>Participation</span>
                        <span className="text-indigo-300">{p.votesCast} / {totalMembers} Voted</span>
                      </div>
                      <div className="w-full bg-neutral-950 rounded-full h-3 border border-neutral-800 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${participationPercent}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className={`h-full rounded-full relative ${p.isTallied ? 'bg-indigo-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                        >
                          {/* Inner glowing pulse for active voting */}
                          {!p.isTallied && (
                            <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30 rounded-full animate-pulse" />
                          )}
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  <span className={`px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest rounded-full border shadow-lg ${isVotingOpen ? 'bg-green-500/10 text-green-400 border-green-500/30 shadow-green-500/10' : p.isTallied ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-blue-500/10' : 'bg-red-500/10 text-red-400 border-red-500/30 shadow-red-500/10'}`}>
                    {isVotingOpen ? "● Active" : p.isTallied ? "Tallied" : "Closed"}
                  </span>
                </div>
                
                <div className="text-neutral-300 mb-8 bg-neutral-950/50 p-5 rounded-xl border border-neutral-800 leading-relaxed">
                  {p.description ? p.description : "Loading description from database..."}
                </div>
                
                <div className="border-t border-white/5 pt-8 mt-2">
                  <div className="flex-1 flex flex-col md:flex-row gap-4">
                    
                    {isVotingOpen ? (
                      <>
                        <motion.button 
                          whileHover={{ scale: isVoting === p.id ? 1 : 1.02 }}
                          whileTap={{ scale: isVoting === p.id ? 1 : 0.98 }}
                          onClick={() => handleVote(p.id, 'YES')}
                          disabled={isVoting === p.id}
                          className="w-full flex-1 bg-green-600/20 text-green-400 border border-green-500/30 py-3.5 rounded-xl font-bold hover:bg-green-600 hover:text-white disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(34,197,94,0.1)]"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote YES (ZK)"}
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: isVoting === p.id ? 1 : 1.02 }}
                          whileTap={{ scale: isVoting === p.id ? 1 : 0.98 }}
                          onClick={() => handleVote(p.id, 'NO')}
                          disabled={isVoting === p.id}
                          className="w-full flex-1 bg-red-600/20 text-red-400 border border-red-500/30 py-3.5 rounded-xl font-bold hover:bg-red-600 hover:text-white disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote NO (ZK)"}
                        </motion.button>
                        <motion.button 
                          whileHover={{ scale: isVoting === p.id ? 1 : 1.02 }}
                          whileTap={{ scale: isVoting === p.id ? 1 : 0.98 }}
                          onClick={() => handleVote(p.id, 'ABSTAIN')}
                          disabled={isVoting === p.id}
                          className="w-full flex-1 bg-neutral-600/20 text-neutral-300 border border-neutral-500/30 py-3.5 rounded-xl font-bold hover:bg-neutral-600 hover:text-white disabled:opacity-50 transition-all"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote ABSTAIN"}
                        </motion.button>
                      </>
                    ) : !p.isTallied ? (
                      <motion.button 
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleFinalize(p.id)}
                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/50"
                      >
                        {is100PercentVoted ? "🎯 100% Voted: Finalize Tally Early" : "🔒 Time Expired: Finalize Tally (Oracle)"}
                      </motion.button>
                    ) : (
                      // ANIMATED TALLIED RESULTS
                      <div className="flex justify-between w-full bg-neutral-950 p-6 rounded-xl border border-neutral-800 shadow-inner">
                        <div className="text-center w-1/3 border-r border-neutral-800">
                          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Yes</p>
                          <p className="text-4xl font-extrabold text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.4)]">
                            <AnimatedCounter to={p.yesVotes} />
                          </p>
                        </div>
                        <div className="text-center w-1/3 border-r border-neutral-800">
                          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">No</p>
                          <p className="text-4xl font-extrabold text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.4)]">
                            <AnimatedCounter to={p.noVotes} />
                          </p>
                        </div>
                        <div className="text-center w-1/3">
                          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Abstain</p>
                          <p className="text-4xl font-extrabold text-neutral-300">
                            <AnimatedCounter to={p.abstainVotes} />
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}