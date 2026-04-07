// app/hooks/useDaoCore.ts
import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';

export const CONTRACT_ADDRESS = "0xa5713A2a775bbA91C942487C686C5546a459F3e4"; 
export const MINIMAL_ABI = [
  "function isManager(address) view returns (bool)",
  "function currentMerkleRoot() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function totalManagers() view returns (uint256)", 
  "event ManagerAdded(address indexed manager)",   
  "event ManagerRemoved(address indexed manager)"  
];

export interface Member {
  id: string; 
  name: string;
  linkedinUrl?: string; 
  authProvider?: string; 
  image?: string; 
  walletAddress: string;
  status: 'pending' | 'verified' | 'revoked';
  approvals: string[];
  removalVotes?: string[];
}

// --- NEW: Strict Typing for Queue Items ---
export interface QueueSignature {
  signer: string;
  signature: string;
}

export interface RootQueueItem {
  root: string;
  nonce: number;
  deadline: number;
  signatures: QueueSignature[];
  totalManagersRequired: number;
}

export interface ManagerQueueItem {
  action: 'add' | 'remove';
  targetAddress: string;
  nonce: number;
  deadline: number;
  signatures: QueueSignature[];
  totalManagersRequired: number;
}

export function useDaoCore() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isManagerOnChain, setIsManagerOnChain] = useState(false);
  const [onChainRoot, setOnChainRoot] = useState<string | null>(null);
  const [onChainManagers, setOnChainManagers] = useState<string[]>([]);
  const [totalManagersCount, setTotalManagersCount] = useState<number>(1);
  
  // FIXED: Replaced any[] with our new strict types
  const [pendingRootTxs, setPendingRootTxs] = useState<RootQueueItem[]>([]);
  const [pendingManagerTxs, setPendingManagerTxs] = useState<ManagerQueueItem[]>([]);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // 1. Fetch Database State
  useEffect(() => {
    fetch('/api/members', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => setMembers(data.members || []));

    fetch('/api/multisig-root', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => { if (data.updates) setPendingRootTxs(data.updates); });

    fetch('/api/multisig-manager', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => { if (data.updates) setPendingManagerTxs(data.updates); });
  }, []);

  // 2. Fetch Blockchain State
  useEffect(() => {
    const fetchBlockchainData = async () => {
      if (isConnected && address && walletProvider) {
        try {
          const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
          const contract = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
          
          const status = await contract.isManager(address);
          setIsManagerOnChain(status);
          
          const tm = await contract.totalManagers();
          setTotalManagersCount(Number(tm));

          const root = await contract.currentMerkleRoot();
          if (root.toString() !== "0") setOnChainRoot(root.toString());

          const addedFilter = contract.filters.ManagerAdded();
          const removedFilter = contract.filters.ManagerRemoved();
          const addedLogs = await contract.queryFilter(addedFilter, 0, "latest");
          const removedLogs = await contract.queryFilter(removedFilter, 0, "latest");

          const activeManagerSet = new Set<string>();
          
          // FIXED: Added explanations for the linter
          // @ts-expect-error - Ethers v6 EventLog args array is dynamically typed and strict mode flags it
          addedLogs.forEach(log => activeManagerSet.add(log.args[0].toLowerCase()));
          
          // @ts-expect-error - Ethers v6 EventLog args array is dynamically typed and strict mode flags it
          removedLogs.forEach(log => activeManagerSet.delete(log.args[0].toLowerCase()));
          
          setOnChainManagers(Array.from(activeManagerSet));
        } catch (error) {
          console.error("Failed to fetch blockchain data:", error);
          setIsManagerOnChain(false);
        }
      } else {
        setIsManagerOnChain(false);
        setOnChainRoot(null);
        setOnChainManagers([]);
      }
    };
    fetchBlockchainData();
  }, [isConnected, address, walletProvider]);

  return {
    address,
    isConnected,
    walletProvider,
    members,
    isManagerOnChain,
    onChainRoot,
    onChainManagers,
    totalManagersCount,
    pendingRootTxs,
    pendingManagerTxs,
    isSubmittingAction,
    setIsSubmittingAction
  };
}