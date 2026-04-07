'use client'
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Proposal, VoteType } from "../types";
import { AnimatedCounter } from "./AnimatedCounter";

interface TallyResults {
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
}

interface Props {
  proposal: Proposal;
  totalMembers: number;
  currentTime: number;
  onVote: (id: number, type: VoteType) => void;
  onFinalize: (id: number) => Promise<TallyResults | null>; // Strictly typed to return numbers
  isVoting: boolean;
  isFinalizing: boolean;
}

export function ProposalCard({ proposal, totalMembers, currentTime, onVote, onFinalize, isVoting, isFinalizing }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const hasAttemptedAutoTally = useRef(false);
  
  // OPTIMISTIC & ERROR STATES
  const [localTallied, setLocalTallied] = useState(proposal.isTallied);
  const [autoTallyFailed, setAutoTallyFailed] = useState(false);
  
  const [localResults, setLocalResults] = useState({
    yes: proposal.yesVotes,
    no: proposal.noVotes,
    abstain: proposal.abstainVotes
  });
  
  const effectiveTotalMembers = proposal.isTallied && proposal.totalEligibleVoters 
    ? proposal.totalEligibleVoters 
    : totalMembers;

  const isTimeExpired = currentTime >= proposal.endTime;
  const is100PercentVoted = proposal.votesCast === effectiveTotalMembers;
  const isVotingOpen = !isTimeExpired && !is100PercentVoted && !localTallied;
  const participationPercent = Math.min(((proposal.votesCast || 0) / effectiveTotalMembers) * 100, 100);
  
  // --- AUTOMATIC TALLY EFFECT (STRICT MODE & INFINITE LOOP PROOF) ---
  useEffect(() => {
    const triggerAutoTally = async () => {
      if (!isVotingOpen && !localTallied && !isFinalizing && !hasAttemptedAutoTally.current) {
        
        hasAttemptedAutoTally.current = true; // Lock it to prevent infinite loops
        setAutoTallyFailed(false);
        
        try {
          const results = await onFinalize(proposal.id);
          
          // STRICT SHIELD: Ensure we received a real object with yesVotes
          if (results && typeof results === 'object' && 'yesVotes' in results) {
            setLocalResults({ yes: results.yesVotes, no: results.noVotes, abstain: results.abstainVotes });
            setLocalTallied(true); 
          } else {
            setAutoTallyFailed(true);
          }
        } catch (error) {
          console.error("Auto-tally crashed:", error);
          setAutoTallyFailed(true);
        }
      }
    };

    triggerAutoTally();
  }, [isVotingOpen, localTallied, isFinalizing, onFinalize, proposal.id]);

  // MANUAL RETRY HANDLER
  const handleManualRetry = async () => {
    setAutoTallyFailed(false);
    const results = await onFinalize(proposal.id);
    if (results && typeof results === 'object' && 'yesVotes' in results) {
      setLocalResults({ yes: results.yesVotes, no: results.noVotes, abstain: results.abstainVotes });
      setLocalTallied(true);
    } else {
      setAutoTallyFailed(true);
    }
  };

  const getTimeRemaining = () => {
    const diff = proposal.endTime - currentTime;
    if (diff <= 0) return "Voting Closed";
    const days = Math.floor(diff / (3600 * 24));
    const hours = Math.floor((diff % (3600 * 24)) / 3600);
    return `${days}d ${hours}h`;
  };

  // DYNAMIC DECISION UI HELPER
  const getDecisionUI = () => {
    if (!localTallied) return null;
    if (localResults.yes > localResults.no) return { text: "Passed (YES)", css: "bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]" };
    if (localResults.no > localResults.yes) return { text: "Rejected (NO)", css: "bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" };
    return { text: "Tie / No Majority", css: "bg-neutral-800 text-neutral-300 border-neutral-700" };
  };

  const decision = getDecisionUI();

  return (
    <motion.div className="bg-neutral-900/60 backdrop-blur-xl rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.3)] border border-neutral-800 relative overflow-hidden transition-all pb-1">
      <div className={`absolute top-0 left-0 w-full h-1 ${isVotingOpen ? 'bg-gradient-to-r from-green-500 to-emerald-400' : localTallied ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gradient-to-r from-red-500 to-rose-500'}`} />
      
      {/* ALWAYS VISIBLE HEADER (Click to toggle) */}
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className="p-6 md:p-8 cursor-pointer hover:bg-white/5 transition-colors flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
      >
        <div className="flex-1 w-full">
          {/* TOP TAGS ROW: Status, Quorum, and Decision */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
             <span className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-full border ${isVotingOpen ? 'bg-green-500/10 text-green-400 border-green-500/30' : localTallied ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {isVotingOpen ? "● Active" : localTallied ? "Tallied" : "Closed"}
            </span>
            
            <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full bg-white/5 text-neutral-300 border border-white/10">
              Quorum: {proposal.votesCast}/{effectiveTotalMembers} ({Math.round(participationPercent)}%)
            </span>

            {localTallied && decision && (
              <span className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-full border ${decision.css}`}>
                Decision: {decision.text}
              </span>
            )}
          </div>
          
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
            {proposal.title || `Proposal #${proposal.id}`}
          </h2>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {!isVotingOpen && !localTallied && !autoTallyFailed && (
             <span className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 animate-pulse">
               Auto-Tallying...
             </span>
          )}
          {!isVotingOpen && !localTallied && autoTallyFailed && (
             <span className="text-xs font-bold text-red-400 uppercase tracking-wider bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
               Network Error
             </span>
          )}
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 border border-neutral-700 shadow-inner">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </motion.div>
        </div>
      </div>

      {/* ACCORDION CONTENT */}
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="overflow-hidden">
            <div className="px-6 pb-6 md:px-8 md:pb-8 pt-0 border-t border-white/5 mt-2">
              
              <div className="flex flex-wrap items-center gap-3 my-6">
                <span className="text-xs font-mono bg-neutral-800 text-neutral-300 px-3 py-1.5 rounded-md border border-neutral-700 shadow-inner">
                  By: <span className="text-indigo-400">{proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}</span>
                </span>
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider bg-black/20 px-3 py-1.5 rounded-md">
                  {isTimeExpired ? "Voting Window Closed" : `Ends in: ${getTimeRemaining()}`}
                </span>
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-xs text-neutral-400 mb-2 font-bold uppercase tracking-widest">
                  <span>Participation Progress</span>
                  <span className="text-indigo-300">{proposal.votesCast} / {effectiveTotalMembers} Voted</span>
                </div>
                <div className="w-full bg-neutral-950 rounded-full h-3 border border-neutral-800 overflow-hidden shadow-inner">
                  <motion.div animate={{ width: `${participationPercent}%` }} className={`h-full rounded-full relative ${localTallied ? 'bg-indigo-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}>
                    {!localTallied && <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30 rounded-full animate-pulse" />}
                  </motion.div>
                </div>
              </div>

              <div className="text-neutral-300 mb-8 bg-neutral-950/50 p-5 rounded-xl border border-neutral-800 leading-relaxed shadow-inner">
                {proposal.description || "Loading description from database..."}
              </div>

              <div className="border-t border-white/5 pt-8 mt-2">
                <div className="flex-1 flex flex-col md:flex-row gap-4">
                  {isVotingOpen ? (
                    <>
                      <button disabled={isVoting} onClick={() => onVote(proposal.id, 'YES')} className="w-full flex-1 bg-green-600/20 text-green-400 border border-green-500/30 py-3.5 rounded-xl font-bold hover:bg-green-600 hover:text-white disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                        {isVoting ? "Generating Proof..." : "Vote YES (ZK)"}
                      </button>
                      <button disabled={isVoting} onClick={() => onVote(proposal.id, 'NO')} className="w-full flex-1 bg-red-600/20 text-red-400 border border-red-500/30 py-3.5 rounded-xl font-bold hover:bg-red-600 hover:text-white disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                        {isVoting ? "Generating Proof..." : "Vote NO (ZK)"}
                      </button>
                      <button disabled={isVoting} onClick={() => onVote(proposal.id, 'ABSTAIN')} className="w-full flex-1 bg-neutral-600/20 text-neutral-300 border border-neutral-500/30 py-3.5 rounded-xl font-bold hover:bg-neutral-600 hover:text-white disabled:opacity-50 transition-all">
                        {isVoting ? "Generating Proof..." : "Vote ABSTAIN"}
                      </button>
                    </>
                  ) : !localTallied ? (
                    autoTallyFailed ? (
                      <button disabled={isFinalizing} onClick={handleManualRetry} className="w-full bg-red-900/60 text-red-300 py-4 rounded-xl font-bold flex items-center justify-center gap-3 border border-red-500/50 hover:bg-red-800 transition-colors">
                        {isFinalizing ? "Retrying Decryption..." : "Auto-Tally Failed. Click to Retry Manually"}
                      </button>
                    ) : (
                      <div className="w-full bg-indigo-900/40 text-indigo-300 py-4 rounded-xl font-bold flex items-center justify-center gap-3 border border-indigo-500/30 shadow-inner">
                        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        {is100PercentVoted ? "100% Voted: Oracle is Decrypting Ballots..." : "Time Expired: Oracle is Decrypting Ballots..."}
                      </div>
                    )
                  ) : (
                    <div className="flex justify-between w-full bg-neutral-950 p-6 rounded-xl border border-neutral-800 shadow-inner relative overflow-hidden">
                      <div className="text-center w-1/3 border-r border-neutral-800 z-10">
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Yes</p>
                        <p className="text-4xl font-extrabold text-green-400"><AnimatedCounter to={localResults.yes} /></p>
                      </div>
                      <div className="text-center w-1/3 border-r border-neutral-800 z-10">
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">No</p>
                        <p className="text-4xl font-extrabold text-red-400"><AnimatedCounter to={localResults.no} /></p>
                      </div>
                      <div className="text-center w-1/3 z-10">
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">Abstain</p>
                        <p className="text-4xl font-extrabold text-neutral-300"><AnimatedCounter to={localResults.abstain} /></p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL BLOCKCHAIN PROCESSING INDICATOR */}
      <AnimatePresence>
        {(isVoting || isFinalizing) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 20 }} 
            className="absolute bottom-0 left-0 w-full bg-indigo-600/90 backdrop-blur-md border-t border-indigo-400 text-center py-2.5 px-4 z-20"
          >
            <span className="text-xs font-mono text-white flex items-center justify-center gap-3">
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Cryptography & Blockchain verification in progress. This may take up to 15 seconds...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}