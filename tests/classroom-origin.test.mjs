import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { classroomInvitationOrigin, classroomRequestOrigin } from "../src/lib/classroom-origin.js";
import { checkClassroomOrigin } from "../src/lib/classroom-http.js";

describe("classroom public proxy origins", { concurrency: false }, () => {
  const publicOrigin = "https://teacher.trycloudflare.com";
  const internalOrigin = "http://localhost:3001";
  let previousPublicUrl;

  beforeEach(() => {
    previousPublicUrl = process.env.CLASSROOM_PUBLIC_URL;
    delete process.env.CLASSROOM_PUBLIC_URL;
  });
  afterEach(() => {
    if (previousPublicUrl === undefined) delete process.env.CLASSROOM_PUBLIC_URL;
    else process.env.CLASSROOM_PUBLIC_URL = previousPublicUrl;
  });

  function request(origin = internalOrigin, extraHeaders = {}) {
    return new Request(`${internalOrigin}/api/classrooms/lesson`, {
      headers: { Origin: origin, Host: new URL(origin).host, "Sec-Fetch-Site": "same-origin", ...extraHeaders },
    });
  }
  const hasStatus = (status) => (error) => error?.name === "ClassroomError" && error.status === status;

  it("uses the exact configured HTTPS origin behind a local proxy", () => {
    process.env.CLASSROOM_PUBLIC_URL = ` ${publicOrigin}/ `;
    assert.equal(classroomRequestOrigin(request(publicOrigin)), publicOrigin);
    assert.equal(classroomInvitationOrigin(internalOrigin), publicOrigin);
    assert.doesNotThrow(() => checkClassroomOrigin(request(publicOrigin)));
    assert.doesNotThrow(() => checkClassroomOrigin(request()));
  });

  it("keeps invitation redirects on the public origin without exposing the token", () => {
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    const incoming = new Request(`${internalOrigin}/api/classrooms/lesson/invite?token=private-token`, {
      headers: { Host: new URL(publicOrigin).host },
    });
    assert.equal(new URL("/classroom/lesson", classroomRequestOrigin(incoming)).href, `${publicOrigin}/classroom/lesson`);
    assert.equal(new URL("/classroom/lesson?invalid=1", classroomRequestOrigin(incoming)).href, `${publicOrigin}/classroom/lesson?invalid=1`);
    const forwarded = new Request(incoming, { headers: { Host: "localhost:3001", "X-Forwarded-Host": `${new URL(publicOrigin).host}, internal.example` } });
    assert.equal(classroomRequestOrigin(forwarded), publicOrigin);
    assert.equal(classroomRequestOrigin(new Request(`${publicOrigin}/api/classrooms/lesson/invite?token=private-token`)), publicOrigin);
  });

  it("rejects foreign origins and scheme, port, or hostname lookalikes", () => {
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    for (const origin of [
      "https://other.example", "http://teacher.trycloudflare.com", "https://teacher.trycloudflare.com:8443",
      "https://teacher.trycloudflare.com.attacker.example", "https://another.trycloudflare.com",
    ]) assert.throws(() => checkClassroomOrigin(request(origin)), hasStatus(403), origin);
  });

  it("does not trust forwarded headers as an additional allowed origin or redirect base", () => {
    const forged = request("https://attacker.example", {
      "X-Forwarded-Host": "attacker.example", "X-Forwarded-Proto": "https", Host: "attacker.example",
    });
    assert.equal(classroomRequestOrigin(forged), internalOrigin);
    assert.throws(() => checkClassroomOrigin(forged), hasStatus(403));
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    assert.equal(classroomRequestOrigin(forged), internalOrigin);
    assert.throws(() => checkClassroomOrigin(forged), hasStatus(403));
    const hostnameLookalike = request(publicOrigin, { Host: "teacher.trycloudflare.com.attacker.example", "X-Forwarded-Host": "attacker.example, teacher.trycloudflare.com" });
    assert.equal(classroomRequestOrigin(hostnameLookalike), internalOrigin);
  });

  it("still rejects cross-site requests even when their Origin is allowed", () => {
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    assert.throws(() => checkClassroomOrigin(request(publicOrigin, { "Sec-Fetch-Site": "cross-site" })), hasStatus(403));
    assert.throws(() => checkClassroomOrigin(request(internalOrigin, { "Sec-Fetch-Site": "cross-site" })), hasStatus(403));
  });

  it("preserves local origins and redirects when no public URL is configured", () => {
    const local = request();
    assert.equal(classroomRequestOrigin(local), internalOrigin);
    assert.equal(new URL("/classroom/lesson", classroomRequestOrigin(local)).href, `${internalOrigin}/classroom/lesson`);
    assert.doesNotThrow(() => checkClassroomOrigin(local));
    assert.throws(() => checkClassroomOrigin(request(publicOrigin)), hasStatus(403));
    assert.throws(() => classroomInvitationOrigin(internalOrigin), hasStatus(409));
    assert.equal(classroomInvitationOrigin(publicOrigin), publicOrigin);
    process.env.CLASSROOM_PUBLIC_URL = "   ";
    assert.equal(classroomRequestOrigin(local), internalOrigin);
  });

  it("keeps local invitation cookies and redirects on localhost with a public URL configured", () => {
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    const local = request();
    assert.equal(classroomRequestOrigin(local), internalOrigin);
    assert.equal(new URL("/classroom/lesson", classroomRequestOrigin(local)).href, `${internalOrigin}/classroom/lesson`);
    assert.doesNotThrow(() => checkClassroomOrigin(local));
  });

  it("preserves allowed requests without an Origin header", () => {
    const noOrigin = new Request(`${internalOrigin}/api/classrooms/lesson`);
    assert.doesNotThrow(() => checkClassroomOrigin(noOrigin));
    process.env.CLASSROOM_PUBLIC_URL = publicOrigin;
    assert.doesNotThrow(() => checkClassroomOrigin(noOrigin));
    assert.throws(() => checkClassroomOrigin(new Request(noOrigin, { headers: { "Sec-Fetch-Site": "cross-site" } })), hasStatus(403));
  });

  it("rejects malformed, private, or non-origin public URL settings", () => {
    for (const configured of [
      "invalid", "http://teacher.example", "https://localhost", "https://127.0.0.1", "https://10.0.0.1",
      "https://192.168.0.1", "https://[::1]", "https://[fd00::1]", "https://teacher.local", "https://teacher.internal",
      `${publicOrigin}/lesson`, `${publicOrigin}?extra=1`, `${publicOrigin}#lesson`, "https://user:password@teacher.example",
    ]) {
      process.env.CLASSROOM_PUBLIC_URL = configured;
      assert.throws(() => classroomRequestOrigin(request()), hasStatus(409), configured);
      assert.throws(() => classroomInvitationOrigin(publicOrigin), hasStatus(409), configured);
    }
  });
});
