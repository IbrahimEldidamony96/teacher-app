import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk supplies the session; protected pages and Server Actions enforce
// access through requireUser() or requireRole("TEACHER") at each resource.
const authenticate = clerkMiddleware();

export default async function proxy(request, event) {
  const response = await authenticate(request, event);
  const rewrite = response.headers.get("x-middleware-rewrite");
  if (rewrite && new URL(rewrite).href === new URL(request.url).href) {
    // Clerk adds auth headers using a rewrite to the current URL. Behind an
    // HTTPS tunnel, Next.js can instead treat that internal URL as an external
    // HTTPS server. Continue locally while retaining Clerk's request headers.
    response.headers.delete("x-middleware-rewrite");
    response.headers.set("x-middleware-next", "1");
  }
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
