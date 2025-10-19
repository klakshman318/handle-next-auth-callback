export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { query, variables } = await req.json();

        if (typeof query !== "string" || !query.includes("userInfo")) {
            return NextResponse.json({ errors: [{ message: "Unsupported operation" }] }, { status: 400 });
        }

        const code = variables?.code ?? "000000";
        const short = String(code).slice(0, 6);

        // simulate SSO cookie requirement
        const ssoName = process.env.FORGEROCK_REQUIRED_COOKIE || "iPlanetDirectoryPro";
        const cookieHeader = req.headers.get("cookie") || "";
        if (!cookieHeader.includes(`${ssoName}=`)) {
            // allow dev fallback behavior
            const fallback = process.env.FORGEROCK_SSO_MOCK || "MOCK_SSO_TOKEN";
            if (!cookieHeader.includes(`${ssoName}=${fallback}`)) {
                return NextResponse.json({ errors: [{ message: "SSO missing" }] }, { status: 401 });
            }
        }

        return NextResponse.json({
            data: {
                userInfo: {
                    id: `user-${short}`,
                    name: `Lakshman ${short}`,
                    email: `user${short}@example.com`,
                    roles: short.endsWith("1") ? ["user", "viewer"] : ["user"]
                }
            }
        }, {
            headers: { "cache-control": "no-store" }
        });
    } catch (e: any) {
        return NextResponse.json({ errors: [{ message: e?.message || "bad request" }] }, { status: 400 });
    }
}
