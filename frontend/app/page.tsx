// app/page.tsx
'use client'

import { motion } from "framer-motion";
import Link from "next/link";

export default function Home() {
  // Split the text for staggered animation
  const titleText = "A decentralized organizational voting system using Ethereum blockchain".split(" ");
  
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      
      {/* --- Ambient Background Glow --- */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/4 translate-y-1/4 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* --- Main Content --- */}
      <div className="max-w-4xl mx-auto px-6 text-center z-10">
        
        {/* Animated Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-block mb-6 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(99,102,241,0.2)]"
        >
          Zero-Knowledge Security
        </motion.div>

        {/* Staggered Title Animation */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
          {titleText.map((word, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: index * 0.1, // Staggers each word!
                ease: [0.2, 0.65, 0.3, 0.9],
              }}
              className="inline-block mr-3 lg:mr-4 last:mr-0"
            >
              {/* Highlight specific words for Web3 aesthetic */}
              {word.toLowerCase() === "decentralized" || word.toLowerCase() === "ethereum" ? (
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                  {word}
                </span>
              ) : (
                word
              )}
            </motion.span>
          ))}
        </h1>

        {/* Subtitle Fade In */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="text-lg md:text-xl text-neutral-400 mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Gasless voting. Cryptographic privacy. Multi-signature governance. 
          Experience the future of organizational consensus without compromising on security.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link 
            href="/vote" 
            className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all transform hover:scale-105"
          >
            Enter Voting Dashboard
          </Link>
          <Link 
            href="/proposals" 
            className="w-full sm:w-auto px-8 py-4 rounded-lg font-bold text-neutral-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all transform hover:scale-105"
          >
            Create Proposal
          </Link>
        </motion.div>
      </div>
    </div>
  );
}