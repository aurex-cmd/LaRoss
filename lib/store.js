// Archivio semplice su file JSON: prodotti (modificabili a mano) e ordini.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PRODOTTI_FILE = path.join(ROOT, 'data', 'prodotti.json');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT, 'storage');
const ORDINI_FILE = path.join(STORAGE_DIR, 'ordini.json');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// I prodotti vengono riletti a ogni richiesta: basta salvare il file per aggiornare il sito.
function prodotti() {
  return JSON.parse(fs.readFileSync(PRODOTTI_FILE, 'utf8'));
}

function prodotto(slug) {
  return prodotti().find((p) => p.slug === slug);
}

function leggiOrdini() {
  try {
    return JSON.parse(fs.readFileSync(ORDINI_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function scriviOrdini(lista) {
  const tmp = ORDINI_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, ORDINI_FILE); // scrittura atomica
}

function ordine(id) {
  return leggiOrdini().find((o) => o.id === id);
}

function trovaOrdine(fn) {
  return leggiOrdini().find(fn);
}

function salvaOrdine(nuovo) {
  const lista = leggiOrdini();
  const i = lista.findIndex((o) => o.id === nuovo.id);
  if (i >= 0) lista[i] = nuovo;
  else lista.unshift(nuovo);
  scriviOrdini(lista);
  return nuovo;
}

function nuovoIdOrdine() {
  const d = new Date();
  const data = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `LR-${data}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = { prodotti, prodotto, leggiOrdini, ordine, trovaOrdine, salvaOrdine, nuovoIdOrdine };
