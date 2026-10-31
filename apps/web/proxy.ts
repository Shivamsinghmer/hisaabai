import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in",
  // Everything needs a session except the customer-facing pages (customers have no login).
  // /auth/* and /api/auth are public by default.
  publicRoutes: ["/", "/pay", "/call-sim", "/media"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
