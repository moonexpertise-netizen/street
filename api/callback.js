"use strict";
/* Retour de Microsoft : on échange le code contre un jeton, on vérifie
   que le compte est autorisé, puis on pose le cookie de session. */

const { readCookies, clearCookie, setCookie, sign, isAllowed, origin, COOKIE, MAX_AGE } = require("./_session");

function back(res, params) {
  const q = new URLSearchParams(params).toString();
  res.writeHead(302, { Location: "/?" + q });
  res.end();
}

module.exports = async (req, res) => {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret) {
    back(res, { err: "config" });
    return;
  }

  const url = new URL(req.url, origin(req));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const msError = url.searchParams.get("error");

  clearCookie(res, "sso_state");

  if (msError) { back(res, { err: "microsoft", detail: msError }); return; }
  if (!code) { back(res, { err: "nocode" }); return; }

  // state doit correspondre au cookie posé au départ
  const expected = readCookies(req)["sso_state"];
  if (!expected || expected !== state) { back(res, { err: "state" }); return; }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin(req)}/api/callback`,
      scope: "openid profile email",
    });

    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tok = await r.json();
    if (!r.ok || !tok.id_token) { back(res, { err: "token" }); return; }

    /* Le jeton vient d'être obtenu directement auprès du point de terminaison
       Microsoft, sur une connexion TLS où nous nous sommes authentifiés avec
       le secret client. Sa provenance est donc garantie par le canal lui-même
       (OIDC Core 3.1.3.7) : on peut lire la charge utile sans revalider la
       signature via JWKS. */
    const payload = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString("utf8"));

    const email = (payload.preferred_username || payload.email || payload.upn || "").toLowerCase();
    const name = payload.name || email;

    if (payload.tid && payload.tid !== tenant) { back(res, { err: "tenant" }); return; }
    if (!isAllowed(email)) { back(res, { err: "denied", mail: email }); return; }

    setCookie(res, COOKIE, sign({
      email,
      name,
      oid: payload.oid || null,
      exp: Date.now() + MAX_AGE * 1000,
    }), MAX_AGE);

    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    back(res, { err: "server" });
  }
};
