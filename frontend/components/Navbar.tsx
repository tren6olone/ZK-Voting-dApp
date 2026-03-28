'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Proposals", href: "/proposals" },
    { name: "Vote", href: "/vote" },
    { name: "Members", href: "/members" },
  ];

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
    >
      {/* Re-enable pointer events on the actual navbar container so clicks work */}
      <div className="pointer-events-auto flex items-center justify-between w-full max-w-6xl bg-neutral-950/60 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        
        {/* Logo Area */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
          <span className="text-white font-extrabold tracking-widest uppercase text-sm group-hover:text-indigo-400 transition-colors">
            ZK-Voting
          </span>
        </Link>
        
        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.name} 
                href={link.href}
                className={`text-sm font-bold tracking-wide transition-all duration-300 relative ${isActive ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {link.name}
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute -bottom-2 left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Action Area: Join DAO + Web3 Wallet */}
        <div className="flex items-center gap-4">
          <Link 
            href="/register"
            className="hidden sm:flex items-center justify-center px-5 py-2 text-sm font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-full hover:bg-indigo-500 hover:text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]"
          >
            Join DAO
          </Link>
          
          <div className="scale-90 sm:scale-100 origin-right">
            <appkit-button />
          </div>
        </div>
        
      </div>
    </motion.nav>
  );
}