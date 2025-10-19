export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { gqlFetch } from "@/lib/gql";

type IncomingUser = {
  userId: string;
  name?: string;
  email?: string;
  roles?: string[];
};

const SSO_COOKIE_NAME = process.env.FORGEROCK_REQUIRED_COOKIE || "iPlanetDirectoryPro";
const SSO_FALLBACK = process.env.FORGEROCK_SSO_MOCK || "MOCK_SSO_TOKEN";

const IDP_ENDPOINT = process.env.IDP_GRAPHQL_ENDPOINT!;
const IDP_AUTH = process.env.IDP_GRAPHQL_AUTH || "";

// Replace this query to match your IdP schema
const USERINFO_QUERY = `
  query GetUserInfo($code: String!) {
    userInfo(code: $code) {
      id
      name
      email
      roles
    }
  }
`;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  // Read SSO cookie with local fallback
  const ssoCookie = req.cookies.get(SSO_COOKIE_NAME)?.value || SSO_FALLBACK;

  // Query IdP GraphQL for user info
  const idpHeaders: Record<string, string> = { cookie: `${SSO_COOKIE_NAME}=${ssoCookie}` };
  if (IDP_AUTH) idpHeaders.authorization = IDP_AUTH;

  type UserinfoGql = { userInfo: { id: string; name?: string; email?: string; roles?: string[] } };
  let data: UserinfoGql;
  try {
    data = await gqlFetch<UserinfoGql>({
      endpoint: IDP_ENDPOINT,
      query: USERINFO_QUERY,
      variables: { code },
      headers: idpHeaders
    });
  } catch {
    return NextResponse.redirect(new URL("/login?error=userinfo_gql", origin));
  }

  const u = data?.userInfo;
  if (!u?.id) return NextResponse.redirect(new URL("/login?error=userinfo_shape", origin));

  const user: IncomingUser = {
    userId: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    roles: Array.isArray(u.roles) ? u.roles : []
  };

  // Fetch CSRF for NextAuth v4 credentials callback
  const csrfRes = await fetch(`${origin}/api/auth/csrf`, {
    headers: { cookie: req.headers.get("cookie") ?? "" },
    cache: "no-store"
  });
  if (!csrfRes.ok) return NextResponse.redirect(new URL("/login?error=csrf", origin));
  const { csrfToken } = await csrfRes.json();
  const setCookie = csrfRes.headers.get("set-cookie") || "";
  if (!csrfToken) return NextResponse.redirect(new URL("/login?error=csrf_token", origin));

  // Loader and auto submit
  const callbackUrl = `${origin}/api/postLogin`;
  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Signing you in</title>
  <style>
    html,body{height:100%;margin:0}
    body{display:flex;align-items:center;justify-content:center;background:#0b0c10;color:#eaf0f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Helvetica,Arial,sans-serif}
    .wrap{text-align:center;max-width:520px;padding:24px}
    .card{background:#111218;border:1px solid #1f2230;border-radius:14px;padding:28px;box-shadow:0 6px 24px rgba(0,0,0,.26)}
    .title{font-size:18px;margin:0 0 8px}
    .subtitle{font-size:14px;opacity:.85;margin:0 0 18px}
    .spinner{width:48px;height:48px;margin:18px auto 10px;border-radius:50%;border:4px solid rgba(234,240,246,.15);border-top-color:#92b4ff;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .hint{font-size:12px;opacity:.7;margin-top:10px}
    .hide{display:none}
    .btn{margin-top:14px;display:inline-block;padding:10px 14px;font-size:14px;color:#0b0c10;background:#eaf0f6;border-radius:10px;border:none;cursor:pointer}
    .btn:disabled{opacity:.6;cursor:not-allowed}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="spinner" role="status" aria-live="polite" aria-label="Signing you in"></div>
      <h1 class="title">Signing you in</h1>
      <p class="subtitle">Creating your session...</p>
      <p class="hint" id="status">This should take only a moment.</p>
      <form id="signin-form" class="hide" action="${origin}/api/auth/callback/credentials?callbackUrl=${encodeURIComponent(callbackUrl)}" method="POST">
        <input type="hidden" name="csrfToken" value="${csrfToken}">
        <input type="hidden" name="userId" value="${escapeHtml(user.userId)}">
        <input type="hidden" name="name" value="${escapeHtml(user.name ?? "")}">
        <input type="hidden" name="email" value="${escapeHtml(user.email ?? "")}">
        <input type="hidden" name="roles" value='${escapeHtml(JSON.stringify(user.roles ?? []))}'>
      </form>
    </div>
  </div>
  <script>
    const form = document.getElementById('signin-form');
    const statusEl = document.getElementById('status');
    function step(msg){ statusEl.textContent = msg; }
    requestAnimationFrame(() => form.submit());
    setTimeout(() => step("Contacting authentication service..."), 700);
    setTimeout(() => step("Finalizing session..."), 1500);
    setTimeout(() => {
      form.classList.remove('hide');
      const btn = document.createElement('button'); btn.className='btn'; btn.type='submit'; btn.textContent='Continue';
      document.querySelector('.card').appendChild(btn);
      step("If this takes too long, click Continue.");
    }, 4000);
  </script>
</body>
</html>
`.trim();

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(setCookie ? { "set-cookie": setCookie } : {})
    }
  });
}

function escapeHtml(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
