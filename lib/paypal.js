// Integrazione PayPal Checkout (API REST v2), lato server.
const BASE = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

const configurato = Boolean(CLIENT_ID && SECRET);

let token = null;
let scadenza = 0;

async function accessToken() {
  if (token && Date.now() < scadenza) return token;
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal token: ${res.status} ${await res.text()}`);
  const json = await res.json();
  token = json.access_token;
  scadenza = Date.now() + (json.expires_in - 60) * 1000;
  return token;
}

async function chiamata(metodo, percorso, corpo) {
  const res = await fetch(BASE + percorso, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`PayPal ${percorso}: ${res.status} ${JSON.stringify(json)}`);
    err.dettagli = json;
    throw err;
  }
  return json;
}

const euro = (n) => n.toFixed(2);

// Crea l'ordine PayPal a partire dall'ordine del negozio (importi calcolati dal server).
function creaOrdine(o, nomeNegozio) {
  return chiamata('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: o.id,
      custom_id: o.id,
      description: `Ordine ${o.id} – ${nomeNegozio}`.slice(0, 127),
      amount: {
        currency_code: 'EUR',
        value: euro(o.totale),
        breakdown: {
          item_total: { currency_code: 'EUR', value: euro(o.subtotale) },
          shipping: { currency_code: 'EUR', value: euro(o.spedizione) },
        },
      },
      items: o.articoli.map((a) => ({
        name: a.nome.slice(0, 127),
        description: a.personalizzazione ? `Personalizzazione: ${a.personalizzazione}`.slice(0, 127) : undefined,
        quantity: String(a.quantita),
        unit_amount: { currency_code: 'EUR', value: euro(a.prezzo) },
        category: 'PHYSICAL_GOODS',
      })),
      shipping: o.indirizzo ? {
        name: { full_name: `${o.cliente.nome} ${o.cliente.cognome}`.slice(0, 300) },
        address: {
          address_line_1: o.indirizzo.via.slice(0, 300),
          admin_area_2: o.indirizzo.citta.slice(0, 120),
          admin_area_1: o.indirizzo.provincia,
          postal_code: o.indirizzo.cap,
          country_code: 'IT',
        },
      } : undefined,
    }],
    application_context: {
      brand_name: nomeNegozio.slice(0, 127),
      locale: 'it-IT',
      shipping_preference: o.indirizzo ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  });
}

function catturaOrdine(paypalId) {
  return chiamata('POST', `/v2/checkout/orders/${encodeURIComponent(paypalId)}/capture`);
}

module.exports = { configurato, CLIENT_ID, creaOrdine, catturaOrdine };
