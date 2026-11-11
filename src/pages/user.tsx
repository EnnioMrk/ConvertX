import { Elysia, t } from "elysia";

import { BaseHtml } from "../components/base";
import { Header } from "../components/header";
import db from "../db/db";
import { User } from "../db/types";
import {
  ACCOUNT_REGISTRATION,
  ALLOW_UNAUTHENTICATED,
  BRANDING,
  ENNIO_AUTH,
  ENNIO_PROJECT,
  HIDE_HISTORY,
  HTTP_ALLOWED,
  WEBROOT,
} from "../helpers/env";
import { upsertEnnioUser, verifyEnnioToken } from "../services/ennio";
import { userService } from "../services/user";

export { userService } from "../services/user";

export let FIRST_RUN = db.query("SELECT * FROM users").get() === null || false;

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      class="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300"
      role="alert"
    >
      <p safe>{message}</p>
    </div>
  );
}

function LoginPage({ error, email = "" }: { error?: string; email?: string }) {
  return (
    <BaseHtml webroot={WEBROOT} title="ConvertX | Login">
      <>
        <Header
          webroot={WEBROOT}
          branding={BRANDING}
          accountRegistration={ACCOUNT_REGISTRATION}
          allowUnauthenticated={ALLOW_UNAUTHENTICATED}
          hideHistory={HIDE_HISTORY}
        />
        <main
          class={`
            w-full flex-1 px-2
            sm:px-4
          `}
        >
          <article class="article">
            <form method="post" class="flex flex-col gap-4">
              {error ? <ErrorBanner message={error} /> : null}
              <fieldset class="mb-4 flex flex-col gap-4">
                <label class="flex flex-col gap-1">
                  Email
                  <input
                    type="email"
                    name="email"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Email"
                    autocomplete="email"
                    value={email}
                    autofocus
                    required
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Password
                  <input
                    type="password"
                    name="password"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="current-password"
                    required
                  />
                </label>
              </fieldset>
              <div class="flex flex-row gap-4">
                {ACCOUNT_REGISTRATION ? (
                  <a
                    href={`${WEBROOT}/register`}
                    role="button"
                    class="w-full btn-secondary text-center"
                  >
                    Register
                  </a>
                ) : null}
                <input type="submit" value="Login" class="w-full btn-primary" />
              </div>
            </form>
          </article>
        </main>
      </>
    </BaseHtml>
  );
}

/**
 * The sign-in page for the shared ennio.vip account. The library draws its own
 * sheet; this page only needs the bridge that trades the library's short-lived
 * token for a ConvertX session cookie.
 */
function EnnioLoginPage() {
  const bridge = `
    (function () {
      var root = ${JSON.stringify(WEBROOT)};
      var audience = ${JSON.stringify(ENNIO_PROJECT)};
      var busy = false;
      async function exchange() {
        if (busy || !window.EnnioAuth || !window.EnnioAuth.signedIn) return;
        busy = true;
        try {
          var token = await window.EnnioAuth.token(audience);
          var response = await fetch(root + "/auth/ennio", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: token })
          });
          if (response.ok) {
            window.location.replace(root + "/");
            return;
          }
        } catch (error) {
          console.error("[ennio]", error);
        }
        busy = false;
      }
      document.addEventListener("ennio:auth:ready", exchange);
      document.addEventListener("ennio:auth:change", exchange);
      window.addEventListener("load", exchange);
    })();
  `;

  return (
    <BaseHtml webroot={WEBROOT} title="ConvertX | Login">
      <>
        <Header
          webroot={WEBROOT}
          branding={BRANDING}
          accountRegistration={ACCOUNT_REGISTRATION}
          allowUnauthenticated={ALLOW_UNAUTHENTICATED}
          hideHistory={HIDE_HISTORY}
        />
        <main
          class={`
            w-full flex-1 px-2
            sm:px-4
          `}
        >
          <article class="article">
            <h1 class="mb-2 text-xl">Sign in</h1>
            <p class="mb-4 text-neutral-400">
              This converter uses your ennio.vip account. The sign-in sheet opens on its own.
            </p>
            <button
              type="button"
              class="w-full btn-primary"
              onclick="window.EnnioAuth && window.EnnioAuth.open()"
            >
              Open sign-in
            </button>
          </article>
        </main>
        <script
          src="https://api.ennio.vip/v1/auth.js"
          data-guard="required"
          data-mode="overlay"
          data-theme="dark"
          defer
        />
        <script>{bridge}</script>
      </>
    </BaseHtml>
  );
}

