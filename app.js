import { initTheme, initMenu } from './scripts/shared.js';
import './scripts/topnav.js';
import './scripts/home-program.js';
import { ready, getSession, siteUrl } from './scripts/session.js';
import { clubs } from './scripts/catalog.js';
initTheme();
initMenu();
const tabs=[...document.querySelectorAll('[role="tab"]')];
function selectTab(tab){tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!selected;});}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowDown'||e.key==='ArrowRight')target=tabs[(index+1)%tabs.length];if(e.key==='ArrowUp'||e.key==='ArrowLeft')target=tabs[(index+tabs.length-1)%tabs.length];if(e.key==='Home')target=tabs[0];if(e.key==='End')target=tabs[tabs.length-1];if(target){e.preventDefault();selectTab(target);target.focus();}});});
const dialog=document.querySelector('#photo-dialog');
document.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click',()=>{dialog.querySelector('img').src=b.dataset.photo;dialog.showModal();}));
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});


// Public remains an introduction; member actions enter the separate shell.
function updateEntryLinks() {
  const session = getSession();
  document.querySelectorAll('[data-member-entry]').forEach(link => {
    link.href = siteUrl(session ? 'member/#anasayfa' : 'uyelik/');
    if (link.classList.contains('join-link')) link.innerHTML = session ? 'Hesabım <span>↗</span>' : 'Hesap aç <span>↗</span>';
  });
  clubs.forEach(club => {
    const link = document.querySelector('#panel-' + club.id + ' .square-arrow');
    if (link) { link.href = siteUrl((session ? 'member/#kulup/' : 'uyelik/?club=') + club.id); link.setAttribute('aria-label', club.name + ' için üye alanına geç'); }
  });
}
window.addEventListener('fikirhane-session', updateEntryLinks);
updateEntryLinks();
ready().catch(() => {});
