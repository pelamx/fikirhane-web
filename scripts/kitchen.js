// Kitchen (mutfak), the member area's #mutfak view: scan a product's barcode onto your tab, pay it once when you leave.
// The tab, prices and payment live on the server (/api/me/kitchen); this view only shows them.
import { escapeHTML as esc } from './shared.js';
import { api } from './api.js';
import { siteUrl } from './session.js';

let content = null, flash = () => {}, signedOut = () => {};
let state = null, product = null, notice = null, noticeAt = 0, busy = false, confirming = 0;

const tl = (amount, currency) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(amount ?? 0));
const timeOnly = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });
/** Keeps the address at member/#mutfak once the card page's answer (?odeme=…) is read. */
const cleanAddress = () => history.replaceState(null, '', location.pathname + '#mutfak');

/** Product barcodes are 8–14 digits (EAN-8/13, UPC-A/E, ITF-14, or digits in code 128). */
const barcodeFrom = text => { const digits = String(text ?? '').replace(/\s+/g, ''); return /^[0-9]{8,14}$/.test(digits) ? digits : null; };

function noticeHtml() {
  if (!notice) return '';
  return `<div class="kitchen-notice kitchen-notice-${notice.kind}" role="status"><strong>${esc(notice.title)}</strong>${notice.text ? `<p>${esc(notice.text)}</p>` : ''}</div>`;
}

function productHtml() {
  if (!product) return '';
  const blocked = !state.eligible || state.tab?.earlier || state.tab?.locked;
  return `<section class="kitchen-product" aria-label="Seçtiğin ürün"><div><small>${product.fromList ? 'Seçtiğin ürün' : 'Okuttuğun ürün'}</small><strong>${esc(product.item_name)}</strong><span>${esc(tl(product.price, product.currency_code))} · KDV dahil</span></div>
    <div class="kitchen-product-actions"><button class="shell-secondary" data-dismiss>Vazgeç</button><button class="shell-primary" data-add="${esc(product.item_code)}" ${blocked ? 'disabled' : ''}>Hesabıma ekle <span>+</span></button></div></section>`;
}

function tabHtml(tab) {
  if (!tab || !tab.lines.length) {
    return `<section class="kitchen-tab kitchen-tab-empty"><h2>Hesabın</h2><p>Henüz bir şey eklemedin. Aldığın ürünün barkodunu okut; çıkarken hepsini tek seferde ödersin.</p></section>`;
  }
  const lines = tab.lines.map(l => `<li><span class="kitchen-line-name">${esc(l.description)}<small>${esc(tl(Number(l.line_total) / l.quantity, tab.currency_code))}</small></span>
      <span class="kitchen-qty">${tab.locked ? '' : `<button data-line="${esc(l.id_document_item)}" data-quantity="${l.quantity - 1}" aria-label="${esc(l.description)}: bir azalt">−</button>`}<b aria-label="adet">${l.quantity}</b>${tab.locked || tab.earlier ? '' : `<button data-line="${esc(l.id_document_item)}" data-quantity="${l.quantity + 1}" aria-label="${esc(l.description)}: bir artır">+</button>`}</span>
      <span class="kitchen-line-total">${esc(tl(l.line_total, tab.currency_code))}</span></li>`).join('');
  const pay = tab.locked
    ? `<p class="booking-note">Ödemen sürüyor. Kart sayfasını kapattıysan yeniden açabilir ya da iptal edip hesabına ürün ekleyebilirsin.</p><div class="kitchen-actions"><button class="shell-secondary" data-cancel-pay>Ödemeyi iptal et</button><button class="shell-primary" data-pay>Ödemeye dön <span>↗</span></button></div>`
    : state.online_payment
      ? `<div class="kitchen-actions"><button class="shell-primary" data-pay>Hesabı öde · ${esc(tl(tab.grand_total, tab.currency_code))} <span>↗</span></button></div><p class="kitchen-fine">Kartla, güvenli ödeme sayfasında ödersin; fişin hesabına işlenir.</p>`
      : `<p class="booking-note">Çıkarken hesabını görevliye ödeyebilirsin; adınla açık hesabını görür.</p>`;
  return `<section class="kitchen-tab"><h2>Hesabın${tab.earlier ? ` <small>${esc(timeOnly.format(new Date(tab.created_at)))} tarihinden</small>` : ''}</h2>
    ${tab.earlier ? '<p class="booking-note">Önceki ziyaretinden ödenmemiş bir hesabın var. Önce onu öde; sonra yeni ürün ekleyebilirsin.</p>' : ''}
    <ul class="kitchen-lines">${lines}</ul><p class="kitchen-total">Toplam <strong>${esc(tl(tab.grand_total, tab.currency_code))}</strong></p>${pay}</section>`;
}

