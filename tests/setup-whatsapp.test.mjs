import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { isCompatibleClassroomTemplate, runWhatsAppSetup } from "../scripts/setup-whatsapp.mjs";

const draft = JSON.parse(await readFile(new URL("../docs/whatsapp-classroom-template.json", import.meta.url), "utf8"));
const environment = {
  WHATSAPP_PHONE_NUMBER_ID: "123456", WHATSAPP_ACCESS_TOKEN: "test-private-token",
  WHATSAPP_GRAPH_VERSION: "v25.0", WHATSAPP_BUSINESS_ACCOUNT_ID: "654321",
};
const approved = { ...draft, id: "789123", parameter_format: "POSITIONAL", status: "APPROVED" };

function mockedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://graph.facebook.com");
    assert.equal(request.searchParams.has("access_token"), false);
    assert.equal(options.headers.Authorization, `Bearer ${environment.WHATSAPP_ACCESS_TOKEN}`);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    calls.push({ url: request, method: options.method, body: options.body && JSON.parse(options.body) });
    const next = responses.shift();
    assert.ok(next, "Unexpected network request");
    return new Response(JSON.stringify(next.body ?? next), { status: next.httpStatus ?? 200 });
  };
  return { fetchImpl, calls };
}

describe("WhatsApp setup without external writes", () => {
  it("reports only missing configuration names and performs no requests", async () => {
    const result = await runWhatsAppSetup(["--submit"], { environment: {}, fetchImpl: () => assert.fail("No request expected") });
    assert.equal(result.status, "MISSING_CONFIGURATION");
    assert.deepEqual(new Set(result.missing), new Set(Object.keys(environment)));
    assert.equal(JSON.stringify(result).includes(environment.WHATSAPP_ACCESS_TOKEN), false);
  });

  it("rejects invalid IDs or Graph versions before contacting the provider", async () => {
    for (const [key, value] of [["WHATSAPP_GRAPH_VERSION", "https://attacker.example"], ["WHATSAPP_BUSINESS_ACCOUNT_ID", "../messages"], ["WHATSAPP_ACCESS_TOKEN", "private\nsecret"]]) {
      const result = await runWhatsAppSetup([], { environment: { ...environment, [key]: value }, fetchImpl: () => assert.fail("No request expected") });
      assert.equal(result.status, "INVALID_CONFIGURATION");
      assert.deepEqual(result.invalid, [key]);
      assert.equal(JSON.stringify(result).includes(value), false);
    }
  });

  it("uses read-only requests to validate a compatible approved Arabic template", async () => {
    const transport = mockedFetch([{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [approved] }]);
    const result = await runWhatsAppSetup([], { environment, ...transport });
    assert.equal(result.status, "APPROVED");
    assert.equal(result.ready, true);
    assert.equal(result.submitted, false);
    assert.deepEqual(transport.calls.map((call) => call.method), ["GET", "GET"]);
    assert.equal(transport.calls[0].url.searchParams.get("fields"), "id");
    assert.equal(transport.calls[1].url.searchParams.get("name"), "classroom_invitation");
    assert.deepEqual(JSON.parse(transport.calls[1].url.searchParams.get("language")), ["ar"]);
  });

  it("does not create a missing template in default check mode", async () => {
    const transport = mockedFetch([{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [] }]);
    const result = await runWhatsAppSetup([], { environment, ...transport });
    assert.equal(result.status, "MISSING_TEMPLATE");
    assert.equal(result.submitted, false);
    assert.equal(transport.calls.some((call) => call.method !== "GET"), false);
  });

  it("submits only the reviewed draft after the configured sender matches its WABA", async () => {
    const transport = mockedFetch([
      { data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] },
      { data: [{ ...approved, language: "en_US" }, { ...approved, name: "classroom_invitation_other" }] },
      { id: "789123", status: "PENDING", category: "UTILITY" },
    ]);
    const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
    assert.equal(result.status, "PENDING");
    assert.equal(result.ready, false);
    assert.equal(result.submitted, true);
    assert.deepEqual(transport.calls.map((call) => call.method), ["GET", "GET", "POST"]);
    assert.deepEqual(transport.calls[2].body, draft);
    assert.equal(transport.calls[2].url.pathname, "/v25.0/654321/message_templates");
  });

  it("leaves existing pending or rejected templates unchanged even with --submit", async () => {
    for (const status of ["PENDING", "REJECTED"]) {
      const transport = mockedFetch([{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [{ ...approved, status }] }]);
      const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
      assert.equal(result.status, status);
      assert.equal(result.ready, false);
      assert.equal(result.submitted, false);
      assert.deepEqual(transport.calls.map((call) => call.method), ["GET", "GET"]);
    }
  });

  it("refuses to submit when the sender does not belong to the configured WABA", async () => {
    const transport = mockedFetch([{ data: [{ id: "999999" }] }]);
    const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
    assert.equal(result.status, "PHONE_ACCOUNT_MISMATCH");
    assert.equal(transport.calls.length, 1);
  });

  it("rejects incompatible bodies, named parameters, media headers, and dynamic buttons", async () => {
    const incompatible = [
      { ...approved, parameter_format: "NAMED" },
      { ...approved, components: [{ type: "BODY", text: "{{2}} {{1}} {{3}} {{4}}" }] },
      { ...approved, components: [{ type: "BODY", text: "{{1}} {{2}} {{3}} {{4}} {{5}}" }] },
      { ...approved, components: [{ type: "BODY", text: "{{student}} {{group}} {{lesson}} {{url}}" }] },
      { ...approved, components: [...draft.components, { type: "HEADER", format: "IMAGE" }] },
      { ...approved, components: [...draft.components, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://example.com/{{1}}" }] }] },
    ];
    assert.equal(isCompatibleClassroomTemplate(approved), true);
    for (const template of incompatible) {
      assert.equal(isCompatibleClassroomTemplate(template), false);
      const transport = mockedFetch([{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [template] }]);
      const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
      assert.equal(result.status, "INCOMPATIBLE_TEMPLATE");
      assert.equal(result.submitted, false);
      assert.equal(transport.calls.some((call) => call.method === "POST"), false);
    }
  });

  it("paginates only on the configured Graph endpoint without forwarding query tokens", async () => {
    const transport = mockedFetch([
      { data: [], paging: { next: "https://attacker.example/?access_token=do-not-use", cursors: { after: "next-phone-page" } } },
      { data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [approved] },
    ]);
    const result = await runWhatsAppSetup([], { environment, ...transport });
    assert.equal(result.ready, true);
    assert.equal(transport.calls[1].url.pathname, transport.calls[0].url.pathname);
    assert.equal(transport.calls[1].url.searchParams.get("after"), "next-phone-page");
  });

  it("stops before any write when template pagination or provider responses are malformed", async () => {
    for (const response of [{ data: [], paging: { next: "https://example.com" } }, { data: null }]) {
      const transport = mockedFetch([{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, response]);
      const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
      assert.equal(result.ok, false);
      assert.equal(transport.calls.some((call) => call.method === "POST"), false);
    }
  });

  it("reports provider error codes without provider messages, tokens, or phone data", async () => {
    const sensitive = `${environment.WHATSAPP_ACCESS_TOKEN} +201012345678 provider-private-text`;
    const transport = mockedFetch([{ httpStatus: 403, body: { error: { code: 190, error_subcode: 463, message: sensitive } } }]);
    const result = await runWhatsAppSetup(["--submit"], { environment, ...transport });
    assert.equal(result.status, "EXPIRED_ACCESS_TOKEN");
    assert.equal(result.ready, false);
    assert.equal(result.providerCode, 190);
    assert.equal(result.providerSubcode, 463);
    assert.match(result.review, /WHATSAPP_ACCESS_TOKEN.*restart the server/);
    assert.deepEqual(transport.calls.map((call) => call.method), ["GET"]);
    assert.equal(JSON.stringify(result).includes(sensitive), false);
    assert.equal(JSON.stringify(result).includes(environment.WHATSAPP_ACCESS_TOKEN), false);
    assert.equal(JSON.stringify(result).includes("+201012345678"), false);
    const networkFailure = await runWhatsAppSetup([], { environment, fetchImpl: async () => { throw new Error(sensitive); } });
    assert.equal(networkFailure.status, "PROVIDER_CONNECTION_FAILED");
    assert.equal(JSON.stringify(networkFailure).includes(environment.WHATSAPP_ACCESS_TOKEN), false);
  });

  it("distinguishes rejected tokens from permission failures and accepts a renewed token on retry", async () => {
    for (const subcode of [undefined, 460]) {
      const transport = mockedFetch([{ httpStatus: 401, body: { error: { code: 190, error_subcode: subcode } } }]);
      const result = await runWhatsAppSetup([], { environment, ...transport });
      assert.equal(result.status, "INVALID_ACCESS_TOKEN");
      assert.equal(result.ready, false);
      assert.equal(result.providerSubcode, subcode);
      assert.deepEqual(transport.calls.map((call) => call.method), ["GET"]);
    }
    const denied = mockedFetch([{ httpStatus: 403, body: { error: { code: 200 } } }]);
    assert.equal((await runWhatsAppSetup([], { environment, ...denied })).status, "PROVIDER_AUTHORIZATION_OR_REQUEST_REVIEW");

    const renewedEnvironment = { ...environment, WHATSAPP_ACCESS_TOKEN: "renewed-private-token" };
    const responses = [{ data: [{ id: environment.WHATSAPP_PHONE_NUMBER_ID }] }, { data: [approved] }];
    const result = await runWhatsAppSetup([], { environment: renewedEnvironment, fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${renewedEnvironment.WHATSAPP_ACCESS_TOKEN}`);
      assert.equal(options.method, "GET");
      return new Response(JSON.stringify(responses.shift()));
    } });
    assert.equal(result.ready, true);
    assert.equal(responses.length, 0);
    assert.equal(JSON.stringify(result).includes(renewedEnvironment.WHATSAPP_ACCESS_TOKEN), false);
  });
});
