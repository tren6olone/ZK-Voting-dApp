'use client'

import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';

// 1. PASTE YOUR NEW PROPOSAL REGISTRY ADDRESS HERE
const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// 2. The exact ABI for the write function
const PROPOSAL_ABI = [
  "function createProposal(string _title, string _description, bytes _serverTicket) external",
  "event ProposalCreated(uint256 indexed id, address indexed creator, string title)"
];

export default function CreateProposal() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');

  // Form State
  const [email, setEmail] = useState(""); // Needed to look up the user in Firebase
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !walletProvider || !address) {
      alert("Please connect your Web3 wallet first.");
      return;
    }

    setIsSubmitting(true);

    try {
      // STEP 1: Ask the Next.js API for the Cryptographic Ticket
      const ticketResponse = await fetch('/api/generate-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: email,
          userWallet: address,
          title: title,
          description: description
        })
      });

      const ticketData = await ticketResponse.json();

      if (!ticketData.success) {
        alert("API Error: " + ticketData.error);
        setIsSubmitting(false);
        return;
      }

      const serverTicket = ticketData.ticket;
      
      // STEP 2: Pop up MetaMask to pay the gas and submit to the Blockchain
      alert("Ticket verified by Server! Please confirm the MetaMask transaction to pay the gas fee and create your proposal on-chain.");

      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const contract = new Contract(PROPOSAL_CONTRACT_ADDRESS, PROPOSAL_ABI, signer);

      // Call the smart contract with the User's Data + The Server's Ticket
      const tx = await contract.createProposal(title, description, serverTicket);

      alert("Transaction submitted! Waiting for the blockchain to mine it...");
      await tx.wait(); // Wait for it to be permanently etched into the local block

      alert("SUCCESS! 🚀 Proposal permanently created on the blockchain!");

      // Clear the form
      setTitle("");
      setDescription("");
      setEmail("");

    } catch (error: unknown) {
  console.error("Proposal creation failed:", error);

  if (error instanceof Error) {
    console.error(error.message);
  }

  alert("Transaction failed or rejected by contract. Check console for details.");
} finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold">DAO Proposals</h1>
        <appkit-button />
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-2xl font-semibold mb-6">Create a New Proposal</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Registered Email (For Verification)</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500"
              placeholder="bhuvan@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proposal Title</label>
            <input 
              type="text" 
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Allocate 5 ETH to Marketing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Description</label>
            <textarea 
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500"
              placeholder="Explain why the DAO should vote for this..."
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || !isConnected}
            className={`w-full py-3 rounded-md font-bold text-white shadow-md transition ${
              isSubmitting || !isConnected
              ? "bg-gray-400 cursor-not-allowed" 
              : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isSubmitting ? "Processing Verification & Transaction..." : "Submit Proposal"}
          </button>
        </form>
      </div>
    </div>
  );
}