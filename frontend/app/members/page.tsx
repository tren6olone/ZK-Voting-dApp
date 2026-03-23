'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';

interface Member {
  id: string; 
  name: string;
  linkedinUrl: string;
  walletAddress: string;
  status: 'pending' | 'verified';
  approvals: string[];
}

// ⚠️ Ensure this is your latest ZKVoting address
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 

const MINIMAL_ABI = [
  "function isManager(address) view returns (bool)",
  "function currentMerkleRoot() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "event ManagerAdded(address indexed manager)",   // NEW: For scanning history
  "event ManagerRemoved(address indexed manager)"  // NEW: For scanning history
];

export default function MembersRoster() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isManagerOnChain, setIsManagerOnChain] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [onChainRoot, setOnChainRoot] = useState<string | null>(null);
  
  // NEW: State strictly for on-chain managers
  const [onChainManagers, setOnChainManagers] = useState<string[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', name: '', linkedinUrl: '', walletAddress: '', isManager: false });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // 1. Fetch the off-chain details (Names, LinkedIn, Pending statuses)
  useEffect(() => {
    fetch('/api/members')
      .then(res => res.json())
      .then(data => setMembers(data.members || []));
  }, []);

  // 2. Fetch the absolute truth from the Blockchain
  useEffect(() => {
      const fetchBlockchainData = async () => {
        if (isConnected && address && walletProvider) {
          try {
            const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
            const contract = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
            
            // Check current user status
            const status = await contract.isManager(address);
            setIsManagerOnChain(status);
  
            // Get Merkle Root
            const root = await contract.currentMerkleRoot();
            if (root.toString() !== "0") {
              setOnChainRoot(root.toString());
            }

            // --- THE TRUE WEB3 UPGRADE: REBUILD MANAGER LIST FROM LOGS ---
            const addedFilter = contract.filters.ManagerAdded();
            const removedFilter = contract.filters.ManagerRemoved();
            
            // Scan from block 0 to latest
            const addedLogs = await contract.queryFilter(addedFilter, 0, "latest");
            const removedLogs = await contract.queryFilter(removedFilter, 0, "latest");

            // Calculate active managers using a Set
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
        alert("Approved successfully!");
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
        
        alert("Signature collected! Confirm the gas transaction to add the manager to the blockchain.");
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
        const msg = "I authorize the generation of the official Merkle Tree for verified members.";
        const apiSignature = await signer.signMessage(msg);
  
        const response = await fetch('/api/generate-tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ managerAddress: address, signature: apiSignature })
        });
  
        const data = await response.json();
        if (data.success) {
          const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
          const currentNonce = await contractRead.nonce();
          const deadline = Math.floor(Date.now() / 1000) + 3600; 
          const network = await ethersProvider.getNetwork();

          const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
          const types = { UpdateRoot: [ { name: "newRoot", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
          const value = { newRoot: data.merkleRoot, nonce: currentNonce, deadline: deadline };

          alert("Please sign the EIP-712 Multi-Sig approval in MetaMask...");
          const eip712Signature = await signer.signTypedData(domain, types, value);

          const WRITE_ABI = ["function updateMerkleRoot(uint256 newRoot, uint256 deadline, bytes[] calldata signatures) external"];
          const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
          
          alert("Signatures collected! Confirm the final gas transaction to update the blockchain.");
          const tx = await contractWrite.updateMerkleRoot(data.merkleRoot, deadline, [eip712Signature]);
          await tx.wait(); 
          
          alert(`SUCCESS! Smart Contract Updated!\nTotal Members Included: ${data.totalMembers}`);
          window.location.reload();
        } else {
          alert("Error: " + data.error);
        }
      } catch (error) {
        console.error("Tree generation failed:", error);
        alert("Failed to update blockchain. Check console.");
      } finally {
        setIsGenerating(false);
      }
    };

  // --- DATA SORTING: MERGING BLOCKCHAIN LOGS WITH FIREBASE ---
  const pending = members.filter(m => m.status === 'pending');
  const verified = members.filter(m => m.status === 'verified');
  
  // 1. Build the true Managers list from the blockchain logs!
  const trueManagers = onChainManagers.map(managerWallet => {
    // Try to find their Firebase profile to get their name
    const profile = members.find(m => m.walletAddress.toLowerCase() === managerWallet);
    return {
      walletAddress: managerWallet,
      name: profile ? profile.name : "Blockchain Admin",
      linkedinUrl: profile ? profile.linkedinUrl : "#",
      approvals: profile ? profile.approvals : ["Smart Contract Constructor"],
      id: profile ? profile.id : managerWallet
    };
  });

  // 2. Regular members are verified Firebase users who are NOT in the onChainManagers list
  const regularMembers = verified.filter(m => !onChainManagers.includes(m.walletAddress.toLowerCase()));

  const formatApprovers = (approvers: string[]) => {
    if (!approvers || approvers.length === 0) return "None";
    return approvers.map(a => `${a.slice(0,6)}...${a.slice(-4)}`).join(", ");
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-start mb-8 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Roster</h1>
          {isManagerOnChain && (
            <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-800 text-xs font-bold uppercase rounded-full tracking-wide">
              Verified On-Chain Manager
            </span>
          )}
            {onChainRoot && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Current On-Chain Merkle Root</p>
                <p className="text-sm font-mono text-indigo-600 break-all">{onChainRoot}</p>
              </div>
            )}
        </div>
        
        <div className="flex flex-col items-end gap-3">
          <appkit-button />
          
          {isManagerOnChain && (
            <div className="flex gap-2">
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-6 py-2 rounded-md font-bold text-gray-700 bg-gray-100 border hover:bg-gray-200 transition"
              >
                {showAddForm ? "Close Form" : "+ Add Member/Manager"}
              </button>

              <button 
                onClick={handleGenerateTree}
                disabled={isGenerating || regularMembers.length === 0}
                className={`px-6 py-2 rounded-md font-bold text-white shadow-md transition ${
                  isGenerating || regularMembers.length === 0 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isGenerating ? "Sweeping Tree..." : "Generate Master Tree"}
              </button>
            </div>
          )}
        </div>
      </div>

      {isManagerOnChain && showAddForm && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-indigo-100 mb-8">
          <h2 className="text-xl font-bold mb-4 text-indigo-900">
            {newMember.isManager ? "Add Governance Manager (On-Chain)" : "Nominate Member (Off-Chain)"}
          </h2>
          
          <div className="flex items-center gap-2 mb-6 p-3 bg-red-50 border border-red-100 rounded">
            <input 
              type="checkbox" 
              id="isManager" 
              className="w-4 h-4 text-red-600"
              checked={newMember.isManager} 
              onChange={e => setNewMember({...newMember, isManager: e.target.checked})} 
            />
            <label htmlFor="isManager" className="text-sm font-bold text-red-800 cursor-pointer">
              Grant Manager Permissions (Direct Smart Contract Execution)
            </label>
          </div>

          <form onSubmit={handleNominate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!newMember.isManager && (
              <>
                <input required type="text" placeholder="Full Name" className="border p-3 rounded" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                <input required type="email" placeholder="Email Address" className="border p-3 rounded" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                <input required type="url" placeholder="LinkedIn URL" className="border p-3 rounded" value={newMember.linkedinUrl} onChange={e => setNewMember({...newMember, linkedinUrl: e.target.value})} />
              </>
            )}
            
            <input required type="text" placeholder="Wallet Address (0x...)" className={`border p-3 rounded ${newMember.isManager ? 'md:col-span-2' : ''}`} value={newMember.walletAddress} onChange={e => setNewMember({...newMember, walletAddress: e.target.value})} />
            
            <button disabled={isSubmittingAction} type="submit" className={`md:col-span-2 mt-2 text-white font-bold py-3 rounded transition ${newMember.isManager ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isSubmittingAction ? "Processing..." : newMember.isManager ? "Sign EIP-712 & Add Manager to Blockchain" : "Submit Member Nomination"}
            </button>
          </form>
        </div>
      )}

      {/* --- TABLE 1: THE TRUE ON-CHAIN MANAGERS --- */}
      <h2 className="text-xl font-semibold mb-4 text-indigo-700">Governance Managers ({trueManagers.length})</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8 border border-indigo-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-indigo-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wallet Address</th>
              {isManagerOnChain && <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase font-bold bg-indigo-50">Private Details</th>}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved By</th>
              {isManagerOnChain && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {trueManagers.map(m => (
              <tr key={m.walletAddress} className="bg-indigo-50/30">
                <td className="px-6 py-4 text-sm font-mono text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                    <button onClick={() => copyToClipboard(m.walletAddress)} className="text-gray-400 hover:text-indigo-600 transition" title="Copy Full Address">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    {address && m.walletAddress.toLowerCase() === address.toLowerCase() && <span className="ml-2 text-xs text-indigo-500 font-bold bg-indigo-100 px-2 py-0.5 rounded">You</span>}
                  </div>
                </td>
                
                {isManagerOnChain && (
                  <td className="px-6 py-4 text-sm bg-indigo-50">
                    <div className="font-bold text-gray-900">{m.name}</div>
                    {m.linkedinUrl !== "#" && <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">LinkedIn</a>}
                  </td>
                )}

                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-indigo-200 text-indigo-800">
                    Manager
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-gray-500">
                  {formatApprovers(m.approvals)}
                </td>
                {isManagerOnChain && (
                  <td className="px-6 py-4 text-right">
                    {!(address && m.walletAddress.toLowerCase() === address.toLowerCase()) && (
                      <button onClick={() => handleRemoveManager(m.walletAddress)} className="text-red-600 hover:text-red-900 text-sm font-bold bg-red-50 px-3 py-1 rounded border border-red-200">
                        Revoke (On-Chain)
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {trueManagers.length === 0 && (
              <tr>
                <td colSpan={isManagerOnChain ? 5 : 4} className="px-6 py-8 text-center text-gray-500">No managers found on the blockchain.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- TABLE 2: VERIFIED MEMBERS --- */}
      <h2 className="text-xl font-semibold mb-4 text-green-700">Verified Organization Members ({regularMembers.length})</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8 border border-green-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-green-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wallet Address</th>
              {isManagerOnChain && <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase font-bold bg-indigo-50">Private Details</th>}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {regularMembers.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4 text-sm font-mono text-gray-800">
                  <div className="flex items-center gap-2">
                    <span>{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                    <button onClick={() => copyToClipboard(m.walletAddress)} className="text-gray-400 hover:text-indigo-600 transition" title="Copy Full Address">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </td>

                {isManagerOnChain && (
                  <td className="px-6 py-4 text-sm bg-indigo-50">
                    <div className="font-bold text-gray-900">{m.name}</div>
                    <div className="text-gray-500">{m.id}</div>
                    <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">LinkedIn</a>
                  </td>
                )}

                <td className="px-6 py-4 text-xs font-mono text-gray-500">
                  {formatApprovers(m.approvals)}
                </td>
              </tr>
            ))}
            {regularMembers.length === 0 && (
              <tr>
                <td colSpan={isManagerOnChain ? 3 : 2} className="px-6 py-8 text-center text-gray-500">No verified members yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- TABLE 3: PENDING APPROVALS --- */}
      <h2 className="text-xl font-semibold mb-4 text-yellow-600">Pending Member Approvals ({pending.length})</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wallet Address</th>
              {isManagerOnChain && <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase font-bold bg-indigo-50">Private Details</th>}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Signatures</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pending.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4 text-sm font-mono text-gray-800">
                  <div className="flex items-center gap-2">
                    <span>{m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}</span>
                    <button onClick={() => copyToClipboard(m.walletAddress)} className="text-gray-400 hover:text-indigo-600 transition" title="Copy Full Address">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </td>

                {isManagerOnChain && (
                  <td className="px-6 py-4 text-sm bg-indigo-50">
                    <div className="font-bold text-gray-900">{m.name}</div>
                    <div className="text-gray-500">{m.id}</div>
                    <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">LinkedIn</a>
                  </td>
                )}

                <td className="px-6 py-4 text-xs font-mono text-gray-500">
                  {m.approvals.length > 0 ? formatApprovers(m.approvals) : "None yet"}
                </td>

                <td className="px-6 py-4 text-right">
                  {isManagerOnChain ? (
                    !m.approvals.includes(address?.toLowerCase() || "") ? (
                      <button 
                        onClick={() => handleApprove(m.id)}
                        className="bg-black text-white px-4 py-1 rounded text-sm hover:bg-gray-800"
                      >
                        Sign & Approve
                      </button>
                    ) : (
                      <span className="text-green-600 font-bold text-sm">Signed ✓</span>
                    )
                  ) : (
                    <span className="text-gray-400 text-sm italic">Pending Multi-Sig</span>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={isManagerOnChain ? 4 : 3} className="px-6 py-8 text-center text-gray-500">No pending applications.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}