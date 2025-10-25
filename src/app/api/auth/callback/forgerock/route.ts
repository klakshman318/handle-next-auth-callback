export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const SSO_COOKIE_NAME = process.env.FORGEROCK_REQUIRED_COOKIE || "iPlanetDirectoryPro";
const rand = () => randomBytes(16).toString("hex");

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const origin = url.origin;
    const code = url.searchParams.get("code") ?? "";
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") ?? "";
    const fromCookie =
        cookieHeader
            .split(";")
            .map(s => s.trim())
            .find(s => s.startsWith(`${SSO_COOKIE_NAME}=`))
            ?.split("=", 2)?.[1] ?? "";

    const iPlanet = fromCookie || rand();
    const isFallback = !fromCookie;

    // 1) CSRF
    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
        headers: { cookie: cookieHeader, accept: "application/json" },
        cache: "no-store",
        redirect: "manual"
    });
    if (!csrfRes.ok) {
        return NextResponse.redirect(new URL("/login?error=csrf_http_${csrfRes.status}", origin));
    }
    const { csrfToken } = await csrfRes.json();
    if (!csrfToken) {
        return NextResponse.redirect(new URL("/login?error=csrf_missing", origin));
    }

    // 2) Post credentials to NextAuth and land on postLogin
    const callbackUrl = `${origin}/api/postLogin`;
    const body = new URLSearchParams({
        csrfToken,
        code,
        iPlanet,
        ...(isFallback ? { iPlanetFallback: "1" } : {})
    });

    const postRes = await fetch(
        `${url.origin}/api/auth/callback/credentials?` + new URLSearchParams({ callbackUrl }),
        {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                accept: "application/json",
                ...(cookieHeader ? { cookie: cookieHeader } : {})
            },
            body,
            redirect: "manual"
        }
    );

    const location = postRes.headers.get("location") || callbackUrl;
    const out = NextResponse.redirect(location, { status: postRes.status || 302 });

    const setCookie = postRes.headers.get("set-cookie");
    if (setCookie) out.headers.append("set-cookie", setCookie);

    console.log("Forgerock callback redirecting to:", location);
    return out;
}
