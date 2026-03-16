'use client'

import { signIn, signOut, useSession } from "next-auth/react";
import WalletConnectGate from "../components/WalletConnectGate";

export default function Home() {
  // 1. Hook into the NextAuth session state
  const { data: session, status } = useSession();

  // 2. Handle the brief loading state while NextAuth checks the session cookie
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-lg text-gray-500 animate-pulse">Loading secure environment...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8 border border-gray-100">
        
        {/* Header Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ZK Voting DAO</h1>
          <p className="text-gray-500">Gasless, Anonymous Blockchain Voting System</p>
        </div>

        {/* Conditional Rendering: Step 1 (LinkedIn) vs Step 2 (Wallet) */}
        {!session ? (
          
          /* --- UNVERIFIED STATE --- */
          <div className="flex flex-col items-center gap-4 pt-8 border-t border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800">Step 1: Organizational Verification</h2>
            <p className="text-center text-gray-600 mb-4 text-sm max-w-md">
              You must be a verified member of the organization to participate in governance. Please authenticate your identity.
            </p>
            <button
              onClick={() => signIn("linkedin")}
              className="px-6 py-3 bg-[#0A66C2] text-white font-medium rounded-md hover:bg-[#004182] transition-colors w-full max-w-sm shadow-sm"
            >
              Sign in with LinkedIn
            </button>
          </div>

        ) : (

          /* --- VERIFIED STATE --- */
          <div className="flex flex-col items-center gap-6 pt-8 border-t border-gray-100">
            
            {/* User Profile Badge */}
            <div className="flex flex-col items-center w-full bg-blue-50/50 p-6 rounded-lg border border-blue-100">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full mb-3 uppercase tracking-wider">
                Verified Member
              </span>
              <p className="text-lg font-bold text-gray-900">{session.user?.name}</p>
              <p className="text-sm text-gray-500">{session.user?.email}</p>
              <button
                onClick={() => signOut()}
                className="mt-4 text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                Sign out
              </button>
            </div>

            {/* The Web3 Wallet Gate we built earlier */}
            <div className="w-full mt-2">
              <WalletConnectGate />
            </div>

          </div>
        )}
      </div>
    </main>
  );
}