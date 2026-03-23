'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract, keccak256 } from 'ethers';
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import EthCrypto from "eth-crypto";

const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const READ_ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id, address creator, bytes32 contentHash, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, uint256 endTime, bool isTallied, bytes32 ballotsHash)",
  "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)" // Added to count live votes!
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
  votesCast?: number; // NEW: Tracks how many encrypted votes exist
}

export default function VotingDashboard() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState<number | null>(null);
  const [timeDrift, setTimeDrift] = useState<number>(0);
  
  // NEW: Track total eligible members in the DAO
  const [totalMembers, setTotalMembers] = useState<number>(1); 

  useEffect(() => {
    const fetchProposals = async () => {
      if (!isConnected || !walletProvider) return;
      try {
        const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
        
        // Fetch Time Drift
        const latestBlock = await ethersProvider.getBlock("latest");
        if (latestBlock) {
          const pcTime = Math.floor(Date.now() / 1000);
          setTimeDrift(latestBlock.timestamp - pcTime);
        }

        // NEW: Fetch Total DAO Members from the Merkle Tree
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
          
          // NEW: Count the EncryptedVoteRecorded logs to see how many people voted!
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
            votesCast: logs.length // Store the total participation
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
  
      const signature = await signer.signMessage("Link my LinkedIn account to this Web3 wallet.");
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
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold">Active Proposals</h1>
        <appkit-button />
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500 font-medium animate-pulse">
          Querying the blockchain for proposals...
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg border">
          No proposals found on the blockchain.
        </div>
      ) : (
        <div className="grid gap-6">
          {proposals.map((p) => {
            const isTimeExpired = getAdjustedNow() >= p.endTime;
            // NEW: Voting closes if time is up OR if 100% of members have voted!
            const is100PercentVoted = p.votesCast === totalMembers;
            const isVotingOpen = (!isTimeExpired && !is100PercentVoted) && !p.isTallied;

            // Calculate progress bar width
            const participationPercent = Math.min(((p.votesCast || 0) / totalMembers) * 100, 100);

            return (
              <div key={p.id} className="bg-neutral-900 p-6 rounded-lg shadow-sm border border-neutral-800 text-white">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-2/3">
                    <h2 className="text-2xl font-bold text-white">
                      {p.title ? p.title : `Proposal #${p.id}`}
                    </h2>
                    <p className="text-sm font-mono text-neutral-400 mt-2">
                      Proposed by: <span className="text-indigo-400">{p.creator.slice(0, 6)}...{p.creator.slice(-4)}</span>
                    </p>
                    <p className="text-xs font-semibold text-neutral-500 mt-1 uppercase tracking-wide">
                      🕒 {isTimeExpired ? "Voting Closed" : getTimeRemaining(p.endTime)}
                    </p>
                    
                    {/* NEW: Live Participation Progress Bar */}
                    <div className="mt-4 mb-2">
                      <div className="flex justify-between text-xs text-neutral-400 mb-1 font-semibold uppercase tracking-wide">
                        <span>Participation</span>
                        <span>{p.votesCast} / {totalMembers} Voted</span>
                      </div>
                      <div className="w-full bg-neutral-800 rounded-full h-2.5">
                        <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${participationPercent}%` }}></div>
                      </div>
                    </div>

                  </div>
                  <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${isVotingOpen ? 'bg-green-900 text-green-300 border border-green-700' : p.isTallied ? 'bg-blue-900 text-blue-300 border border-blue-700' : 'bg-red-900 text-red-300 border border-red-700'}`}>
                    {isVotingOpen ? "Active" : p.isTallied ? "Tallied" : "Closed"}
                  </span>
                </div>
                
                <p className="text-neutral-300 mb-6 bg-neutral-950 p-4 rounded-md border border-neutral-800">
                  {p.description ? p.description : "Loading description from database..."}
                </p>
                
                <div className="flex items-center gap-4 border-t border-neutral-800 pt-6">
                  <div className="flex-1 flex flex-col gap-3">
                    
                    {isVotingOpen ? (
                      <>
                        <button 
                          onClick={() => handleVote(p.id, 'YES')}
                          disabled={isVoting === p.id}
                          className="w-full bg-green-700 text-white py-3 rounded-md font-bold hover:bg-green-600 disabled:opacity-50 transition shadow-lg"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote YES (ZK)"}
                        </button>
                        <button 
                          onClick={() => handleVote(p.id, 'NO')}
                          disabled={isVoting === p.id}
                          className="w-full bg-red-700 text-white py-3 rounded-md font-bold hover:bg-red-600 disabled:opacity-50 transition shadow-lg"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote NO (ZK)"}
                        </button>
                        <button 
                          onClick={() => handleVote(p.id, 'ABSTAIN')}
                          disabled={isVoting === p.id}
                          className="w-full bg-neutral-700 text-white py-3 rounded-md font-bold hover:bg-neutral-600 disabled:opacity-50 transition shadow-lg"
                        >
                          {isVoting === p.id ? "Generating Proof..." : "Vote ABSTAIN (ZK)"}
                        </button>
                      </>
                    ) : !p.isTallied ? (
                      <button 
                        onClick={() => handleFinalize(p.id)}
                        className="w-full bg-blue-600 text-white py-3 rounded-md font-bold hover:bg-blue-500 transition shadow-lg border border-blue-400"
                      >
                        {is100PercentVoted ? "🎯 100% Voted: Finalize Tally Early" : "🔒 Time Expired: Finalize Tally"}
                      </button>
                    ) : (
                      <div className="flex justify-between w-full bg-neutral-950 p-4 rounded-md border border-neutral-800">
                        <div className="text-center w-1/3 border-r border-neutral-800">
                          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Yes</p>
                          <p className="text-2xl font-bold text-green-500">{p.yesVotes}</p>
                        </div>
                        <div className="text-center w-1/3 border-r border-neutral-800">
                          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">No</p>
                          <p className="text-2xl font-bold text-red-500">{p.noVotes}</p>
                        </div>
                        <div className="text-center w-1/3">
                          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Abstain</p>
                          <p className="text-2xl font-bold text-neutral-400">{p.abstainVotes}</p>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}