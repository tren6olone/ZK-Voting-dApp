// app/hooks/useDaoTransactions.ts
import { useState } from "react";
import { BrowserProvider, Eip1193Provider, Contract } from 'ethers';
import { CONTRACT_ADDRESS, MINIMAL_ABI, Member, RootQueueItem, ManagerQueueItem } from "./useDaoCore";

interface TransactionParams {
  address: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletProvider: any;
  totalManagersCount: number;
  onChainRoot: string | null;
  pendingRootTxs: RootQueueItem[];
  revoked: Member[];
}

export function useDaoTransactions({ address, walletProvider, totalManagersCount, onChainRoot, pendingRootTxs, revoked }: TransactionParams) {
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
      } else alert("Error: " + data.error);
    } catch (error) {
      console.error("Approval failed:", error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNominate = async (e: React.FormEvent, newMember: any) => {
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
         
         await fetch('/api/multisig-manager', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ action: 'add', targetAddress: newMember.walletAddress, nonce: Number(currentNonce), deadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
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
        } else alert("Error: " + data.error);
      }
    } catch (error: unknown) {
      console.error("Nomination failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Already manager")) {
        alert("The blockchain says this wallet is ALREADY a manager! Refreshing data.");
        window.location.reload();
      } else alert("Failed to submit. Check console for details.");
    } finally {
      setIsSubmittingAction(false);
    }
  };

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
          body: JSON.stringify({ action: 'remove', targetAddress: targetWallet, nonce: Number(currentNonce), deadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
        });
        
        if (!res.ok) throw new Error(`Server returned ${res.status}: ${await res.text()}`);
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

  const handleExecuteManagerTx = async (txData: ManagerQueueItem) => {
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
        txData.signatures.forEach(s => uniqueSignaturesMap.set(s.signature, s.signer.toLowerCase()));
        if (uniqueSignaturesMap.size < totalManagersCount) return alert("Duplicate signatures detected.");
   
        const sortedSigners = Array.from(uniqueSignaturesMap.values()).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        const sortedSignatures = sortedSigners.map(signer => txData.signatures.find(s => s.signer.toLowerCase() === signer)?.signature || "");
   
        const WRITE_ABI = txData.action === 'add' 
          ? ["function addManager(address newManager, uint256 deadline, bytes[] calldata signatures) external"]
          : ["function removeManager(address manager, uint256 deadline, bytes[] calldata signatures) external"];
        
        const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
        
        alert(`Confirm gas transaction to finalize the manager's ${txData.action.toUpperCase()}.`);
        const tx = txData.action === 'add' 
          ? await contractWrite.addManager(txData.targetAddress, BigInt(txData.deadline), sortedSignatures)
          : await contractWrite.removeManager(txData.targetAddress, BigInt(txData.deadline), sortedSignatures);
        
        await tx.wait();
        await fetch('/api/multisig-manager', { method: 'DELETE', body: JSON.stringify({ targetAddress: txData.targetAddress }) });
        alert("SUCCESS! Manager queue item executed on the blockchain.");
        window.location.reload();
      } catch (error: unknown) {
        console.error("Execution failed:", error);
        alert("Failed to execute transaction. See console for details.");
      }
  };

  const handleSignManagerTx = async (txData: ManagerQueueItem) => {
     if (!walletProvider || !address) return;
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const network = await ethersProvider.getNetwork();
       const domain = { name: "ZKVoting", version: "1", chainId: network.chainId, verifyingContract: CONTRACT_ADDRESS };
       
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
  
       await fetch('/api/multisig-manager', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: txData.action, targetAddress: txData.targetAddress, nonce: txData.nonce, deadline: txData.deadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
       });
       alert("Signature successfully added to the queue!");
       window.location.reload();
     } catch (error) {
       console.error("Failed to sign manager queue:", error);
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
  
       await fetch('/api/multisig-manager', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'add', targetAddress: targetWallet, nonce: Number(currentNonce), deadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
       });
       alert("Promotion vote added to the Queue! Waiting for other managers.");
       window.location.reload();
     } catch (error) {
       console.error("Promotion failed:", error);
     } finally {
       setIsSubmittingAction(false);
     }
  };

  const handleVoteRevokeMember = async (m: Member) => {
    if (!walletProvider || !address) return;
    if (!confirm(`Are you sure you want to vote to remove ${m.name}?`)) return;
    setIsSubmittingAction(true);
    try {
      const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
      const signer = await ethersProvider.getSigner();
      const signature = await signer.signMessage(`I vote to revoke the membership of ${m.id}.`);

      const res = await fetch('/api/revoke-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: m.id, signature, managerAddress: address, totalManagersRequired: totalManagersCount })
      });
      
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        window.location.reload();
      } else alert("Error: " + data.error);
    } catch (error) {
      console.error("Failed to vote for removal:", error);
    } finally {
      setIsSubmittingAction(false);
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

      const apiSignature = await signer.signMessage("I authorize the generation of the official Merkle Tree for verified members.");
      const res = await fetch('/api/generate-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerAddress: address, signature: apiSignature })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const targetRoot = data.merkleRoot;
      if (targetRoot === onChainRoot) return alert("The blockchain is already perfectly in sync! No update is needed.");
      if (pendingRootTxs.some(tx => tx.root === targetRoot)) return alert("This specific Merkle Root is already in the queue!");

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
        body: JSON.stringify({ root: targetRoot, nonce: Number(targetNonce), deadline: targetDeadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
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

  const handleSignQueuedRoot = async (txData: RootQueueItem) => {
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
        body: JSON.stringify({ root: txData.root, nonce: txData.nonce, deadline: txData.deadline, signature: eip712Signature, signerAddress: address, totalManagersRequired: totalManagersCount })
      });
      alert("Signature added to the queue!");
      window.location.reload();
    } catch (error) {
      console.error("Failed to sign queue:", error);
    }
  };

  const handleExecuteRoot = async (txData: RootQueueItem) => {
     if (!walletProvider || !address) return;
     try {
       const ethersProvider = new BrowserProvider(walletProvider as unknown as Eip1193Provider);
       const signer = await ethersProvider.getSigner();
       const contractRead = new Contract(CONTRACT_ADDRESS, MINIMAL_ABI, ethersProvider);
  
       const currentNonce = await contractRead.nonce();
       if (Number(currentNonce) !== Number(txData.nonce)) {
           alert("The blockchain state has changed. This queued signature bundle is now invalid. Auto-deleting.");
           await fetch('/api/multisig-root', { method: 'DELETE', body: JSON.stringify({ root: txData.root }) });
           window.location.reload();
           return;
       }
  
       const uniqueSignaturesMap = new Map();
       txData.signatures.forEach(s => uniqueSignaturesMap.set(s.signature, s.signer.toLowerCase()));
       if (uniqueSignaturesMap.size < totalManagersCount) return alert(`Duplicate signatures detected.`);
  
       alert("Confirm the final gas transaction to push this state to the blockchain.");
       const sortedSigners = Array.from(uniqueSignaturesMap.values()).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
       const sortedSignatures = sortedSigners.map(signer => txData.signatures.find(s => s.signer.toLowerCase() === signer)?.signature || "");
  
       const WRITE_ABI = ["function updateMerkleRoot(uint256 newRoot, uint256 deadline, bytes[] calldata signatures) external"];
       const contractWrite = new Contract(CONTRACT_ADDRESS, WRITE_ABI, signer);
       const tx = await contractWrite.updateMerkleRoot(BigInt(txData.root), BigInt(txData.deadline), sortedSignatures);
       await tx.wait();
  
       await fetch('/api/multisig-root', { method: 'DELETE', body: JSON.stringify({ root: txData.root }) });
  
       if (revoked.length > 0) {
         for (const rm of revoked) {
           await fetch('/api/remove-member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId: rm.id }) });
         }
       }
       alert("SUCCESS! Blockchain updated.");
       window.location.reload();
     } catch (error: unknown) {
       console.error("Execution failed:", error);
       alert(`Error executing transaction.`);
     }
  };

  return {
    isSubmittingAction, isGenerating,
    handleApprove, handleNominate, handleVoteRemoveManager, handleExecuteManagerTx, handleSignManagerTx,
    handleVoteRevokeMember, handlePromoteToManager, handleGenerateTree, handleSignQueuedRoot, handleExecuteRoot
  };
}