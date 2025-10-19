import NextAuth, { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
    secret: process.env.AUTH_SECRET,
    session: { strategy: "jwt", maxAge: 60 * 60 * 8 },

    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                userId: { label: "userId", type: "text" },
                name: { label: "name", type: "text" },
                email: { label: "email", type: "text" },
                roles: { label: "roles", type: "text" }
            },
            async authorize(creds) {
                if (!creds?.userId) return null;
                let roles: string[] = [];
                try { roles = JSON.parse(String(creds.roles ?? "[]")); } catch { }
                return {
                    id: String(creds.userId),
                    name: String(creds.name ?? ""),
                    email: String(creds.email ?? ""),
                    roles
                } as any;
            }
        })
    ],

    callbacks: {
        async jwt({ token, user }) {
            if (user) token.roles = (user as any).roles ?? [];
            return token;
        },
        async session({ session, token }) {
            if (!session.user) session.user = {} as any;
            (session.user as any).id = token.sub;
            (session.user as any).roles = (token as any).roles ?? [];
            return session;
        }
    }
};
