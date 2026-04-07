'use client'
import { motion } from "framer-motion";
import Image from 'next/image';
import { Member, ManagerQueueItem, QueueSignature } from "@/app/members/hooks/useDaoCore";

interface Props {
  address: string | undefined;
  isManagerOnChain: boolean;
  totalManagersCount: number;
  // STRICT TYPING: Replaced any[] with the actual interface
  pendingManagerTxs: ManagerQueueItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trueManagers: any[];
  verified: Member[];
  pending: Member[];
  revoked: Member[];
  handleVoteRemoveManager: (w: string) => void;
  // STRICT TYPING: Ensure the sign function expects the proper item
  handleSignManagerTx: (tx: ManagerQueueItem) => void;
  handlePromoteToManager: (w: string) => void;
  handleVoteRevokeMember: (m: Member) => void;
  handleApprove: (id: string) => void;
}

export default function MembersTables({
  address, isManagerOnChain, totalManagersCount, pendingManagerTxs,
  trueManagers, verified, pending, revoked,
  handleVoteRemoveManager, handleSignManagerTx, handlePromoteToManager, handleVoteRevokeMember, handleApprove
}: Props) {

  const formatApprovers = (approvers: string[]) => {
    if (!approvers || approvers.length === 0) return "None";
    return approvers.map(a => `${a.slice(0,6)}...${a.slice(-4)}`).join(", ");
  };

  const renderProfileCell = (m: Member, isPublic: boolean) => {
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

  const isVerifiedMember = verified.some(m => m.walletAddress.toLowerCase() === address?.toLowerCase()) || isManagerOnChain;
  const isPublic = !isVerifiedMember && !isManagerOnChain;

  return (
    <>
      {/* TABLE 1: MANAGERS */}
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
                    {renderProfileCell(m, isPublic)}
                    <td className="px-6 py-4"><span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-indigo-500/20 text-indigo-300">Manager</span></td>
                    <td className="px-6 py-4 text-xs font-mono text-neutral-500">{formatApprovers(m.approvals)}</td>
                    {isManagerOnChain && (
                        <td className="px-6 py-4 text-right">
                          {(() => {
                            const pendingTx = pendingManagerTxs.find(tx => tx.targetAddress.toLowerCase() === m.walletAddress.toLowerCase() && tx.action === 'remove');
                            // STRICT TYPING: Replaced `any` with `QueueSignature`
                            const hasVoted = pendingTx?.signatures.some((s: QueueSignature) => s.signer.toLowerCase() === address?.toLowerCase());
                            const isSelf = address && m.walletAddress.toLowerCase() === address.toLowerCase();
                    
                            // FIX: Added `&& pendingTx` check so TypeScript knows it's impossible for it to be undefined inside the return block
                            if (hasVoted && pendingTx) {
                              return <span className="text-amber-400 font-bold text-xs bg-amber-400/10 px-3 py-1.5 rounded-lg border border-amber-400/20">Voted ({pendingTx.signatures.length}/{totalManagersCount})</span>;
                            }
                    
                            return (
                                <button 
                                  onClick={() => pendingTx ? handleSignManagerTx(pendingTx) : handleVoteRemoveManager(m.walletAddress)} 
                                  className="text-red-400 hover:text-red-300 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/20 transition-colors"
                                >
                                  {/* Checking `pendingTx ?` ensures TypeScript doesn't throw the possible undefined error */}
                                  {isSelf ? "Vote to Revoke (Self)" : pendingTx ? `Sign Removal (${pendingTx.signatures.length}/{totalManagersCount})` : "Vote to Revoke"}
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

      {/* TABLE 2: VERIFIED MEMBERS */}
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
                    {renderProfileCell(m, isPublic)}
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

      {/* TABLE 3: PENDING */}
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
                    {renderProfileCell(m, isPublic)}
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

      {/* TABLE 4: REVOKED */}
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
                      {renderProfileCell(m, isPublic)}
                      <td className="px-6 py-4 text-xs font-bold text-red-400 uppercase">Revoked by Managers</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}