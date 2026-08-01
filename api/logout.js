"use strict";
/* Déconnexion : on efface le cookie de session côté navigateur.
   Sans ?full=1 on reste connecté à Microsoft (retour immédiat possible) ;
   avec, on ferme aussi la session Microsoft. */

const { clearCookie, COOKIE, origin } = require("./_session");

module.exports = (req, res) => {
  clearCookie(res, COOKIE);
  clearCookie(res, "sso_state");

  const url = new URL(req.url, origin(req));
  const tenant = process.env.MS_TENANT_ID;

  if (url.searchParams.get("full") === "1" && tenant) {
    const out = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`);
    out.searchParams.set("post_logout_redirect_uri", origin(req) + "/");
    res.writeHead(302, { Location: out.toString() });
    res.end();
    return;
  }

  res.writeHead(302, { Location: "/" });
  res.end();
};
