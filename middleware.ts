import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Light gate: one password check, remembered in a cookie for a year.
// The dashboard data itself is public market data; this only keeps
// casual visitors out. Password is "ekingland" (set by the owner).
export function middleware(req: NextRequest) {
  const authed = req.cookies.get("ekingland_auth")?.value === "1";
  if (authed) return NextResponse.next();
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/api/market"],
};
