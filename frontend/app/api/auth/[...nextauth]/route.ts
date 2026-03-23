import NextAuth, { NextAuthOptions } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";

export const authOptions: NextAuthOptions = {
  providers: [
    LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      
      // Explicitly tell NextAuth to expect this exact issuer from LinkedIn
      issuer: "https://www.linkedin.com/oauth", 
      jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks", // Explicitly define the JWKS endpoint for token verification
      
      authorization: {
        params: { scope: "openid profile email" },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // 1. Check if LinkedIn successfully returned an email
      if (!user.email) {
        console.warn("Blocked login attempt: No email provided by LinkedIn.");
        return false;
      }
      
      // 2. The gates are open! Allow anyone with a valid LinkedIn account to log in.
      return true; 
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };