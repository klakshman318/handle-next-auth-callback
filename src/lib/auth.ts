import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { gqlFetch } from "@/lib/gql";

const SSO_COOKIE_NAME = process.env.FORGEROCK_REQUIRED_COOKIE || "iPlanetDirectoryPro";
const SSO_FALLBACK = process.env.FORGEROCK_SSO_MOCK || "MOCK_SSO_TOKEN";

const IDP_ENDPOINT = process.env.IDP_GRAPHQL_ENDPOINT!;
const IDP_AUTH = process.env.IDP_GRAPHQL_AUTH || "";

const USERINFO_QUERY = `
    query GetUserInfo($code: String!) {
        userInfo(code: $code) {
            id
            name
            email
            roles
            parentaccId
        }
    }
`;

type UserinfoGql = {
    userInfo: { id: string; name?: string; email?: string; roles?: string[]; parentaccId?: string };
};

export const authOptions: NextAuthOptions = {
    secret: process.env.AUTH_SECRET,
    session: { strategy: "jwt", maxAge: 60 * 60 * 8 },

    providers: [
        Credentials({
            name: "credentials",
            credentials: {
                // bridge fields
                code: { label: "code", type: "text" },
                iPlanet: { label: SSO_COOKIE_NAME, type: "password" },
                iPlanetFallback: { label: "iPlanetFallback", type: "text" },

                // legacy trusted fields remain supported
                userId: { label: "userId", type: "text" },
                name: { label: "name", type: "text" },
                email: { label: "email", type: "text" },
                roles: { label: "roles", type: "text" },
                parentaccId: { label: "parentaccId", type: "text" }
            },

            async authorize(creds) {
                // Bridge path from ForgeRock callback

                console.log("Authorize called with creds:", creds);
                if (creds?.code) {
                    const code = String(creds.code).trim();
                    const iPlanet = String(creds.iPlanet || "").trim();
                    const usedFallback = String(creds.iPlanetFallback || "") === "1";

                    if (!code) throw new Error("Missing code");

                    // Use provided cookie or a configured dev fallback
                    const ssoCookie = iPlanet || SSO_FALLBACK;

                    // GraphQL headers
                    const idpHeaders: Record<string, string> = {
                        cookie: `${SSO_COOKIE_NAME}=${ssoCookie}`
                    };
                    if (IDP_AUTH) idpHeaders.authorization = IDP_AUTH;

                    // Call mock GraphQL userinfo
                    let data: UserinfoGql;
                    try {
                        data = await gqlFetch<UserinfoGql>({
                            endpoint: IDP_ENDPOINT,
                            query: USERINFO_QUERY,
                            variables: { code },
                            headers: idpHeaders
                        });
                    } catch {
                        // If mock fails but this was a dev fallback, return a mock user to keep the loop testable
                        if (usedFallback && process.env.NODE_ENV !== "production") {
                            return {
                                id: "dev-" + Date.now(),
                                name: "Dev User",
                                email: null,
                                roles: ["developer"]
                            } as any;
                        }
                        throw new Error("userinfo_gql_error");
                    }

                    const u = data?.userInfo;
                    console.log("Fetched userinfo:", u);
                    if (!u?.id) {
                        if (usedFallback && process.env.NODE_ENV !== "production") {
                            return {
                                id: "dev-" + Date.now(),
                                name: "Dev User",
                                email: null,
                                roles: ["developer"]
                            } as any;
                        }
                        throw new Error("userinfo_missing_id");
                    }

                    return {
                        id: String(u.id),
                        name: u.name ?? "",
                        email: u.email ?? null,
                        roles: Array.isArray(u.roles) ? u.roles : [],
                        parentaccId: u.parentaccId ?? undefined
                    } as any;
                }

                // Legacy trusted path
                if (creds?.userId) {
                    let roles: string[] = [];
                    try {
                        roles = JSON.parse(String(creds.roles ?? "[]"));
                    } catch { }
                    return {
                        id: String(creds.userId),
                        name: String(creds.name ?? ""),
                        email: String(creds.email ?? ""),
                        roles,
                        parentaccId: creds.parentaccId ? String(creds.parentaccId) : undefined
                    } as any;
                }

                return null;
            }
        })
    ],

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                (token as any).roles = (user as any).roles ?? [];
                (token as any).parentaccId = (user as any).parentaccId ?? undefined;
            }
            return token;
        },
        async session({ session, token }) {
            if (!session.user) session.user = {} as any;
            (session.user as any).id = token.sub;
            (session.user as any).roles = (token as any).roles ?? [];
            (session.user as any).parentaccId = (token as any).parentaccId ?? undefined;
            return session;
        },
        async redirect({ baseUrl }) {
            // ensure all successful sign ins land on your decision route
            return `${baseUrl}/api/postLogin`;
        }
    },

    debug: process.env.NODE_ENV === "development"
};
