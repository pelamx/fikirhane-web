// Kitchen (mutfak): scan a product's QR label onto your tab, pay it once when you leave.
// The tab, prices and payment live on the server (/api/me/kitchen); this page only shows them.
import { initTheme, escapeHTML as esc } from './shared.js';
import { api, apiAvailable } from './api.js';
import { siteUrl } from './session.js';

initTheme();
const content = document.querySelector('#kitchen-content');
const dialog = document.querySelector('#kitchen-scanner'), video = document.querySelector('#scanner-video'), note = document.querySelector('#scanner-note');
const params = new URLSearchParams(location.search);
let state = null, product = null, notice = null, busy = false, toastTimer;

const tl = (amount, currency) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2 }).format(Number(amount ?? 0));
const timeOnly = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });
function flash(message) { const t = document.querySelector('#toast'); clearTimeout(toastTimer); t.textContent = message; t.hidden = false; toastTimer = setTimeout(() => t.hidden = true, 4000); }
const loginUrl = (create = false) => siteUrl(`uyelik/?${create ? '' : 'giris&'}next=${encodeURIComponent('mutfak/' + (product ? `?urun=${product.item_code}` : ''))}`);

/** A label's QR carries …/mutfak/?urun=CODE; a bare code is accepted too. */
function codeFrom(text) {
  try { const code = new URL(text).searchParams.get('urun'); if (code) return code.toUpperCase(); } catch { /* not an address */ }
  return /^[A-Z0-9_]{2,60}$/.test(text?.trim() ?? '') ? text.trim() : null;
}

function noticeHtml() {
  if (!notice) return '';
  return `<div class="kitchen-notice kitchen-notice-${notice.kind}" role="status"><strong>${esc(notice.title)}</strong>${notice.text ? `<p>${esc(notice.text)}</p>` : ''}</div>`;
}

function productHtml() {
  if (!product) return '';
  const blocked = !state.eligible || state.tab?.earlier || state.tab?.locked;
  return `<section class="kitchen-product" aria-label="Okutulan ürün"><div><small>Okuttuğun ürün</small><strong>${esc(product.item_name)}</strong><span>${esc(tl(product.price, product.currency_code))} · KDV dahil</span></div>
    <div class="kitchen-product-actions"><button class="shell-secondary" data-dismiss>Vazgeç</button><button class="shell-primary" data-add="${esc(product.item_code)}" ${blocked ? 'disabled' : ''}>Hesabıma ekle <span>+</span></button></div></section>`;
}

