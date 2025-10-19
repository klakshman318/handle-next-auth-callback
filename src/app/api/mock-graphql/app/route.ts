export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { query, variables } = await req.json();
        if (typeof query !== "string") {
            return NextResponse.json({ errors: [{ message: "Invalid query" }] }, { status: 400 });
        }

        // profile(userId)
        if (query.includes("profile(")) {
            const userId = String(variables?.userId ?? "");
            const complete = userId.length % 2 === 1; // deterministic mock
            return NextResponse.json({ data: { profile: { complete } } }, { headers: { "cache-control": "no-store" } });
        }

        // entitlements(userId)
        if (query.includes("entitlements(")) {
            const userId = String(variables?.userId ?? "");
            const features = ["kpi.read", "map.view"];
            if (userId.includes("8")) features.push("force.external");
            return NextResponse.json({ data: { entitlements: { features } } }, { headers: { "cache-control": "no-store" } });
        }

        // dashboardDecision(features)
        if (query.includes("dashboardDecision(")) {
            const features: string[] = Array.isArray(variables?.features) ? variables.features : [];
            const forceExternal = features.includes("force.external");
            return NextResponse.json({ data: { dashboardDecision: { forceExternal } } }, { headers: { "cache-control": "no-store" } });
        }

        return NextResponse.json({ errors: [{ message: "Unsupported operation" }] }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ errors: [{ message: e?.message || "bad request" }] }, { status: 400 });
    }
}
