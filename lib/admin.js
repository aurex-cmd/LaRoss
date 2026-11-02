// Area riservata del creatore: elenco ordini, dettaglio, stato spedizione, export CSV.
const crypto = require('crypto');
const express = require('express');
const store = require('./store');
const { layout, esc, prezzo } = require('./views');

const STATI = {
  in_attesa: 'In attesa di pagamento',
  pagato: 'Pagato – da spedire',
  spedito: 'Spedito',
  annullato: 'Annullato',
};

const dataIt = (iso) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });

function confrontoSicuro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = function admin({ password, ctx }) {
  const r = express.Router();

  // Accesso con nome utente "admin" e la password di ADMIN_PASSWORD
  r.use((req, res, next) => {
    const [tipo, valore] = (req.headers.authorization || '').split(' ');
    if (tipo === 'Basic' && valore) {
      const [utente, ...resto] = Buffer.from(valore, 'base64').toString().split(':');
      if (utente === 'admin' && confrontoSicuro(resto.join(':'), password)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Ordini", charset="UTF-8"').status(401).send('Accesso riservato');
  });

  // Protezione base contro richieste POST da altri siti
  r.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const origine = req.get('origin') || req.get('referer') || '';
    try {
      if (new URL(origine).host === req.get('host')) return next();
    } catch { /* origine non valida */ }
    res.status(403).send('Richiesta non consentita');
  });

  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  r.get('/', (req, res) => {
    const filtro = req.query.filtro || 'da_spedire';
    const tutti = store.leggiOrdini();
    const conta = {
      da_spedire: tutti.filter((o) => o.stato === 'pagato').length,
      spediti: tutti.filter((o) => o.stato === 'spedito').length,
      tutti: tutti.length,
    };
    const lista = tutti.filter((o) => (
      filtro === 'da_spedire' ? o.stato === 'pagato'
        : filtro === 'spediti' ? o.stato === 'spedito'
          : true));
    const incassato = tutti.filter((o) => ['pagato', 'spedito'].includes(o.stato)).reduce((s, o) => s + o.totale, 0);

    const contenuto = `
<section class="sezione">
  <div class="contenitore">
    <div class="admin-testa">
      <h1>Ordini</h1>
      <a class="btn btn-secondario" href="/admin/ordini.csv">Scarica CSV</a>
    </div>
    <div class="statistiche">
      <div><span class="numero">${conta.da_spedire}</span><span class="muted">da spedire</span></div>
      <div><span class="numero">${conta.spediti}</span><span class="muted">spediti</span></div>
      <div><span class="numero">${prezzo(incassato)}</span><span class="muted">incassato</span></div>
    </div>
    <nav class="schede">
      <a href="?filtro=da_spedire" class="${filtro === 'da_spedire' ? 'attiva' : ''}">Da spedire (${conta.da_spedire})</a>
      <a href="?filtro=spediti" class="${filtro === 'spediti' ? 'attiva' : ''}">Spediti (${conta.spediti})</a>
      <a href="?filtro=tutti" class="${filtro === 'tutti' ? 'attiva' : ''}">Tutti (${conta.tutti})</a>
    </nav>
    ${lista.length ? `
    <div class="tabella-scroll">
    <table class="tabella">
      <thead><tr><th>Ordine</th><th>Data</th><th>Cliente</th><th>Articoli</th><th>Totale</th><th>Stato</th></tr></thead>
      <tbody>
      ${lista.map((o) => `
        <tr>
          <td><a href="/admin/ordini/${esc(o.id)}"><strong>${esc(o.id)}</strong></a></td>
          <td>${dataIt(o.creato)}</td>
          <td>${esc(o.cliente.nome)}<br><span class="muted piccolo">${esc(o.indirizzo.citta)} (${esc(o.indirizzo.provincia)})</span></td>
          <td>${o.articoli.map((a) => `${a.quantita}× ${esc(a.nome)}${a.personalizzazione ? ` <em>“${esc(a.personalizzazione)}”</em>` : ''}`).join('<br>')}</td>
          <td>${prezzo(o.totale)}</td>
          <td><span class="stato stato-${o.stato}">${STATI[o.stato] || o.stato}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>` : '<p class="vuoto muted">Nessun ordine in questa lista.</p>'}
  </div>
</section>`;
    res.send(layout({ ...ctx(req), mostraTemi: false }, { titolo: 'Ordini', contenuto, bodyClass: 'admin' }));
  });

  r.get('/ordini.csv', (req, res) => {
    const campi = ['id', 'creato', 'stato', 'nome', 'email', 'telefono', 'via', 'cap', 'citta', 'provincia', 'articoli', 'subtotale', 'spedizione', 'totale', 'note', 'tracking'];
    const cella = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const righe = store.leggiOrdini().map((o) => [
      o.id, o.creato, STATI[o.stato] || o.stato, o.cliente.nome, o.cliente.email, o.cliente.telefono,
      o.indirizzo.via, o.indirizzo.cap, o.indirizzo.citta, o.indirizzo.provincia,
      o.articoli.map((a) => `${a.quantita}x ${a.nome}${a.personalizzazione ? ` [${a.personalizzazione}]` : ''}`).join('; '),
      o.subtotale.toFixed(2).replace('.', ','), o.spedizione.toFixed(2).replace('.', ','), o.totale.toFixed(2).replace('.', ','),
      o.note, o.tracking,
    ].map(cella).join(';'));
    res.set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="ordini.csv"')
      .send('﻿' + [campi.join(';'), ...righe].join('\r\n'));
  });

  r.get('/ordini/:id', (req, res, next) => {
    const o = store.ordine(req.params.id);
    if (!o) return next();
    const contenuto = `
<section class="sezione">
  <div class="contenitore stretto">
    <nav class="briciole"><a href="/admin">Ordini</a> / <span>${esc(o.id)}</span></nav>
    <div class="admin-testa">
      <h1>${esc(o.id)}</h1>
      <span class="stato stato-${o.stato}">${STATI[o.stato] || o.stato}</span>
    </div>
    <p class="muted">Ricevuto il ${dataIt(o.creato)}${o.pagato ? ` · pagato il ${dataIt(o.pagato)}` : ''}${o.spedito ? ` · spedito il ${dataIt(o.spedito)}` : ''}</p>

    <div class="pannelli">
      <div class="pannello">
        <h2>Da realizzare</h2>
        <ul class="lista-articoli">
          ${o.articoli.map((a) => `<li><strong>${a.quantita}× ${esc(a.nome)}</strong>${a.personalizzazione ? `<br>Testo: <span class="testo-pers">${esc(a.personalizzazione)}</span>` : ''}<span class="muted"> · ${prezzo(a.prezzo)} cad.</span></li>`).join('')}
        </ul>
        ${o.note ? `<p><strong>Note del cliente:</strong><br>${esc(o.note)}</p>` : ''}
        <dl class="importi">
          <div><dt>Subtotale</dt><dd>${prezzo(o.subtotale)}</dd></div>
          <div><dt>Spedizione</dt><dd>${prezzo(o.spedizione)}</dd></div>
          <div class="totale"><dt>Totale</dt><dd>${prezzo(o.totale)}</dd></div>
        </dl>
      </div>
      <div class="pannello">
        <h2>Spedire a</h2>
        <address class="etichetta">${esc(o.cliente.nome)}<br>${esc(o.indirizzo.via)}<br>${esc(o.indirizzo.cap)} ${esc(o.indirizzo.citta)} (${esc(o.indirizzo.provincia)})<br>Italia</address>
        <p><a href="mailto:${esc(o.cliente.email)}">${esc(o.cliente.email)}</a>${o.cliente.telefono ? `<br><a href="tel:${esc(o.cliente.telefono)}">${esc(o.cliente.telefono)}</a>` : ''}</p>
        ${o.paypal?.captureId ? `<p class="muted piccolo">PayPal: transazione ${esc(o.paypal.captureId)}${o.paypal.emailPagatore ? ` · ${esc(o.paypal.emailPagatore)}` : ''}</p>` : ''}
        ${o.demo ? '<p class="avviso piccolo">Ordine di prova (pagamento simulato)</p>' : ''}
      </div>
    </div>

    <div class="pannello">
      <h2>Aggiorna stato</h2>
      <form method="post" action="/admin/ordini/${esc(o.id)}/stato" class="form-stato">
        <label class="campo"><span>Numero di tracking (facoltativo)</span><input name="tracking" value="${esc(o.tracking || '')}" maxlength="80"></label>
        <div class="azioni">
          ${o.stato !== 'spedito' ? '<button class="btn btn-primario" name="stato" value="spedito">Segna come spedito</button>' : '<button class="btn btn-secondario" name="stato" value="pagato">Riporta a “da spedire”</button>'}
          ${o.stato !== 'annullato' ? '<button class="btn btn-leggero" name="stato" value="annullato" onclick="return confirm(\'Annullare questo ordine? Ricorda di fare il rimborso da PayPal.\')">Annulla ordine</button>' : ''}
        </div>
      </form>
    </div>
  </div>
</section>`;
    res.send(layout({ ...ctx(req), mostraTemi: false }, { titolo: o.id, contenuto, bodyClass: 'admin' }));
  });

  r.post('/ordini/:id/stato', express.urlencoded({ extended: false, limit: '5kb' }), (req, res, next) => {
    const o = store.ordine(req.params.id);
    if (!o) return next();
    const stato = req.body.stato;
    if (!['pagato', 'spedito', 'annullato'].includes(stato)) return res.status(400).send('Stato non valido');
    o.stato = stato;
    o.tracking = String(req.body.tracking || '').slice(0, 80).trim() || o.tracking;
    if (stato === 'spedito') o.spedito = new Date().toISOString();
    store.salvaOrdine(o);
    res.redirect(303, `/admin/ordini/${encodeURIComponent(o.id)}`);
  });

  return r;
};
