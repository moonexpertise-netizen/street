"use strict";
/* Sauvegarde des données rattachée au compte Microsoft.
   Clé = identifiant d'objet Entra (oid), stable et propre à la personne.
   Le stockage passe par l'API REST d'Upstash Redis : aucun paquet à
   installer, le projet reste un site statique + fonctions. */

const { sessionFrom } = require("./_session");

const MAX = 1024 * 1024;               // 1 Mo, très au-delà d'un usage normal

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && tok ? { url: url.replace(/\/$/, ""), tok } : null;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX) throw new Error("too_large");
  }
  return raw;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  let s = null;
  try { s = sessionFrom(req); } catch (e) { s = null; }
  if (!s) { res.status(401).json({ error: "auth" }); return; }

  const c = store();
  if (!c) { res.status(200).json({ configured: false }); return; }

  const key = "moonsport:" + (s.oid || s.email);
  const auth = { Authorization: `Bearer ${c.tok}` };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${c.url}/get/${encodeURIComponent(key)}`, { headers: auth });
      if (!r.ok) throw new Error("kv_get");
      const j = await r.json();
      let data = null;
      if (j && typeof j.result === "string") { try { data = JSON.parse(j.result); } catch (e) { data = null; } }
      res.status(200).json({ configured: true, data });
      return;
    }

    if (req.method === "POST") {
      const raw = await readBody(req);
      if (raw.length > MAX) { res.status(413).json({ error: "too_large" }); return; }
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { res.status(400).json({ error: "json" }); return; }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) { res.status(400).json({ error: "shape" }); return; }

      const r = await fetch(`${c.url}/set/${encodeURIComponent(key)}`, {
        method: "POST", headers: { ...auth, "Content-Type": "text/plain" }, body: JSON.stringify(obj),
      });
      if (!r.ok) throw new Error("kv_set");
      res.status(200).json({ ok: true, at: Date.now() });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "method" });
  } catch (e) {
    res.status(e.message === "too_large" ? 413 : 502).json({ error: "store" });
  }
};
