import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { User } from "../../src/db/types";
import { db, request, resetEnv, setCookieValue, setEnv } from "./helpers/app";

const originalFetch = globalThis.fetch;

function stubVerify(claims: Record<string, unknown> | null, status = 200) {
  globalThis.fetch = (async () =>
    new Response(
      claims
        ? JSON.stringify({ ok: true, data: { claims } })
        : JSON.stringify({ ok: false, error: "That token is not valid." }),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    )) as unknown as typeof fetch;
}

function claims(email: string) {
  return {
    sub: crypto.randomUUID(),
    email,
    name: "Ennio",
    role: "user",
    projects: [],
    aud: "convertx",
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEnv();
});

beforeEach(() => {
  setEnv({ ENNIO_AUTH: true, ENNIO_API: "https://api.test", ENNIO_PROJECT: "convertx" });
});

describe("POST /auth/ennio", () => {
  test("turns a valid ennio.vip token into a ConvertX session", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    stubVerify(claims(email));

    const response = await request("/auth/ennio", { json: { token: "good-token" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(setCookieValue(response, "auth")).toBeString();

    const user = db.query("SELECT * FROM users WHERE email = ?").get(email) as User | null;
    expect(user).not.toBeNull();
    expect(user?.ennio_id).toBeString();
  });

  test("reuses the local row for the same ennio account", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const payload = claims(email);
    stubVerify(payload);

    await request("/auth/ennio", { json: { token: "first" } });
    await request("/auth/ennio", { json: { token: "second" } });

    const rows = db.query("SELECT * FROM users WHERE ennio_id = ?").all(payload.sub) as User[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.email).toBe(email);
  });

  test("refuses a token the ennio.vip API rejects", async () => {
    stubVerify(null, 401);

    const response = await request("/auth/ennio", { json: { token: "bad-token" } });

    expect(response.status).toBe(401);
    expect(setCookieValue(response, "auth")).toBeUndefined();
  });
});

describe("pages in ennio auth mode", () => {
  test("the login page loads the shared library", async () => {
    const response = await request("/login");

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("https://api.ennio.vip/v1/auth.js");
    expect(body).toContain("ennio.vip account");
  });

  test("the local setup and register pages are closed", async () => {
    const setup = await request("/setup");
    const register = await request("/register");

    expect(setup.status).toBe(302);
    expect(setup.headers.get("location")).toBe("/login");
    expect(register.status).toBe(302);
    expect(register.headers.get("location")).toBe("/login");
  });

  test("a valid session opens the converter", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    stubVerify(claims(email));

    const login = await request("/auth/ennio", { json: { token: "good-token" } });
    const auth = setCookieValue(login, "auth") as string;

    const response = await request("/", { cookies: { auth } });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Choose a file");
  });

  test("the logoff page signs out of ennio.vip too", async () => {
    const response = await request("/logoff");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("EnnioAuth.logout()");
  });
});
