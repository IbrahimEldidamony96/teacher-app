import { isIP } from "node:net";
import { classroomAssert } from "@/lib/classroom-errors";

function isPublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    return first !== 0 && first !== 10 && first !== 127 && first < 224
      && !(first === 169 && second === 254)
      && !(first === 172 && second >= 16 && second <= 31)
      && !(first === 192 && second === 168)
      && !(first === 100 && second >= 64 && second <= 127);
  }
  if (isIP(host) === 6) return /^[23]/.test(host);
  return host.includes(".");
}

export function classroomInvitationOrigin(requestOrigin) {
  let url;
  try { url = new URL(process.env.CLASSROOM_PUBLIC_URL?.trim() || requestOrigin); } catch { /* Report a safe setup message below. */ }
  classroomAssert(url && url.protocol === "https:" && isPublicHost(url.hostname)
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
  "إرسال الدعوات يحتاج رابط HTTPS عاماً للتطبيق. اضبط CLASSROOM_PUBLIC_URL برابط التطبيق بدون مسار أو بيانات إضافية.", 409);
  return url.origin;
}

export function classroomRequestOrigin(request) {
  const origin = new URL(request.url).origin;
  if (!process.env.CLASSROOM_PUBLIC_URL?.trim()) return origin;
  const publicOrigin = classroomInvitationOrigin(origin);
  const publicHost = new URL(publicOrigin).host;
  const host = request.headers.get("host")?.trim().toLowerCase();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim().toLowerCase();
  // Forwarding headers may select the configured origin, never supply a new
  // redirect destination. Direct local invitations keep their local cookie.
  return origin === publicOrigin || host === publicHost || forwardedHost === publicHost ? publicOrigin : origin;
}
