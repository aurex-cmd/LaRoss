const fs = require('fs');
const path = require('path');

// Carica le impostazioni dal file .env (se presente) prima di tutto il resto
if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));

const express = require('express');
const store = require('./lib/store');
const paypal = require('./lib/paypal');
const views = require('./lib/views');
const admin = require('./lib/admin');

const PRODUZIONE = process.env.NODE_ENV === 'production';

const negozio = {
  nome: process.env.NOME_NEGOZIO || 'LaRoss',
  descrizione: process.env.DESCRIZIONE_NEGOZIO || 'Lavoretti fatti a mano, personalizzati con amore per le vostre feste.',
  email: process.env.EMAIL_NEGOZIO || '',
  spedizione: Number(process.env.SPEDIZIONE_EURO ?? 6),
  spedizioneGratisDa: Number(process.env.SPEDIZIONE_GRATIS_DA ?? 50),
};

const TEMA_PREDEFINITO = views.TEMI[process.env.TEMA] ? process.env.TEMA : 'neve';
const MOSTRA_TEMI = process.env.MOSTRA_SCELTA_TEMA !== 'false';

let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  if (PRODUZIONE) throw new Error('Imposta ADMIN_PASSWORD nel file .env');
  adminPassword = 'admin';
  console.warn('⚠️  ADMIN_PASSWORD non impostata: uso "admin" (solo per prove locali).');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: PRODUZIONE ? '1d' : 0 }));

// Tema grafico: ?tema=bosco lo prova e lo ricorda (solo se la scelta è attiva)
function leggiCookie(req, nome) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}
app.use((req, res, next) => {
  let tema = TEMA_PREDEFINITO;
  if (MOSTRA_TEMI) {
    const scelto = req.query.tema || leggiCookie(req, 'tema');
    if (views.TEMI[scelto]) tema = scelto;
    if (req.query.tema && views.TEMI[req.query.tema]) {
      res.cookie('tema', req.query.tema, { maxAge: 30 * 864e5, sameSite: 'lax' });
    }
  }
  req.tema = tema;
  next();
});
const ctx = (req) => ({ negozio, tema: req.tema, mostraTemi: MOSTRA_TEMI });

// ---------- Pagine ----------
app.get('/', (req, res) => res.send(views.home(ctx(req), store.prodotti())));

app.get('/lavoretti/:slug', (req, res, next) => {
  const tutti = store.prodotti();
  const p = tutti.find((x) => x.slug === req.params.slug);
  if (!p) return next();
  const altri = tutti.filter((x) => x.slug !== p.slug && x.disponibile !== false).slice(0, 3);
  res.send(views.paginaProdotto(ctx(req), p, altri));
});

app.get('/carrello', (req, res) => res.send(views.carrello(ctx(req), store.prodotti(), paypal)));

app.get('/grazie', (req, res) => {
  const o = req.query.ordine ? store.ordine(String(req.query.ordine)) : null;
  res.send(views.grazie(ctx(req), o && ['pagato', 'spedito'].includes(o.stato) ? o : null));
});

app.use('/admin', admin({ password: adminPassword, ctx }));

// ---------- API ordini ----------
const api = express.Router();
api.use(express.json({ limit: '20kb' }));

const testo = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const arrotonda = (n) => Math.round(n * 100) / 100;

