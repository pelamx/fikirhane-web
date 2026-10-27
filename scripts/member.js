import { initTheme, escapeHTML as esc } from './shared.js';
import { passCard } from './pass.js';
import { api } from './api.js';
import { mountKitchen } from './kitchen.js';
import './topnav.js';
import { ready, mode, getCatalog, getSession, saveProfile, toggleClub, toggleEvent, bookEvent, cancelBooking, addGuest, signOut, clearPreview, siteUrl } from './session.js';
initTheme();
const content = document.querySelector('#member-content');
let query = '', category = 'all', eventFilter = 'all', toastTimer, busy = false;
const navNames = { anasayfa: 'Ana sayfam', kesfet: 'Kulüpleri keşfet', kuluplerim: 'Kulüplerim', bulusmalar: 'Buluşmalar', mutfak: 'Kafeterya', profil: 'Profilim', kulup: 'Kulüp' };
const live = () => mode() === 'api';
const clubs = () => getCatalog().clubs;
const events = () => getCatalog().events;
const money = (amount, currency) => Number(amount) === 0 ? 'Ücretsiz' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount));
function route() { const [view, id] = location.hash.slice(1).split('/'); return { view: Object.hasOwn(navNames, view) ? view : 'anasayfa', id }; }
function requireSession() {
  const session = getSession();
  if (!session) { const { view, id } = route(); const params = new URLSearchParams(view === 'kulup' && clubs().some(c => c.id === id) ? { club: id } : { view }); location.replace(siteUrl('uyelik/?' + params)); return null; }
  return session;
}
function flash(message) { const toast = document.querySelector('#toast'); clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => toast.hidden = true, 3500); }
function heading(eyebrow, title, copy = '') { return `<div class="member-heading"><span class="section-label">${eyebrow}</span><h1>${title}</h1>${copy ? `<p>${copy}</p>` : ''}</div>`; }
function empty(title, text, action = 'Kulüpleri keşfet', url = '#kesfet') { return `<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h3>${title}</h3><p>${text}</p><a class="shell-secondary" href="${url}">${action} <span>↗</span></a></div>`; }
function clubCard(club, session, compact = false) {
  const followed = session.clubIds.includes(club.id);
  const [on, off] = live() ? ['✓ Kulüptesin', '+ Katıl'] : ['✓ Takiptesin', '+ Takip et'];
  return `<article class="member-club ${compact ? 'compact' : ''}"><a class="member-club-art ${esc(club.id)}" href="#kulup/${esc(club.id)}"><span>${esc(club.category.toLocaleUpperCase('tr'))}</span><strong>${esc(club.words[0])}<br><em>${esc(club.words[1])}</em></strong><span>FİKİRHANE KULÜPLERİ <span>↗</span></span></a><div class="member-club-copy"><a href="#kulup/${esc(club.id)}"><h3>${esc(club.name)}</h3></a><p>${esc(club.description)}</p><div class="club-card-actions"><a class="text-link" href="#kulup/${esc(club.id)}">Kulübü tanı ↗</a><button class="follow-button ${followed ? 'is-followed' : ''}" data-action="club" data-id="${esc(club.id)}" aria-pressed="${followed}" aria-label="${esc(club.name)}: ${followed ? (live() ? 'kulüpten ayrıl' : 'takipten çıkar') : (live() ? 'kulübe katıl' : 'takip et')}">${followed ? on : off}</button></div></div></article>`;
}
function bookingControls(event) {
  if (event.booking) {
    const b = event.booking;
    const option = event.options.find(o => o.id_event_option === b.id_event_option);
    const label = b.booking_status === 'waitlisted' ? 'Bekleme listesindesin' : 'Yerin ayrıldı';
    return `<p class="booking-state">✓ ${label}${option ? ' · ' + esc(option.option_name ?? option.location_name) : ''}</p>${['confirmed', 'checked_in'].includes(b.booking_status) ? `<button class="shell-primary option-button" data-action="pass" data-id="${esc(b.id_booking)}">QR kodum <span>▣</span></button>` : ''}${guestControls(event)}<button class="shell-secondary" data-action="cancel-booking" data-id="${esc(b.id_booking)}">Rezervasyonu iptal et</button>`;
  }
  // Booking happens in the reservation flow (session → seat → details → confirm); here we show price and room availability.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(event.start));
  const free = event.options.reduce((n, o) => n + o.available, 0);
  const prices = event.options.map(o => o.price).filter(Boolean).sort((a, b) => Number(a.finalPrice) - Number(b.finalPrice));
  const price = prices[0] ? money(prices[0].finalPrice, prices[0].currency) : '';
  return `<p class="booking-state">${price}${price ? ' · ' : ''}${free ? `${free} yer boş` : 'Dolu · bekleme listesi'}</p><a class="shell-primary option-button" href="${siteUrl(`rezervasyon/?tarih=${day}&seans=${encodeURIComponent(event.id)}&adim=koltuk`)}">Yer ayırt <span>↗</span></a>`;
}
// Plus: once a month a friend comes along for free, on the member's own booking (or with the code from the profile).
const guestRight = () => live() && (getSession()?.membership?.monthly_guest_passes ?? 0) > 0;
function guestControls(event) {
  const g = event.guest;
  if (g) return `<p class="booking-guest">+ Misafirin: ${esc([g.guest_first_name, g.guest_last_name].filter(Boolean).join(' '))}</p><button class="shell-secondary" data-action="pass" data-id="${esc(g.id_booking)}">Misafirin QR kodu <span>▣</span></button><button class="shell-secondary" data-action="cancel-guest" data-id="${esc(g.id_booking)}">Misafiri çıkar</button>`;
  if (!guestRight() || event.booking.booking_status !== 'confirmed') return '';
  return `<button class="shell-secondary" data-action="add-guest" data-id="${esc(event.booking.id_booking)}">+ Arkadaşını ekle <span>↗</span></button>`;
}
function guestDialog(bookingId) {
  const dialog = document.querySelector('#guest-dialog') ?? document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'guest-dialog', className: 'pass-dialog guest-dialog' }));
  dialog.innerHTML = `<form id="guest-form" class="profile-form" data-booking="${esc(bookingId)}"><h2>Arkadaşını ekle</h2><p>Plus planınla ayda bir arkadaşın seninle aynı seansa ücretsiz gelir. Ona ayrı bir QR kodu çıkar; masanda yer varsa yanına oturur.</p>
    <label for="guest-first">Adı</label><input id="guest-first" name="first_name" maxlength="50" required autocomplete="off">
    <label for="guest-last">Soyadı <small>İsteğe bağlı</small></label><input id="guest-last" name="last_name" maxlength="50" autocomplete="off">
    <label for="guest-contact">E-postası ya da telefonu</label><input id="guest-contact" name="contact" maxlength="200" required autocomplete="off" placeholder="ornek@eposta.com ya da 0532 000 00 00">
    <p class="guest-error" role="alert" hidden></p>
    <div class="dialog-actions"><button class="shell-secondary" type="button" data-close-guest>Vazgeç</button><button class="shell-primary" type="submit">Arkadaşımı ekle <span>↗</span></button></div></form>`;
  dialog.showModal();
  dialog.querySelector('#guest-first').focus();
}
async function submitGuest(form) {
  const contact = form.contact.value.trim();
  const guest = { first_name: form.first_name.value.trim(), last_name: form.last_name.value.trim() || null,
    ...(contact.includes('@') ? { email: contact } : { phone: contact }) };
  const error = form.querySelector('.guest-error'); const button = form.querySelector('[type=submit]');
  if (busy) return; busy = true; button.disabled = true; error.hidden = true;
  try { await addGuest(form.dataset.booking, guest); document.querySelector('#guest-dialog').close(); render(); flash('Arkadaşın eklendi. QR kodunu ona gönderebilirsin.'); }
  catch (err) { error.textContent = err?.message || 'Arkadaşın eklenemedi.'; error.hidden = false; }
  finally { busy = false; button.disabled = false; }
}
function eventCard(event, session) {
  const club = clubs().find(c => c.id === event.clubId);
  const label = club ? esc(club.category.toLocaleUpperCase('tr')) : 'FİKİRHANE';
  if (live()) {
    return `<article class="member-event"><div class="member-event-date"><strong>${esc(event.day)}</strong><span>${esc(event.month)}</span></div><div class="member-event-main"><span class="section-label">${label} / BULUŞMA</span><h3>${esc(event.name)}</h3><p>${esc(event.date)} · ${esc(event.time)} · ${esc(event.location)}</p>${club ? `<a class="text-link" href="#kulup/${esc(club.id)}">${esc(club.name)} ↗</a>` : ''}</div><div class="member-event-actions">${bookingControls(event)}</div></article>`;
  }
  const saved = session.eventIds.includes(event.id);
  return `<article class="member-event"><div class="member-event-date"><strong>${event.day}</strong><span>${event.month}</span></div><div class="member-event-main"><span class="section-label">${label} / ÖRNEK PROGRAM</span><h3>${esc(event.name)}</h3><p>${esc(event.date)} · ${event.time} · ${event.location}</p>${club ? `<a class="text-link" href="#kulup/${club.id}">${esc(club.name)} ↗</a>` : ''}</div><div class="member-event-actions"><button class="shell-secondary" data-action="event" data-id="${event.id}" aria-pressed="${saved}">${saved ? '✓ Planımdan çıkar' : '+ Planıma ekle'}</button>${event.sourceUrl ? `<a class="text-link" href="${event.sourceUrl}" target="_blank" rel="noopener">Gerçek etkinliği incele ↗</a>` : ''}</div></article>`;
}
function home(session) {
  const followed = clubs().filter(c => session.clubIds.includes(c.id));
  const planned = events().filter(e => session.eventIds.includes(e.id));
  const note = live() ? 'Fikirhane takviminden' : '21–27 Ekim 2026 · Örnek program';
  return heading('SENİN FİKİRHANE’N', `Merhaba, <em>${esc(session.profile.name)}.</em>`, 'Bir merakını takip et. Bir masaya katıl. Kendi çevreni burada kur.') + `<div class="member-stats"><a href="#kuluplerim"><strong>${followed.length.toString().padStart(2,'0')}</strong><span>${live() ? 'Üyesi olduğun kulüp' : 'Takip ettiğin kulüp'} <span>↗</span></span></a><a href="#bulusmalar"><strong>${planned.length.toString().padStart(2,'0')}</strong><span>${live() ? 'Rezervasyonun' : 'Planındaki buluşma'} <span>↗</span></span></a><a href="#kesfet"><strong>${clubs().length.toString().padStart(2,'0')}</strong><span>Keşfedilecek kulüp <span>↗</span></span></a></div><div class="member-home-grid"><section><div class="member-section-top"><h2>Kulüplerim</h2><a class="text-link" href="#kuluplerim">Tümünü gör ↗</a></div>${followed.length ? `<div class="member-club-grid home-clubs">${followed.slice(0,2).map(c => clubCard(c,session,true)).join('')}</div>` : empty('İlk kulübün seni bekliyor.', 'Ortak bir merak, tanışmak için yeter. İlgi duyduğun kulübe katılarak başla.')}</section><aside class="member-agenda"><span class="section-label">KENDİ TAKVİMİN</span><h2>Sıradaki<br><em>tanışmalar.</em></h2>${planned.length ? planned.map(e=>`<a class="agenda-item" href="#bulusmalar"><strong>${esc(e.day)} ${esc(e.month)}</strong><span>${esc(e.name)}</span><small>${esc(e.time)} ↗</small></a>`).join('') : `<p>${live() ? 'Henüz bir buluşmaya yer ayırtmadın.' : 'Henüz planına bir buluşma eklemedin.'} Sana uyan bir sohbetle başlayabilirsin.</p>`}<a class="shell-secondary" href="#bulusmalar">Programı keşfet ↗</a><span class="agenda-note">${note}</span></aside></div><section class="member-recommend"><div><span class="section-label">ORTAK NOKTAN BURADA OLABİLİR.</span><h2>Farklı bir kulübe<br><em>de göz at.</em></h2></div><p>Kulüpler arasında dolaş. Bir gün bir fikri, başka bir gün yeni bir kelimeyi paylaş.</p><a class="square-arrow" href="#kesfet" aria-label="Tüm kulüpleri keşfet">↗</a></section>`;
}
function discover() {
  return heading('KEŞFET', 'Merakının <em>peşinden.</em>', 'Birlikte üretmek, konuşmak, yazmak. Kendine yakın bir kulüp bul.') + `<div class="club-toolbar"><label class="search-field"><span>Ara</span><input type="search" id="club-search" placeholder="Kulüp veya ilgi alanı ara" value="${esc(query)}" autocomplete="off"></label><div class="category-filter" role="group" aria-label="Kulüp kategorisi"><button data-category="all" aria-pressed="${category==='all'}">Tümü</button>${clubs().map(c=>`<button data-category="${esc(c.id)}" aria-pressed="${category===c.id}">${esc(c.category)}</button>`).join('')}</div></div><p class="search-count" id="search-count" aria-live="polite"></p><div id="discovery-results"></div>`;
}
function renderResults(session) {
  const filtered = clubs().filter(c => (category === 'all' || category === c.id) && `${c.name} ${c.category} ${c.description}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  document.querySelector('#search-count').textContent = filtered.length + ' kulüp';
  document.querySelector('#discovery-results').innerHTML = filtered.length ? `<div class="member-club-grid">${filtered.map(c=>clubCard(c,session)).join('')}</div>` : `<div class="empty-state"><h3>Bu merak henüz bir kulübe dönüşmemiş.</h3><p>Başka bir kelimeyle arayabilir veya tüm kulüplere dönebilirsin.</p><button class="shell-secondary" data-action="reset-search">Aramayı temizle ↗</button></div>`;
}
function myClubs(session) {
  const followed = clubs().filter(c => session.clubIds.includes(c.id));
  const copy = live() ? 'Katıldığın kulüpler bir arada.' : 'Takip ettiğin kulüpler bir arada. Gerçek kulüp üyeliği için kulübün kayıt sayfasına devam edebilirsin.';
  return heading('KULÜPLERİM', 'Aynı merakta <em>buluştuk.</em>', copy) + (followed.length ? `<div class="member-club-grid">${followed.map(c=>clubCard(c,session)).join('')}</div>` : empty('Burada ilk kulübüne yer var.', live() ? 'Bir kulübe katıldığında burada göreceksin.' : 'Bir kulübü takip ettiğinde burada göreceksin.'));
}
function clubDetail(id, session) {
  const club = clubs().find(c => c.id === id);
  if (!club) return heading('KULÜPLER', 'Bu kulüp <em>bulunamadı.</em>') + empty('Yeni bir kulüp keşfedelim.', 'Bu bağlantı artık geçerli olmayabilir.');
  const followed = session.clubIds.includes(id);
  const clubEvents = events().filter(e => e.clubId === id);
  const panel = live()
    ? `<p>Kulübe katılarak topluluğun bir parçası ol; buluşmalarını kendi alanında takip et.</p><button class="shell-primary" data-action="club" data-id="${esc(id)}" aria-pressed="${followed}">${followed ? '✓ Kulüpten ayrıl' : '+ Kulübe katıl'}</button><small>${club.memberCount ?? 0} üye · Kulüp üyeliği ücretsizdir ve Fikirhane üyeliğinden bağımsızdır.</small>`
    : `<p>Kulübü takip ederek kişisel alanında tut. Gerçek üyelik ve katılım koşullarını kulübün sayfasından öğren.</p><button class="shell-primary" data-action="club" data-id="${id}" aria-pressed="${followed}">${followed ? '✓ Takipten çıkar' : '+ Kulüplerime ekle'}</button><a class="shell-secondary" href="${club.sourceUrl}" target="_blank" rel="noopener">Kulübün kayıt sayfası ↗</a><small>Takip işlemi bu tasarım önizlemesinde saklanır. Gerçek üyelik oluşturmaz.</small>`;
  return `<a class="text-link back-link" href="#kesfet">← Kulüplere dön</a>` + heading(esc(club.category.toLocaleUpperCase('tr')), esc(club.name), esc(club.prompt)) + `<div class="club-detail-layout"><section><div class="club-art art-${esc(club.id)}" aria-hidden="true"><span>FİKİRLER, İNSANLAR, BAĞLANTILAR.</span><div class="bubble bubble-one">${esc(club.words[0])}</div><div class="bubble bubble-two">${esc(club.words[1])}</div></div><div class="club-about"><h2>Bu masada ne var?</h2><p>${esc(club.description)}</p>${live() ? '' : `<p class="source-note">Kaynak sitedeki adı: ${esc(club.sourceName)}</p>`}</div><div class="member-section-top"><h2>Kulübün buluşmaları</h2></div>${clubEvents.length ? clubEvents.map(e=>eventCard(e,session)).join('') : `<p class="quiet-empty">${live() ? 'Bu kulübün yakında yayımlanmış bir buluşması yok.' : 'Kaynak programda bu kulüp için yayımlanmış bir buluşma bulunmuyor. Yeni programı kulübün sayfasından kontrol edebilirsin.'}</p>`}</section><aside class="club-join-panel"><span class="section-label">KENDİ ÇEVRENE EKLE.</span><h2>Bir merak.<br><em>Yeni bir bağ.</em></h2>${panel}</aside></div>`;
}
function gatherings(session) {
  const shown = eventFilter==='mine' ? events().filter(e=>session.eventIds.includes(e.id)) : events();
  const [intro, mine, label] = live()
    ? ['Sana uyan buluşmada yerini ayırt. Fiyatlar üyeliğine göre hesaplanır.', `Rezervasyonlarım (${session.eventIds.length})`, 'Fikirhane takvimi · önümüzdeki 60 gün']
    : ['İlgini çeken buluşmaları kişisel planına ekle. Gerçek katılım işlemini etkinliğin kendi sayfasında tamamla.', `Planım (${session.eventIds.length})`, '21–27 Ekim 2026 · Kaynak siteden alınan örnek program'];
  return heading('BULUŞMALAR', 'Bir sonraki <em>merhaba.</em>', intro) + `<div class="event-filter" role="group" aria-label="Buluşma görünümü"><button data-event-filter="all" aria-pressed="${eventFilter==='all'}">Tüm buluşmalar</button><button data-event-filter="mine" aria-pressed="${eventFilter==='mine'}">${mine}</button></div><p class="program-label">${label}</p>` + (shown.length ? shown.map(e=>eventCard(e,session)).join('') : empty('Takviminde boş bir sandalye var.', live() ? 'Bir buluşmada yerini ayırt; tarihi ve saati burada bir arada gör.' : 'Bir buluşmayı planına ekle; tarihi ve saati burada bir arada gör.', 'Tüm buluşmaları gör', '#bulusmalar/tumu'));
}
function profile(session) {
  const badge = live() ? esc((session.membership?.code ? session.membership.name : 'Ziyaretçi').toLocaleUpperCase('tr')) : 'ÜYE ALANI ÖNİZLEMESİ';
  const foot = live() ? 'Profilin Fikirhane hesabında saklanır.' : 'Bu profil yalnızca senin tarayıcında görünür. Başka üyelerle paylaşılmaz.';
  const settings = live()
    ? `<section class="preview-settings"><h2>Hesap</h2><p>${esc(session.profile.email ?? '')}</p><div><button class="shell-secondary" data-signout>Çıkış yap ↗</button></div></section>`
    : `<section class="preview-settings"><h2>Önizleme tercihleri</h2><p>Çıkış yaparsan seçimlerin korunur. Önizlemeyi silersen bu tarayıcıdaki profilin ve seçimlerin kaldırılır.</p><div><button class="shell-secondary" data-signout>Çıkış yap ↗</button><button class="text-danger" data-action="reset">Önizlemeyi sil</button></div></section>`;
  return heading('PROFİLİM', 'Biraz da <em>senden.</em>', 'Bir sonraki sohbet, ortak bir merakla başlayabilir.') + `<div class="profile-layout"><form id="profile-form" class="profile-form"><label for="profile-name">Adın</label><input id="profile-name" name="name" maxlength="50" required autocomplete="given-name" value="${esc(session.profile.name)}"><label for="profile-bio">Nelerle ilgileniyorsun?</label><textarea id="profile-bio" name="bio" maxlength="240" rows="4" placeholder="Kısaca kendinden ve merak ettiklerinden bahset.">${esc(session.profile.bio)}</textarea><p class="entry-footnote">${foot}</p><button class="shell-primary" type="submit">Değişiklikleri kaydet <span>↗</span></button></form><aside class="profile-summary"><div class="profile-avatar">${esc(session.profile.name[0].toLocaleUpperCase('tr'))}</div><h2>${esc(session.profile.name)}</h2><p>${session.clubIds.length} kulüp · ${session.eventIds.length} ${live() ? 'rezervasyon' : 'buluşma'}</p><span class="preview-badge">${badge}</span>${live() ? '' : '<a class="text-link" href="https://www.fikirhane.co/ng/uyelik" target="_blank" rel="noopener">Gerçek Fikirhane üyeliği ↗</a>'}</aside></div>${live() ? '<section class="preview-settings profile-tags" id="profile-tags" aria-busy="true"><h2>İlgi alanların ve becerilerin</h2><p>Yükleniyor…</p></section>' : ''}${live() && session.membership?.code ? planSummary(session.membership) : ''}${settings}`;
}

// The member's plan (Basic or Plus) and, with Plus, this month's guest pass.
function planSummary(m) {
  const rights = [m.discount_rate ? `Buluşmalarda %${Number(m.discount_rate)} indirim` : null, `${m.reservation_window_days} gün önceden rezervasyon`,
    `Aynı anda ${m.max_active_bookings} rezervasyon`, m.monthly_guest_passes ? `Ayda ${m.monthly_guest_passes} kez bir arkadaşınla ücretsiz gelme` : null].filter(Boolean);
  const until = m.end_date ? ` · ${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${m.end_date}T12:00:00+03:00`))} tarihine kadar` : '';
  return `<section class="preview-settings plan-summary"><h2>Planın: ${esc(m.name)}</h2><p>${esc(rights.join(' · '))}${esc(until)}</p>${m.monthly_guest_passes ? '<div id="guest-pass" aria-busy="true"><p>Misafir hakkın yükleniyor…</p></div>' : ''}</section>`;
}
async function loadGuestPass() {
  const box = content.querySelector('#guest-pass'); if (!box) return;
  try {
    const { pass } = await api('/me/guest-pass');
    const month = pass && new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(new Date(new Date(pass.valid_until).getTime() - 86_400_000));
    box.innerHTML = !pass ? '' : pass.remaining > 0
      ? `<h3>${esc(month)} ayı misafir hakkın: ${pass.remaining} / ${pass.usage_limit}</h3><p>Bir rezervasyonunda “Arkadaşını ekle”yi seç ya da bu kodu arkadaşına ver; rezervasyon yaparken “Freepass ya da misafir kodun var mı?” alanına yazsın. İkisi aynı haktan düşer.</p><p class="guest-code"><code>${esc(pass.code)}</code><button class="shell-secondary" data-action="copy-guest-code" data-id="${esc(pass.code)}">Kodu kopyala</button></p>`
      : `<h3>${esc(month)} ayı misafir hakkını kullandın.</h3><p>Yeni hakkın ay başında açılır. Arkadaşının rezervasyonunu zamanında iptal edersen hak geri gelir.</p>`;
  } catch { box.innerHTML = '<p>Misafir hakkın şu anda yüklenemedi.</p>'; }
  box.removeAttribute('aria-busy');
}

// Interests and skills are the member's own: chosen here from Fikirhane's lists, shown to others only per profile settings.
const TAG_LIMITS = { interest: 10, skill: 12 };
let savedSkills = [];
async function loadTags() {
  const box = content.querySelector('#profile-tags'); if (!box) return;
  try {
    const [interests, skills, mine, mySkills] = await Promise.all([api('/interests'), api('/skills'), api('/me/interests'), api('/me/skills')]);
    savedSkills = mySkills.items;
    const chosen = { interest: new Set(mine.items.map(i => i.code)), skill: new Set(mySkills.items.map(i => i.code)) };
    const group = (kind, title, hint, list) => `<fieldset class="interest-options" data-kind="${kind}"><legend>${title} <span>${hint} En fazla ${TAG_LIMITS[kind]} tane.</span></legend>${list.map(i => `<label><input type="checkbox" name="${kind}" value="${esc(i.code)}"${chosen[kind].has(i.code) ? ' checked' : ''}><span>${esc(i.name)}</span></label>`).join('')}</fieldset>`;
    box.innerHTML = `<h2>İlgi alanların ve becerilerin</h2><p>Ortak meraklarla tanışmak ve kulüp önerileri için. İstediğin zaman değiştirebilirsin.</p><form id="tags-form">`
      + group('interest', 'Neler ilgini çekiyor?', 'Konuşmaktan ve öğrenmekten keyif aldıkların.', interests.items)
      + group('skill', 'Nelerde iyisin?', 'Başkalarıyla paylaşabileceğin beceriler.', skills.items)
      + '<button class="shell-primary" type="submit">Seçimleri kaydet <span>↗</span></button></form>';
  } catch { box.innerHTML = '<h2>İlgi alanların ve becerilerin</h2><p>Şu anda yüklenemedi. Biraz sonra tekrar dener misin?</p>'; }
  box.removeAttribute('aria-busy');
}
async function saveTags(form) {
  const codes = kind => [...form.querySelectorAll(`input[name=${kind}]:checked`)].map(i => i.value);
  const level = Object.fromEntries(savedSkills.map(s => [s.code, s.level ?? null]));
  await api('/me/interests', { method: 'PUT', body: { items: codes('interest').map((code, i) => ({ code, priority: i + 1 })) } });
  await api('/me/skills', { method: 'PUT', body: { items: codes('skill').map((code, i) => ({ code, level: level[code] ?? null, priority: i + 1 })) } });
  savedSkills = codes('skill').map(code => ({ code, level: level[code] ?? null }));
}
function render() {
  const session = requireSession(); if (!session) return;
  document.querySelector('#member-loading').hidden = true;
  document.querySelector('#member-shell').hidden = false;
  document.querySelector('#member-preview-note').hidden = live();
  document.querySelector('#member-footnote').hidden = live();
  const { view, id } = route();
  document.title = `${navNames[view]} · Fikirhane`;
  document.querySelector('#header-name').textContent = session.profile.name;
  document.querySelector('#header-initial').textContent = session.profile.name[0].toLocaleUpperCase('tr');
  window.dispatchEvent(new CustomEvent('fikirhane-nav', { detail: { href: `member/#${view === 'kulup' ? 'kesfet' : view}` } }));
  if (view==='bulusmalar' && id==='tumu') eventFilter='all';
  content.innerHTML = view==='anasayfa' ? home(session) : view==='kesfet' ? discover() : view==='kuluplerim' ? myClubs(session) : view==='kulup' ? clubDetail(id,session) : view==='bulusmalar' ? gatherings(session) : view==='mutfak' ? kitchen() : profile(session);
  if (view==='kesfet') renderResults(session);
  if (view==='profil' && live()) { loadTags(); loadGuestPass(); }
  if (view==='anasayfa' && live()) loadKitchen();
  if (view==='mutfak' && live()) mountKitchen(content.querySelector('#kitchen-root'), { flash, signedOut: requireSession });
}
function kitchen() {
  return heading('KAFETERYA', 'Seç, ekle, <em>çıkarken öde.</em>', 'Kafeteryadan aldığın ürünü menüden seç ya da barkodunu okut; hepsi hesabında toplanır, çıkarken tek seferde ödersin.')
    + (live() ? '<div class="kitchen-root" id="kitchen-root"><p class="entry-loading">Menü yükleniyor…</p></div>'
      : '<div class="booking-empty"><p>Kafeterya yalnızca sunucuya bağlıyken çalışır; bu önizlemede yok.</p></div>');
}
/** With an unpaid tab, the home page points to it. */
async function loadKitchen() {
  const k = await api('/me/kitchen').catch(() => null);
  if (!k?.tab?.lines.length || route().view !== 'anasayfa' || content.querySelector('.member-kitchen')) return;
  const total = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: k.tab.currency_code, maximumFractionDigits: 2 }).format(Number(k.tab.grand_total));
  content.querySelector('.member-heading')?.insertAdjacentHTML('afterend', `<a class="member-kitchen" href="#mutfak"><span class="copper-dot"></span><span><strong>Kafeterya hesabın: ${esc(total)}</strong>Çıkarken tek seferde öde.</span><span aria-hidden="true">↗</span></a>`);
}
async function exit() { try { await signOut(); location.assign(siteUrl('')); } catch { flash('Çıkış kaydedilemedi. Tarayıcı depolama iznini kontrol et.'); } }
async function run(task, success) {
  if (busy) return; busy = true;
  try { await task(); render(); if (success) flash(success); }
  catch (err) { if (err?.status === 401) { requireSession(); return; } flash(err?.message || 'Değişiklik kaydedilemedi.'); }
  finally { busy = false; }
}
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.hasAttribute('data-signout')) { exit(); return; }
  if (target.hasAttribute('data-close-pass')) { document.querySelector('#pass-dialog')?.close(); return; }
  if (target.hasAttribute('data-close-guest')) { document.querySelector('#guest-dialog')?.close(); return; }
  if (target.dataset.category) { category=target.dataset.category; render(); return; }
  if (target.dataset.eventFilter) { eventFilter=target.dataset.eventFilter; if(location.hash==='#bulusmalar/tumu')history.replaceState(null,'','#bulusmalar'); render(); return; }
  const { action, id, option } = target.dataset;
  const refocus = () => [...content.querySelectorAll('[data-action]')].find(b=>b.dataset.action===action&&b.dataset.id===id)?.focus({preventScroll:true});
  if (action==='club') { const had = getSession()?.clubIds.includes(id); run(async () => { await toggleClub(id); }, live() ? (had ? 'Kulüpten ayrıldın.' : 'Kulübe katıldın.') : (had ? 'Kulüp takipten çıkarıldı.' : 'Kulüp, kulüplerine eklendi.')).then(refocus); }
  if (action==='event') { const had = getSession()?.eventIds.includes(id); run(async () => { await toggleEvent(id); }, had ? 'Buluşma planından çıkarıldı.' : 'Buluşma planına eklendi. Gerçek katılım için etkinlik sayfasına devam et.').then(refocus); }
  if (action==='book') run(async () => { const s = await bookEvent(id, option); const b = s?.bookings[id]; if (b?.booking_status === 'waitlisted') flash('Bekleme listesine eklendin.'); }, 'Yerin ayrıldı. Görüşmek üzere!');
  if (action==='pass') {
    const dialog = document.querySelector('#pass-dialog') ?? document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'pass-dialog', className: 'pass-dialog' }));
    dialog.innerHTML = '<p class="entry-loading">QR hazırlanıyor…</p>';
    dialog.showModal();
    passCard(id).then(html => { dialog.innerHTML = html + '<div class="dialog-actions"><button class="shell-secondary" data-close-pass>Kapat</button></div>'; })
      .catch(err => { dialog.innerHTML = `<p>${esc(err?.message ?? 'QR gösterilemedi.')}</p><div class="dialog-actions"><button class="shell-secondary" data-close-pass>Kapat</button></div>`; });
    return;
  }
  if (action==='cancel-booking') run(async () => { await cancelBooking(id); }, 'Rezervasyonun iptal edildi.');
  if (action==='add-guest') guestDialog(id);
  if (action==='cancel-guest') run(async () => { await cancelBooking(id); }, 'Misafirin çıkarıldı.');
  if (action==='copy-guest-code') navigator.clipboard?.writeText(id).then(() => flash('Kod kopyalandı.'), () => flash(id));
  if (action==='reset-search') {query='';category='all';render();document.querySelector('#club-search').focus();}
  if (action==='reset') document.querySelector('#reset-dialog').showModal();
});
content.addEventListener('change', event => {
  const box = event.target.closest('#tags-form fieldset'); if (!box || !event.target.checked) return;
  const kind = box.dataset.kind;
  if (box.querySelectorAll('input:checked').length > TAG_LIMITS[kind]) { event.target.checked = false; flash(`En fazla ${TAG_LIMITS[kind]} ${kind === 'skill' ? 'beceri' : 'ilgi alanı'} seçebilirsin.`); }
});
content.addEventListener('input', event => { if(event.target.id==='club-search'){query=event.target.value;renderResults(getSession());} if(event.target.id==='profile-name')event.target.setCustomValidity(''); });
content.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id==='tags-form') {
    if (busy) return; busy = true; const button = event.target.querySelector('[type=submit]'); button.disabled = true;
    saveTags(event.target).then(() => flash('Seçimlerin kaydedildi.'), err => flash(err?.message || 'Seçimler kaydedilemedi.'))
      .finally(() => { busy = false; button.disabled = false; });
    return;
  }
  if (event.target.id!=='profile-form') return;
  const name=document.querySelector('#profile-name').value.trim();
  if(!name){document.querySelector('#profile-name').setCustomValidity('Adını yazabilir misin?');document.querySelector('#profile-name').reportValidity();return;}
  run(() => saveProfile(name, document.querySelector('#profile-bio').value.trim()), 'Profilin kaydedildi.');
});
document.addEventListener('submit', event => { if (event.target.id === 'guest-form') { event.preventDefault(); submitGuest(event.target); } });
window.addEventListener('hashchange',()=>{render();document.querySelector('#member-main').focus({preventScroll:true});window.scrollTo({top:0});});
window.addEventListener('fikirhane-session',()=>{if(!mode())return;if(!getSession())requireSession();else if(!busy && !document.activeElement?.closest('form'))render();});
document.querySelector('#cancel-reset').addEventListener('click',()=>document.querySelector('#reset-dialog').close());
document.querySelector('#confirm-reset').addEventListener('click',()=>{try{clearPreview();location.assign(siteUrl(''));}catch{flash('Önizleme silinemedi. Tarayıcı depolama iznini kontrol et.');}});
ready().then(render).catch(() => { document.querySelector('#member-loading p').textContent = 'Üye alanı şu anda yüklenemedi. Biraz sonra tekrar dener misin?'; });
