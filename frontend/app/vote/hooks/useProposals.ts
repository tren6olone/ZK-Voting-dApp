import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';
import { Proposal } from "../types";

const PROPOSAL_CONTRACT_ADDRESS = "0x890c4696889172E6A8895390489F0b7f6cA51128";
const READ_ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id, address creator, bytes32 contentHash, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, uint256 endTime, bool isTallied, bytes32 ballotsHash)",
  "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)" 
];

export function useProposals(isConnected: boolean, walletProvider: Eip1193Provider | undefined) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeDrift, setTimeDrift] = useState(0);
  const [totalMembers, setTotalMembers] = useState(1);

  const fetchProposals = useCallback(async () => {
    if (!isConnected || !walletProvider) return;
    setIsLoading(true);
    try {
      const ethersProvider = new BrowserProvider(walletProvider);
      
      // Sync Time
      const latestBlock = await ethersProvider.getBlock("latest");
      if (latestBlock) setTimeDrift(latestBlock.timestamp - Math.floor(Date.now() / 1000));

      // Fetch Group Size
      const groupRes = await fetch('/api/get-group');
      const { commitments } = await groupRes.json();
      setTotalMembers(commitments.length || 1);

      // Fetch Blockchain Proposals
      const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, READ_ABI, ethersProvider);
      const count = Number(await contract.proposalCount());
      const fetchedProposals: Proposal[] = [];
      const hashes: string[] = [];

      for (let i = 1; i <= count; i++) {
        const p = await contract.proposals(i);
        const logs = await contract.queryFilter(contract.filters.EncryptedVoteRecorded(i));
        
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
        hashes.push(p.contentHash);
      }

      // Enrich with Metadata
      if (hashes.length > 0) {
          // THE FIX: Restored the actual POST request configuration!
          const metaRes = await fetch('/api/proposals-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes })
          });
          
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            if (metaData.success) {
              fetchedProposals.forEach(p => {
                p.title = metaData.metadata[p.contentHash]?.title;
                p.description = metaData.metadata[p.contentHash]?.description;
                p.totalEligibleVoters = metaData.metadata[p.contentHash]?.totalEligibleVoters; 
              });
            }
          }
        }
      setProposals(fetchedProposals.reverse());
    } catch (e) {
      console.error("Failed to load proposals:", e);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, walletProvider]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  return { proposals, isLoading, timeDrift, totalMembers, refresh: fetchProposals };
}