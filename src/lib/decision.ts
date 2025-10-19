import { gqlFetch } from "@/lib/gql";

const APP_ENDPOINT = process.env.APP_GRAPHQL_ENDPOINT!;
const APP_AUTH = process.env.APP_GRAPHQL_AUTH || "";

const PROFILE_QUERY = `
    query GetProfile($userId: ID!) {
        profile(userId: $userId) { complete }
    }
`;

const ENTITLEMENTS_QUERY = `
    query GetEntitlements($userId: ID!) {
        entitlements(userId: $userId) { features }
    }
`;

const DASHBOARD_MUTATION = `
    mutation ResolveDashboard($features: [String!]!) {
        dashboardDecision(features: $features) { forceExternal }
    }
`;

type Outcome = { next: "dashboard" | "onboarding" | "external-google" };

export async function runDecisionChain(userId: string): Promise<Outcome> {
    const headers: Record<string, string> = {};
    if (APP_AUTH) headers.authorization = APP_AUTH;

    // 1 Profile
    type ProfileGql = { profile: { complete: boolean } };
    const profile = await gqlFetch<ProfileGql>({
        endpoint: APP_ENDPOINT,
        query: PROFILE_QUERY,
        variables: { userId },
        headers
    });
    
    console.log("PROFILE:", profile);

    if (!profile?.profile?.complete) return { next: "onboarding" };

    // 2 Entitlements
    type EntGql = { entitlements: { features: string[] } };
    const ent = await gqlFetch<EntGql>({
        endpoint: APP_ENDPOINT,
        query: ENTITLEMENTS_QUERY,
        variables: { userId },
        headers
    });
    const features = ent?.entitlements?.features ?? [];

    console.log("FEATURES:", features);

    // 3 Dashboard decision
    type DashGql = { dashboardDecision: { forceExternal: boolean } };
    const dash = await gqlFetch<DashGql>({
        endpoint: APP_ENDPOINT,
        query: DASHBOARD_MUTATION,
        variables: { features },
        headers
    });

    console.log("DASHBOARD:", dash);

    if (dash?.dashboardDecision?.forceExternal) return { next: "external-google" };
    return { next: "dashboard" };
}
