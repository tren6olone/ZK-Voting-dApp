'use client'
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDaoCore } from "./hooks/useDaoCore";
import { useDaoTransactions } from "./hooks/useDaoTransactions";
import MembersTables from "@/components/MembersTables";

export default function MembersRoster() {
  // 1. Data & State Layer
  const { address, walletProvider, members, isManagerOnChain, onChainRoot, onChainManagers, totalManagersCount, pendingRootTxs, pendingManagerTxs } = useDaoCore();

  // 2. Strict UI Filtering (Derived State)
  const pending = members.filter(m => m.status === 'pending' && !onChainManagers.includes(m.walletAddress.toLowerCase()));
  const verified = members.filter(m => m.status === 'verified' && !onChainManagers.includes(m.walletAddress.toLowerCase()));
  const revoked = members.filter(m => m.status === 'revoked'); 
  
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

  // 3. The Business Logic Service Layer
  const {
    isSubmittingAction, isGenerating,
    handleApprove, handleNominate, handleVoteRemoveManager, handleExecuteManagerTx, handleSignManagerTx,
    handleVoteRevokeMember, handlePromoteToManager, handleGenerateTree, handleSignQueuedRoot, handleExecuteRoot
  } = useDaoTransactions({ address, walletProvider, totalManagersCount, onChainRoot, pendingRootTxs, revoked });

  // 4. Local UI Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', name: '', linkedinUrl: '', walletAddress: '', isManager: false });

  const onSubmitNomination = (e: React.FormEvent) => {
    handleNominate(e, newMember);
  };

  // 5. The View (Pure UI Composition)
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="p-8 max-w-6xl mx-auto relative z-10">
      {/* Background Ambience */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* THE QUEUE DASHBOARD */}
      {(pendingRootTxs.length > 0 || pendingManagerTxs.length > 0) && isManagerOnChain && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10 bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 shadow-[0_0_30px_rgba(245,158,11,0.15)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <h2 className="text-xl font-bold text-amber-400 mb-4">Transaction Queue ({pendingRootTxs.length + pendingManagerTxs.length})</h2>
          
          <div className="space-y-4">
            {/* Merkle Root Updates */}
            {pendingRootTxs.map((tx, index) => {
              const hasSigned = tx.signatures.some(s => s.signer.toLowerCase() === address?.toLowerCase());
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
                      <button onClick={() => handleExecuteRoot(tx)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg animate-pulse">Pay Gas & Execute</button>
                    ) : hasSigned ? (
                      <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-4 py-2.5 rounded-lg border border-amber-400/20">Waiting on others...</span>
                    ) : (
                      <button onClick={() => handleSignQueuedRoot(tx)} className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg">Sign this Update</button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Manager Updates */}
            {pendingManagerTxs.map((tx) => {
              const hasSigned = tx.signatures.some(s => s.signer.toLowerCase() === address?.toLowerCase());
              const isReady = tx.signatures.length >= totalManagersCount;
              return (
                <div key={tx.targetAddress} className="bg-black/40 border border-red-500/30 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <div className="text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
                      <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded text-[10px] uppercase">Manager {tx.action}</span>
                    </div>
                    <div className="text-xs font-mono text-white/70">Target: {tx.targetAddress.slice(0, 15)}...</div>
                    <div className="text-xs font-mono text-white/50 mt-1">Signatures: {tx.signatures.length} / {totalManagersCount}</div>
                  </div>
                  <div>
                    {isReady ? (
                      <button onClick={() => handleExecuteManagerTx(tx)} className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(220,38,38,0.4)] animate-pulse">Pay Gas & Execute</button>
                    ) : hasSigned ? (
                      <span className="text-red-400 font-bold text-xs bg-red-400/10 px-4 py-2.5 rounded-lg border border-red-400/20">Waiting on others...</span>
                    ) : (
                      <button onClick={() => handleSignManagerTx(tx)} className="bg-red-600/80 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg">Sign this Request</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* HEADER & CONTROLS */}
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
              <button 
                onClick={handleGenerateTree}
                disabled={isGenerating || (verified.length === 0 && revoked.length === 0)}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all transform hover:scale-105 ${
                  isGenerating || (verified.length === 0 && revoked.length === 0) ? "bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none border border-neutral-700" : "bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50"
                }`}
              >
                {isGenerating ? "Computing..." : "Compute New Root & Queue It"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* INJECTED FORM */}
      <AnimatePresence>
        {isManagerOnChain && showAddForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }}>
            <div className="bg-neutral-900/60 backdrop-blur-md p-6 rounded-xl border border-indigo-500/20 mb-10">
              <h2 className="text-xl font-bold mb-5 text-indigo-300">{newMember.isManager ? "Add Governance Manager (On-Chain)" : "Nominate Member (Off-Chain)"}</h2>
              <div className="flex items-center gap-3 mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <input type="checkbox" id="isManager" className="w-5 h-5 rounded border-neutral-700 bg-neutral-900" checked={newMember.isManager} onChange={e => setNewMember({...newMember, isManager: e.target.checked})} />
                <label htmlFor="isManager" className="text-sm font-bold text-purple-300">Grant Manager Permissions (Requires On-Chain EIP-712 Signature)</label>
              </div>
              <form onSubmit={onSubmitNomination} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* INJECTED TABLES UI */}
      <MembersTables 
        address={address}
        isManagerOnChain={isManagerOnChain}
        totalManagersCount={totalManagersCount}
        pendingManagerTxs={pendingManagerTxs}
        trueManagers={trueManagers}
        verified={verified}
        pending={pending}
        revoked={revoked}
        handleVoteRemoveManager={handleVoteRemoveManager}
        handleSignManagerTx={handleSignManagerTx}
        handlePromoteToManager={handlePromoteToManager}
        handleVoteRevokeMember={handleVoteRevokeMember}
        handleApprove={handleApprove}
      />
    </motion.div>
  );
}