/**
 * ConvertX signs out locally, then the shared login signs out the ennio.vip
 * session. Without the second step the library would sign the page back in at
 * once.
 */
function EnnioLogoutPage() {
  const logout = `
    (function () {
      var root = ${JSON.stringify(WEBROOT)};
      var tries = 0;
      function finish() {
        window.location.replace(root + "/login");
      }
      function run() {
        if (window.EnnioAuth) {
          window.EnnioAuth.logout().catch(function () {}).then(finish);
          return;
        }
        if (++tries > 50) {
          finish();
          return;
        }
        window.setTimeout(run, 100);
      }
      run();
    })();
  `;

  return (
    <BaseHtml webroot={WEBROOT} title="ConvertX | Logout">
      <>
        <main
          class={`
            w-full flex-1 px-2
            sm:px-4
          `}
        >
          <article class="article">
            <h1 class="mb-2 text-xl">Signing out</h1>
            <p class="text-neutral-400">Closing your ennio.vip session.</p>
          </article>
        </main>
        <script
          src="https://api.ennio.vip/v1/auth.js"
          data-guard="optional"
          data-mode="none"
          data-theme="dark"
          defer
        />
        <script>{logout}</script>
      </>
    </BaseHtml>
  );
}

function AccountPage({ email, error }: { email: string; error?: string }) {
  return (
    <BaseHtml webroot={WEBROOT} title="ConvertX | Account">
      <>
        <Header
          webroot={WEBROOT}
          branding={BRANDING}
          accountRegistration={ACCOUNT_REGISTRATION}
          allowUnauthenticated={ALLOW_UNAUTHENTICATED}
          hideHistory={HIDE_HISTORY}
          loggedIn
        />
        <main
          class={`
            w-full flex-1 px-2
            sm:px-4
          `}
        >
          <article class="article">
            <form method="post" class="flex flex-col gap-4">
              {error ? <ErrorBanner message={error} /> : null}
              <fieldset class="mb-4 flex flex-col gap-4">
                <label class="flex flex-col gap-1">
                  Email
                  <input
                    type="email"
                    name="email"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Email"
                    autocomplete="email"
                    value={email}
                    required
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Password (leave blank for unchanged)
                  <input
                    type="password"
                    name="newPassword"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="new-password"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Current Password
                  <input
                    type="password"
                    name="password"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="current-password"
                    required
                  />
                </label>
              </fieldset>
              <div role="group">
                <input type="submit" value="Update" class="w-full btn-primary" />
              </div>
            </form>
          </article>
        </main>
      </>
    </BaseHtml>
  );
}

