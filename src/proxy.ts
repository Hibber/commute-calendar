import { clerkMiddleware } from "@clerk/nextjs/server";

// Renamed from `middleware.ts`, the convention Next.js 16 deprecated.
//
// This only attaches Clerk's session to the request so `auth()` works in route
// handlers and server components. It deliberately does NOT authorize anything:
// both Next.js and Clerk now advise against proxy/middleware route matching for
// authorization, because path matching can diverge from how requests actually
// route and leave protected resources reachable. Every route handler checks for
// itself via `requireUser()` / `requireAdmin()` in `src/lib/auth.ts`.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
