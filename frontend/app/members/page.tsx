'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';
import { motion, AnimatePresence } from "framer-motion";

interface Member {
  id: string; 
  name: string;
  linkedinUrl: string;
  walletAddress: string;
  status: 'pending' | 'verified';
  approvals: string[];
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingRootTx, setPendingRootTx] = useState<any>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', name: '', linkedinUrl: '', walletAddress: '', isManager: false });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
    fetch('/api/members')
      .then(res => res.json())
      .then(data => setMembers(data.members || []));

    fetch('/api/multisig-root')
      .then(res => res.json())
      .then(data => {
        if (data.exists) setPendingRootTx(data);
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
            // @ts-expect-error - ethers v6 log args
            addedLogs.forEach(log => activeManagerSet.add(log.args[0].toLowerCase()));
            // @ts-expect-error - ethers v6 log args
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

  // --- ACTIONS (Unchanged Web3 Logic) ---
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

        const WRITE_ABI = ["function addManager(address newManager, uint256 deadline, bytes[] calldata signatures) external"];
        const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
        
        alert("Confirm the gas transaction to add the manager to the blockchain.");
        const tx = await contractWrite.addManager(newMember.walletAddress, deadline, [eip712Signature]);
        await tx.wait(); 

        alert("SUCCESS! Manager permanently added to the blockchain.");
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

  const handleRemoveManager = async (targetWallet: string) => {
    if (!walletProvider || !address) return;
    if (!confirm(`Are you sure you want to REVOKE manager privileges for ${targetWallet}? This will hit the blockchain.`)) return;
    
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const network = await ethersProvider.getNetwork();
      const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
      
      const currentNonce = await contractRead.nonce();
      const deadline = Math.floor(Date.now() / 1000) + 3600; 

      const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
      const types = { RemoveManager: [ { name: "manager", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
      const value = { manager: targetWallet, nonce: currentNonce, deadline: deadline };

      alert("Please sign the EIP-712 RemoveManager Authorization in MetaMask...");
      const eip712Signature = await signer.signTypedData(domain, types, value);

      const WRITE_ABI = ["function removeManager(address manager, uint256 deadline, bytes[] calldata signatures) external"];
      const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
      
      alert("Confirm the gas transaction to remove the manager from the blockchain.");
      const tx = await contractWrite.removeManager(targetWallet, deadline, [eip712Signature]);
      await tx.wait(); 

      alert("SUCCESS! Manager removed from the blockchain.");
      window.location.reload();
    } catch (error) {
      console.error("Removal failed:", error);
      alert("Transaction failed. Check console.");
    }
  };

  const handleGenerateTree = async () => {
    if (!walletProvider || !address) return;
    setIsGenerating(true);
    
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const network = await ethersProvider.getNetwork();
      const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);

      let targetRoot = pendingRootTx?.root;
      let targetNonce = pendingRootTx?.nonce;
      let targetDeadline = pendingRootTx?.deadline;

      if (!pendingRootTx) {
        const msg = "I authorize the generation of the official Merkle Tree for verified members.";
        const apiSignature = await signer.signMessage(msg);

        const res = await fetch('/api/generate-tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ managerAddress: address, signature: apiSignature })
        });
        const data = await res.json();
        
        if (!data.success) throw new Error(data.error);

        targetRoot = data.merkleRoot;
        targetNonce = await contractRead.nonce();
        targetDeadline = Math.floor(Date.now() / 1000) + (24 * 3600); 
      }

      const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
      const types = { UpdateRoot: [ { name: "newRoot", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
      const value = { newRoot: targetRoot, nonce: Number(targetNonce), deadline: targetDeadline };

      alert(`Please sign the EIP-712 Multi-Sig approval in MetaMask...\nRequires ${totalManagersCount} manager signatures.`);
      const eip712Signature = await signer.signTypedData(domain, types, value);

      const multiSigRes = await fetch('/api/multisig-root', {
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

      const multiSigData = await multiSigRes.json();

      if (multiSigData.isReady) {
         alert("All signatures collected! Confirm the final gas transaction to update the blockchain.");

         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const sortedSignatures = multiSigData.signatures.sort((a: any, b: any) => {
            return BigInt(a.signer) < BigInt(b.signer) ? -1 : 1;
         }).map((s: { signature: string }) => s.signature);

         const WRITE_ABI = ["function updateMerkleRoot(uint256 newRoot, uint256 deadline, bytes[] calldata signatures) external"];
         const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);

         const tx = await contractWrite.updateMerkleRoot(targetRoot, targetDeadline, sortedSignatures);
         await tx.wait();

         await fetch('/api/multisig-root', { method: 'DELETE' });

         alert("SUCCESS! Master Merkle Tree permanently updated on the blockchain!");
      } else {
         alert(`Signature saved! Waiting for other managers to sign. (${multiSigData.signatures.length}/${totalManagersCount})`);
      }

      window.location.reload();

    } catch (error: unknown) {
      console.error("Tree generation failed:", error);
      const msg = error instanceof Error ? error.message : "Transaction Failed";
      alert(`Error: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- DATA SORTING ---
  const pending = members.filter(m => m.status === 'pending');
  const verified = members.filter(m => m.status === 'verified');
  
  const trueManagers = onChainManagers.map(managerWallet => {
    const profile = members.find(m => m.walletAddress.toLowerCase() === managerWallet);
    return {
      walletAddress: managerWallet,
      name: profile ? profile.name : "Blockchain Admin",
      linkedinUrl: profile ? profile.linkedinUrl : "#",
      approvals: profile ? profile.approvals : ["Smart Contract Constructor"],
      id: profile ? profile.id : managerWallet
    };
  });

  const regularMembers = verified.filter(m => !onChainManagers.includes(m.walletAddress.toLowerCase()));

  const formatApprovers = (approvers: string[]) => {
    if (!approvers || approvers.length === 0) return "None";
    return approvers.map(a => `${a.slice(0,6)}...${a.slice(-4)}`).join(", ");
  };

  let generateBtnText = "Generate Master Tree";
  let hasAlreadySigned = false;
  if (pendingRootTx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasAlreadySigned = pendingRootTx.signatures?.some((s: any) => s.signer.toLowerCase() === address?.toLowerCase());
    generateBtnText = hasAlreadySigned 
      ? `Waiting on Managers (${pendingRootTx.signatures.length}/${totalManagersCount})` 
      : `Sign Pending Tree Update (${pendingRootTx.signatures.length}/${totalManagersCount})`;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-8 max-w-6xl mx-auto relative z-10"
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 tracking-tight">
            Organization Roster
          </h1>
          {isManagerOnChain && (
            <motion.span 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="inline-block mt-3 px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase rounded-full tracking-wider shadow-[0_0_10px_rgba(99,102,241,0.2)]"
            >
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
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-6 py-2.5 rounded-lg font-bold text-sm text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all shadow-lg"
              >
                {showAddForm ? "Close Form" : "+ Add Participant"}
              </button>

              <button 
                onClick={handleGenerateTree}
                disabled={isGenerating || regularMembers.length === 0 || hasAlreadySigned}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all transform hover:scale-105 ${
                  isGenerating || regularMembers.length === 0 || hasAlreadySigned
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none border border-neutral-700" 
                  : pendingRootTx ? "bg-amber-600 hover:bg-amber-500" : "bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50"
                }`}
              >
                {isGenerating ? "Processing..." : generateBtnText}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NOMINATION FORM (Animated) */}
      <AnimatePresence>
        {isManagerOnChain && showAddForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0, overflow: "hidden" }}
            animate={{ opacity: 1, height: "auto", overflow: "visible" }}
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            <div className="bg-neutral-900/60 backdrop-blur-md p-6 rounded-xl border border-indigo-500/20 mb-10 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
              <h2 className="text-xl font-bold mb-5 text-indigo-300">
                {newMember.isManager ? "Add Governance Manager (On-Chain)" : "Nominate Member (Off-Chain)"}
              </h2>
              
              <div className="flex items-center gap-3 mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <input 
                  type="checkbox" 
                  id="isManager" 
                  className="w-5 h-5 rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-purple-500/50 cursor-pointer"
                  checked={newMember.isManager} 
                  onChange={e => setNewMember({...newMember, isManager: e.target.checked})} 
                />
                <label htmlFor="isManager" className="text-sm font-bold text-purple-300 cursor-pointer">
                  Grant Manager Permissions (Requires On-Chain EIP-712 Signature)
                </label>
              </div>

              <form onSubmit={handleNominate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!newMember.isManager && (
                  <>
                    <input required type="text" placeholder="Full Name" className="bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                    <input required type="email" placeholder="Email Address" className="bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                    <input required type="url" placeholder="LinkedIn URL" className="bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" value={newMember.linkedinUrl} onChange={e => setNewMember({...newMember, linkedinUrl: e.target.value})} />
                  </>
                )}
                
                <input required type="text" placeholder="Wallet Address (0x...)" className={`bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${newMember.isManager ? 'md:col-span-2' : ''}`} value={newMember.walletAddress} onChange={e => setNewMember({...newMember, walletAddress: e.target.value})} />
                
                <button disabled={isSubmittingAction} type="submit" className={`md:col-span-2 mt-2 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg transform hover:scale-[1.01] ${newMember.isManager ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}`}>
                  {isSubmittingAction ? "Processing..." : newMember.isManager ? "Sign EIP-712 & Execute on Blockchain" : "Submit Off-Chain Nomination"}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- TABLE 1: TRUE MANAGERS --- */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h2 className="text-xl font-bold mb-4 text-indigo-400">Governance Managers ({trueManagers.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden mb-10 border border-neutral-800 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  {isManagerOnChain && <th className="px-6 py-4 text-left text-xs font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/5">Private Details</th>}
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
                        <button onClick={() => copyToClipboard(m.walletAddress)} className="text-neutral-500 hover:text-indigo-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        {address && m.walletAddress.toLowerCase() === address.toLowerCase() && <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-full">YOU</span>}
                      </div>
                    </td>
                    
                    {isManagerOnChain && (
                      <td className="px-6 py-4 text-sm bg-indigo-500/5 border-l border-r border-indigo-500/10">
                        <div className="font-bold text-neutral-200">{m.name}</div>
                        {m.linkedinUrl !== "#" && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs mt-1 inline-block">LinkedIn Profile ↗</a>}
                      </td>
                    )}

                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-full uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Manager
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">
                      {formatApprovers(m.approvals)}
                    </td>
                    {isManagerOnChain && (
                      <td className="px-6 py-4 text-right">
                        {!(address && m.walletAddress.toLowerCase() === address.toLowerCase()) && (
                          <button onClick={() => handleRemoveManager(m.walletAddress)} className="text-red-400 hover:text-red-300 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/20 transition-colors">
                            Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {trueManagers.length === 0 && (
                  <tr>
                    <td colSpan={isManagerOnChain ? 5 : 4} className="px-6 py-8 text-center text-neutral-500 italic">No managers found on the blockchain.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* --- TABLE 2: VERIFIED MEMBERS --- */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-xl font-bold mb-4 text-emerald-400">Verified Members ({regularMembers.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden mb-10 border border-neutral-800 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  {isManagerOnChain && <th className="px-6 py-4 text-left text-xs font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/5">Private Details</th>}
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {regularMembers.map(m => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-neutral-300 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span>{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                        <button onClick={() => copyToClipboard(m.walletAddress)} className="text-neutral-500 hover:text-emerald-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    {isManagerOnChain && (
                      <td className="px-6 py-4 text-sm bg-indigo-500/5 border-l border-r border-indigo-500/10">
                        <div className="font-bold text-neutral-200">{m.name}</div>
                        <div className="text-neutral-500 text-xs mt-0.5">{m.id}</div>
                        <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs mt-1 inline-block">LinkedIn Profile ↗</a>
                      </td>
                    )}

                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">
                      {formatApprovers(m.approvals)}
                    </td>
                  </tr>
                ))}
                {regularMembers.length === 0 && (
                  <tr>
                    <td colSpan={isManagerOnChain ? 3 : 2} className="px-6 py-8 text-center text-neutral-500 italic">No verified members yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* --- TABLE 3: PENDING APPROVALS --- */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <h2 className="text-xl font-bold mb-4 text-amber-400">Pending Approvals ({pending.length})</h2>
        <div className="bg-neutral-900/50 backdrop-blur-md rounded-xl overflow-hidden border border-neutral-800 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Wallet Address</th>
                  {isManagerOnChain && <th className="px-6 py-4 text-left text-xs font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/5">Private Details</th>}
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-wider">Signatures</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-neutral-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {pending.map(m => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-neutral-300 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span>{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                        <button onClick={() => copyToClipboard(m.walletAddress)} className="text-neutral-500 hover:text-amber-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    {isManagerOnChain && (
                      <td className="px-6 py-4 text-sm bg-indigo-500/5 border-l border-r border-indigo-500/10">
                        <div className="font-bold text-neutral-200">{m.name}</div>
                        <div className="text-neutral-500 text-xs mt-0.5">{m.id}</div>
                        <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs mt-1 inline-block">LinkedIn Profile ↗</a>
                      </td>
                    )}

                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">
                      {m.approvals.length > 0 ? formatApprovers(m.approvals) : "None yet"}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {isManagerOnChain ? (
                        !m.approvals.includes(address?.toLowerCase() || "") ? (
                          <button 
                            onClick={() => handleApprove(m.id)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                          >
                            Sign & Approve
                          </button>
                        ) : (
                          <span className="text-emerald-400 font-bold text-xs bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20">Signed ✓</span>
                        )
                      ) : (
                        <span className="text-neutral-500 text-xs italic">Pending Multi-Sig</span>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={isManagerOnChain ? 4 : 3} className="px-6 py-8 text-center text-neutral-500 italic">No pending applications.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}