export const user = new Elysia()
  .use(userService)
  .get("/setup", ({ redirect }) => {
    if (ENNIO_AUTH || !FIRST_RUN) {
      return redirect(`${WEBROOT}/login`, 302);
    }

    return (
      <BaseHtml title="ConvertX | Setup" webroot={WEBROOT}>
        <main
          class={`
            mx-auto w-full max-w-4xl flex-1 px-2
            sm:px-4
          `}
        >
          <h1 class="my-8 text-3xl">Welcome to ConvertX!</h1>
          <article class="article p-0">
            <header class="w-full bg-neutral-800 p-4">Create your account</header>
            <form method="post" action={`${WEBROOT}/register`} class="p-4">
              <fieldset class="mb-4 flex flex-col gap-4">
                <label class="flex flex-col gap-1">
                  Email
                  <input
                    type="email"
                    name="email"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Email"
                    autocomplete="email"
                    required
                  />
                </label>
                <label class="flex flex-col gap-1">
                  Password
                  <input
                    type="password"
                    name="password"
                    class="rounded-sm bg-neutral-800 p-3"
                    placeholder="Password"
                    autocomplete="current-password"
                    required
                  />
                </label>
              </fieldset>
              <input type="submit" value="Create account" class="btn-primary" />
            </form>
            <footer class="p-4">
              Report any issues on{" "}
              <a
                class={`
                  text-accent-500 underline
                  hover:text-accent-400
                `}
                href="https://github.com/C4illin/ConvertX"
              >
                GitHub
              </a>
              .
            </footer>
          </article>
        </main>
      </BaseHtml>
    );
  })
  .get("/register", ({ redirect }) => {
    if (ENNIO_AUTH || !ACCOUNT_REGISTRATION) {
      return redirect(`${WEBROOT}/login`, 302);
    }

    return (
      <BaseHtml webroot={WEBROOT} title="ConvertX | Register">
        <>
          <Header
            webroot={WEBROOT}
            branding={BRANDING}
            accountRegistration={ACCOUNT_REGISTRATION}
            allowUnauthenticated={ALLOW_UNAUTHENTICATED}
            hideHistory={HIDE_HISTORY}
          />
          <main
            class={`
              w-full flex-1 px-2
              sm:px-4
            `}
          >
            <article class="article">
              <form method="post" class="flex flex-col gap-4">
                <fieldset class="mb-4 flex flex-col gap-4">
                  <label class="flex flex-col gap-1">
                    Email
                    <input
                      type="email"
                      name="email"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Email"
                      autocomplete="email"
                      required
                    />
                  </label>
                  <label class="flex flex-col gap-1">
                    Password
                    <input
                      type="password"
                      name="password"
                      class="rounded-sm bg-neutral-800 p-3"
                      placeholder="Password"
                      autocomplete="current-password"
                      required
                    />
                  </label>
                </fieldset>
                <input type="submit" value="Register" class="w-full btn-primary" />
              </form>
            </article>
          </main>
        </>
      </BaseHtml>
    );
  })
  .post(
    "/register",
    async ({ body: { email, password }, set, redirect, jwt, cookie: { auth } }) => {
      if (ENNIO_AUTH) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      if (!ACCOUNT_REGISTRATION && !FIRST_RUN) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      if (FIRST_RUN) {
        FIRST_RUN = false;
      }

      const existingUser = await db.query("SELECT * FROM users WHERE email = ?").get(email);
      if (existingUser) {
        set.status = 400;
        return {
          message: "Email already in use.",
        };
      }
      const savedPassword = await Bun.password.hash(password);

      db.query("INSERT INTO users (email, password) VALUES (?, ?)").run(email, savedPassword);

      const user = db.query("SELECT * FROM users WHERE email = ?").as(User).get(email);

      if (!user) {
        set.status = 500;
        return {
          message: "Failed to create user.",
        };
      }

      const accessToken = await jwt.sign({
        id: String(user.id),
      });

      if (!auth) {
        set.status = 500;
        return {
          message: "No auth cookie, perhaps your browser is blocking cookies.",
        };
      }

      // set cookie
      auth.set({
        value: accessToken,
        httpOnly: true,
        secure: !HTTP_ALLOWED,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "strict",
      });

      return redirect(`${WEBROOT}/`, 302);
    },
    { body: "signIn" },
  )
  .get(
    "/login",
    async ({ jwt, redirect, cookie: { auth } }) => {
      if (!ENNIO_AUTH && FIRST_RUN) {
        return redirect(`${WEBROOT}/setup`, 302);
      }

      // if already logged in, redirect to home
      if (auth?.value) {
        const user = await jwt.verify(auth.value);

        if (user) {
          return redirect(`${WEBROOT}/`, 302);
        }

        auth.remove();
      }

      if (ENNIO_AUTH) {
        return <EnnioLoginPage />;
      }

      return <LoginPage />;
    },
    { body: "signIn", cookie: "optionalSession" },
  )
  .post(
    "/login",
    async function handler({ body, set, redirect, jwt, cookie: { auth } }) {
      if (ENNIO_AUTH) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const existingUser = db.query("SELECT * FROM users WHERE email = ?").as(User).get(body.email);

      if (!existingUser) {
        set.status = 403;
        return <LoginPage error="Invalid credentials." email={body.email} />;
      }

      const validPassword = await Bun.password.verify(body.password, existingUser.password);

      if (!validPassword) {
        set.status = 403;
        return <LoginPage error="Invalid credentials." email={body.email} />;
      }

      const accessToken = await jwt.sign({
        id: String(existingUser.id),
      });

      if (!auth) {
        set.status = 500;
        return {
          message: "No auth cookie, perhaps your browser is blocking cookies.",
        };
      }

      // set cookie
      auth.set({
        value: accessToken,
        httpOnly: true,
        secure: !HTTP_ALLOWED,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "strict",
      });

      return redirect(`${WEBROOT}/`, 302);
    },
    { body: "signIn" },
  )
  .post(
    "/auth/ennio",
    async ({ body: { token }, set, jwt, cookie: { auth } }) => {
      if (!ENNIO_AUTH) {
        set.status = 404;
        return { success: false, message: "The ennio.vip login is not enabled." };
      }

      const claims = await verifyEnnioToken(token);
      if (!claims) {
        set.status = 401;
        return { success: false, message: "The ennio.vip token is not valid." };
      }

      const user = await upsertEnnioUser(claims);
      const accessToken = await jwt.sign({ id: String(user.id) });

      if (!auth) {
        set.status = 500;
        return {
          success: false,
          message: "No auth cookie, perhaps your browser is blocking cookies.",
        };
      }

      auth.set({
        value: accessToken,
        httpOnly: true,
        secure: !HTTP_ALLOWED,
        maxAge: 60 * 60 * 24,
        sameSite: "lax",
      });

      return { success: true };
    },
    {
      body: t.Object({
        token: t.String({ maxLength: 4096 }),
      }),
    },
  )
  .get("/logoff", ({ redirect, cookie: { auth } }) => {
    if (auth?.value) {
      auth.remove();
    }

    if (ENNIO_AUTH) {
      return <EnnioLogoutPage />;
    }

    return redirect(`${WEBROOT}/login`, 302);
  })
  .post("/logoff", ({ redirect, cookie: { auth } }) => {
    if (auth?.value) {
      auth.remove();
    }

    return redirect(`${WEBROOT}/login`, 302);
  })
  .get(
    "/account",
    async ({ user, redirect }) => {
      if (ENNIO_AUTH) {
        return redirect(`${WEBROOT}/`, 302);
      }

      if (!user) {
        return redirect(`${WEBROOT}/`, 302);
      }

      const userData = db.query("SELECT * FROM users WHERE id = ?").as(User).get(user.id);

      if (!userData) {
        return redirect(`${WEBROOT}/`, 302);
      }

      return <AccountPage email={userData.email} />;
    },
    {
      auth: true,
    },
  )
  .post(
    "/account",
    async function handler({ body, set, redirect, jwt, cookie: { auth } }) {
      if (ENNIO_AUTH) {
        return redirect(`${WEBROOT}/`, 302);
      }

      if (!auth?.value) {
        return redirect(`${WEBROOT}/login`, 302);
      }

      const user = await jwt.verify(auth.value);
      if (!user) {
        return redirect(`${WEBROOT}/login`, 302);
      }
      const existingUser = db.query("SELECT * FROM users WHERE id = ?").as(User).get(user.id);

      if (!existingUser) {
        if (auth?.value) {
          auth.remove();
        }
        return redirect(`${WEBROOT}/login`, 302);
      }

      const validPassword = await Bun.password.verify(body.password, existingUser.password);
      const emailValue = body.email || existingUser.email;

      if (!validPassword) {
        set.status = 403;
        return <AccountPage email={emailValue} error="Invalid credentials." />;
      }

      const fields = [];
      const values = [];

      if (body.email) {
        const existingEmailUser = await db
          .query("SELECT id FROM users WHERE email = ?")
          .as(User)
          .get(body.email);
        if (existingEmailUser && existingEmailUser.id.toString() !== user.id) {
          set.status = 409;
          return <AccountPage email={emailValue} error="Email already in use." />;
        }
        fields.push("email");
        values.push(body.email);
      }
      if (body.newPassword) {
        fields.push("password");
        values.push(await Bun.password.hash(body.newPassword));
      }

      if (fields.length > 0) {
        db.query(
          `UPDATE users SET ${fields.map((field) => `${field}=?`).join(", ")} WHERE id=?`,
        ).run(...values, user.id);
      }

      return redirect(`${WEBROOT}/`, 302);
    },
    {
      body: t.Object({
        email: t.MaybeEmpty(t.String()),
        newPassword: t.MaybeEmpty(t.String()),
        password: t.String(),
      }),
      cookie: "session",
    },
  );
