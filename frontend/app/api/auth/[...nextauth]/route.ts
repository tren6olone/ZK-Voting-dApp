import NextAuth, { NextAuthOptions } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    LinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      issuer: "https://www.linkedin.com/oauth", 
      jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks", 
      authorization: {
        params: { scope: "openid profile email" },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture, // Capture Profile Picture
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
      async signIn({ user }) {
        if (!user.email) {
          console.warn("Blocked login attempt: No email provided.");
          return false;
        }
        return true; 
      },
      // NEW: Grab the account.provider (which will be 'google' or 'linkedin')
      async jwt({ token, user, account }) {
        if (account) {
          token.provider = account.provider; 
        }
        if (user) {
          token.sub = user.id;
          token.email = user.email;
          token.name = user.name;
          token.picture = user.image;
        }
        return token;
      },
      // NEW: Pass the provider to the session
      async session({ session, token }) {
        if (session.user) {
          session.user.email = token.email as string;
          session.user.name = token.name as string;
          session.user.image = token.picture as string;
          // @ts-expect-error - dynamically adding provider to session
          session.provider = token.provider; 
        }
        return session;
      },
    },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };