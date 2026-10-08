import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { classroomInvitationTemplateStatus, sendWhatsAppTemplate, whatsAppFailureDiagnostics, whatsAppFailureMessage } from "../src/lib/whatsapp.js";

// Dummy configuration and mocked fetch only; no .env files or network requests.
describe("WhatsApp provider failure diagnostics", { concurrency: false }, () => {
  const keys = ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_BUSINESS_ACCOUNT_ID"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const privateDetails = "private-token +201012345678 https://classroom.test/invite?token=private-invite";
  const input = { to: "01012345678", template: "classroom_invitation", params: [privateDetails] };

  before(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "isolated-test-phone";
    process.env.WHATSAPP_ACCESS_TOKEN = "isolated-test-token";
    process.env.WHATSAPP_GRAPH_VERSION = "v-test";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "isolated-test-account";
  });
  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  function assertPrivate(result) {
    const serialized = JSON.stringify([result, whatsAppFailureDiagnostics(result), whatsAppFailureMessage(result)]);
    for (const sentinel of ["private-token", "201012345678", "private-invite", "isolated-test-token"]) {
      assert.equal(serialized.includes(sentinel), false, sentinel);
    }
  }

  it("reads the exact Arabic invitation approval with header auth and no message writes", async (t) => {
    t.mock.method(globalThis, "fetch", async (url, options) => {
      const request = new URL(url);
      assert.equal(request.pathname, "/v-test/isolated-test-account/message_templates");
      assert.equal(request.searchParams.has("access_token"), false);
      assert.equal(request.searchParams.get("name"), "classroom_invitation");
      assert.deepEqual(JSON.parse(request.searchParams.get("language")), ["ar"]);
      assert.equal(options.method, "GET");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, "Bearer isolated-test-token");
      return Response.json({ data: [
        { name: "classroom_invitation", language: "en_US", status: "APPROVED" },
        { name: "classroom_invitation", language: "ar", status: "PENDING", privateDetails },
      ] });
    });
    assert.equal(await classroomInvitationTemplateStatus(), "PENDING");
  });

  it("does not treat unreadable management responses as a missing template or echo private data", async (t) => {
    let response;
    t.mock.method(globalThis, "fetch", async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    for (response of [
      Response.json({ error: { message: privateDetails } }, { status: 403 }),
      new Response(privateDetails, { status: 502 }),
      Response.json({ data: [{ name: "classroom_invitation", language: "ar", status: privateDetails }] }),
      Response.json({ data: [], paging: { next: "https://example.com/private-token" } }),
      new Error(privateDetails),
    ]) assert.equal(await classroomInvitationTemplateStatus(), null);
    response = Response.json({ data: [] });
    assert.equal(await classroomInvitationTemplateStatus(), "MISSING");
  });

  it("keeps account inspection optional for existing messaging-only configuration", async (t) => {
    t.mock.method(globalThis, "fetch", () => assert.fail("No account request expected"));
    const account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    try {
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "";
      assert.equal(await classroomInvitationTemplateStatus(), null);
    } finally { process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = account; }
  });

  it("reports a rejected token before sending while preserving optional management access", async (t) => {
    let code = 190;
    const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(new URL(url).pathname, "/v-test/isolated-test-account/message_templates");
      assert.equal(options.method, "GET");
      return Response.json({ error: { code, error_subcode: 463, message: privateDetails } }, { status: 401 });
    });
    assert.equal(await classroomInvitationTemplateStatus(), "INVALID_ACCESS_TOKEN");
    for (code of [10, 200, "190", -190]) {
      assert.equal(await classroomInvitationTemplateStatus(), null);
    }
    assert.equal(fetch.mock.calls.length, 5);
    const explanation = whatsAppFailureMessage({ providerCode: 190 });
    assert.match(explanation, /WHATSAPP_ACCESS_TOKEN.*\.env.*أعد تشغيل/);
    assertPrivate({ error: explanation });
  });

  it("preserves numeric request codes and explains parameter or access failures safely", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
      error: { code: 100, error_subcode: 33, message: privateDetails, error_data: { details: privateDetails } },
    }, { status: 400 }));
    const result = await sendWhatsAppTemplate(input);
    assert.equal(fetch.mock.calls.length, 1);
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.failureCategory, "provider_request");
    assert.deepEqual(whatsAppFailureDiagnostics(result), { httpStatus: 400, providerCode: 100, providerSubcode: 33 });
    assert.match(whatsAppFailureMessage(result), /Phone Number ID/);
    assertPrivate(result);
  });

  it("explains missing Arabic invitation templates without using Meta messages", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({
      error: { code: 132001, message: privateDetails },
    }, { status: 400 }));
    const result = await sendWhatsAppTemplate(input);
    assert.match(whatsAppFailureMessage(result), /classroom_invitation.*العربية.*WhatsApp Manager/);
    assertPrivate(result);
  });

  it("rejects string, negative, fractional, and unsafe provider codes", async (t) => {
    let code;
    t.mock.method(globalThis, "fetch", async () => Response.json({
      error: { code, error_subcode: code, message: privateDetails },
    }, { status: 400 }));
    for (code of ["100", privateDetails, -1, 100.5, Number.MAX_SAFE_INTEGER + 1, null]) {
      const result = await sendWhatsAppTemplate(input);
      assert.deepEqual(whatsAppFailureDiagnostics(result), { httpStatus: 400 });
      assert.equal(whatsAppFailureMessage(result), "تعذر إرسال الدعوة لهذا الطالب. أعد المحاولة.");
      assertPrivate(result);
    }
  });

  it("keeps malformed and non-JSON response details private", async (t) => {
    let response = Response.json({ error: privateDetails }, { status: 502 });
    t.mock.method(globalThis, "fetch", async () => response);
    for (const body of [JSON.stringify({ error: privateDetails }), privateDetails]) {
      response = new Response(body, { status: 502 });
      const result = await sendWhatsAppTemplate(input);
      assert.equal(result.failureCategory, "provider_request");
      assert.deepEqual(whatsAppFailureDiagnostics(result), { httpStatus: 502 });
      assertPrivate(result);
    }
  });

  it("returns a fixed network failure category without exception details", async (t) => {
    t.mock.method(globalThis, "fetch", async () => { throw new Error(privateDetails); });
    const result = await sendWhatsAppTemplate(input);
    assert.equal(result.status, "failed");
    assert.equal(result.failureCategory, "provider_connection");
    assert.deepEqual(whatsAppFailureDiagnostics(result), {});
    assertPrivate(result);
  });

  it("provides relevant next steps for known authorization and template failures", () => {
    for (const [code, explanation] of [
      [190, /رمز وصول.*انتهت صلاحيته/],
      [10, /whatsapp_business_messaging/], [200, /whatsapp_business_messaging/], [131005, /whatsapp_business_messaging/],
      [131030, /المستلمين التجريبية/], [132000, /عدد بيانات الدعوة/],
      [132015, /متوقف مؤقتاً/], [132016, /معطّل/],
    ]) {
      assert.match(whatsAppFailureMessage({ providerCode: code }), explanation);
    }
    assert.match(whatsAppFailureMessage({ providerCode: 999999 }), /Meta: 999999/);
    assert.deepEqual(whatsAppFailureDiagnostics({ httpStatus: privateDetails, providerCode: -1, providerSubcode: "33" }), {});
  });

  it("preserves successful sends and configuration or phone skips", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ messages: [{ id: "test-message" }] }));
    assert.deepEqual(await sendWhatsAppTemplate(input), { ok: true, status: "sent" });
    assert.deepEqual(await sendWhatsAppTemplate({ ...input, to: "invalid" }), { ok: false, status: "skipped_no_phone" });
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    try {
      process.env.WHATSAPP_ACCESS_TOKEN = "";
      assert.deepEqual(await sendWhatsAppTemplate(input), { ok: false, status: "skipped_not_configured" });
    } finally {
      process.env.WHATSAPP_ACCESS_TOKEN = token;
    }
    assert.equal(fetch.mock.calls.length, 1);
  });
});
