import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    if (
        pathname.startsWith("/api") ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico" ||
        pathname.startsWith("/static")
    ) {
        return NextResponse.next();
    }
    return NextResponse.next();
}
