import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateFile = path.join(workspace, "docs", "whatsapp-classroom-template.json");
const templateName = "classroom_invitation";
const templateLanguage = "ar";
const requiredKeys = [
  "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_BUSINESS_ACCOUNT_ID",
];
const knownStatuses = new Set(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "DELETED", "LIMIT_EXCEEDED"]);
const usage = "npm run whatsapp:setup [-- --submit] (default: read-only check)";

class SetupError extends Error {
  constructor(status, details = {}) {
    super(status);
    this.details = { ok: false, status, ...details };
  }
}

function safeStatus(status) {
  return knownStatuses.has(status) ? status : "UNKNOWN";
}

// The app sends four positional BODY text arguments and no media or button
// arguments. Do not call an incompatible existing template ready to send.
export function isCompatibleClassroomTemplate(template) {
  if (template?.name !== templateName || template.language !== templateLanguage
    || (template.parameter_format && template.parameter_format !== "POSITIONAL")
    || !Array.isArray(template.components)) return false;
  const bodies = template.components.filter((component) => component?.type === "BODY");
  if (bodies.length !== 1 || typeof bodies[0].text !== "string") return false;
  const placeholders = Array.from(bodies[0].text.matchAll(/\{\{(\d+)\}\}/g), (match) => match[1]);
  if (placeholders.join(",") !== "1,2,3,4" || /\{\{|\}\}/.test(bodies[0].text.replace(/\{\{\d+\}\}/g, ""))) return false;
  return template.components.every((component) => component?.type === "BODY"
    || ((component?.type === "FOOTER" || (component?.type === "HEADER" && component.format === "TEXT"))
      && typeof component.text === "string" && !/\{\{|\}\}/.test(component.text)));
}

function configFrom(environment) {
  const values = Object.fromEntries(requiredKeys.map((key) => [key, environment[key]?.trim()]));
  const missing = requiredKeys.filter((key) => !values[key]);
  if (missing.length) throw new SetupError("MISSING_CONFIGURATION", { missing });
  const invalid = requiredKeys.filter((key) => {
    if (key === "WHATSAPP_GRAPH_VERSION") return !/^v[1-9]\d*\.\d+$/.test(values[key]);
    if (key === "WHATSAPP_ACCESS_TOKEN") return /\s/.test(values[key]);
    return !/^[1-9]\d*$/.test(values[key]);
  });
  if (invalid.length) throw new SetupError("INVALID_CONFIGURATION", { invalid });
  return values;
}

async function graphRequest(url, configuration, fetchImpl, body) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${configuration.WHATSAPP_ACCESS_TOKEN}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new SetupError("PROVIDER_CONNECTION_FAILED", { review: "Check connectivity and Meta authorization; no provider details are printed." });
  }
  let result;
  try { result = await response.json(); } catch {
    throw new SetupError("PROVIDER_RESPONSE_REVIEW", { httpStatus: response.status });
  }
  if (!response.ok || result?.error) {
    const code = Number.isSafeInteger(result?.error?.code) ? result.error.code : undefined;
    const subcode = Number.isSafeInteger(result?.error?.error_subcode) ? result.error.error_subcode : undefined;
    if (code === 190) {
      throw new SetupError(subcode === 463 ? "EXPIRED_ACCESS_TOKEN" : "INVALID_ACCESS_TOKEN", {
        httpStatus: response.status, providerCode: code, ...(subcode !== undefined && { providerSubcode: subcode }),
        ready: false,
        review: "Replace WHATSAPP_ACCESS_TOKEN in the active .env or .env.local file with a fresh Meta token, rerun npm run whatsapp:setup, then restart the server. For regular use, create a system user token with access to the app and WhatsApp account, plus whatsapp_business_messaging and whatsapp_business_management. Do not paste the token into chat.",
      });
    }
    throw new SetupError("PROVIDER_AUTHORIZATION_OR_REQUEST_REVIEW", {
      httpStatus: response.status, ...(code !== undefined && { providerCode: code }), ...(subcode !== undefined && { providerSubcode: subcode }),
      review: "Review Meta token permissions, account access, and the configured Graph version.",
    });
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new SetupError("PROVIDER_RESPONSE_REVIEW");
  return result;
}

async function graphList(url, configuration, fetchImpl) {
  const entries = [];
  const seen = new Set();
  for (let page = 0; page < 10; page += 1) {
    const result = await graphRequest(url, configuration, fetchImpl);
    if (!Array.isArray(result.data)) throw new SetupError("PROVIDER_RESPONSE_REVIEW");
    entries.push(...result.data);
    if (!result.paging?.next) return entries;
    const cursor = result.paging?.cursors?.after;
    if (typeof cursor !== "string" || !cursor || cursor.length > 4096 || seen.has(cursor)) throw new SetupError("PROVIDER_PAGINATION_REVIEW");
    seen.add(cursor);
    // Never follow provider-supplied URLs or their access_token query strings.
    // Keep every request on the configured Graph endpoint with header auth.
    url = new URL(url);
    url.searchParams.set("after", cursor);
  }
  throw new SetupError("PROVIDER_PAGINATION_REVIEW");
}

