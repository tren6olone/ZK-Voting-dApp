import NextAuth, { NextAuthOptions } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";

const WHITELISTED_EMAILS: string[] = [
  "bhuvaneshbhanusairyali@gmail.com", "akhilanadikattu@gmail.com"
];

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
      if (!user.email) return false;
      const isWhitelisted = WHITELISTED_EMAILS.includes(user.email);
      if (!isWhitelisted) {
        console.warn(`Blocked unauthorized login attempt from: ${user.email}`);
        return false; 
      }
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