"use strict";
/* Sauvegarde des données rattachée au compte Microsoft.
   Clé = identifiant d'objet Entra (oid), stable et propre à la personne.
   Le stockage passe par l'API REST d'Upstash Redis : aucun paquet à
   installer, le projet reste un site statique + fonctions. */

const { sessionFrom } = require("./_session");

const MAX = 1024 * 1024;               // 1 Mo, très au-delà d'un usage normal

/* Vercel nomme les variables selon le préfixe choisi à la connexion de la
   base. Plutôt que d'imposer un nom précis, on reconnaît d'abord les noms
   usuels, puis à défaut on repère l'URL Upstash et son jeton associé. */
function store() {
  const env = process.env;
  const connus = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["STORAGE_REST_API_URL", "STORAGE_REST_API_TOKEN"],
    ["STORAGE_URL", "STORAGE_TOKEN"],
  ];
  for (const [u, t] of connus) if (env[u] && env[t]) return { url: env[u].replace(/\/$/, ""), tok: env[t] };

  const cleUrl = Object.keys(env).find(k =>
    /URL$/.test(k) && /^https:\/\/[^\s]*upstash\.io/i.test(env[k] || ""));
  if (cleUrl) {
    const base = cleUrl.replace(/URL$/, "");
    const cleTok = [base + "TOKEN", base + "REST_TOKEN"].find(k => env[k])
      || Object.keys(env).find(k => k.startsWith(base) && /TOKEN$/.test(k));
    if (cleTok && env[cleTok]) return { url: env[cleUrl].replace(/\/$/, ""), tok: env[cleTok] };
  }
  return null;
}
/* Noms des variables repérées, sans aucune valeur : sert au diagnostic. */
function varsVues() {
  return Object.keys(process.env).filter(k => /KV|UPSTASH|REDIS|STORAGE/i.test(k)).sort();
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
  if (!c) { res.status(200).json({ configured: false, vars: varsVues() }); return; }

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
