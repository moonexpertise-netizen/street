"use strict";
/* Utilitaires de session partagés par les fonctions /api.
   La session est un cookie signé HMAC-SHA256 : le navigateur ne peut ni
   le forger ni le modifier sans SESSION_SECRET, qui ne quitte jamais le serveur. */

const crypto = require("crypto");

const COOKIE = "ms_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum)");
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}

function verify(token) {
  if (!token || token.indexOf(".") === -1) return null;
  const [body, mac] = token.split(".");
  let expected;
  try { expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url"); }
  catch (e) { return null; }
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

function readCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, name, value, maxAge) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(bits.join("; "));
  res.setHeader("Set-Cookie", list);
}

function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

function sessionFrom(req) {
  return verify(readCookies(req)[COOKIE]);
}

/* Qui a le droit d'entrer.
   ALLOWED_DOMAINS : domaines autorisés, séparés par des virgules (défaut moonexpertise.fr)
   ALLOWED_EMAILS  : adresses autorisées à l'unité, séparées par des virgules
   Une adresse passe si son domaine est autorisé OU si elle est listée nommément. */
function isAllowed(email) {
  if (!email) return false;
  const mail = String(email).trim().toLowerCase();
  const domains = (process.env.ALLOWED_DOMAINS || "moonexpertise.fr")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const emails = (process.env.ALLOWED_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (emails.includes(mail)) return true;
  const at = mail.lastIndexOf("@");
  if (at === -1) return false;
  return domains.includes(mail.slice(at + 1));
}

function origin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

module.exports = { COOKIE, MAX_AGE, sign, verify, readCookies, setCookie, clearCookie, sessionFrom, isAllowed, origin };
