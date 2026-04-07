export type VoteType = 'YES' | 'NO' | 'ABSTAIN';

export interface Proposal {
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
  totalEligibleVoters?: number;
}

export interface ZKProofData {
  nullifierHash: string;
  encryptedVote: string;
  proof: string;
  merkleTreeDepth: number;
}