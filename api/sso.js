"use strict";
/* Départ du parcours de connexion : redirige vers Microsoft Entra ID. */

const crypto = require("crypto");
const { setCookie, origin } = require("./_session");

module.exports = (req, res) => {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;

  if (!tenant || !clientId) {
    res.status(500).json({ error: "config", message: "MS_TENANT_ID ou MS_CLIENT_ID absent des variables d'environnement Vercel." });
    return;
  }

  // state : protège contre le CSRF, on le compare au retour
  const state = crypto.randomBytes(24).toString("base64url");
  setCookie(res, "sso_state", state, 600);

  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${origin(req)}/api/callback`);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  res.writeHead(302, { Location: url.toString() });
  res.end();
};
