'use client'

import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { BrowserProvider, Eip1193Provider } from 'ethers';
import { Identity } from "@semaphore-protocol/identity";

export default function TestIdentity() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  
  const [signMessage, setSignMessage] = useState("Associating this social account to this Web3 wallet.");
  const [commitment, setCommitment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateTestIdentity = async () => {
    if (!isConnected || !walletProvider) {
      setError("Please connect your wallet first.");
      return;
    }

    try {
      setError(null);
      setCommitment("Awaiting MetaMask signature...");

      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();

      // 1. Sign the exact message
      const signature = await signer.signMessage(signMessage);

      // 2. Generate the deterministic identity
      const identity = new Identity(signature);

      // 3. Print the commitment
      setCommitment(identity.commitment.toString());

    } catch (err: unknown) {
  console.error(err);

  let message = "Failed to generate identity";

  if (err instanceof Error) {
    message = err.message;
  }

  setError(message);
  setCommitment(null);
}
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold">Identity Debugger</h1>
        <appkit-button />
      </div>

      <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message to Sign (Must match exactly what you signed during registration)
          </label>
          <input 
            type="text" 
            value={signMessage}
            onChange={(e) => setSignMessage(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button 
          onClick={generateTestIdentity}
          disabled={!isConnected}
          className="w-full bg-black text-white py-3 rounded-md font-bold hover:bg-gray-800 disabled:bg-gray-400 transition"
        >
          Generate Identity Commitment
        </button>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {commitment && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
            <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Generated Commitment:</h3>
            <p className="font-mono text-sm break-all text-green-700 font-bold">
              {commitment}
            </p>
            <p className="text-xs text-gray-500 mt-4">
              👆 Compare this number to the `identityCommitment` in your Firebase database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}