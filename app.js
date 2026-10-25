import { initTheme, initMenu } from './scripts/shared.js';
import './scripts/topnav.js';
import { ready, getSession, siteUrl } from './scripts/session.js';
import { clubs } from './scripts/catalog.js';
initTheme();
initMenu();
const tabs=[...document.querySelectorAll('[role="tab"]')];
function selectTab(tab){tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!selected;});}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowDown'||e.key==='ArrowRight')target=tabs[(index+1)%tabs.length];if(e.key==='ArrowUp'||e.key==='ArrowLeft')target=tabs[(index+tabs.length-1)%tabs.length];if(e.key==='Home')target=tabs[0];if(e.key==='End')target=tabs[tabs.length-1];if(target){e.preventDefault();selectTab(target);target.focus();}});});
const weekdays=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
const weekSessions=[['10.00 seansı','10.00 — 14.00'],['14.00 seansı','14.00 — 18.00']];
// The week runs Monday to Sunday in Istanbul; on the weekend, when there are no sessions left, it shows the coming week.
function renderWeek(){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());const t=new Date(today+'T00:00:00Z');const dow=(t.getUTCDay()+6)%7;const days=weekdays.map((name,i)=>{const date=new Date(t);date.setUTCDate(t.getUTCDate()-dow+(dow>4?7:0)+i);return{name,date,key:date.toISOString().slice(0,10)};});const fmt=(d,o)=>d.toLocaleDateString('tr-TR',{timeZone:'UTC',...o});const first=days[0].date,last=days[6].date;document.querySelector('#week-range').textContent=fmt(first,first.getUTCMonth()===last.getUTCMonth()?{day:'numeric'}:{day:'numeric',month:'long'})+' — '+fmt(last,{day:'numeric',month:'long',year:'numeric'});document.querySelector('#week-program').innerHTML=days.map((d,i)=>{const body=i>4?'<p class="week-closed">Çalışma seansı yok</p>':weekSessions.map(([name,time])=>d.key<today?'<span class="week-session past"><span>'+name+'<small>'+time+'</small></span><span>Geçti</span></span>':'<a class="week-session" href="rezervasyon/?tarih='+d.key+'"><span>'+name+'<small>'+time+'</small></span><span>Rezervasyon ↗</span></a>').join('');return'<div class="week-day'+(d.key===today?' today':'')+'"><h4>'+d.name+' <span>'+fmt(d.date,{day:'numeric',month:'long'})+'</span></h4>'+body+'</div>';}).join('');}
renderWeek();
const dialog=document.querySelector('#photo-dialog');
document.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click',()=>{dialog.querySelector('img').src=b.dataset.photo;dialog.showModal();}));
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});


// Public remains an introduction; member actions enter the separate shell.
function updateEntryLinks() {
  const session = getSession();
  document.querySelectorAll('[data-member-entry]').forEach(link => {
    link.href = siteUrl(session ? 'member/#anasayfa' : 'uyelik/');
    if (link.classList.contains('join-link')) link.innerHTML = session ? 'Üye alanım <span>↗</span>' : 'Aramıza katıl <span>↗</span>';
  });
  clubs.forEach(club => {
    const link = document.querySelector('#panel-' + club.id + ' .square-arrow');
    if (link) { link.href = siteUrl((session ? 'member/#kulup/' : 'uyelik/?club=') + club.id); link.setAttribute('aria-label', club.name + ' için üye alanına geç'); }
  });
}
window.addEventListener('fikirhane-session', updateEntryLinks);
updateEntryLinks();
ready().catch(() => {});