function tabHtml(tab) {
  if (!tab || !tab.lines.length) {
    return `<section class="kitchen-tab kitchen-tab-empty"><h2>Hesabın</h2><p>Henüz bir şey eklemedin. Aldığın ürünün QR kodunu okut; çıkarken hepsini tek seferde ödersin.</p></section>`;
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

function render() {
  if (!state) return;
  const tab = state.tab;
  const canScan = state.eligible && !tab?.earlier && !tab?.locked;
  const closed = !state.eligible && !tab
    ? `<div class="booking-empty"><p>Mutfak, bugün Fikirhane’de rezervasyonu olanlara açık.</p><p><a class="text-link" href="${siteUrl('rezervasyon/')}">Seans ayırt ↗</a></p></div>` : '';
  content.innerHTML = noticeHtml() + productHtml() + closed
    + (canScan ? `<button class="shell-primary kitchen-scan" data-scan>QR okut <span aria-hidden="true">⌗</span></button>` : '')
    + (state.eligible || tab ? tabHtml(tab) : '');
}

async function load() {
  try { state = await api('/me/kitchen'); render(); }
  catch (err) {
    if (err?.status === 401) { showLogin(); return; }
    content.innerHTML = `<div class="booking-empty"><p>${esc(err?.message ?? 'Mutfak hesabın şu an açılamadı.')}</p></div>`;
  }
}

function showLogin() {
  content.innerHTML = noticeHtml() + `<div class="booking-empty"><p>Mutfaktan aldıklarını hesabına eklemek için giriş yap.</p>
    <div class="booking-login"><a class="shell-primary" href="${loginUrl()}">Giriş yap <span>↗</span></a><a class="shell-secondary" href="${loginUrl(true)}">Hesap oluştur</a></div></div>`;
}

async function showProduct(code) {
  try { product = await api(`/me/kitchen/items/${encodeURIComponent(code)}`); notice = null; }
  catch (err) {
    if (err?.status === 401) { product = { item_code: code }; showLogin(); return; }
    product = null; notice = { kind: 'bad', title: 'Bu QR bir mutfak ürününe ait değil.', text: 'Ürünün kendi etiketini okut ya da görevliye sor.' };
  }
  render();
  content.querySelector('[data-add]')?.focus();
}

async function act(fn) {
  if (busy) return; busy = true;
  try { await fn(); } catch (err) { if (err?.status === 401) { showLogin(); return; } flash(err?.message ?? 'Bir şeyler ters gitti.'); await load(); }
  finally { busy = false; }
}

// ---------- scanner ----------
// BarcodeDetector where the browser has it (Android Chrome); elsewhere (iOS Safari) jsQR reads the camera frames.
let stream = null, running = false, lastCode = null, lastAt = 0;
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSQR; s.integrity = 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx'; s.crossOrigin = 'anonymous';
    s.onload = resolve; s.onerror = () => reject(new Error('QR okuyucu yüklenemedi.'));
    document.head.append(s);
  });
}
async function detector() {
  if ('BarcodeDetector' in window) {
    try { if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) { const d = new window.BarcodeDetector({ formats: ['qr_code'] }); return async () => (await d.detect(video))[0]?.rawValue; } }
    catch { /* fall back to jsQR */ }
  }
  await loadJsQR();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async () => {
    const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
    const scale = Math.min(1, 640 / Math.max(w, h)); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data;
  };
}
async function openScanner() {
  note.textContent = 'Ürünün üzerindeki QR kodu çerçeveye getir.';
  dialog.showModal();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream; await video.play();
    const read = await detector();
    running = true;
    while (running && dialog.open) {
      const text = await read().catch(() => null);
      const code = text && codeFrom(text);
      // The same label held in front of the camera is read once (a repeat within 3 s is ignored).
      if (code && (code !== lastCode || Date.now() - lastAt > 3000)) { lastCode = code; lastAt = Date.now(); closeScanner(); navigator.vibrate?.(40); showProduct(code); return; }
      await new Promise(r => setTimeout(r, 180));
    }
  } catch (err) {
    note.textContent = err?.name === 'NotAllowedError' ? 'Kamera izni verilmedi. İzin verebilir ya da telefonunun kamerasıyla QR kodu okutabilirsin.'
      : err?.message === 'QR okuyucu yüklenemedi.' ? 'QR okuyucu yüklenemedi. Telefonunun kamerasıyla QR kodu okutabilirsin.'
      : 'Kamera açılamadı. Telefonunun kamerasıyla QR kodu okutabilirsin.';
  }
}
function closeScanner() {
  running = false;
  stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null;
  if (dialog.open) dialog.close();
}
dialog.addEventListener('close', closeScanner);
document.querySelector('#scanner-close').addEventListener('click', closeScanner);

// ---------- actions ----------
content.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t || t.disabled) return;
  if (t.hasAttribute('data-scan')) openScanner();
  else if (t.hasAttribute('data-dismiss')) { product = null; history.replaceState(null, '', location.pathname); render(); }
  else if (t.dataset.add) act(async () => {
    state = await api('/me/kitchen/lines', { method: 'POST', body: { item_code: t.dataset.add } });
    flash(`${product?.item_name ?? 'Ürün'} hesabına eklendi.`);
    product = null; notice = null; history.replaceState(null, '', location.pathname); render();
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

(async () => {
  // Back from the card page: say how it went, then keep the address clean.
  if (params.get('odeme') === 'ok') notice = { kind: 'ok', title: 'Ödendi. Afiyet olsun!', text: params.get('fis') ? `Fiş: ${params.get('fis')}` : '' };
  else if (params.get('odeme') === 'hata') notice = { kind: 'bad', title: 'Ödeme tamamlanmadı.', text: params.get('mesaj') || 'Hesabın açık duruyor; tekrar deneyebilirsin.' };
  if (params.has('odeme')) history.replaceState(null, '', location.pathname);

  if (!await apiAvailable()) { content.innerHTML = '<div class="booking-empty"><p>Mutfak hesabı şu anda yalnızca sunucuya bağlıyken çalışır.</p></div>'; return; }
  let me = null;
  try { me = await api('/me'); } catch { me = null; }
  if (me) {
    document.querySelector('#kitchen-profile').hidden = false;
    document.querySelector('#header-name').textContent = me.user.first_name;
    document.querySelector('#header-initial').textContent = me.user.first_name[0].toLocaleUpperCase('tr');
  } else {
    const code = params.get('urun') && codeFrom(params.get('urun'));
    if (code) product = { item_code: code };
    document.querySelector('#kitchen-login').hidden = false;
    document.querySelector('#kitchen-login').href = loginUrl();
    showLogin();
    return;
  }
  await load();
  const code = params.get('urun') && codeFrom(params.get('urun'));
  if (code && state) await showProduct(code);
})();
