'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';
import { motion, AnimatePresence } from "framer-motion";
import Image from 'next/image';

interface Member {
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

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 

const MINIMAL_ABI = [
  "function isManager(address) view returns (bool)",
  "function currentMerkleRoot() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function totalManagers() view returns (uint256)", 
  "event ManagerAdded(address indexed manager)",   
  "event ManagerRemoved(address indexed manager)"  
];

export default function MembersRoster() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isManagerOnChain, setIsManagerOnChain] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [onChainRoot, setOnChainRoot] = useState<string | null>(null);
  
  const [onChainManagers, setOnChainManagers] = useState<string[]>([]);
  const [totalManagersCount, setTotalManagersCount] = useState<number>(1);

  // NEW: An array of pending transactions, not just one!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingRootTxs, setPendingRootTxs] = useState<any[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingManagerTxs, setPendingManagerTxs] = useState<any[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', name: '', linkedinUrl: '', walletAddress: '', isManager: false });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
      // 1. Fetch Verified Members
      // Added { cache: 'no-store' } to completely bypass Next.js aggressive caching
      fetch('/api/members', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => setMembers(data.members || []));
  
      // 2. Fetch the array of queued Merkle Root updates
      fetch('/api/multisig-root', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data.updates) setPendingRootTxs(data.updates);
        });
  
      // 3. FIXED: Actually fetch the Manager Queue! (You were missing this)
      fetch('/api/multisig-manager', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          if (data.updates) setPendingManagerTxs(data.updates);
        });
    }, []);

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
            if (root.toString() !== "0") {
              setOnChainRoot(root.toString());
            }

            const addedFilter = contract.filters.ManagerAdded();
            const removedFilter = contract.filters.ManagerRemoved();
            const addedLogs = await contract.queryFilter(addedFilter, 0, "latest");
            const removedLogs = await contract.queryFilter(removedFilter, 0, "latest");

           const activeManagerSet = new Set<string>();
             
           // @ts-expect-error - Ethers v6 EventLog args array is not strictly typed by default
           addedLogs.forEach(log => activeManagerSet.add(log.args[0].toLowerCase()));
             
           // @ts-expect-error - Ethers v6 EventLog args array is not strictly typed by default
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Full wallet address copied to clipboard!");
  };

  const handleApprove = async (targetId: string) => {
    if (!walletProvider || !address) return;
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const message = `I approve the entry of ${targetId} into the organization.`;
      const signature = await signer.signMessage(message);

      const response = await fetch('/api/approve-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: targetId, signature, managerAddress: address })
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        window.location.reload();
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Approval failed:", error);
    }
  };
  
  const handleNominate = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!walletProvider || !address) return;
     setIsSubmittingAction(true);
     
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const network = await ethersProvider.getNetwork();
       const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
  
       if (newMember.isManager) {
          const currentNonce = await contractRead.nonce();
          const deadline = Math.floor(Date.now() / 1000) + 3600; 
          const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
          const types = { AddManager: [ { name: "newManager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
          const value = { newManager: newMember.walletAddress, nonce: currentNonce, deadline: deadline };
       
          alert("Please sign the EIP-712 AddManager Authorization in MetaMask...");
          const eip712Signature = await signer.signTypedData(domain, types, value);
          
          // Push this new manager addition into the Manager Queue!
          await fetch('/api/multisig-manager', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               action: 'add',
               targetAddress: newMember.walletAddress,
               nonce: Number(currentNonce),
               deadline: deadline,
               signature: eip712Signature,
               signerAddress: address,
               totalManagersRequired: totalManagersCount
            })
          });
          
          alert("New Manager addition added to the Queue! Waiting for other managers to sign.");
          window.location.reload();
        } else {
         const message = `I nominate ${newMember.email} as a new MEMBER in the organization.`;
         const signature = await signer.signMessage(message);
  
         const response = await fetch('/api/nominate-member', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ ...newMember, targetId: newMember.email, signature, managerAddress: address })
         });
  
         const data = await response.json();
         if (data.success) {
           alert("Member Nomination submitted successfully!");
           window.location.reload();
         } else {
           alert("Error: " + data.error);
         }
       }
     } catch (error: unknown) {
       console.error("Nomination/Blockchain failed:", error);
       const errorMessage = error instanceof Error ? error.message : String(error);
       if (errorMessage.includes("Already manager")) {
         alert("The blockchain says this wallet is ALREADY a manager! Refreshing data.");
         window.location.reload();
       } else {
         alert("Failed to submit. Check console for details.");
       }
     } finally {
       setIsSubmittingAction(false);
     }
   };
  
  // --- 1. VOTE TO REMOVE A MANAGER ---
   const handleVoteRemoveManager = async (targetWallet: string) => {
       if (!walletProvider || !address) return;
       if (!confirm(`Vote to REVOKE manager privileges for ${targetWallet.slice(0,6)}...?`)) return;
       
       setIsSubmittingAction(true);
       try {
         const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
         const signer = await ethersProvider.getSigner();
         const network = await ethersProvider.getNetwork();
         const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
         
         const currentNonce = await contractRead.nonce();
         const deadline = Math.floor(Date.now() / 1000) + 3600; 
    
         const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
         const types = { RemoveManager: [ { name: "manager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
         const value = { manager: targetWallet, nonce: Number(currentNonce), deadline };
    
         alert("Please sign the EIP-712 RemoveManager vote in MetaMask...");
         const eip712Signature = await signer.signTypedData(domain, types, value);
    
         const res = await fetch('/api/multisig-manager', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              action: 'remove',
              targetAddress: targetWallet,
              nonce: Number(currentNonce),
              deadline,
              signature: eip712Signature,
              signerAddress: address,
              totalManagersRequired: totalManagersCount
           })
         });
         
         if (!res.ok) {
             const errorText = await res.text();
             throw new Error(`Server returned ${res.status}: ${errorText}`);
         }
    
         const data = await res.json();
         if (!data.success) throw new Error(data.error || "API returned false");
    
         alert("Vote successfully added to the Database Queue! Waiting for other managers.");
         window.location.reload();
         
       } catch (error: unknown) { 
         console.error("Vote failed:", error);
         const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
         alert(`Failed to save vote to database: ${errorMessage}`);
       } finally {
         setIsSubmittingAction(false);
       }
     };
  
   // --- 2. EXECUTE THE REMOVAL ON-CHAIN ---
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleExecuteManagerTx = async (txData: any) => {
      if (!walletProvider || !address) return;
      try {
        const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
        const signer = await ethersProvider.getSigner();
        const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
   
        const currentNonce = await contractRead.nonce();
        if (Number(currentNonce) !== Number(txData.nonce)) {
            alert("Nonce mismatch! The blockchain state changed. Deleting invalid queue item.");
            await fetch('/api/multisig-manager', { method: 'DELETE', body: JSON.stringify({ targetAddress: txData.targetAddress }) });
            window.location.reload();
            return;
        }
   
        const uniqueSignaturesMap = new Map();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        txData.signatures.forEach((s: any) => uniqueSignaturesMap.set(s.signature, s.signer.toLowerCase()));
   
        if (uniqueSignaturesMap.size < totalManagersCount) return alert("Duplicate signatures detected.");
   
        const sortedSigners = Array.from(uniqueSignaturesMap.values()).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        const sortedSignatures = sortedSigners.map(signer => {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const match = txData.signatures.find((s: any) => s.signer.toLowerCase() === signer);
           return match?.signature || ""; 
        });
   
        // --- DYNAMIC EXECUTION: PROMOTIONS VS REMOVALS ---
        if (txData.action === 'add') {
          const WRITE_ABI = ["function addManager(address newManager, uint256 deadline, bytes[] calldata signatures) external"];
          const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
          
          alert("Confirm gas transaction to finalize the manager's PROMOTION.");
          const tx = await contractWrite.addManager(txData.targetAddress, BigInt(txData.deadline), sortedSignatures);
          await tx.wait();
        } else {
          const WRITE_ABI = ["function removeManager(address manager, uint256 deadline, bytes[] calldata signatures) external"];
          const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
          
          alert("Confirm gas transaction to finalize the manager's REMOVAL.");
          const tx = await contractWrite.removeManager(txData.targetAddress, BigInt(txData.deadline), sortedSignatures);
          await tx.wait();
        }
   
        // Cleanup queue item after success
        await fetch('/api/multisig-manager', { method: 'DELETE', body: JSON.stringify({ targetAddress: txData.targetAddress }) });
   
        alert("SUCCESS! Manager queue item executed on the blockchain.");
        window.location.reload();
      } catch (error: unknown) {
        console.error("Execution failed:", error);
        alert("Failed to execute transaction.");
      }
    };
  const handleVoteRevokeMember = async (m: Member) => {
    if (!walletProvider || !address) return;
    if (!confirm(`Are you sure you want to vote to remove ${m.name}? This requires ${totalManagersCount} manager signatures before updating the Merkle Tree.`)) return;
    
    setIsSubmittingAction(true);
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      
      const message = `I vote to revoke the membership of ${m.id}.`;
      const signature = await signer.signMessage(message);

      const res = await fetch('/api/revoke-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            targetId: m.id, 
            signature, 
            managerAddress: address,
            totalManagersRequired: totalManagersCount
        })
      });
      
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        window.location.reload();
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Failed to vote for removal:", error);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handlePromoteToManager = async (targetWallet: string) => {
     if (!walletProvider || !address) return;
     setIsSubmittingAction(true);
     
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const network = await ethersProvider.getNetwork();
       const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
  
       const currentNonce = await contractRead.nonce();
       const deadline = Math.floor(Date.now() / 1000) + 3600; 
       const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
       const types = { AddManager: [ { name: "newManager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
       const value = { newManager: targetWallet, nonce: Number(currentNonce), deadline };
  
       alert("Please sign the EIP-712 AddManager Authorization in MetaMask...");
       const eip712Signature = await signer.signTypedData(domain, types, value);
  
       // ADD TO QUEUE INSTEAD OF EXECUTING
       await fetch('/api/multisig-manager', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            action: 'add',
            targetAddress: targetWallet,
            nonce: Number(currentNonce),
            deadline,
            signature: eip712Signature,
            signerAddress: address,
            totalManagersRequired: totalManagersCount
         })
       });
  
       alert("Promotion vote added to the Queue! Waiting for other managers.");
       window.location.reload();
     } catch (error) {
       console.error("Promotion failed:", error);
     } finally {
       setIsSubmittingAction(false);
     }
   };

  // --- NEW: QUEUE GENERATION ---
  const handleGenerateTree = async () => {
    if (!walletProvider || !address) return;
    setIsGenerating(true);
    
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const network = await ethersProvider.getNetwork();
      const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);

      const msg = "I authorize the generation of the official Merkle Tree for verified members.";
      const apiSignature = await signer.signMessage(msg);

      const res = await fetch('/api/generate-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerAddress: address, signature: apiSignature })
      });
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);

      const targetRoot = data.merkleRoot;

      if (targetRoot === onChainRoot) {
        alert("The blockchain is already perfectly in sync with the current member database! No update is needed.");
        setIsGenerating(false);
        return;
      }

      // Check if we already created a queue item for this specific state
      if (pendingRootTxs.some(tx => tx.root === targetRoot)) {
        alert("This specific Merkle Root is already in the queue waiting for signatures!");
        setIsGenerating(false);
        return;
      }

      const targetNonce = await contractRead.nonce();
      const targetDeadline = Math.floor(Date.now() / 1000) + (24 * 3600); 

      const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
      const types = { UpdateRoot: [ { name: "newRoot", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
      const value = { newRoot: targetRoot, nonce: Number(targetNonce), deadline: targetDeadline };

      alert(`Please sign the EIP-712 Multi-Sig approval in MetaMask to create this queue item.`);
      const eip712Signature = await signer.signTypedData(domain, types, value);

      await fetch('/api/multisig-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           root: targetRoot,
           nonce: Number(targetNonce),
           deadline: targetDeadline,
           signature: eip712Signature,
           signerAddress: address,
           totalManagersRequired: totalManagersCount
        })
      });

      alert(`Queue item created! Waiting for other managers to sign.`);
      window.location.reload();

    } catch (error: unknown) {
      console.error("Tree generation failed:", error);
      const msg = error instanceof Error ? error.message : "Transaction Failed";
      alert(`Error: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- NEW: QUEUE ACTIONS ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSignQueuedRoot = async (txData: any) => {
    if (!walletProvider || !address) return;
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const network = await ethersProvider.getNetwork();

      const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
      const types = { UpdateRoot: [ { name: "newRoot", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
      const value = { newRoot: txData.root, nonce: Number(txData.nonce), deadline: txData.deadline };

      alert(`Please sign this specific root update in MetaMask.`);
      const eip712Signature = await signer.signTypedData(domain, types, value);

      await fetch('/api/multisig-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           root: txData.root,
           nonce: txData.nonce,
           deadline: txData.deadline,
           signature: eip712Signature,
           signerAddress: address,
           totalManagersRequired: totalManagersCount
        })
      });

      alert("Signature added to the queue!");
      window.location.reload();
    } catch (error) {
      console.error("Failed to sign queue:", error);
    }
  };

  // --- SIGN AN EXISTING MANAGER TX FROM THE QUEUE ---
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const handleSignManagerTx = async (txData: any) => {
     if (!walletProvider || !address) return;
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const network = await ethersProvider.getNetwork();
  
       const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
       
       // We must strictly match the data types based on whether it's an Add or Remove action
       let types, value, typeName;
       if (txData.action === 'add') {
           types = { AddManager: [ { name: "newManager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
           value = { newManager: txData.targetAddress, nonce: Number(txData.nonce), deadline: txData.deadline };
           typeName = "AddManager";
       } else {
           types = { RemoveManager: [ { name: "manager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
           value = { manager: txData.targetAddress, nonce: Number(txData.nonce), deadline: txData.deadline };
           typeName = "RemoveManager";
       }
  
       alert(`Please sign the EIP-712 ${typeName} vote in MetaMask to add your consensus.`);
       const eip712Signature = await signer.signTypedData(domain, types, value);
  
       // Save the signature while strictly preserving the ORIGINAL nonce and deadline
       await fetch('/api/multisig-manager', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            action: txData.action,
            targetAddress: txData.targetAddress,
            nonce: txData.nonce,
            deadline: txData.deadline,
            signature: eip712Signature,
            signerAddress: address,
            totalManagersRequired: totalManagersCount
         })
       });
  
       alert("Signature successfully added to the queue!");
       window.location.reload();
     } catch (error) {
       console.error("Failed to sign manager queue:", error);
     }
   };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const handleExecuteRoot = async (txData: any) => {
     if (!walletProvider || !address) return;
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
  
       // --- 1. THE NONCE SAFETY CHECK (The Fix) ---
       // Check if the contract's nonce moved forward since this queue item was created
       const currentNonce = await contractRead.nonce();
       if (Number(currentNonce) !== Number(txData.nonce)) {
           alert("The blockchain state has changed (likely because a manager was added or removed). This queued signature bundle is now invalid. Auto-deleting so you can generate a fresh one.");
           
           // Auto-clean the invalid tx from the queue
           await fetch('/api/multisig-root', { method: 'DELETE', body: JSON.stringify({ root: txData.root }) });
           window.location.reload();
           return;
       }
  
       // --- 2. DEDUPLICATE BY EXACT SIGNATURE BYTES ---
       const uniqueSignaturesMap = new Map();
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       txData.signatures.forEach((s: any) => {
          uniqueSignaturesMap.set(s.signature, s.signer.toLowerCase());
       });
  
       if (uniqueSignaturesMap.size < totalManagersCount) {
           alert(`Duplicate signatures detected. Please ensure unique manager wallets signed this.`);
           return;
       }
  
       alert("Confirm the final gas transaction to push this state to the blockchain.");
  
       // --- 3. MATHEMATICAL SORTING ---
       const sortedSigners = Array.from(uniqueSignaturesMap.values()).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
       
       const sortedSignatures = sortedSigners.map(signer => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = txData.signatures.find((s: any) => s.signer.toLowerCase() === signer);
          return match?.signature || ""; 
       });
  
       // --- 4. STRICT TYPING FOR WEB3 EXECUTION ---
       const WRITE_ABI = ["function updateMerkleRoot(uint256 newRoot, uint256 deadline, bytes[] calldata signatures) external"];
       const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
  
       // Force inputs to BigInt to prevent any hex-string misinterpretations by Ethers.js
       const tx = await contractWrite.updateMerkleRoot(BigInt(txData.root), BigInt(txData.deadline), sortedSignatures);
       await tx.wait();
  
       // Clean up the executed queue item
       await fetch('/api/multisig-root', { method: 'DELETE', body: JSON.stringify({ root: txData.root }) });
  
       // Automatically wipe revoked members from DB since blockchain is synced
       if (revoked.length > 0) {
         for (const rm of revoked) {
           await fetch('/api/remove-member', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ targetId: rm.id })
           });
         }
       }
  
       alert("SUCCESS! Blockchain updated. Other pending queue items may now be invalid.");
       window.location.reload();
  
     } catch (error: unknown) {
       console.error("Execution failed:", error);
       const msg = error instanceof Error ? error.message : "Transaction Failed";
       alert(`Error executing transaction: ${msg}`);
     }
   };

   

  // --- STRICT DATA FILTERING ---
  const pending = members.filter(m => m.status === 'pending' && !onChainManagers.includes(m.walletAddress.toLowerCase()));
  const verified = members.filter(m => m.status === 'verified' && !onChainManagers.includes(m.walletAddress.toLowerCase()));
  const revoked = members.filter(m => m.status === 'revoked'); 

  const isVerifiedMember = verified.some(m => m.walletAddress.toLowerCase() === address?.toLowerCase()) || isManagerOnChain;

  const trueManagers = onChainManagers.map(managerWallet => {
    const profile = members.find(m => m.walletAddress.toLowerCase() === managerWallet);
    return {
      walletAddress: managerWallet,
      name: profile ? profile.name : "Blockchain Admin",
      linkedinUrl: profile?.linkedinUrl,
      authProvider: profile?.authProvider,
      image: profile?.image,
      approvals: profile ? profile.approvals : ["Smart Contract Constructor"],
      id: profile ? profile.id : managerWallet,
      status: 'verified' as const
    };
  });

  const formatApprovers = (approvers: string[]) => {
    if (!approvers || approvers.length === 0) return "None";
    return approvers.map(a => `${a.slice(0,6)}...${a.slice(-4)}`).join(", ");
  };

  const renderProfileCell = (m: Member) => {
    const isPublic = !isVerifiedMember && !isManagerOnChain;

    if (isPublic) {
      return (
        <td className="px-6 py-4 text-sm border-l border-r border-white/5">
          <div className="flex items-center gap-3 opacity-60">
            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 border border-neutral-700">?</div>
            <div>
              <div className="font-bold text-neutral-400">{m.name}</div>
              <div className="text-[10px] text-neutral-500 italic">Profile Hidden</div>
            </div>
          </div>
        </td>
      );
    }

    return (
      <td className="px-6 py-4 text-sm border-l border-r border-white/5">
        <div className="flex items-center gap-3">
          
          <div className="relative w-10 h-10 flex-shrink-0 rounded-full overflow-hidden border-2 border-indigo-500/30 shadow-sm bg-neutral-800">
            {m.image ? (
              <Image src={m.image} alt={m.name} fill sizes="40px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-indigo-300 font-bold bg-indigo-500/20">{m.name.charAt(0)}</div>
            )}
          </div>
          
          <div>
            <div className="font-bold text-neutral-200">{m.name}</div>
            {isManagerOnChain && (
              <div className="mt-1">
                {m.id.includes('@') && <div className="text-neutral-500 text-[10px] tracking-wide mb-1.5">{m.id}</div>}
                
                <div className="flex items-center gap-2">
                  {m.authProvider === 'Google' ? (
                    <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded shadow-inner bg-white text-neutral-900 flex items-center gap-1">Google</span>
                  ) : (
                    <>
                      <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded shadow-inner bg-[#0A66C2] text-white flex items-center gap-1">LinkedIn</span>
                      {m.linkedinUrl && m.linkedinUrl !== "" && (
                        <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline text-[10px] font-semibold">View ↗</a>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="p-8 max-w-6xl mx-auto relative z-10">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* --- NEW TRANSACTION QUEUE DASHBOARD --- */}
      {(pendingRootTxs.length > 0 || pendingManagerTxs.length > 0) && isManagerOnChain && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10 bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.15)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <h2 className="text-xl font-bold text-amber-400 mb-4">Transaction Queue ({pendingRootTxs.length + pendingManagerTxs.length})</h2>
          
          <div className="space-y-4">
              {/* 1. MERKLE ROOT ACTION QUEUE */}
              {pendingRootTxs.map((tx, index) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasSigned = tx.signatures.some((s: any) => s.signer.toLowerCase() === address?.toLowerCase());
                const isReady = tx.signatures.length >= totalManagersCount;
          
                return (
                  <div key={tx.root} className="bg-black/40 border border-amber-500/20 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                      <div className="text-sm font-bold text-white mb-1">Update #{index + 1}</div>
                      <div className="text-xs font-mono text-amber-200/50">Root: {tx.root.slice(0, 15)}...</div>
                      <div className="text-xs font-mono text-amber-200/50">Signatures: {tx.signatures.length} / {totalManagersCount}</div>
                    </div>
                    <div>
                      {isReady ? (
                        <button onClick={() => handleExecuteRoot(tx)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg animate-pulse">
                          Pay Gas & Execute
                        </button>
                      ) : hasSigned ? (
                        <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-4 py-2.5 rounded-lg border border-amber-400/20">Waiting on others...</span>
                      ) : (
                        <button onClick={() => handleSignQueuedRoot(tx)} className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg">Sign this Update</button>
                      )}
                    </div>
                  </div>
                );
              })}
          
              {/* 2. MANAGER ACTION QUEUE */}
              {pendingManagerTxs.map((tx) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasSigned = tx.signatures.some((s: any) => s.signer.toLowerCase() === address?.toLowerCase());
                const isReady = tx.signatures.length >= totalManagersCount;
            
                return (
                  <div key={tx.targetAddress} className="bg-black/40 border border-red-500/30 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                      <div className="text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
                        <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded text-[10px] uppercase">Manager Removal</span>
                      </div>
                      <div className="text-xs font-mono text-white/70">Target: {tx.targetAddress.slice(0, 15)}...</div>
                      <div className="text-xs font-mono text-white/50 mt-1">Signatures: {tx.signatures.length} / {totalManagersCount}</div>
                    </div>
                    <div>
                      {isReady ? (
                        <button onClick={() => handleExecuteManagerTx(tx)} className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(220,38,38,0.4)] animate-pulse">
                          Pay Gas & Execute Removal
                        </button>
                      ) : hasSigned ? (
                        <span className="text-red-400 font-bold text-xs bg-red-400/10 px-4 py-2.5 rounded-lg border border-red-400/20">Waiting on others...</span>
                      ) : (
                        <button onClick={() => handleSignManagerTx(tx)} className="bg-red-600/80 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg">
                          Sign this Removal
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">Organization Roster</h1>
          {isManagerOnChain && (
            <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-block mt-3 px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase rounded-full tracking-wider">
              Verified On-Chain Manager
            </motion.span>
          )}
          {onChainRoot && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-3 bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1">Current On-Chain Merkle Root</p>
              <p className="text-sm font-mono text-indigo-400 break-all">{onChainRoot}</p>
            </motion.div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-4 mt-6 md:mt-0">
          <div className="hidden md:block"><appkit-button /></div>
          
          {isManagerOnChain && (
            <div className="flex flex-wrap gap-3 justify-end">
              <button onClick={() => setShowAddForm(!showAddForm)} className="px-6 py-2.5 rounded-lg font-bold text-sm text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all shadow-lg">
                {showAddForm ? "Close Form" : "+ Add Participant"}
              </button>
              
              {/* THE BUTTON NOW COMPUTES AND ADDS TO QUEUE */}
              <button 
                onClick={handleGenerateTree}
                disabled={isGenerating || (verified.length === 0 && revoked.length === 0)}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all transform hover:scale-105 ${
                  isGenerating || (verified.length === 0 && revoked.length === 0)
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none border border-neutral-700" 
                  : "bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50"
                }`}
              >
                {isGenerating ? "Computing..." : "Compute New Root & Queue It"}
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isManagerOnChain && showAddForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }}>
            <div className="bg-neutral-900/60 backdrop-blur-md p-6 rounded-xl border border-indigo-500/20 mb-10">
              <h2 className="text-xl font-bold mb-5 text-indigo-300">{newMember.isManager ? "Add Governance Manager (On-Chain)" : "Nominate Member (Off-Chain)"}</h2>
              <div className="flex items-center gap-3 mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <input type="checkbox" id="isManager" className="w-5 h-5 rounded border-neutral-700 bg-neutral-900" checked={newMember.isManager} onChange={e => setNewMember({...newMember, isManager: e.target.checked})} />
                <label htmlFor="isManager" className="text-sm font-bold text-purple-300">Grant Manager Permissions (Requires On-Chain EIP-712 Signature)</label>
              </div>
              <form onSubmit={handleNominate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!newMember.isManager && (
                  <>
                    <input required type="text" placeholder="Full Name" className="bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-white" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                    <input required type="email" placeholder="Email Address" className="bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-white" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                    <input type="url" placeholder="LinkedIn URL (Optional)" className="bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-white" value={newMember.linkedinUrl} onChange={e => setNewMember({...newMember, linkedinUrl: e.target.value})} />
                  </>
                )}
                <input required type="text" placeholder="Wallet Address (0x...)" className={`bg-neutral-950 border border-neutral-800 p-3 rounded-lg text-white ${newMember.isManager ? 'md:col-span-2' : ''}`} value={newMember.walletAddress} onChange={e => setNewMember({...newMember, walletAddress: e.target.value})} />
                <button disabled={isSubmittingAction} type="submit" className={`md:col-span-2 mt-2 text-white font-bold py-3.5 rounded-lg ${newMember.isManager ? 'bg-purple-600' : 'bg-indigo-600'}`}>
                  {isSubmittingAction ? "Processing..." : newMember.isManager ? "Sign EIP-712 & Execute on Blockchain" : "Submit Off-Chain Nomination"}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-xl font-bold mb-4 text-indigo-400">Governance Managers ({trueManagers.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden mb-10 border border-neutral-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Member Profile</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Approved By</th>
                  {isManagerOnChain && <th className="px-6 py-4 text-right text-xs font-bold text-neutral-400 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {trueManagers.map(m => (
                  <tr key={m.walletAddress} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-neutral-300 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span>{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                        {address && m.walletAddress.toLowerCase() === address.toLowerCase() && <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded-full">YOU</span>}
                      </div>
                    </td>
                    {renderProfileCell(m)}
                    <td className="px-6 py-4"><span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-indigo-500/20 text-indigo-300">Manager</span></td>
                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">{formatApprovers(m.approvals)}</td>
                    {isManagerOnChain && (
                        <td className="px-6 py-4 text-right">
                          {(() => {
                            const pendingTx = pendingManagerTxs.find(tx => tx.targetAddress.toLowerCase() === m.walletAddress.toLowerCase() && tx.action === 'remove');
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const hasVoted = pendingTx?.signatures.some((s: any) => s.signer.toLowerCase() === address?.toLowerCase());
                            const isSelf = address && m.walletAddress.toLowerCase() === address.toLowerCase();
                    
                            if (hasVoted) {
                              return <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">Voted ({pendingTx.signatures.length}/{totalManagersCount})</span>;
                            }
                    
                            return (
                                <button 
                                  // NEW: If a queue item exists, use the Sign function. Otherwise, create a new vote!
                                  onClick={() => pendingTx ? handleSignManagerTx(pendingTx) : handleVoteRemoveManager(m.walletAddress)} 
                                  className="text-red-400 hover:text-red-300 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/20 transition-colors"
                                >
                                  {isSelf ? "Vote to Revoke (Self)" : pendingTx ? `Sign Removal (${pendingTx.signatures.length}/${totalManagersCount})` : "Vote to Revoke"}
                                </button>
                              );
                          })()}
                        </td>
                      )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-xl font-bold mb-4 text-emerald-400">Verified Members ({verified.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden mb-10 border border-neutral-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Member Profile</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Approved By</th>
                  {isManagerOnChain && <th className="px-6 py-4 text-right text-xs font-bold text-neutral-400 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {verified.map(m => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-neutral-300 whitespace-nowrap">{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</td>
                    {renderProfileCell(m)}
                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">{formatApprovers(m.approvals)}</td>
                    {isManagerOnChain && (
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <button onClick={() => handlePromoteToManager(m.walletAddress)} className="text-purple-400 bg-purple-500/10 text-xs font-bold px-3 py-1.5 rounded-lg">Promote</button>
                        {m.removalVotes?.includes(address?.toLowerCase() || "") ? (
                           <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-3 py-1.5 rounded-lg">Voted ({m.removalVotes.length}/{totalManagersCount})</span>
                        ) : (
                          <button onClick={() => handleVoteRevokeMember(m)} className="text-red-400 bg-red-500/10 text-xs font-bold px-3 py-1.5 rounded-lg">
                            {m.removalVotes && m.removalVotes.length > 0 ? `Vote Remove (${m.removalVotes.length}/${totalManagersCount})` : "Vote Remove"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h2 className="text-xl font-bold mb-4 text-amber-400">Pending Approvals ({pending.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden border border-neutral-800 mb-10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Member Profile</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-neutral-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {pending.map(m => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-neutral-300 whitespace-nowrap">{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</td>
                    {renderProfileCell(m)}
                    <td className="px-6 py-4 text-right">
                      {isManagerOnChain ? (
                        !m.approvals.includes(address?.toLowerCase() || "") ? (
                          <button onClick={() => handleApprove(m.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold">
                            {m.approvals.length > 0 ? `Sign & Approve (${m.approvals.length}/${totalManagersCount})` : "Sign & Approve"}
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-bold text-xs bg-emerald-400/10 px-3 py-1.5 rounded-lg">Signed ✓ ({m.approvals.length}/{totalManagersCount})</span>
                        )
                      ) : (
                        <span className="text-neutral-500 text-xs italic">Pending Multi-Sig</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {isManagerOnChain && revoked.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <h2 className="text-xl font-bold mb-4 text-red-400">Revoked Members <span className="text-xs bg-red-500/20 px-2 py-1 rounded-full">Requires Merkle Update</span></h2>
          <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden border border-red-900/50">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-800">
                <thead className="bg-red-950/30">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400">Wallet Address</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400">Member Profile</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {revoked.map(m => (
                    <tr key={m.id} className="hover:bg-red-500/5 opacity-70">
                      <td className="px-6 py-4 text-sm font-mono text-neutral-300">{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</td>
                      {renderProfileCell(m)}
                      <td className="px-6 py-4 text-xs font-bold text-red-400 uppercase">Revoked by Managers</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}