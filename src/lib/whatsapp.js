// Low-level WhatsApp Cloud API client. Every notification is sent as an approved
// message TEMPLATE (never free-form text), because the tutor is always the one
// starting the conversation - WhatsApp does not allow free-form business-initiated
// messages outside a customer service window.
//
// Required in .env.local once the Meta app is set up:
//   WHATSAPP_PHONE_NUMBER_ID
//   WHATSAPP_ACCESS_TOKEN
//   WHATSAPP_GRAPH_VERSION (check the current version in your Meta App Dashboard)

const LANGUAGE = "ar";
const TEMPLATE_STATUSES = new Set(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED"]);
const SEND_FAILURE = "تعذر إرسال رسالة WhatsApp. أعد المحاولة.";
const INVITATION_FAILURE = "تعذر إرسال الدعوة لهذا الطالب. أعد المحاولة.";

export function whatsAppFailureDiagnostics(result = {}) {
  return Object.fromEntries(["httpStatus", "providerCode", "providerSubcode"]
    .filter((key) => Number.isSafeInteger(result?.[key]) && result[key] >= 0)
    .map((key) => [key, result[key]]));
}

// Explain known configuration failures using fixed text, never Meta's message.
export function whatsAppFailureMessage(result = {}) {
  const { providerCode } = whatsAppFailureDiagnostics(result);
  switch (providerCode) {
    case 100:
      return "رفض Meta طلب الإرسال. راجع Phone Number ID وصلاحيات رمز الوصول وبيانات الطلب.";
    case 190:
      return "رمز وصول WhatsApp غير صالح أو انتهت صلاحيته. حدّث WHATSAPP_ACCESS_TOKEN في ملف .env ثم أعد تشغيل الخادم.";
    case 10:
    case 200:
    case 131005:
      return "رمز الوصول لا يملك صلاحية إرسال WhatsApp. راجع صلاحية whatsapp_business_messaging والوصول لحساب WhatsApp في Meta.";
    case 131030:
      return "رقم ولي الأمر غير مضاف لقائمة المستلمين التجريبية في Meta. أضفه وتحقق منه ثم أعد المحاولة.";
    case 132001:
      return "قالب classroom_invitation باللغة العربية غير موجود أو غير معتمد. راجع القالب في WhatsApp Manager.";
    case 132000:
      return "عدد بيانات الدعوة لا يطابق قالب classroom_invitation. راجع إعداد القالب في WhatsApp Manager.";
    case 132015:
      return "قالب classroom_invitation متوقف مؤقتاً في Meta. راجع القالب قبل إعادة الإرسال.";
    case 132016:
      return "قالب classroom_invitation معطّل في Meta. راجع تفعيله في WhatsApp Manager قبل إعادة الإرسال.";
    default:
      return providerCode === undefined ? INVITATION_FAILURE : `${INVITATION_FAILURE} (Meta: ${providerCode})`;
  }
}

export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_GRAPH_VERSION
  );
}

// Read approval before preparing a group send. Management access is optional
// for existing messaging-only integrations; an unavailable read returns null.
// A rejected token also prevents messaging, so report it before student sends.
export async function classroomInvitationTemplateStatus() {
  if (!isWhatsAppConfigured() || !process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) return null;
  try {
    const url = new URL(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`);
    url.searchParams.set("name", "classroom_invitation");
    url.searchParams.set("language", JSON.stringify([LANGUAGE]));
    url.searchParams.set("fields", "name,language,status");
    url.searchParams.set("limit", "100");
    const response = await fetch(url, {
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if ((!response.ok || data?.error) && whatsAppFailureDiagnostics({ providerCode: data?.error?.code }).providerCode === 190) {
      return "INVALID_ACCESS_TOKEN";
    }
    if (!response.ok || data?.error || !Array.isArray(data?.data)) return null;
    const matches = data.data.filter((template) => template?.name === "classroom_invitation" && template.language === LANGUAGE);
    if (!matches.length) return data.paging?.next ? null : "MISSING";
    return matches.length === 1 && TEMPLATE_STATUSES.has(matches[0].status) ? matches[0].status : null;
  } catch {
    return null;
  }
}

// Egyptian local format "01xxxxxxxxx" -> WhatsApp's expected "201xxxxxxxxx"
// (country code, no leading 0, no "+", digits only). Returns null if it doesn't look valid.
export function toWhatsAppNumber(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("20") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return "20" + digits.slice(1);
  if (digits.length === 10) return "20" + digits; // typed without the leading 0

  return null;
}

// params: array of strings, in the same order as the template's {{1}}, {{2}}, ... placeholders
export async function sendWhatsAppTemplate({ to, template, params = [] }) {
  if (!isWhatsAppConfigured()) {
    return { ok: false, status: "skipped_not_configured" };
  }

  const number = toWhatsAppNumber(to);
  if (!number) {
    return { ok: false, status: "skipped_no_phone" };
  }

  const url = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: number,
    type: "template",
    template: {
      name: template,
      language: { code: LANGUAGE },
      components:
        params.length > 0
          ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text: String(text) })) }]
          : [],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      return {
        ok: false, status: "failed", error: SEND_FAILURE, failureCategory: "provider_request",
        ...whatsAppFailureDiagnostics({
          httpStatus: res.status, providerCode: errBody?.error?.code, providerSubcode: errBody?.error?.error_subcode,
        }),
      };
    }
    return { ok: true, status: "sent" };
  } catch {
    return { ok: false, status: "failed", error: SEND_FAILURE, failureCategory: "provider_connection" };
  }
}
