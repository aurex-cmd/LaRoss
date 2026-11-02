// Integrazione InPost (InPost Group API – Shipping v2): crea la spedizione e scarica l'etichetta.
// Documentazione: https://developers.inpost-group.com/shipping
const crypto = require('crypto');

const STAGE = process.env.INPOST_ENV !== 'production';
const BASE = STAGE ? 'https://stage-api.inpost-group.com' : 'https://api.inpost-group.com';

const CLIENT_ID = process.env.INPOST_CLIENT_ID || '';
const SECRET = process.env.INPOST_CLIENT_SECRET || '';
const ORG = process.env.INPOST_ORGANIZATION_ID || '';
const GEOWIDGET_TOKEN = process.env.INPOST_GEOWIDGET_TOKEN || '';

const configurato = Boolean(CLIENT_ID && SECRET && ORG);

// Dati del mittente stampati sull'etichetta
const mittente = {
  firstName: process.env.INPOST_MITTENTE_NOME || '',
  lastName: process.env.INPOST_MITTENTE_COGNOME || '',
  email: process.env.INPOST_MITTENTE_EMAIL || '',
  phone: process.env.INPOST_MITTENTE_TELEFONO || '',
};

// Dove consegni il pacco: ANY_POINT = in qualsiasi Locker o punto InPost
const ORIGINE = process.env.INPOST_ORIGINE || 'ANY_POINT';

// Misure standard dei Locker InPost (verifica con il tuo contratto)
const PACCHI = {
  A: { nome: 'Piccolo (A)', misure: '8 × 38 × 64 cm', dimensions: { length: 64, width: 38, height: 8, unit: 'CM' } },
  B: { nome: 'Medio (B)', misure: '19 × 38 × 64 cm', dimensions: { length: 64, width: 38, height: 19, unit: 'CM' } },
  C: { nome: 'Grande (C)', misure: '41 × 38 × 64 cm', dimensions: { length: 64, width: 38, height: 41, unit: 'CM' } },
};

let token = null;
let scadenza = 0;

async function accessToken() {
  if (token && Date.now() < scadenza) return token;
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'openid api:shipments:write' }),
  });
  if (!res.ok) throw new Error(`InPost token: ${res.status} ${await res.text()}`);
  const json = await res.json();
  token = json.access_token;
  scadenza = Date.now() + (json.expires_in - 30) * 1000;
  return token;
}

// Numero in formato internazionale (+39…), come richiesto da InPost
function telefonoE164(t) {
  let n = String(t || '').replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = '+39' + n;
  return n;
}

// Separa "Via Roma 12" in via e numero civico
function separaCivico(via) {
  const m = String(via).trim().match(/^(.*?)[,\s]+(\d+[A-Za-z]?(?:\/\w+)?)$/);
  return m ? { street: m[1].trim(), houseNumber: m[2] } : { street: String(via).trim() };
}

function corpoSpedizione(o, pacco, pesoKg) {
  const destinazione = o.consegna.tipo === 'locker'
    ? { countryCode: 'IT', pointId: o.consegna.punto.id }
    : {
      countryCode: 'IT',
      ...separaCivico(o.indirizzo.via),
      city: o.indirizzo.citta,
      postalCode: o.indirizzo.cap,
    };
  return {
    sender: mittente,
    recipient: {
      firstName: o.cliente.nome,
      lastName: o.cliente.cognome || '-',
      email: o.cliente.email,
      phone: telefonoE164(o.cliente.telefono),
    },
    origin: { countryCode: 'IT', shippingMethod: ORIGINE },
    destination: destinazione,
    references: { custom: { orderId: o.id } },
    parcels: [{
      type: 'STANDARD',
      dimensions: PACCHI[pacco].dimensions,
      weight: { amount: pesoKg, unit: 'KG' },
    }],
  };
}

async function creaSpedizione(o, pacco, pesoKg) {
  const res = await fetch(`${BASE}/shipping/v2/organizations/${encodeURIComponent(ORG)}/shipments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      // Evita doppie spedizioni se la richiesta viene ripetuta
      'X-Deduplication-Id': crypto.createHash('sha256').update(`${o.id}:${pacco}:${pesoKg}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5'),
    },
    body: JSON.stringify(corpoSpedizione(o, pacco, pesoKg)),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`InPost spedizione: ${res.status} ${JSON.stringify(json)}`);
    err.dettagli = json;
    throw err;
  }
  return json; // { trackingNumber, parcels, routing }
}

// formato: 'A6' (etichetta adesiva 10×15) oppure 'A4'
async function scaricaEtichetta(trackingNumber, formato = 'A6') {
  const res = await fetch(`${BASE}/shipping/v2/organizations/${encodeURIComponent(ORG)}/shipments/${encodeURIComponent(trackingNumber)}/label`, {
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      Accept: `application/pdf;format=${formato === 'A4' ? 'A4' : 'A6'}`,
    },
  });
  if (!res.ok) throw new Error(`InPost etichetta: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---- Etichetta finta per provare il sito senza credenziali InPost ----
function etichettaDiProva(o, trackingNumber) {
  const latin = (s) => String(s).normalize('NFC').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  const pdfStr = (s) => '(' + latin(s).replace(/([\\()])/g, '\\$1') + ')';
  const righe = [
    ['F2', 15, 'InPost - ETICHETTA DI PROVA'],
    ['F1', 9, 'Non valida per la spedizione'],
    ['F1', 9, ''],
    ['F2', 11, 'DESTINATARIO'],
    ['F1', 11, `${o.cliente.nome} ${o.cliente.cognome || ''}`],
    ...(o.consegna.tipo === 'locker'
      ? [['F1', 11, `Locker ${o.consegna.punto.id}`], ['F1', 10, o.consegna.punto.indirizzo || '']]
      : [['F1', 11, o.indirizzo.via], ['F1', 11, `${o.indirizzo.cap} ${o.indirizzo.citta} (${o.indirizzo.provincia})`]]),
    ['F1', 10, o.cliente.telefono || ''],
    ['F1', 9, ''],
    ['F2', 11, 'MITTENTE'],
    ['F1', 10, `${mittente.firstName} ${mittente.lastName}`.trim() || 'Le Perle di Ross'],
    ['F1', 9, ''],
    ['F2', 10, `Ordine ${o.id}`],
    ['F2', 13, trackingNumber],
  ];
  let y = 380;
  let testo = 'BT\n';
  for (const [f, s, t] of righe) {
    testo += `/${f} ${s} Tf 1 0 0 1 20 ${y} Tm ${pdfStr(t)} Tj\n`;
    y -= s + 8;
  }
  testo += 'ET\n';
  // finto codice a barre
  let barre = '';
  let x = 20;
  const h = crypto.createHash('sha256').update(trackingNumber).digest();
  for (let i = 0; x < 270; i++) {
    const w = 1 + (h[i % h.length] % 3);
    if (i % 2 === 0) barre += `${x} 30 ${w} 60 re\n`;
    x += w + 1;
  }
  const contenuto = `${testo}0 0 0 rg\n${barre}f\n2 w 10 10 278 400 re S\n`;
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 298 420] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contenuto, 'latin1')} >>\nstream\n${contenuto}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offset = [];
  oggetti.forEach((ob, i) => { offset.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${ob}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n${offset.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}`;
  pdf += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

module.exports = {
  configurato, STAGE, GEOWIDGET_TOKEN, PACCHI, mittente,
  creaSpedizione, scaricaEtichetta, etichettaDiProva, telefonoE164,
};
