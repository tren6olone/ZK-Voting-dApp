'use client'

import { useEffect, useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';

// 1. Define the TypeScript interfaces
interface Member {
  id: string;
  name: string;
  linkedinUrl: string;
  walletAddress: string;
  status: 'pending' | 'verified';
  approvals: string[];
}

// 2. Your Deployed Smart Contract Details
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MINIMAL_ABI = ["function isManager(address) view returns (bool)"];

export default function MembersRoster() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isManagerOnChain, setIsManagerOnChain] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch the roster from Firebase
  useEffect(() => {
    fetch('/api/members')
      .then(res => res.json())
      .then(data => setMembers(data.members || []));
  }, []);

  // 3. TRUE WEB3 CHECK: Ask the blockchain if the connected wallet is a manager
  useEffect(() => {
    const checkManagerStatus = async () => {
      if (isConnected && address && walletProvider) {
        try {
          const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
          const contract = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
          
          const status = await contract.isManager(address);
          setIsManagerOnChain(status);
        } catch (error) {
          console.error("Failed to check manager status on-chain:", error);
          setIsManagerOnChain(false);
        }
      } else {
        setIsManagerOnChain(false);
      }
    };
    checkManagerStatus();
  }, [isConnected, address, walletProvider]);

  // Handle Individual User Approval
  const handleApprove = async (targetEmail: string) => {
    if (!walletProvider || !address) return;

    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      
      const message = `I approve the entry of ${targetEmail} into the organization.`;
      const signature = await signer.signMessage(message);

      const response = await fetch('/api/approve-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail, signature, managerAddress: address })
      });

      const data = await response.json();
      if (data.success) {
        alert("Member approved successfully!");
        window.location.reload();
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Approval failed:", error);
    }
  };

  // 4. Handle Master Merkle Tree Generation
  const handleGenerateTree = async () => {
    if (!walletProvider || !address) return;
    setIsGenerating(true);

    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      
      const message = "I authorize the generation of the official Merkle Tree for verified members.";
      const signature = await signer.signMessage(message);

      const response = await fetch('/api/generate-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerAddress: address, signature })
      });

      const data = await response.json();
      if (data.success) {
        alert(`SUCCESS! Master Merkle Root Generated:\n\n${data.merkleRoot}\n\nTotal Members Included: ${data.totalMembers}`);
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Tree generation failed:", error);
      alert("Failed to generate tree. Check console.");
    } finally {
      setIsGenerating(false);
    }
  };

  const pending = members.filter(m => m.status === 'pending');
  const verified = members.filter(m => m.status === 'verified');

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-start mb-8 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Roster</h1>
          {isManagerOnChain && (
            <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-800 text-xs font-bold uppercase rounded-full tracking-wide">
              Verified On-Chain Manager
            </span>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-3">
          <appkit-button />
          
          {/* Only show the Master Tree button if the blockchain confirms they are a manager */}
          {isManagerOnChain && (
            <button 
              onClick={handleGenerateTree}
              disabled={isGenerating || verified.length === 0}
              className={`px-6 py-2 rounded-md font-bold text-white shadow-md transition ${
                isGenerating || verified.length === 0 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isGenerating ? "Sweeping Tree..." : "Generate Master Tree"}
            </button>
          )}
        </div>
      </div>

      {/* Verified Members Table */}
      <h2 className="text-xl font-semibold mb-4 text-green-700">Verified Members ({verified.length})</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8 border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wallet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {verified.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4">
                  <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">
                    {m.name}
                  </a>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600">
                  {m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}
                </td>
              </tr>
            ))}
            {verified.length === 0 && (
              <tr>
                <td colSpan={2} className="px-6 py-8 text-center text-gray-500">No verified members yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Applications Table */}
      <h2 className="text-xl font-semibold mb-4 text-yellow-600">Pending Approvals ({pending.length})</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden border">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approvals</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pending.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4">
                  <a href={m.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">
                    {m.name}
                  </a>
                </td>
                <td className="px-6 py-4 text-sm">
                  {m.approvals.length} / 1
                </td>
                <td className="px-6 py-4 text-right">
                  {isManagerOnChain && !m.approvals.includes(address?.toLowerCase() || "") && (
                    <button 
                      onClick={() => handleApprove(m.id)}
                      className="bg-black text-white px-4 py-1 rounded text-sm hover:bg-gray-800"
                    >
                      Sign & Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">No pending applications.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}