import './globals.css'
import Navbar from '../components/Navbar'
import { AppKitProvider } from '@/context/AppKitProvider' 

// ⚠️ NEW: Import the SessionWrapper we just created!
import SessionWrapper from '../components/SessionWrapper' 

export const metadata = {
  title: 'ZK-DAO | Gasless Voting',
  description: 'A decentralized organizational voting system using Ethereum',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-white antialiased min-h-screen selection:bg-indigo-500 selection:text-white">
        
        {/* Turn on the NextAuth (LinkedIn) Engine */}
        <SessionWrapper> 
          
          {/* Turn on the Web3 (MetaMask) Engine */}
          <AppKitProvider>
            
            <Navbar />
            
            <main className="pt-32 pb-16">
              {children}
            </main>
            
          </AppKitProvider>
          
        </SessionWrapper>

      </body>
    </html>
  )
}