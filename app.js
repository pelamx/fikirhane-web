const root=document.documentElement;
const themeButton=document.querySelector('.theme-toggle');
function updateThemeLabel(){const dark=root.dataset.theme==='dark';themeButton.setAttribute('aria-label',dark?'Açık temaya geç':'Koyu temaya geç');document.querySelector('meta[name="theme-color"]').content=dark?'#191a17':'#fbf8f2';}
updateThemeLabel();
themeButton.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('fikirhane-theme',root.dataset.theme)}catch(e){}updateThemeLabel();});
const menu=document.querySelector('.menu'),nav=document.querySelector('#nav');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Menüyü aç');}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Menüyü kapat':'Menüyü aç');});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
const tabs=[...document.querySelectorAll('[role="tab"]')];
function selectTab(tab){tabs.forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!selected;});}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',e=>{let target;if(e.key==='ArrowDown'||e.key==='ArrowRight')target=tabs[(index+1)%tabs.length];if(e.key==='ArrowUp'||e.key==='ArrowLeft')target=tabs[(index+tabs.length-1)%tabs.length];if(e.key==='Home')target=tabs[0];if(e.key==='End')target=tabs[tabs.length-1];if(target){e.preventDefault();selectTab(target);target.focus();}});});
const dayNames=['21 Ekim, Çarşamba','22 Ekim, Perşembe','23 Ekim, Cuma','24 Ekim, Cumartesi','25 Ekim, Pazar','26 Ekim, Pazartesi','27 Ekim, Salı'];
const dayButtons=[...document.querySelectorAll('[data-day]')];
function selectDay(index){dayButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));const date='2026-10-'+(21+index);const booking='https://www.fikirhane.co/ng/giris?donus='+encodeURIComponent('/rezervasyon?tarih='+date);let content='<p class="day-label">'+dayNames[index]+'</p>';if(index<3){content+='<a class="session" href="'+booking+'"><div><strong>Sabah</strong><small>10.00 — 14.00 · Coworking</small></div><span>Rezervasyon ↗</span></a><a class="session" href="'+booking+'"><div><strong>Öğleden sonra</strong><small>14.00 — 18.00 · Coworking</small></div><span>Rezervasyon ↗</span></a>';}else if(index===3){content+='<a class="session" href="https://www.fikirhane.co/ng/giris?donus=%2Fprofil%2Fetkinlikler%2F24"><div><strong>Culture, Food and Traditions</strong><small>14.00 — 16.00 · Konuşma Kulübü</small></div><span>İncele ↗</span></a><p class="no-session">Bu gün çalışma alanı rezervasyonuna kapalı.</p>';}else{content+='<p class="no-session">Bu gün rezervasyona kapalı.</p>';}document.querySelector('#day-program').innerHTML=content;}
dayButtons.forEach((b,i)=>b.addEventListener('click',()=>selectDay(i)));selectDay(0);
const dialog=document.querySelector('#photo-dialog');
document.querySelectorAll('[data-photo]').forEach(b=>b.addEventListener('click',()=>{dialog.querySelector('img').src=b.dataset.photo;dialog.showModal();}));
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