async function draftPayload() {
  let draft;
  try { draft = JSON.parse(await readFile(templateFile, "utf8")); } catch {
    throw new SetupError("TEMPLATE_DRAFT_REVIEW", { file: "docs/whatsapp-classroom-template.json" });
  }
  const body = draft?.components?.find((component) => component?.type === "BODY");
  if (!isCompatibleClassroomTemplate(draft) || draft.category !== "UTILITY" || draft.components.length !== 1
    || !Array.isArray(body?.example?.body_text) || body.example.body_text.length !== 1
    || body.example.body_text[0]?.length !== 4 || !body.example.body_text[0].every((value) => typeof value === "string" && value)) {
    throw new SetupError("TEMPLATE_DRAFT_REVIEW", { file: "docs/whatsapp-classroom-template.json" });
  }
  return draft;
}

export async function runWhatsAppSetup(args = [], { environment = process.env, fetchImpl = fetch } = {}) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { ok: true, status: "HELP", usage };
  if (!(args.length === 0 || (args.length === 1 && ["--submit", "--check"].includes(args[0])))) {
    return { ok: false, status: "INVALID_ARGUMENTS", usage };
  }
  try {
    const configuration = configFrom(environment);
    const root = `https://graph.facebook.com/${configuration.WHATSAPP_GRAPH_VERSION}/${configuration.WHATSAPP_BUSINESS_ACCOUNT_ID}`;
    const phoneUrl = new URL(`${root}/phone_numbers`);
    phoneUrl.searchParams.set("fields", "id");
    phoneUrl.searchParams.set("limit", "100");
    const phones = await graphList(phoneUrl, configuration, fetchImpl);
    if (!phones.some((phone) => phone?.id === configuration.WHATSAPP_PHONE_NUMBER_ID)) {
      return { ok: false, status: "PHONE_ACCOUNT_MISMATCH", review: "WHATSAPP_PHONE_NUMBER_ID does not belong to WHATSAPP_BUSINESS_ACCOUNT_ID." };
    }
    const templatesUrl = new URL(`${root}/message_templates`);
    templatesUrl.searchParams.set("name", templateName);
    templatesUrl.searchParams.set("language", JSON.stringify([templateLanguage]));
    templatesUrl.searchParams.set("fields", "id,name,language,status,components,parameter_format");
    templatesUrl.searchParams.set("limit", "100");
    const templates = (await graphList(templatesUrl, configuration, fetchImpl))
      .filter((template) => template?.name === templateName && template.language === templateLanguage);
    if (templates.length > 1) return { ok: false, status: "MULTIPLE_TEMPLATE_MATCHES", review: "Review existing Arabic classroom_invitation templates in WhatsApp Manager." };
    const existing = templates[0];
    if (existing) {
      const status = safeStatus(existing.status);
      const compatible = isCompatibleClassroomTemplate(existing);
      return {
        ok: compatible, status: compatible ? status : "INCOMPATIBLE_TEMPLATE", templateStatus: status,
        template: templateName, language: templateLanguage, compatible, ready: compatible && status === "APPROVED", submitted: false,
        ...(!compatible && { review: "Existing template must support four ordered BODY text parameters; it was left unchanged." }),
      };
    }
    if (!args.includes("--submit")) return {
      ok: false, status: "MISSING_TEMPLATE", template: templateName, language: templateLanguage,
      ready: false, submitted: false, next: "Review docs/whatsapp-classroom-template.json, then run npm run whatsapp:setup -- --submit.",
    };
    const draft = await draftPayload();
    const created = await graphRequest(new URL(`${root}/message_templates`), configuration, fetchImpl, draft);
    if (typeof created.id !== "string" || !/^[1-9]\d*$/.test(created.id)) throw new SetupError("PROVIDER_RESPONSE_REVIEW");
    const status = safeStatus(created.status);
    return { ok: true, status, template: templateName, language: templateLanguage, ready: status === "APPROVED", submitted: true };
  } catch (error) {
    return error instanceof SetupError ? error.details : { ok: false, status: "SETUP_REVIEW", review: "Review configuration and template draft; no internal details are printed." };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    nextEnv.loadEnvConfig(workspace, process.env.NODE_ENV !== "production", {
      info: () => {}, error: () => { throw new SetupError("ENVIRONMENT_FILE_REVIEW"); },
    });
    const result = await runWhatsAppSetup(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error("Environment files could not be loaded. Review local configuration.");
    process.exitCode = 1;
  }
}
