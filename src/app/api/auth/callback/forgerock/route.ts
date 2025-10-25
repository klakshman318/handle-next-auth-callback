export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const SSO_COOKIE_NAME = process.env.FORGEROCK_REQUIRED_COOKIE || "iPlanetDirectoryPro";
const rand = () => randomBytes(16).toString("hex");

// Extract "name=value" pairs from a Set-Cookie header string
function pickCookiePairs(setCookieHeader: string | null): string[] {
    if (!setCookieHeader) return [];
    // Some platforms combine multiple Set-Cookie values into a single comma-separated header.
    // We split on comma, then take only the "name=value" before the first ';'.
    return setCookieHeader
        .split(/,(?=[^ ;]+=)/) // split only where a new cookie likely starts
        .map(v => v.trim().split(";", 1)[0])
        .filter(Boolean);
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const origin = url.origin;
    const code = url.searchParams.get("code") ?? "";
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const incomingCookieHeader = req.headers.get("cookie") ?? "";

    const fromCookie =
        incomingCookieHeader
            .split(";")
            .map(s => s.trim())
            .find(s => s.startsWith(`${SSO_COOKIE_NAME}=`))
            ?.split("=", 2)?.[1] ?? "";

    const iPlanet = fromCookie || rand();
    const isFallback = !fromCookie;

    // 1) Get CSRF and CAPTURE the Set-Cookie from the response
    const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
        headers: { cookie: incomingCookieHeader, accept: "application/json" },
        cache: "no-store",
        redirect: "manual"
    });

    if (!csrfRes.ok) {
        return NextResponse.redirect(new URL(`/login?error=csrf_http_${csrfRes.status}`, origin));
    }

    const { csrfToken } = await csrfRes.json();
    if (!csrfToken) {
        return NextResponse.redirect(new URL("/login?error=csrf_missing", origin));
    }

    // Merge original cookies + CSRF cookie(s)
    const csrfSetCookie = csrfRes.headers.get("set-cookie");
    const csrfPairs = pickCookiePairs(csrfSetCookie);              // e.g. ["next-auth.csrf-token=..."]
    const mergedCookieHeader = [
        incomingCookieHeader,
        csrfPairs.join("; ")
    ].filter(Boolean).join("; ");

    // 2) POST to credentials callback WITH the merged Cookie header
    const callbackUrl = `${origin}/api/postLogin`;
    const body = new URLSearchParams({
        csrfToken,
        code,
        iPlanet,
        ...(isFallback ? { iPlanetFallback: "1" } : {})
    });

    const postRes = await fetch(
        `${origin}/api/auth/callback/credentials?` + new URLSearchParams({ callbackUrl }),
        {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                accept: "application/json",
                ...(mergedCookieHeader ? { cookie: mergedCookieHeader } : {})
            },
            body,
            redirect: "manual"
        }
    );

    const location = postRes.headers.get("location") || callbackUrl;
    const out = NextResponse.redirect(location, { status: postRes.status || 302 });

    const setCookie = postRes.headers.get("set-cookie");
    if (setCookie) out.headers.append("set-cookie", setCookie);

    return out;
}
