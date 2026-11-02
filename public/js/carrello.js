// Carrello salvato nel browser del cliente
window.Carrello = (function () {
  const CHIAVE = 'carrello';

  function leggi() {
    try { return JSON.parse(localStorage.getItem(CHIAVE)) || []; } catch (e) { return []; }
  }
  function scrivi(righe) {
    try { localStorage.setItem(CHIAVE, JSON.stringify(righe)); } catch (e) { /* storage non disponibile */ }
    aggiornaBadge();
  }
  function aggiungi(slug, quantita, personalizzazione) {
    const righe = leggi();
    const esistente = righe.find((r) => r.slug === slug && (r.personalizzazione || '') === (personalizzazione || ''));
    if (esistente) esistente.quantita = Math.min(20, esistente.quantita + quantita);
    else righe.push({ slug, quantita, personalizzazione: personalizzazione || '' });
    scrivi(righe);
  }
  function conta() {
    return leggi().reduce((s, r) => s + r.quantita, 0);
  }
  function aggiornaBadge() {
    const n = conta();
    document.querySelectorAll('[data-badge-carrello]').forEach((el) => {
      el.textContent = n;
      el.hidden = n === 0;
    });
  }

  let timer;
  function toast(html) {
    const el = document.querySelector('.toast');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('visibile'));
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.classList.remove('visibile');
      setTimeout(() => { el.hidden = true; }, 300);
    }, 3500);
  }

  document.addEventListener('DOMContentLoaded', aggiornaBadge);
  window.addEventListener('storage', aggiornaBadge);

  return { leggi, scrivi, aggiungi, conta, aggiornaBadge, toast };
})();
