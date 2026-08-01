"use strict";
/* Qui suis-je ? Le front interroge cette route au chargement pour savoir
   s'il doit afficher l'application ou l'écran de connexion. */

const { sessionFrom } = require("./_session");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const configured = !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.SESSION_SECRET);
  if (!configured) {
    res.status(200).json({ authenticated: false, configured: false });
    return;
  }

  let s = null;
  try { s = sessionFrom(req); } catch (e) { s = null; }

  if (!s) { res.status(200).json({ authenticated: false, configured: true }); return; }
  res.status(200).json({ authenticated: true, configured: true, email: s.email, name: s.name });
};
