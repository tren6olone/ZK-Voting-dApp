'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

// 1. PASTE YOUR TWO CONTRACT ADDRESSES HERE
const ZK_VOTING_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const ANONYMOUS_VOTER_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // The one we just deployed!

// 2. The ABIs
const ZK_VOTING_ABI = ["function currentMerkleRoot() view returns (uint256)"];

const VOTE_ABI = [
  "function castVote(bool support, uint256 proposalId, uint256 nullifierHash, uint256[8] calldata proof, uint256 merkleTreeDepth) external"
];

const READ_ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id, address creator, string title, string description, uint256 yesVotes, uint256 noVotes, bool isActive)"
];


interface Proposal {
  id: number;
  creator: string;
  title: string;
  description: string;
  yesVotes: number;
  noVotes: number;
  isActive: boolean;
}

export default function VotingDashboard() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState<number | null>(null);

  useEffect(() => {
    const fetchProposals = async () => {
      if (!isConnected || !walletProvider) return;
      try {
        const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
        const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, READ_ABI, ethersProvider);
        const count = await contract.proposalCount();
        const countNumber = Number(count);
        const fetchedProposals: Proposal[] = [];

        for (let i = 1; i <= countNumber; i++) {
          const p = await contract.proposals(i);
          fetchedProposals.push({
            id: Number(p.id),
            creator: p.creator,
            title: p.title,
            description: p.description,
            yesVotes: Number(p.yesVotes),
            noVotes: Number(p.noVotes),
            isActive: p.isActive
          });
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

  // THE ZK-SNARK VOTING ENGINE
  const handleVote = async (proposalId: number, support: boolean) => {
    if (!isConnected || !walletProvider || !address) return;
    setIsVoting(proposalId);
  
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
  
      // STEP 1: Fetch the ACTUAL root currently on the blockchain
      const zkVotingContract = new Contract(ZK_VOTING_ADDRESS, ZK_VOTING_ABI, ethersProvider);
      const blockchainRoot = await zkVotingContract.currentMerkleRoot();
      
      console.log("Current Blockchain Merkle Root:", blockchainRoot.toString());
      
      if (blockchainRoot.toString() === "0") {
        alert("The blockchain Merkle tree is empty. Please ask the manager to sync the root.");
        setIsVoting(null);
        return;
      }
  
      // STEP 2: Recreate Identity
      const signature = await signer.signMessage("Link my LinkedIn account to this Web3 wallet.");
      const identity = new Identity(signature);
  
      // STEP 3: Fetch commitments and build the group
      const groupRes = await fetch('/api/get-group');
      const groupData = await groupRes.json();
      const group = new Group(groupData.commitments.map((c: string) => BigInt(c)));
  
      // CRITICAL CHECK: Does our local group root match the blockchain root?
      if (group.root.toString() !== blockchainRoot.toString()) {
        console.warn("Local root mismatch! Local:", group.root.toString(), "Chain:", blockchainRoot.toString());
        // We proceed, but the proof might fail if the blockchain is behind Firebase
      }
  
      alert("Generating ZK Proof...");
  
      // STEP 4: Generate Proof
      const voteMessage = support ? BigInt(1) : BigInt(0);
      const scope = BigInt(proposalId);
      const fullProof = await generateProof(identity, group, voteMessage, scope);
  
      // STEP 5: Cast Vote on-chain
      const votingContract = new Contract(ANONYMOUS_VOTER_ADDRESS, VOTE_ABI, signer);
      const tx = await votingContract.castVote(
        support,
        proposalId,
        fullProof.nullifier,
        fullProof.points,
        fullProof.merkleTreeDepth
      );
  
      await tx.wait();
      alert("Vote Recorded Successfully!");
      window.location.reload();
  
    } catch (error: unknown) {
  console.error("Voting failed:", error);

  if (error instanceof Error && error.message.includes("You have already voted")) {
    alert("Double voting detected! The ZK math proves you already voted on this proposal.");
  } else {
    alert("Failed to cast vote. Check console.");
  }
} finally {
      setIsVoting(null);
    }
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
          {proposals.map((p) => (
            <div key={p.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{p.title}</h2>
                  <p className="text-xs font-mono text-gray-500 mt-1">
                    Proposed by: {p.creator.slice(0, 6)}...{p.creator.slice(-4)}
                  </p>
                </div>
                <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {p.isActive ? "Active" : "Closed"}
                </span>
              </div>
              
              <p className="text-gray-700 mb-6">{p.description}</p>
              
              <div className="flex items-center gap-4 border-t pt-4">
                <div className="flex-1 bg-gray-100 rounded-md p-3 text-center">
                  <span className="block text-sm text-gray-500 font-bold uppercase">Yes Votes</span>
                  <span className="block text-2xl font-bold text-green-600">{p.yesVotes}</span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-md p-3 text-center">
                  <span className="block text-sm text-gray-500 font-bold uppercase">No Votes</span>
                  <span className="block text-2xl font-bold text-red-600">{p.noVotes}</span>
                </div>
                
                <div className="flex-1 flex flex-col gap-2">
                  <button 
                    onClick={() => handleVote(p.id, true)}
                    disabled={isVoting === p.id || !p.isActive}
                    className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {isVoting === p.id ? "Generating Proof..." : "Vote YES (ZK)"}
                  </button>
                  <button 
                    onClick={() => handleVote(p.id, false)}
                    disabled={isVoting === p.id || !p.isActive}
                    className="w-full bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {isVoting === p.id ? "Generating Proof..." : "Vote NO (ZK)"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}