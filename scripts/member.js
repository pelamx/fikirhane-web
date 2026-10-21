import { clubs, events } from './catalog.js';
import { initTheme, escapeHTML as esc } from './shared.js';
import { getSession, saveProfile, toggleClub, toggleEvent, signOut, clearPreview, siteUrl } from './session.js';
initTheme();
const content = document.querySelector('#member-content');
const menu = document.querySelector('.member-menu');
const sidebar = document.querySelector('.member-sidebar');
let query = '', category = 'all', eventFilter = 'all', toastTimer;
const navNames = { anasayfa: 'Ana sayfam', kesfet: 'Kulüpleri keşfet', kuluplerim: 'Kulüplerim', bulusmalar: 'Buluşmalar', profil: 'Profilim', kulup: 'Kulüp' };
function route() { const [view, id] = location.hash.slice(1).split('/'); return { view: Object.hasOwn(navNames, view) ? view : 'anasayfa', id }; }
function requireSession() {
  const session = getSession();
  if (!session) { const { view, id } = route(); const params = new URLSearchParams(view === 'kulup' && clubs.some(c => c.id === id) ? { club: id } : { view }); location.replace(siteUrl('uyelik/?' + params)); return null; }
  return session;
}
function flash(message) { const toast = document.querySelector('#toast'); clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => toast.hidden = true, 3500); }
function heading(eyebrow, title, copy = '') { return `<div class="member-heading"><span class="section-label">${eyebrow}</span><h1>${title}</h1>${copy ? `<p>${copy}</p>` : ''}</div>`; }
function empty(title, text, action = 'Kulüpleri keşfet', url = '#kesfet') { return `<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h3>${title}</h3><p>${text}</p><a class="shell-secondary" href="${url}">${action} <span>↗</span></a></div>`; }
function clubCard(club, session, compact = false) {
  const followed = session.clubIds.includes(club.id);
  return `<article class="member-club ${compact ? 'compact' : ''}"><a class="member-club-art ${club.id}" href="#kulup/${club.id}"><span>${esc(club.category.toLocaleUpperCase('tr'))}</span><strong>${esc(club.words[0])}<br><em>${esc(club.words[1])}</em></strong><span>FİKİRHANE KULÜPLERİ <span>↗</span></span></a><div class="member-club-copy"><a href="#kulup/${club.id}"><h3>${esc(club.name)}</h3></a><p>${esc(club.description)}</p><div class="club-card-actions"><a class="text-link" href="#kulup/${club.id}">Kulübü tanı ↗</a><button class="follow-button ${followed ? 'is-followed' : ''}" data-action="club" data-id="${club.id}" aria-pressed="${followed}" aria-label="${esc(club.name)}: ${followed ? 'takipten çıkar' : 'takip et'}">${followed ? '✓ Takiptesin' : '+ Takip et'}</button></div></div></article>`;
}
function eventCard(event, session) {
  const saved = session.eventIds.includes(event.id);
  const club = clubs.find(c => c.id === event.clubId);
  return `<article class="member-event"><div class="member-event-date"><strong>${event.day}</strong><span>${event.month}</span></div><div class="member-event-main"><span class="section-label">${esc(club.category.toLocaleUpperCase('tr'))} / ÖRNEK PROGRAM</span><h3>${esc(event.name)}</h3><p>${esc(event.date)} · ${event.time} · ${event.location}</p><a class="text-link" href="#kulup/${club.id}">${esc(club.name)} ↗</a></div><div class="member-event-actions"><button class="shell-secondary" data-action="event" data-id="${event.id}" aria-pressed="${saved}">${saved ? '✓ Planımdan çıkar' : '+ Planıma ekle'}</button><a class="text-link" href="${event.sourceUrl}" target="_blank" rel="noopener">Gerçek etkinliği incele ↗</a></div></article>`;
}
function home(session) {
  const followed = clubs.filter(c => session.clubIds.includes(c.id));
  const planned = events.filter(e => session.eventIds.includes(e.id));
  return heading('SENİN FİKİRHANE’N', `Merhaba, <em>${esc(session.profile.name)}.</em>`, 'Bir merakını takip et. Bir masaya katıl. Kendi çevreni burada kur.') + `<div class="member-stats"><a href="#kuluplerim"><strong>${followed.length.toString().padStart(2,'0')}</strong><span>Takip ettiğin kulüp <span>↗</span></span></a><a href="#bulusmalar"><strong>${planned.length.toString().padStart(2,'0')}</strong><span>Planındaki buluşma <span>↗</span></span></a><a href="#kesfet"><strong>${clubs.length.toString().padStart(2,'0')}</strong><span>Keşfedilecek kulüp <span>↗</span></span></a></div><div class="member-home-grid"><section><div class="member-section-top"><h2>Kulüplerim</h2><a class="text-link" href="#kuluplerim">Tümünü gör ↗</a></div>${followed.length ? `<div class="member-club-grid home-clubs">${followed.slice(0,2).map(c => clubCard(c,session,true)).join('')}</div>` : empty('İlk kulübün seni bekliyor.', 'Ortak bir merak, tanışmak için yeter. İlgi duyduğun kulübü takip ederek başla.')}</section><aside class="member-agenda"><span class="section-label">KENDİ TAKVİMİN</span><h2>Sıradaki<br><em>tanışmalar.</em></h2>${planned.length ? planned.map(e=>`<a class="agenda-item" href="#bulusmalar"><strong>${e.day} ${e.month}</strong><span>${esc(e.name)}</span><small>${e.time} ↗</small></a>`).join('') : '<p>Henüz planına bir buluşma eklemedin. Sana uyan bir sohbetle başlayabilirsin.</p>'}<a class="shell-secondary" href="#bulusmalar">Programı keşfet ↗</a><span class="agenda-note">21–27 Ekim 2026 · Örnek program</span></aside></div><section class="member-recommend"><div><span class="section-label">ORTAK NOKTAN BURADA OLABİLİR.</span><h2>Farklı bir kulübe<br><em>de göz at.</em></h2></div><p>Kulüpler arasında dolaş. Bir gün bir fikri, başka bir gün yeni bir kelimeyi paylaş.</p><a class="square-arrow" href="#kesfet" aria-label="Tüm kulüpleri keşfet">↗</a></section>`;
}
function discover(session) {
  return heading('KEŞFET', 'Merakının <em>peşinden.</em>', 'Birlikte üretmek, konuşmak, yazmak. Kendine yakın bir kulüp bul.') + `<div class="club-toolbar"><label class="search-field"><span>Ara</span><input type="search" id="club-search" placeholder="Kulüp veya ilgi alanı ara" value="${esc(query)}" autocomplete="off"></label><div class="category-filter" role="group" aria-label="Kulüp kategorisi"><button data-category="all" aria-pressed="${category==='all'}">Tümü</button>${clubs.map(c=>`<button data-category="${c.id}" aria-pressed="${category===c.id}">${esc(c.category)}</button>`).join('')}</div></div><p class="search-count" id="search-count" aria-live="polite"></p><div id="discovery-results"></div>`;
}
function renderResults(session) {
  const filtered = clubs.filter(c => (category === 'all' || category === c.id) && `${c.name} ${c.category} ${c.description}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  document.querySelector('#search-count').textContent = filtered.length + ' kulüp';
  document.querySelector('#discovery-results').innerHTML = filtered.length ? `<div class="member-club-grid">${filtered.map(c=>clubCard(c,session)).join('')}</div>` : `<div class="empty-state"><h3>Bu merak henüz bir kulübe dönüşmemiş.</h3><p>Başka bir kelimeyle arayabilir veya tüm kulüplere dönebilirsin.</p><button class="shell-secondary" data-action="reset-search">Aramayı temizle ↗</button></div>`;
}
function myClubs(session) {
  const followed = clubs.filter(c => session.clubIds.includes(c.id));
  return heading('KULÜPLERİM', 'Aynı merakta <em>buluştuk.</em>', 'Takip ettiğin kulüpler bir arada. Gerçek kulüp üyeliği için kulübün kayıt sayfasına devam edebilirsin.') + (followed.length ? `<div class="member-club-grid">${followed.map(c=>clubCard(c,session)).join('')}</div>` : empty('Burada ilk kulübüne yer var.', 'Bir kulübü takip ettiğinde burada göreceksin.'));
}
function clubDetail(id, session) {
  const club = clubs.find(c => c.id === id);
  if (!club) return heading('KULÜPLER', 'Bu kulüp <em>bulunamadı.</em>') + empty('Yeni bir kulüp keşfedelim.', 'Bu bağlantı artık geçerli olmayabilir.');
  const followed = session.clubIds.includes(id);
  return `<a class="text-link back-link" href="#kesfet">← Kulüplere dön</a>` + heading(esc(club.category.toLocaleUpperCase('tr')), esc(club.name), esc(club.prompt)) + `<div class="club-detail-layout"><section><div class="club-art art-${club.id}" aria-hidden="true"><span>FİKİRLER, İNSANLAR, BAĞLANTILAR.</span><div class="bubble bubble-one">${esc(club.words[0])}</div><div class="bubble bubble-two">${esc(club.words[1])}</div></div><div class="club-about"><h2>Bu masada ne var?</h2><p>${esc(club.description)}</p><p class="source-note">Kaynak sitedeki adı: ${esc(club.sourceName)}</p></div><div class="member-section-top"><h2>Kulübün buluşmaları</h2></div>${events.some(e=>e.clubId===id) ? events.filter(e=>e.clubId===id).map(e=>eventCard(e,session)).join('') : '<p class="quiet-empty">Kaynak programda bu kulüp için yayımlanmış bir buluşma bulunmuyor. Yeni programı kulübün sayfasından kontrol edebilirsin.</p>'}</section><aside class="club-join-panel"><span class="section-label">KENDİ ÇEVRENE EKLE.</span><h2>Bir merak.<br><em>Yeni bir bağ.</em></h2><p>Kulübü takip ederek kişisel alanında tut. Gerçek üyelik ve katılım koşullarını kulübün sayfasından öğren.</p><button class="shell-primary" data-action="club" data-id="${id}" aria-pressed="${followed}">${followed ? '✓ Takipten çıkar' : '+ Kulüplerime ekle'}</button><a class="shell-secondary" href="${club.sourceUrl}" target="_blank" rel="noopener">Kulübün kayıt sayfası ↗</a><small>Takip işlemi bu tasarım önizlemesinde saklanır. Gerçek üyelik oluşturmaz.</small></aside></div>`;
}
function gatherings(session) {
  const shown = eventFilter==='mine' ? events.filter(e=>session.eventIds.includes(e.id)) : events;
  return heading('BULUŞMALAR', 'Bir sonraki <em>merhaba.</em>', 'İlgini çeken buluşmaları kişisel planına ekle. Gerçek katılım işlemini etkinliğin kendi sayfasında tamamla.') + `<div class="event-filter" role="group" aria-label="Buluşma görünümü"><button data-event-filter="all" aria-pressed="${eventFilter==='all'}">Tüm buluşmalar</button><button data-event-filter="mine" aria-pressed="${eventFilter==='mine'}">Planım (${session.eventIds.length})</button></div><p class="program-label">21–27 Ekim 2026 · Kaynak siteden alınan örnek program</p>` + (shown.length ? shown.map(e=>eventCard(e,session)).join('') : empty('Takviminde boş bir sandalye var.', 'Bir buluşmayı planına ekle; tarihi ve saati burada bir arada gör.', 'Tüm buluşmaları gör', '#bulusmalar/tumu'));
}
function profile(session) {
  return heading('PROFİLİM', 'Biraz da <em>senden.</em>', 'Bir sonraki sohbet, ortak bir merakla başlayabilir.') + `<div class="profile-layout"><form id="profile-form" class="profile-form"><label for="profile-name">Adın</label><input id="profile-name" name="name" maxlength="50" required autocomplete="given-name" value="${esc(session.profile.name)}"><label for="profile-bio">Nelerle ilgileniyorsun?</label><textarea id="profile-bio" name="bio" maxlength="240" rows="4" placeholder="Kısaca kendinden ve merak ettiklerinden bahset.">${esc(session.profile.bio)}</textarea><p class="entry-footnote">Bu profil yalnızca senin tarayıcında görünür. Başka üyelerle paylaşılmaz.</p><button class="shell-primary" type="submit">Değişiklikleri kaydet <span>↗</span></button></form><aside class="profile-summary"><div class="profile-avatar">${esc(session.profile.name[0].toLocaleUpperCase('tr'))}</div><h2>${esc(session.profile.name)}</h2><p>${session.clubIds.length} kulüp · ${session.eventIds.length} buluşma</p><span class="preview-badge">ÜYE ALANI ÖNİZLEMESİ</span><a class="text-link" href="https://www.fikirhane.co/ng/uyelik" target="_blank" rel="noopener">Gerçek Fikirhane üyeliği ↗</a></aside></div><section class="preview-settings"><h2>Önizleme tercihleri</h2><p>Çıkış yaparsan seçimlerin korunur. Önizlemeyi silersen bu tarayıcıdaki profilin ve seçimlerin kaldırılır.</p><div><button class="shell-secondary" data-signout>Çıkış yap ↗</button><button class="text-danger" data-action="reset">Önizlemeyi sil</button></div></section>`;
}
function render() {
  const session = requireSession(); if (!session) return;
  document.querySelector('#member-loading').hidden = true;
  document.querySelector('#member-shell').hidden = false;
  const { view, id } = route();
  document.title = `${navNames[view]} · Fikirhane`;
  document.querySelector('#header-name').textContent = session.profile.name;
  document.querySelector('#header-initial').textContent = session.profile.name[0].toLocaleUpperCase('tr');
  document.querySelector('#sidebar-club-count').textContent = session.clubIds.length;
  document.querySelectorAll('[data-view]').forEach(link=> { const current = link.dataset.view === (view==='kulup' ? 'kesfet' : view); if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current'); });
  if (view==='bulusmalar' && id==='tumu') eventFilter='all';
  content.innerHTML = view==='anasayfa' ? home(session) : view==='kesfet' ? discover(session) : view==='kuluplerim' ? myClubs(session) : view==='kulup' ? clubDetail(id,session) : view==='bulusmalar' ? gatherings(session) : profile(session);
  if (view==='kesfet') renderResults(session);
}
function exit() { try { signOut(); location.assign(siteUrl('')); } catch { flash('Çıkış kaydedilemedi. Tarayıcı depolama iznini kontrol et.'); } }
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.hasAttribute('data-signout')) { exit(); return; }
  if (target.dataset.category) { category=target.dataset.category; render(); return; }
  if (target.dataset.eventFilter) { eventFilter=target.dataset.eventFilter; if(location.hash==='#bulusmalar/tumu')history.replaceState(null,'','#bulusmalar'); render(); return; }
  const { action, id } = target.dataset;
  try {
    if(action==='club' || action==='event') { const current = getSession(); if (!current) { requireSession();return; } const had = (action==='club'?current.clubIds:current.eventIds).includes(id); if(action==='club')toggleClub(id);else toggleEvent(id); render(); const replacement=[...content.querySelectorAll('[data-action]')].find(b=>b.dataset.action===action&&b.dataset.id===id); replacement?.focus({preventScroll:true}); flash(action==='club'?(had?'Kulüp takipten çıkarıldı.':'Kulüp, kulüplerine eklendi.'):(had?'Buluşma planından çıkarıldı.':'Buluşma planına eklendi. Gerçek katılım için etkinlik sayfasına devam et.')); }
    if(action==='reset-search') {query='';category='all';render();document.querySelector('#club-search').focus();}
    if(action==='reset') document.querySelector('#reset-dialog').showModal();
  } catch { flash('Değişiklik kaydedilemedi. Tarayıcı depolama iznini kontrol et.'); }
});
content.addEventListener('input', event => { if(event.target.id==='club-search'){query=event.target.value;renderResults(getSession());} if(event.target.id==='profile-name')event.target.setCustomValidity(''); });
content.addEventListener('submit', event => { if(event.target.id!=='profile-form')return;event.preventDefault();const name=document.querySelector('#profile-name').value.trim();if(!name){document.querySelector('#profile-name').setCustomValidity('Adını yazabilir misin?');document.querySelector('#profile-name').reportValidity();return;}try{saveProfile(name,document.querySelector('#profile-bio').value.trim());render();flash('Profilin kaydedildi.');}catch{flash('Profil kaydedilemedi. Tarayıcı depolama iznini kontrol et.');} });
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Üye menüsünü kapat':'Üye menüsünü aç');sidebar.classList.toggle('open',open);});
function closeMenu(){sidebar.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Üye menüsünü aç');}
window.addEventListener('hashchange',()=>{closeMenu();render();document.querySelector('#member-main').focus({preventScroll:true});window.scrollTo({top:0});});
window.addEventListener('fikirhane-session',()=>{if(!getSession())requireSession();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
document.querySelector('#cancel-reset').addEventListener('click',()=>document.querySelector('#reset-dialog').close());
document.querySelector('#confirm-reset').addEventListener('click',()=>{try{clearPreview();location.assign(siteUrl(''));}catch{flash('Önizleme silinemedi. Tarayıcı depolama iznini kontrol et.');}});
render();