// Ricostruisce l'ordine usando SOLO i prezzi del catalogo sul server
function preparaOrdine(body) {
  const errori = [];
  const catalogo = store.prodotti();
  const articoli = [];
  if (!Array.isArray(body.articoli) || !body.articoli.length || body.articoli.length > 30) {
    errori.push('Il carrello è vuoto.');
  } else {
    for (const r of body.articoli) {
      const p = catalogo.find((x) => x.slug === r?.slug);
      const quantita = Number.parseInt(r?.quantita, 10);
      if (!p || p.disponibile === false) { errori.push('Un prodotto nel carrello non è più disponibile.'); continue; }
      if (!(quantita >= 1 && quantita <= 20)) { errori.push(`Quantità non valida per ${p.nome}.`); continue; }
      const max = p.personalizzazione ? Number(p.personalizzazione.maxLunghezza) || 60 : 0;
      const personalizzazione = max ? testo(r.personalizzazione, max) : '';
      if (p.personalizzazione?.obbligatoria && !personalizzazione) { errori.push(`Manca la personalizzazione per ${p.nome}.`); continue; }
      articoli.push({ slug: p.slug, nome: p.nome, prezzo: p.prezzo, quantita, personalizzazione });
    }
  }

  const c = body.cliente || {};
  const cliente = { nome: testo(c.nome, 100), email: testo(c.email, 120), telefono: testo(c.telefono, 30) };
  const indirizzo = {
    via: testo(c.via, 200), cap: testo(c.cap, 5), citta: testo(c.citta, 100),
    provincia: testo(c.provincia, 2).toUpperCase(), paese: 'IT',
  };
  if (!cliente.nome) errori.push('Inserisci nome e cognome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) errori.push('Inserisci un indirizzo email valido.');
  if (!indirizzo.via) errori.push("Inserisci l'indirizzo.");
  if (!/^\d{5}$/.test(indirizzo.cap)) errori.push('Il CAP deve avere 5 cifre.');
  if (!indirizzo.citta) errori.push('Inserisci la città.');
  if (!/^[A-Z]{2}$/.test(indirizzo.provincia)) errori.push('Inserisci la sigla della provincia (es. MI).');

  const subtotale = arrotonda(articoli.reduce((s, a) => s + a.prezzo * a.quantita, 0));
  const spedizione = negozio.spedizioneGratisDa && subtotale >= negozio.spedizioneGratisDa ? 0 : negozio.spedizione;
  return {
    errori,
    ordine: {
      id: store.nuovoIdOrdine(),
      creato: new Date().toISOString(),
      stato: 'in_attesa',
      articoli, cliente, indirizzo,
      note: testo(c.note, 500),
      subtotale, spedizione: arrotonda(spedizione), totale: arrotonda(subtotale + spedizione),
    },
  };
}

api.post('/ordini', async (req, res) => {
  const { errori, ordine } = preparaOrdine(req.body || {});
  if (errori.length) return res.status(400).json({ errore: errori[0] });

  if (!paypal.configurato) {
    if (PRODUZIONE) return res.status(503).json({ errore: 'Pagamenti non ancora attivi.' });
    ordine.demo = true;
    store.salvaOrdine(ordine);
    return res.json({ ordine: ordine.id, demo: true });
  }

  try {
    const pp = await paypal.creaOrdine(ordine, negozio.nome);
    ordine.paypal = { ordineId: pp.id };
    store.salvaOrdine(ordine);
    res.json({ ordine: ordine.id, paypalId: pp.id });
  } catch (e) {
    console.error(e);
    res.status(502).json({ errore: 'Non è stato possibile avviare il pagamento. Controlla l’indirizzo e riprova.' });
  }
});

api.post('/ordini/:id/cattura', async (req, res) => {
  const o = store.ordine(req.params.id);
  if (!o || !o.paypal?.ordineId) return res.status(404).json({ errore: 'Ordine non trovato.' });
  if (o.stato !== 'in_attesa') return res.json({ ordine: o.id });
  try {
    const pp = await paypal.catturaOrdine(o.paypal.ordineId);
    const cattura = pp.purchase_units?.[0]?.payments?.captures?.[0];
    if (pp.status !== 'COMPLETED' || !cattura || cattura.status === 'DECLINED') {
      return res.status(402).json({ errore: 'Il pagamento non è stato completato.' });
    }
    if (cattura.amount?.value !== o.totale.toFixed(2) || cattura.amount?.currency_code !== 'EUR') {
      console.error('Importo PayPal diverso dall’ordine', o.id, cattura.amount);
    }
    o.stato = 'pagato';
    o.pagato = new Date().toISOString();
    o.paypal.captureId = cattura.id;
    o.paypal.statoCattura = cattura.status; // COMPLETED o PENDING (es. verifica in corso)
    o.paypal.emailPagatore = pp.payer?.email_address;
    store.salvaOrdine(o);
    res.json({ ordine: o.id });
  } catch (e) {
    console.error(e);
    const rifiutato = e.dettagli?.details?.[0]?.issue === 'INSTRUMENT_DECLINED';
    res.status(rifiutato ? 422 : 502).json({
      errore: rifiutato ? 'Il metodo di pagamento è stato rifiutato: provane un altro.' : 'Errore durante il pagamento. Riprova.',
      riprova: rifiutato,
    });
  }
});

// Solo in modalità prova (PayPal non configurato, fuori produzione)
api.post('/ordini/:id/paga-demo', (req, res) => {
  if (paypal.configurato || PRODUZIONE) return res.status(404).end();
  const o = store.ordine(req.params.id);
  if (!o || !o.demo) return res.status(404).json({ errore: 'Ordine non trovato.' });
  o.stato = 'pagato';
  o.pagato = new Date().toISOString();
  store.salvaOrdine(o);
  res.json({ ordine: o.id });
});

app.use('/api', api);

app.use((req, res) => res.status(404).send(views.nonTrovato(ctx(req))));

const PORTA = Number(process.env.PORT || 3000);
app.listen(PORTA, () => {
  console.log(`🎄 ${negozio.nome} attivo su http://localhost:${PORTA}`);
  console.log(`   Ordini: http://localhost:${PORTA}/admin (utente: admin)`);
  console.log(`   PayPal: ${paypal.configurato ? (process.env.PAYPAL_ENV === 'live' ? 'LIVE' : 'sandbox') : 'non configurato (modalità prova)'}`);
});
