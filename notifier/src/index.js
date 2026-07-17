/* SeuCofrin — notificador de metas.
   A cada minuto o cron confere, para cada usuário, quais metas têm horário
   igual ao minuto atual (no fuso do usuário) e envia Web Push para os
   aparelhos inscritos. O app sincroniza metas e inscrições via POST /sync. */

const te = new TextEncoder();
const td = new TextDecoder();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/* ---------------- base64url ---------------- */
export function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function bytesToB64u(buf) {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

/* ---------------- Verificação do token Firebase (RS256 via JWKS) ---------------- */
let jwksCache = { keys: null, exp: 0 };
async function getJwks() {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('jwks fetch ' + r.status);
  const j = await r.json();
  jwksCache = { keys: j.keys, exp: Date.now() + 30 * 60e3 };
  return j.keys;
}
async function verifyFirebaseToken(token, projectId) {
  try {
    const [h, p, s] = token.split('.');
    if (!s) return null;
    const header = JSON.parse(td.decode(b64uToBytes(h)));
    const claims = JSON.parse(td.decode(b64uToBytes(p)));
    if (claims.aud !== projectId) return null;
    if (claims.iss !== 'https://securetoken.google.com/' + projectId) return null;
    if (!claims.sub || claims.exp * 1000 < Date.now()) return null;
    const jwk = (await getJwks()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(s), te.encode(h + '.' + p));
    return ok ? claims : null;
  } catch {
    return null;
  }
}

/* ---------------- Web Push: criptografia do payload (RFC 8291, aes128gcm) ---------------- */
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
export async function encryptPayload(sub, plaintext) {
  const uaPub = b64uToBytes(sub.keys.p256dh);      // chave pública do navegador (65 bytes)
  const authSecret = b64uToBytes(sub.keys.auth);   // segredo de autenticação (16 bytes)
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const padded = concat(te.encode(plaintext), new Uint8Array([2])); // 0x02 = delimitador do último registro
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // cabeçalho aes128gcm: salt(16) | rs(4) | idlen(1) | keyid(65)
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(asPub, 21);
  return concat(header, ct);
}

/* ---------------- VAPID (JWT ES256) ---------------- */
async function vapidAuthHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const head = bytesToB64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = bytesToB64u(te.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT,
  })));
  const unsigned = head + '.' + body;
  // o segredo pode vir com BOM (U+FEFF) quando gravado por PowerShell no Windows
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK.replace(/^\uFEFF/, '').trim());
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return `vapid t=${unsigned + '.' + bytesToB64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendPush(env, sub, payloadObj) {
  const body = await encryptPayload(sub, JSON.stringify(payloadObj));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '600',
      Urgency: 'high',
    },
    body,
  });
  // corpo não interessa; garante que a conexão é liberada
  await res.arrayBuffer().catch(() => {});
  return res.status;
}

/* ---------------- Dados no KV ---------------- */
async function endpointId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', te.encode(endpoint));
  return bytesToB64u(h).slice(0, 20);
}
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function sanitizeRotinas(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 200).map((r) => ({
    id: String(r.id || '').slice(0, 40),
    texto: String(r.texto || '').slice(0, 140),
    dias: (Array.isArray(r.dias) ? r.dias : []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    hora: typeof r.hora === 'string' && HORA_RE.test(r.hora) ? r.hora : null,
  })).filter((r) => r.hora && r.texto && r.dias.length);
}

/* ---------------- Cron: dispara as metas do minuto ---------------- */
function localNow(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const dw = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    let hh = get('hour');
    if (hh === '24') hh = '00';
    return { hhmm: hh + ':' + get('minute'), dw };
  } catch {
    return { hhmm: '', dw: -1 };
  }
}

async function processUser(env, key, now) {
  const doc = await env.PUSH.get(key, 'json');
  if (!doc) { console.log(key + ': sem doc no KV'); return; }
  const subs = doc.subs || {};
  const rotinas = doc.rotinas || [];
  if (!Object.keys(subs).length || !rotinas.length) {
    console.log(`${key}: ${rotinas.length} metas com hora, ${Object.keys(subs).length} aparelhos — nada a fazer`);
    return;
  }

  const { hhmm, dw } = localNow(now, doc.tz || 'America/Sao_Paulo');
  const due = rotinas.filter((r) => r.hora === hhmm && (r.dias || []).includes(dw));
  if (!due.length) return;

  let mudou = false;
  for (const r of due) {
    for (const [id, sub] of Object.entries(subs)) {
      try {
        const st = await sendPush(env, sub, {
          title: '⏰ Hora da meta!',
          body: r.texto,
          tag: 'meta-' + r.id,
          url: './',
        });
        console.log(`push "${r.texto.slice(0, 30)}" ${hhmm} → HTTP ${st}`);
        if (st === 404 || st === 410) { delete subs[id]; mudou = true; } // inscrição expirada
      } catch (e) {
        console.log('push falhou', e && e.message);
      }
    }
  }
  if (mudou) await env.PUSH.put(key, JSON.stringify({ ...doc, subs }));
}

/* Índice de usuários ("idx"): evita usar PUSH.list() no cron — o plano
   gratuito do KV permite só 1.000 lists/dia e o cron roda 1.440×/dia.
   Leituras (get) têm cota de 100.000/dia, folgada. */
const IDX_KEY = 'idx';
async function rebuildIdx(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.PUSH.list({ prefix: 'u:', cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) keys.push(k.name);
  } while (cursor);
  await env.PUSH.put(IDX_KEY, JSON.stringify(keys));
  console.log('idx reconstruído com', keys.length, 'usuário(s)');
  return keys;
}
async function idxGarantir(env, key) {
  const idx = (await env.PUSH.get(IDX_KEY, 'json')) || [];
  if (!idx.includes(key)) {
    idx.push(key);
    await env.PUSH.put(IDX_KEY, JSON.stringify(idx));
  }
}

export default {
  async scheduled(event, env, ctx) {
    const now = new Date(event.scheduledTime);
    let idx = await env.PUSH.get(IDX_KEY, 'json');
    if (!Array.isArray(idx)) idx = await rebuildIdx(env);
    for (const k of idx) await processUser(env, k, now);
  },

  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    if (!claims) return json({ error: 'não autenticado' }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'corpo inválido' }, 400);

    const key = 'u:' + claims.sub;
    const path = new URL(req.url).pathname;

    if (path === '/sync') {
      const doc = (await env.PUSH.get(key, 'json')) || {};
      doc.subs = doc.subs || {};
      if (body.tz) doc.tz = String(body.tz).slice(0, 60);
      if (Array.isArray(body.rotinas)) doc.rotinas = sanitizeRotinas(body.rotinas);
      if (body.sub && body.sub.endpoint && body.sub.keys && body.sub.keys.p256dh && body.sub.keys.auth) {
        doc.subs[await endpointId(body.sub.endpoint)] = {
          endpoint: String(body.sub.endpoint),
          keys: { p256dh: String(body.sub.keys.p256dh), auth: String(body.sub.keys.auth) },
        };
      }
      if (body.removeEndpoint) delete doc.subs[await endpointId(String(body.removeEndpoint))];
      await env.PUSH.put(key, JSON.stringify(doc));
      await idxGarantir(env, key);
      return json({ ok: true, aparelhos: Object.keys(doc.subs).length });
    }

    if (path === '/test') {
      const doc = await env.PUSH.get(key, 'json');
      const subs = doc && doc.subs ? Object.values(doc.subs) : [];
      if (!subs.length) return json({ error: 'nenhum aparelho inscrito' }, 400);
      const results = [];
      for (const sub of subs) {
        results.push(await sendPush(env, sub, {
          title: '🔔 Teste do SeuCofrin',
          body: 'As notificações estão funcionando! 🎉',
          url: './',
        }).catch(() => 0));
      }
      return json({ ok: true, results });
    }

    return json({ error: 'rota desconhecida' }, 404);
  },
};
