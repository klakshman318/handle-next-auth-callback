export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runDecisionChain } from "@/lib/decision";

export async function GET(req: NextRequest) {
    const origin = new URL(req.url).origin;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.redirect(new URL("/login?error=session", origin));
    }

    try {
        const result = await runDecisionChain(session.user.id as string);
        if (result.next === "external-google") return NextResponse.redirect("https://www.google.com");
        const dest = result.next === "onboarding" ? "/onboarding" : "/dashboard";
        return NextResponse.redirect(new URL(dest, origin));
    } catch {
        return NextResponse.redirect(new URL("/login?error=chain", origin));
    }
}
