import { randomUUID } from "node:crypto";

import db from "../db/db";
import { User } from "../db/types";
import { ENNIO_API, ENNIO_PROJECT } from "../helpers/env";

/**
 * The shared ennio.vip login.
 *
 * The page gets a five-minute token from `window.EnnioAuth.token("convertx")`.
 * The browser is not trusted: this server posts the token to the ennio.vip API
 * and only then creates a local session. A local user row keeps jobs and
 * history, and the row is keyed by the ennio account id, not by the email.
 */

const VERIFY_TIMEOUT_MS = 5000;

export interface EnnioClaims {
  sub: string;
  email: string;
  name?: string;
  role?: string;
  projects?: string[];
  aud?: string;
}

export async function verifyEnnioToken(token: string): Promise<EnnioClaims | null> {
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${ENNIO_API}/v1/auth/verify?aud=${encodeURIComponent(ENNIO_PROJECT)}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      ok?: boolean;
      data?: { claims?: EnnioClaims };
    };
    const claims = payload?.data?.claims;

    if (payload?.ok !== true || !claims?.sub || !claims.email) return null;
    // The API already checks the audience. Check it again before a token
    // decides who may convert.
    if (claims.aud && claims.aud !== ENNIO_PROJECT) return null;

    return claims;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function upsertEnnioUser(claims: EnnioClaims): Promise<User> {
  const byId = db
    .query("SELECT * FROM users WHERE ennio_id = ?")
    .as(User)
    .get(claims.sub) as User | null;

  if (byId) {
    if (byId.email !== claims.email) {
      db.query("UPDATE users SET email = ? WHERE id = ?").run(claims.email, byId.id);
      byId.email = claims.email;
    }
    return byId;
  }

  const byEmail = db
    .query("SELECT * FROM users WHERE email = ?")
    .as(User)
    .get(claims.email) as User | null;

  if (byEmail) {
    db.query("UPDATE users SET ennio_id = ? WHERE id = ?").run(claims.sub, byEmail.id);
    byEmail.ennio_id = claims.sub;
    return byEmail;
  }

  // The password column stays because the upstream schema has it. The value is
  // random and is never given out, so the local login form cannot open this row.
  const unusablePassword = await Bun.password.hash(randomUUID());

  db.query("INSERT OR IGNORE INTO users (email, password, ennio_id) VALUES (?, ?, ?)").run(
    claims.email,
    unusablePassword,
    claims.sub,
  );

  const created = db
    .query("SELECT * FROM users WHERE ennio_id = ?")
    .as(User)
    .get(claims.sub) as User | null;

  if (!created) throw new Error("Could not create the local user row.");

  return created;
}
