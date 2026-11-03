// Pagine HTML generate lato server (nessun motore di template necessario).
const TEMI = {
  neve: {
    nome: 'Neve',
    descr: 'Bianco pulito, pulsanti rosso Natale',
    font: 'family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600',
  },
  bosco: {
    nome: 'Bosco',
    descr: 'Crema e verde abete',
    font: 'family=Cormorant+Garamond:wght@500;600;700&family=Karla:wght@400;500;700',
  },
  kraft: {
    nome: 'Kraft',
    descr: 'Carta da pacchi e scritte a mano',
    font: 'family=Caveat:wght@500;700&family=Nunito+Sans:wght@400;600;700',
  },
  notte: {
    nome: 'Notte',
    descr: 'Blu notte, rosso e oro',
    font: 'family=DM+Serif+Display&family=DM+Sans:wght@400;500;700',
  },
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Nome e destinazione dell'ordine, per le pagine e l'area ordini
const nomeCliente = (o) => `${o.cliente.nome} ${o.cliente.cognome || ''}`.trim();
function destinazioneHtml(o) {
  if (o.consegna?.tipo === 'locker') {
    const p = o.consegna.punto;
    return `${esc(nomeCliente(o))}<br>Locker InPost <strong>${esc(p.id)}</strong>${p.indirizzo ? `<br>${esc(p.indirizzo)}` : ''}`;
  }
  return `${esc(nomeCliente(o))}<br>${esc(o.indirizzo.via)}<br>${esc(o.indirizzo.cap)} ${esc(o.indirizzo.citta)} (${esc(o.indirizzo.provincia)})`;
}
const luogoBreve = (o) => (o.consegna?.tipo === 'locker' ? `Locker ${o.consegna.punto.id}` : `${o.indirizzo.citta} (${o.indirizzo.provincia})`);

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const prezzo = (n) => fmt.format(n);

// JSON sicuro da inserire dentro <script>
const jsonScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function layout(ctx, { titolo, contenuto, script = '', bodyClass = '' }) {
  const { negozio, tema, mostraTemi } = ctx;
  const t = TEMI[tema];
  const switcher = mostraTemi ? `
  <div class="temi" aria-label="Scegli lo stile del sito">
    <span class="temi-label">Stile:</span>
    ${Object.entries(TEMI).map(([k, v]) => `<a href="?tema=${k}" class="${k === tema ? 'attivo' : ''}" title="${esc(v.descr)}"><i class="pallino pallino-${k}"></i>${esc(v.nome)}</a>`).join('')}
  </div>` : '';

  return `<!doctype html>
<html lang="it" data-tema="${tema}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo ? `${titolo} · ${negozio.nome}` : negozio.nome)}</title>
<meta name="description" content="${esc(negozio.descrizione)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${t.font}&display=swap">
<link rel="stylesheet" href="/css/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎄</text></svg>">
</head>
<body class="${bodyClass}">
<header class="testata">
  <div class="contenitore testata-riga">
    <a href="/" class="logo">${esc(negozio.nome)}<span class="logo-stella" aria-hidden="true">✦</span></a>
    <nav class="menu">
      <a href="/#creazioni">Creazioni</a>
      <a href="/carrello" class="menu-carrello">Carrello <span class="badge" data-badge-carrello hidden>0</span></a>
    </nav>
  </div>
</header>
<main>
${contenuto}
</main>
<footer class="piede">
  <div class="contenitore piede-griglia">
    <div>
      <p class="logo logo-piccolo">${esc(negozio.nome)}</p>
      <p class="muted">${esc(negozio.descrizione)}</p>
    </div>
    <div>
      <p><strong>Spedizioni</strong></p>
      <p class="muted">Con InPost in tutta Italia · Locker ${prezzo(negozio.spedizione)}${negozio.spedizioneGratisDa ? ` · gratis sopra ${prezzo(negozio.spedizioneGratisDa)}` : ''}</p>
    </div>
    <div>
      <p><strong>Pagamenti sicuri</strong></p>
      <p class="muted">PayPal e carte di credito/debito</p>
      ${negozio.email ? `<p class="muted"><a href="mailto:${esc(negozio.email)}">${esc(negozio.email)}</a></p>` : ''}
    </div>
  </div>
</footer>
${switcher}
<div class="toast" role="status" aria-live="polite" hidden></div>
<script src="/js/carrello.js"></script>
${script}
</body>
</html>`;
}

function card(p) {
  return `
  <a class="card" href="/creazioni/${esc(p.slug)}">
    <div class="card-img"><img src="${esc(p.immagini[0])}" alt="${esc(p.nome)}" loading="lazy"${p.posizioneImmagine ? ` style="object-position:${esc(p.posizioneImmagine)}"` : ''}></div>
    <div class="card-testo">
      <h3>${esc(p.nome)}</h3>
      <p class="muted">${p.personalizzazione ? 'Personalizzabile' : esc(p.tempiDiLavorazione || '')}</p>
      <p class="prezzo">${prezzo(p.prezzo)}</p>
    </div>
  </a>`;
}

function home(ctx, prodotti) {
  const evid = prodotti.find((p) => p.inEvidenza) || prodotti[0];
  const contenuto = `
<section class="hero">
  <div class="contenitore hero-griglia">
    <div class="hero-testo">
      <p class="occhiello">Natale ${new Date().getFullYear()} · fatto a mano</p>
      <h1>Piccole creazioni<br>per un Natale speciale</h1>
      <p class="lead">${esc(ctx.negozio.descrizione)}</p>
      <div class="azioni azioni-hero">
        ${evid ? `<a class="btn btn-primario" href="/creazioni/${esc(evid.slug)}">${esc(evid.pulsanteHome || `Scopri ${evid.nome}`)}</a>` : ''}
        <a class="btn btn-secondario" href="#creazioni">Tutte le creazioni</a>
      </div>
    </div>
    ${evid ? `<a class="hero-img" href="/creazioni/${esc(evid.slug)}"><img src="${esc(evid.immagini[0])}" alt="${esc(evid.nome)}"></a>` : ''}
  </div>
</section>
<section class="sezione" id="creazioni">
  <div class="contenitore">
    <div class="sezione-titolo">
      <h2>Le creazioni</h2>
      <p class="muted">Ogni pezzo è realizzato a mano, uno alla volta.</p>
    </div>
    <div class="griglia">
      ${prodotti.filter((p) => p.disponibile !== false).map(card).join('')}
    </div>
  </div>
</section>`;
  return layout(ctx, { contenuto });
}

function paginaProdotto(ctx, p, altri) {
  const pers = p.personalizzazione;
  const contenuto = `
<section class="sezione">
  <div class="contenitore">
    <nav class="briciole"><a href="/">Home</a> / <a href="/#creazioni">Creazioni</a> / <span>${esc(p.nome)}</span></nav>
    <div class="prodotto">
      <div class="prodotto-galleria">
        <img class="prodotto-img" src="${esc(p.immagini[0])}" alt="${esc(p.nome)}" data-img-principale>
        ${p.immagini.length > 1 ? `<div class="miniature">${p.immagini.map((src, i) => `<button type="button" data-miniatura="${esc(src)}" class="${i === 0 ? 'attiva' : ''}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="prodotto-info">
        <h1>${esc(p.nome)}</h1>
        ${p.sottotitolo ? `<p class="lead">${esc(p.sottotitolo)}</p>` : ''}
        <p class="prezzo prezzo-grande">${prezzo(p.prezzo)}</p>
        <p>${esc(p.descrizione)}</p>
        ${p.dettagli?.length ? `<ul class="dettagli">${p.dettagli.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${p.disponibile === false ? '<p class="avviso">Al momento non disponibile.</p>' : `
        <form class="form-acquisto" data-form-acquisto data-slug="${esc(p.slug)}">
          ${pers ? `
          <label class="campo">
            <span>${esc(pers.etichetta)}${pers.obbligatoria ? ' *' : ''}</span>
            <input type="text" name="personalizzazione" maxlength="${Number(pers.maxLunghezza) || 60}" placeholder="es. ${esc(pers.esempio || '')}" ${pers.obbligatoria ? 'required' : ''}>
            <small class="muted">Scrivi esattamente come vuoi che appaia (max ${Number(pers.maxLunghezza) || 60} caratteri).</small>
          </label>` : ''}
          <div class="riga-acquisto">
            <label class="campo campo-qta">
              <span>Quantità</span>
              <input type="number" name="quantita" value="1" min="1" max="20" required>
            </label>
            <button class="btn btn-primario btn-largo" type="submit">Aggiungi al carrello</button>
          </div>
          ${p.tempiDiLavorazione ? `<p class="muted piccolo">⏱ ${esc(p.tempiDiLavorazione)}</p>` : ''}
        </form>`}
      </div>
    </div>
  </div>
</section>
${altri.length ? `
<section class="sezione sezione-alt">
  <div class="contenitore">
    <div class="sezione-titolo"><h2>Potrebbe piacerti anche</h2></div>
    <div class="griglia">${altri.map(card).join('')}</div>
  </div>
</section>` : ''}`;
  return layout(ctx, { titolo: p.nome, contenuto, script: '<script src="/js/prodotto.js"></script>' });
}

function carrello(ctx, prodotti, paypal) {
  const catalogo = Object.fromEntries(prodotti.map((p) => [p.slug, {
    nome: p.nome, prezzo: p.prezzo, img: p.immagini[0], disponibile: p.disponibile !== false,
  }]));
  const contenuto = `
<section class="sezione">
  <div class="contenitore">
    <h1>Il tuo carrello</h1>
    <div data-carrello-vuoto hidden class="vuoto">
      <p>Il carrello è vuoto.</p>
      <a class="btn btn-primario" href="/#creazioni">Guarda le creazioni</a>
    </div>
    <div class="checkout" data-checkout hidden>
      <div class="checkout-sinistra">
        <ul class="righe-carrello" data-righe></ul>

        <form class="form-spedizione" data-form-spedizione novalidate>
          <h2>I tuoi dati</h2>
          <div class="campi">
            <label class="campo"><span>Nome *</span><input name="nome" autocomplete="given-name" required maxlength="60"></label>
            <label class="campo"><span>Cognome *</span><input name="cognome" autocomplete="family-name" required maxlength="60"></label>
            <label class="campo"><span>Email *</span><input name="email" type="email" autocomplete="email" required maxlength="120"></label>
            <label class="campo"><span>Cellulare *</span><input name="telefono" type="tel" autocomplete="tel" required maxlength="20" pattern="[+]?[0-9 ]{8,16}" placeholder="es. 333 1234567"><small>InPost ti manda qui il codice per ritirare il pacco.</small></label>
          </div>

          <h2>Consegna con InPost</h2>
          <div class="opzioni-consegna">
            <label class="opzione">
              <input type="radio" name="consegna" value="locker" checked>
              <span><strong>Ritiro in un Locker o punto InPost</strong><br><span class="muted piccolo">Ritiri quando vuoi con il codice che ricevi sul telefono</span></span>
              <span class="opzione-prezzo" data-prezzo-locker></span>
            </label>
            ${ctx.inpost.domicilio ? `
            <label class="opzione">
              <input type="radio" name="consegna" value="domicilio">
              <span><strong>A casa con il corriere InPost</strong><br><span class="muted piccolo">Disponibile solo in alcune zone</span></span>
              <span class="opzione-prezzo" data-prezzo-domicilio></span>
            </label>` : ''}
          </div>

          <div data-blocco-locker>
            ${ctx.inpost.geowidgetToken ? `
            <inpost-geowidget class="mappa-locker" token="${esc(ctx.inpost.geowidgetToken)}" config="parcelCollect" language="it" country="IT"></inpost-geowidget>` : `
            <label class="campo"><span>Codice del Locker *</span><input name="puntoId" maxlength="20" placeholder="es. il codice scritto sul Locker" autocapitalize="characters"><small>Cercalo sulla mappa su <a href="https://inpost.it" target="_blank" rel="noopener">inpost.it</a>.</small></label>
            <label class="campo"><span>Indirizzo del Locker</span><input name="puntoIndirizzo" maxlength="200" placeholder="es. Via Roma 1, Milano"></label>`}
            <div class="punto-scelto" data-punto-scelto hidden></div>
          </div>

          <div class="campi" data-blocco-domicilio hidden>
            <label class="campo campo-pieno"><span>Indirizzo e numero civico *</span><input name="via" autocomplete="address-line1" maxlength="200" data-req-domicilio></label>
            <label class="campo"><span>CAP *</span><input name="cap" inputmode="numeric" pattern="[0-9]{5}" autocomplete="postal-code" maxlength="5" data-req-domicilio></label>
            <label class="campo"><span>Città *</span><input name="citta" autocomplete="address-level2" maxlength="100" data-req-domicilio></label>
            <label class="campo"><span>Provincia (sigla) *</span><input name="provincia" pattern="[A-Za-z]{2}" maxlength="2" placeholder="es. MI" autocomplete="address-level1" data-req-domicilio></label>
          </div>

          <label class="campo"><span>Note per l'ordine</span><textarea name="note" rows="3" maxlength="500" placeholder="Es. data entro cui ti serve, richieste particolari…"></textarea></label>
        </form>
      </div>

      <aside class="riepilogo">
        <h2>Riepilogo</h2>
        <dl>
          <div><dt>Subtotale</dt><dd data-subtotale>—</dd></div>
          <div><dt>Spedizione</dt><dd data-spedizione>—</dd></div>
          <div class="totale"><dt>Totale</dt><dd data-totale>—</dd></div>
        </dl>
        <p class="muted piccolo" data-nota-gratis></p>
        <div class="pagamento">
          ${paypal.configurato
            ? '<div id="paypal-pulsanti"></div>'
            : `<div class="avviso">
                <strong>Modalità prova</strong><br>PayPal non è ancora configurato: il pulsante qui sotto simula un pagamento per provare il sito.
              </div>
              <button type="button" class="btn btn-primario btn-largo" data-paga-demo>Paga (simulazione)</button>`}
          <p class="errore" data-errore hidden></p>
        </div>
        <p class="muted piccolo">🔒 Il pagamento avviene sul sito sicuro di PayPal. Puoi pagare anche con carta senza un account PayPal.</p>
      </aside>
    </div>
  </div>
</section>`;
  const script = `
<script>window.CATALOGO=${jsonScript(catalogo)};window.SPEDIZIONE=${jsonScript({ locker: ctx.negozio.spedizione, domicilio: ctx.negozio.spedizioneDomicilio, gratisDa: ctx.negozio.spedizioneGratisDa })};</script>
${ctx.inpost.geowidgetToken ? '<link rel="stylesheet" href="https://geowidget.inpost-group.com/inpost-geowidget.css">\n<script src="https://geowidget.inpost-group.com/inpost-geowidget.js" defer></script>' : ''}
${paypal.configurato ? `<script src="https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypal.CLIENT_ID)}&currency=EUR&locale=it_IT&components=buttons" data-namespace="paypal"></script>` : ''}
<script src="/js/checkout.js"></script>`;
  return layout(ctx, { titolo: 'Carrello', contenuto, script });
}

function grazie(ctx, o) {
  const contenuto = `
<section class="sezione">
  <div class="contenitore stretto centrato">
    <div class="grazie-icona" aria-hidden="true">🎁</div>
    <h1>Grazie per il tuo ordine!</h1>
    ${o ? `
      <p class="lead">Ordine <strong>${esc(o.id)}</strong> · ${prezzo(o.totale)}</p>
      <p>Abbiamo ricevuto il pagamento. ${o.consegna?.tipo === 'locker' ? 'La tua creazione arriverà al Locker InPost:' : 'Riceverai la tua creazione all\'indirizzo:'}</p>
      <address>${destinazioneHtml(o)}</address>
      <p class="muted">Quando la spediamo, InPost ti avvisa via SMS ed email. Conserva il numero d'ordine per qualsiasi domanda.</p>` : '<p>Il tuo ordine è stato registrato.</p>'}
    <a class="btn btn-secondario" href="/">Torna al negozio</a>
  </div>
</section>
<script>try{localStorage.removeItem('carrello')}catch(e){}</script>`;
  return layout(ctx, { titolo: 'Grazie', contenuto });
}

function nonTrovato(ctx) {
  return layout(ctx, {
    titolo: 'Pagina non trovata',
    contenuto: `<section class="sezione"><div class="contenitore stretto centrato"><h1>Pagina non trovata</h1><p><a class="btn btn-primario" href="/">Torna al negozio</a></p></div></section>`,
  });
}

module.exports = { TEMI, esc, prezzo, nomeCliente, destinazioneHtml, luogoBreve, layout, home, paginaProdotto, carrello, grazie, nonTrovato };