const mounted = () => content?.isConnected;
function render() {
  if (!state || !mounted()) return;
  const tab = state.tab;
  const canScan = state.eligible && !tab?.earlier && !tab?.locked;
  const closed = !state.eligible && !tab
    ? `<div class="booking-empty"><p>Mutfak, bugün Fikirhane’de rezervasyonu olanlara açık.</p><p><a class="text-link" href="${siteUrl('rezervasyon/')}">Seans ayırt ↗</a></p></div>` : '';
  const menu = canScan && state.menu?.length
    ? `<section class="kitchen-menu" aria-label="Barkodu olmayan ürünler"><h2>Mutfakta hazırlananlar</h2><p>Barkodu yok; listeden seç.</p><div>${state.menu.map(i =>
        `<button data-pick="${esc(i.item_code)}"><span>${esc(i.item_name)}</span><small>${esc(tl(i.price, i.currency_code))}</small></button>`).join('')}</div></section>` : '';
  const scan = canScan ? `<button class="shell-primary kitchen-scan" data-scan>Barkod okut <span aria-hidden="true">|||</span></button>
    <form class="kitchen-manual" id="kitchen-manual"><label for="kitchen-barcode">Barkod okunmuyorsa altındaki numarayı yaz</label><div><input id="kitchen-barcode" name="barcode" inputmode="numeric" autocomplete="off" pattern="[0-9 ]{8,17}" maxlength="17" placeholder="8690000000005" required><button class="shell-secondary" type="submit">Bul</button></div></form>` : '';
  content.innerHTML = noticeHtml() + productHtml() + closed + scan + menu + (state.eligible || tab ? tabHtml(tab) : '');
}

async function load() {
  try { state = await api('/me/kitchen'); render(); }
  catch (err) {
    if (err?.status === 401) { signedOut(); return; }
    if (mounted()) content.innerHTML = `<div class="booking-empty"><p>${esc(err?.message ?? 'Mutfak hesabın şu an açılamadı.')}</p></div>`;
  }
}

async function showProduct(barcode) {
  try { product = await api(`/me/kitchen/barcode/${encodeURIComponent(barcode)}`); notice = null; }
  catch (err) {
    if (err?.status === 401) { signedOut(); return; }
    product = null; notice = err?.status === 404
      ? { kind: 'bad', title: `${barcode} mutfakta satılan bir ürün değil.`, text: 'Barkod kayıtlı değil. Görevliye haber ver ya da çıkarken görevliye öde.' }
      : { kind: 'bad', title: 'Ürün şu an bulunamadı.', text: err?.message ?? '' };
  }
  render();
  if (mounted()) content.querySelector('[data-add]')?.focus();
}

async function act(fn) {
  if (busy) return; busy = true;
  try { await fn(); } catch (err) { if (err?.status === 401) { signedOut(); return; } flash(err?.message ?? 'Bir şeyler ters gitti.'); await load(); }
  finally { busy = false; }
}

