import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { PREVIEW } from "@/lib/preview";

const guard = auth.middleware({
  loginUrl: "/auth/sign-in",
  // Everything needs a session except the customer-facing pages (customers have no login).
  // /auth/* and /api/auth are public by default.
  publicRoutes: ["/", "/pay", "/call-sim", "/media"],
});

// Design preview (dev only): skip the login redirect.
export default PREVIEW ? () => NextResponse.next() : guard;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
