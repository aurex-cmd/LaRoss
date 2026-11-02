(function () {
  const form = document.querySelector('[data-form-acquisto]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const pers = form.elements.personalizzazione ? form.elements.personalizzazione.value.trim() : '';
      if (form.elements.personalizzazione && form.elements.personalizzazione.required && !pers) {
        form.elements.personalizzazione.focus();
        return;
      }
      const qta = Math.max(1, Math.min(20, parseInt(form.elements.quantita.value, 10) || 1));
      Carrello.aggiungi(form.dataset.slug, qta, pers);
      Carrello.toast('Aggiunto al carrello ✓ <a href="/carrello">Vai al carrello</a>');
    });
  }

  const principale = document.querySelector('[data-img-principale]');
  document.querySelectorAll('[data-miniatura]').forEach((btn) => {
    btn.addEventListener('click', () => {
      principale.src = btn.dataset.miniatura;
      document.querySelectorAll('[data-miniatura]').forEach((b) => b.classList.toggle('attiva', b === btn));
    });
  });
})();