// ---------- scanner ----------
// BarcodeDetector where the browser has it (Android Chrome); elsewhere (iOS Safari) ZXing reads the camera frames.
// A code counts once it is read the same in two frames in a row, so a half-seen barcode does not add the wrong product.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];
let stream = null, running = false, dialog = null, video = null, note = null;
function scannerDialog() {
  if (dialog) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog class="kitchen-scanner" id="kitchen-scanner" aria-label="Barkod okut"><div class="kitchen-viewfinder"><video playsinline muted></video><i aria-hidden="true"></i></div>
    <p>Barkodu çizginin üzerine, yatay ve yakın tut.</p><button class="shell-secondary" type="button">Kapat</button></dialog>`);
  dialog = document.querySelector('#kitchen-scanner'); video = dialog.querySelector('video'); note = dialog.querySelector('p');
  dialog.addEventListener('close', closeScanner);
  dialog.querySelector('button').addEventListener('click', closeScanner);
}
const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZXING; s.integrity = 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB'; s.crossOrigin = 'anonymous';
    s.onload = resolve; s.onerror = () => reject(new Error('reader'));
    document.head.append(s);
  });
}
async function detector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = (await window.BarcodeDetector.getSupportedFormats()).filter(f => FORMATS.includes(f));
      if (formats.includes('ean_13')) { const d = new window.BarcodeDetector({ formats }); return async () => (await d.detect(video))[0]?.rawValue; }
    } catch { /* fall back to ZXing */ }
  }
  await loadZXing();
  const Z = window.ZXing, reader = new Z.MultiFormatReader();
  reader.setHints(new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
    Z.BarcodeFormat.ITF, Z.BarcodeFormat.CODE_128]], [Z.DecodeHintType.TRY_HARDER, true]]));
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async () => {
    const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
    const scale = Math.min(1, 1024 / Math.max(w, h)); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); }
    catch { return null; } finally { reader.reset(); }
  };
}
async function openScanner() {
  scannerDialog();
  note.textContent = 'Barkodu çizginin üzerine, yatay ve yakın tut.';
  dialog.showModal();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play();
    const read = await detector();
    running = true;
    let previous = null;
    while (running && dialog.open) {
      const code = barcodeFrom(await read().catch(() => null));
      if (code && code === previous) { closeScanner(); navigator.vibrate?.(40); showProduct(code); return; }
      previous = code;
      await new Promise(r => setTimeout(r, 120));
    }
  } catch (err) {
    note.textContent = err?.name === 'NotAllowedError' ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin verebilir ya da barkodun altındaki numarayı yazabilirsin.'
      : err?.message === 'reader' ? 'Barkod okuyucu yüklenemedi. Barkodun altındaki numarayı yazabilirsin.'
      : 'Kamera açılamadı. Barkodun altındaki numarayı yazabilirsin.';
  }
}
function closeScanner() {
  running = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  if (video) video.srcObject = null;
  if (dialog?.open) dialog.close();
}

// ---------- actions ----------
document.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t || t.disabled || !mounted() || !content.contains(t)) return;
  if (t.hasAttribute('data-scan')) openScanner();
  else if (t.hasAttribute('data-dismiss')) { product = null; render(); }
  else if (t.dataset.pick) { const i = state.menu.find(m => m.item_code === t.dataset.pick); if (i) { product = { ...i, fromList: true }; notice = null; render(); content.querySelector('[data-add]')?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }
  else if (t.dataset.add) act(async () => {
    state = await api('/me/kitchen/lines', { method: 'POST', body: { item_code: t.dataset.add } });
    flash(`${product?.item_name ?? 'Ürün'} hesabına eklendi.`);
    product = null; notice = null; render();
  });
  else if (t.dataset.line) act(async () => {
    state = await api(`/me/kitchen/lines/${t.dataset.line}`, { method: 'PATCH', body: { quantity: Number(t.dataset.quantity) } }); render();
  });
  else if (t.hasAttribute('data-pay')) act(async () => {
    t.disabled = true;
    const { page_url } = await api('/me/kitchen/checkout', { method: 'POST' });
    location.assign(page_url);
  });
  else if (t.hasAttribute('data-cancel-pay')) act(async () => { state = await api('/me/kitchen/checkout/cancel', { method: 'POST' }); render(); });
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'kitchen-manual' || !mounted()) return;
  ev.preventDefault();
  const code = barcodeFrom(new FormData(ev.target).get('barcode'));
  if (!code) { flash('Barkod 8–14 rakamdan oluşur.'); return; }
  showProduct(code);
});

/** Back from the card page before PayTR's confirmation landed: look again for a little while. */
async function awaitConfirmation() {
  const round = ++confirming;
  for (let i = 0; i < 10 && round === confirming && mounted(); i++) {
    await new Promise(r => setTimeout(r, 2000));
    await load();
    if (!state?.tab?.locked) {
      notice = state?.tab?.lines.length ? { kind: 'bad', title: 'Ödeme tamamlanmadı.', text: 'Hesabın açık duruyor; tekrar deneyebilirsin.' } : { kind: 'ok', title: 'Ödendi. Afiyet olsun!', text: '' };
      render(); return;
    }
  }
}

/** Draws the kitchen into `root`. ?odeme=ok|hata|bekliyor is the card page's answer, read once. */
export async function mountKitchen(root, opts) {
  content = root; flash = opts.flash; signedOut = opts.signedOut;
  const params = new URLSearchParams(location.search);
  if (params.get('odeme') === 'ok') notice = { kind: 'ok', title: 'Ödendi. Afiyet olsun!', text: params.get('fis') ? `Fiş: ${params.get('fis')}` : '' };
  else if (params.get('odeme') === 'hata') notice = { kind: 'bad', title: 'Ödeme tamamlanmadı.', text: params.get('mesaj') || 'Hesabın açık duruyor; tekrar deneyebilirsin.' };
  else if (params.get('odeme') === 'bekliyor') notice = { kind: 'ok', title: 'Ödemen onaylanıyor…', text: 'Birkaç saniye içinde burada görünür.' };
  // The member area redraws right after loading (its session event); a payment result survives that, not a later visit.
  else if (Date.now() - noticeAt > 3000) notice = null;
  if (params.has('odeme')) noticeAt = Date.now();
  if (location.search) cleanAddress();
  if (state) render();
  await load();
  if (params.get('odeme') === 'bekliyor') awaitConfirmation();
}
