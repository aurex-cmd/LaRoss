(function () {
  const CAT = window.CATALOGO || {};
  const SPED = window.SPEDIZIONE || { locker: 0, domicilio: null, gratisDa: 0 };
  const euro = (n) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const form = $('[data-form-spedizione]');
  const errore = $('[data-errore]');

  // --- Consegna InPost: Locker (mappa o codice) oppure domicilio ---
  const conMappa = Boolean(document.querySelector('inpost-geowidget'));
  let puntoMappa = null; // punto scelto sulla mappa
  const tipoConsegna = () => (form.querySelector('input[name=consegna]:checked') || {}).value || 'locker';

  function aggiornaConsegna() {
    const dom = tipoConsegna() === 'domicilio';
    $('[data-blocco-locker]').hidden = dom;
    $('[data-blocco-domicilio]').hidden = !dom;
    form.querySelectorAll('[data-req-domicilio]').forEach((el) => { el.required = dom; });
    if (form.elements.puntoId) form.elements.puntoId.required = !dom;
    disegna();
  }
  form.querySelectorAll('input[name=consegna]').forEach((r) => r.addEventListener('change', aggiornaConsegna));

  function mostraPunto(p) {
    const box = $('[data-punto-scelto]');
    box.hidden = !p;
    if (p) box.innerHTML = `<strong>Locker scelto: ${esc(p.id)}</strong>${p.indirizzo ? `<br>${esc(p.indirizzo)}` : ''}`;
  }
  document.addEventListener('onpointselect', (e) => {
    const p = e.detail || {};
    const a = p.address || {};
    puntoMappa = { id: p.name, indirizzo: [a.line1, a.line2].filter(Boolean).join(', ') };
    mostraPunto(puntoMappa);
    mostraErrore('');
    salva();
  });

  // Ricorda i dati di spedizione mentre il cliente compila
  function salva() {
    try { sessionStorage.setItem('spedizione', JSON.stringify(datiCliente())); } catch (e) { /* niente */ }
  }
  try {
    const salvati = JSON.parse(sessionStorage.getItem('spedizione') || '{}');
    Object.entries(salvati).forEach(([k, v]) => {
      if (k === 'consegna') { const r = form.querySelector(`input[name=consegna][value="${v}"]`); if (r) r.checked = true; return; }
      if (form.elements[k] && form.elements[k].type !== 'radio') form.elements[k].value = v;
    });
    if (conMappa && salvati.puntoId) { puntoMappa = { id: salvati.puntoId, indirizzo: salvati.puntoIndirizzo }; mostraPunto(puntoMappa); }
  } catch (e) { /* niente */ }
  form.addEventListener('input', () => {
    if (!errore.hidden) mostraErrore('');
    salva();
  });

  function righeValide() {
    return Carrello.leggi().filter((r) => CAT[r.slug] && CAT[r.slug].disponibile);
  }

  function disegna() {
    const righe = righeValide();
    $('[data-carrello-vuoto]').hidden = righe.length > 0;
    $('[data-checkout]').hidden = righe.length === 0;
    if (!righe.length) return;

    $('[data-righe]').innerHTML = righe.map((r, i) => {
      const p = CAT[r.slug];
      return `<li class="riga">
        <img src="${esc(p.img)}" alt="">
        <div class="riga-info">
          <a href="/creazioni/${esc(r.slug)}"><strong>${esc(p.nome)}</strong></a>
          ${r.personalizzazione ? `<span class="muted piccolo">“${esc(r.personalizzazione)}”</span>` : ''}
          <span class="muted piccolo">${euro(p.prezzo)} cad.</span>
        </div>
        <div class="riga-qta">
          <button type="button" data-meno="${i}" aria-label="Diminuisci">−</button>
          <span>${r.quantita}</span>
          <button type="button" data-piu="${i}" aria-label="Aumenta">+</button>
        </div>
        <strong class="riga-tot">${euro(p.prezzo * r.quantita)}</strong>
        <button type="button" class="rimuovi" data-rimuovi="${i}" aria-label="Rimuovi">×</button>
      </li>`;
    }).join('');

    const sub = righe.reduce((s, r) => s + CAT[r.slug].prezzo * r.quantita, 0);
    const gratis = SPED.gratisDa && sub >= SPED.gratisDa;
    const costo = tipoConsegna() === 'domicilio' ? SPED.domicilio : SPED.locker;
    const sped = gratis ? 0 : costo;
    const p1 = $('[data-prezzo-locker]'); if (p1) p1.textContent = gratis ? 'Gratis' : euro(SPED.locker);
    const p2 = $('[data-prezzo-domicilio]'); if (p2) p2.textContent = gratis ? 'Gratis' : euro(SPED.domicilio);
    $('[data-subtotale]').textContent = euro(sub);
    $('[data-spedizione]').textContent = sped ? euro(sped) : 'Gratis';
    $('[data-totale]').textContent = euro(sub + sped);
    $('[data-nota-gratis]').textContent = SPED.gratisDa && !gratis
      ? `Aggiungi ${euro(SPED.gratisDa - sub)} per la spedizione gratuita.` : '';
  }

  $('[data-righe]').addEventListener('click', (e) => {
    const righe = righeValide();
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.piu) righe[t.dataset.piu].quantita = Math.min(20, righe[t.dataset.piu].quantita + 1);
    if (t.dataset.meno) righe[t.dataset.meno].quantita = Math.max(1, righe[t.dataset.meno].quantita - 1);
    if (t.dataset.rimuovi) righe.splice(Number(t.dataset.rimuovi), 1);
    Carrello.scrivi(righe);
    disegna();
  });

  function datiCliente() {
    const f = form.elements;
    const val = (k) => (f[k] ? f[k].value : '');
    return {
      nome: val('nome'), cognome: val('cognome'), email: val('email'), telefono: val('telefono'),
      consegna: tipoConsegna(),
      puntoId: conMappa ? (puntoMappa ? puntoMappa.id : '') : val('puntoId'),
      puntoIndirizzo: conMappa ? (puntoMappa ? puntoMappa.indirizzo : '') : val('puntoIndirizzo'),
      via: val('via'), cap: val('cap'), citta: val('citta'), provincia: val('provincia'), note: val('note'),
    };
  }

  function mostraErrore(msg) {
    errore.textContent = msg || '';
    errore.hidden = !msg;
  }

  function formValido() {
    form.classList.add('verificato');
    if (form.checkValidity()) {
      if (conMappa && tipoConsegna() === 'locker' && !puntoMappa) {
        const mappa = document.querySelector('inpost-geowidget');
        mappa.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mostraErrore('Scegli sulla mappa il Locker dove ritirare il pacco.');
        return false;
      }
      return true;
    }
    const primo = form.querySelector(':invalid');
    if (primo) { primo.focus(); primo.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    mostraErrore('Completa i dati di spedizione evidenziati.');
    return false;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(json.errore || 'Errore imprevisto. Riprova.'); err.riprova = json.riprova; throw err; }
    return json;
  }

  async function creaOrdine() {
    mostraErrore('');
    return post('/api/ordini', { articoli: righeValide(), cliente: datiCliente() });
  }

  function vaiAGrazie(id) {
    try { localStorage.removeItem('carrello'); sessionStorage.removeItem('spedizione'); } catch (e) { /* niente */ }
    location.href = '/grazie?ordine=' + encodeURIComponent(id);
  }

  // --- PayPal ---
  let ordineCorrente = null;
  if (window.paypal && document.getElementById('paypal-pulsanti')) {
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
      onClick(data, actions) {
        return formValido() ? actions.resolve() : actions.reject();
      },
      async createOrder() {
        try {
          const r = await creaOrdine();
          ordineCorrente = r.ordine;
          return r.paypalId;
        } catch (e) { mostraErrore(e.message); throw e; }
      },
      async onApprove(data, actions) {
        try {
          const r = await post(`/api/ordini/${encodeURIComponent(ordineCorrente)}/cattura`);
          vaiAGrazie(r.ordine);
        } catch (e) {
          if (e.riprova) return actions.restart();
          mostraErrore(e.message);
        }
      },
      onCancel() { mostraErrore('Pagamento annullato. Puoi riprovare quando vuoi.'); },
      onError() { mostraErrore('Si è verificato un problema con PayPal. Riprova.'); },
    }).render('#paypal-pulsanti');
  }

  // --- Modalità prova ---
  const demo = $('[data-paga-demo]');
  if (demo) {
    demo.addEventListener('click', async () => {
      if (!formValido()) return;
      demo.disabled = true;
      try {
        const r = await creaOrdine();
        const pagato = await post(`/api/ordini/${encodeURIComponent(r.ordine)}/paga-demo`);
        vaiAGrazie(pagato.ordine);
      } catch (e) {
        mostraErrore(e.message);
        demo.disabled = false;
      }
    });
  }

  aggiornaConsegna();
})();
