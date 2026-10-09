import {today,money,displayDate,cents,validDate,makeEntry,normalize,summarize,occurrencesFor,economyBalance} from './finance.js';
const $ = id => document.getElementById(id);
const state = {uid:null,data:normalize(),ready:false,profile:{},unsubscribe:null,session:0,editing:null,dirty:false,writing:false,settling:null,customMonths:[],clearRevision:0,currentPage:'inicio',visitedPages:new Set(),dashboardAnimated:false,metricAnimationToken:0,connectionNotified:false,dashboardPeriodMode:'month',incomeVisibleCount:30,expenseFilterMonth:null};
let repository, noticeTimer;
const stored = (key,fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const remember = (key,value) => { try { localStorage.setItem(key,value); } catch { /* Preferência não impede o uso. */ } };
function notify(message,error=false) { $('notice').textContent=message; $('notice').classList.toggle('error',error); $('notice').hidden=false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').hidden=true,8000); }
function errorMessage(error) {
  if (!error.code) return error.message || 'Não foi possível concluir. Tente novamente.';
  const messages = {'auth/invalid-login-credentials':'E-mail ou senha inválidos.','auth/invalid-credential':'E-mail ou senha inválidos.','auth/wrong-password':'E-mail ou senha inválidos.','auth/user-not-found':'E-mail ou senha inválidos.','auth/email-already-in-use':'Este e-mail já está cadastrado.','auth/weak-password':'Use uma senha com pelo menos 6 caracteres.','auth/invalid-email':'Informe um e-mail válido.','auth/network-request-failed':'Sem conexão. Verifique sua internet.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.','permission-denied':'Acesso negado ao banco de dados. Verifique as permissões da conta.','unavailable':'Não foi possível conectar. Seus campos foram preservados para tentar novamente.','resource-exhausted':'O armazenamento atingiu um limite. Exporte seus dados e contate o suporte.'};
  return messages[error.code] || 'Não foi possível concluir. Seus dados não foram confirmados. Tente novamente.';
}
async function formTask(form,errorId,action) {
  if (form.dataset.busy) return;
  form.dataset.busy='true'; $(errorId).textContent='';
  const controls=[...form.querySelectorAll('input,select,button')].map(node=>[node,node.disabled]);
  controls.forEach(([node])=>node.disabled=true); form.setAttribute('aria-busy','true');
  try { await action(); } catch(error) { $(errorId).textContent=errorMessage(error); }
  finally {controls.forEach(([node,disabled])=>node.disabled=disabled);delete form.dataset.busy;form.removeAttribute('aria-busy');}
}
async function write(operation) {
  if (!state.ready || !state.uid) throw new Error('Aguarde os dados da conta carregarem.');
  if (state.writing) throw new Error('Aguarde a gravação atual terminar.');
  const uid=state.uid, session=state.session;
  state.writing=true; updateConnection();
  try { await repository.mutate(uid,operation); if(session!==state.session) throw new Error('A sessão mudou. Entre novamente para conferir o resultado.'); }
  finally {state.writing=false;updateConnection();}
}
function showAuth(id) { for(const form of $('auth').querySelectorAll('form')) form.hidden=form.id!==id; $('authError').textContent=''; }
for(const button of document.querySelectorAll('[data-auth]')) button.addEventListener('click',()=>showAuth(button.dataset.auth));
$('loginForm').addEventListener('submit',e=>{e.preventDefault();const email=$('emailLogin').value.trim(),password=$('senhaLogin').value,keep=$('rememberLogin').checked;formTask(e.currentTarget,'authError',()=>repository.login(email,password,keep));});
$('toggleLoginPassword').addEventListener('click',()=>{
  const input=$('senhaLogin'),button=$('toggleLoginPassword'),show=input.type==='password';
  input.type=show?'text':'password';
  button.setAttribute('aria-pressed',String(show));
  button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
  button.title=show?'Ocultar senha':'Mostrar senha';
  button.querySelector('.password-icon-show').hidden=show;
  button.querySelector('.password-icon-hide').hidden=!show;
  input.focus({preventScroll:true});
});
$('resetForm').addEventListener('submit',e=>{e.preventDefault();const email=$('emailRecuperacao').value.trim();formTask(e.currentTarget,'authError',async()=>{await repository.resetPassword(email);notify('Se houver uma conta para este e-mail, você receberá as instruções.');});});
$('registerForm').addEventListener('submit',e=>{e.preventDefault();const nome=$('nomeCadastro').value.trim();const profile={nome,sobrenome:$('sobrenomeCadastro').value.trim(),apelido:$('apelidoCadastro').value.trim()||nome,sexo:$('sexoCadastro').value,email:$('emailCadastro').value.trim(),temaPadrao:'claro',fontePadrao:'Urbanist, sans-serif'};const password=$('senhaCadastro').value,confirm=$('confirmaSenha').value,file=$('fotoCadastro').files[0];formTask(e.currentTarget,'authError',async()=>{
  if(!profile.nome || !profile.sobrenome) throw new Error('Preencha nome e sobrenome.');
  if(password!==confirm) throw new Error('As senhas não coincidem.');
  if(file) profile.fotoPerfil=await readPhoto(file);
  try {await repository.register(profile.email,password,profile);} catch(error) {notify(errorMessage(error),true);throw error;}
  if(state.uid){state.profile=profile;renderProfile();}notify('Conta criada com sucesso.');
});});
async function readPhoto(file) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024) throw new Error('Escolha uma imagem PNG, JPEG ou WebP de até 5 MB.');
  const bitmap=await createImageBitmap(file); const canvas=document.createElement('canvas');
  const ratio=Math.min(1,160/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.8);
}
function safePhoto(value) { return typeof value==='string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length<150000 ? value : ''; }
function renderProfile() {
  const profile=state.profile, photo=safePhoto(profile.fotoPerfil),displayName=profile.apelido||profile.nome||'Minha conta';
  const sexo=profile.sexo==='feminino'?'feminino':profile.sexo==='masculino'?'masculino':'';
  $('welcomeLabel').textContent=sexo==='feminino'?'Bem-vinda':sexo==='masculino'?'Bem-vindo':'Boas-vindas';
  $('userName').textContent=displayName;$('avatarInitials').textContent=(displayName || 'U').slice(0,1).toUpperCase();
  $('avatarImage').hidden=!photo;$('avatarInitials').hidden=!!photo;
  if(photo) $('avatarImage').src=photo; else $('avatarImage').removeAttribute('src');
  $('profileName').value=profile.nome || '';$('profileSurname').value=profile.sobrenome || '';$('profileNickname').value=profile.apelido || profile.nome || '';$('profileSex').value=sexo;
  $('photoPreview').hidden=!photo;if(photo) $('photoPreview').src=photo;else $('photoPreview').removeAttribute('src');
}
function applyAppearance(){
  const theme=stored('temaSolon','claro'),dark=theme==='escuro';document.body.classList.toggle('dark',dark);document.body.classList.toggle('margaridas',theme==='margaridas');document.body.style.fontFamily=stored('fonteSolon','Urbanist, sans-serif');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0f100f':theme==='margaridas'?'#df8eae':'#f7f7f5');
}

const PRODUCT_TOUR_VERSION='redesign-tour-2026-10-v2';
const productTourKey=uid=>`productTourSeen:${PRODUCT_TOUR_VERSION}:${uid}`;
let productTourIndex=-1,productTourTarget=null,productTourPositionToken=0;
const productTourSteps=[
  {page:'inicio',selector:'.dashboard-period',title:'Escolha o período',text:'Use Mensal e Anual aqui para mudar a leitura do painel. O seletor de mês ou ano acompanha automaticamente.'},
  {page:'inicio',selector:'#openNotesDialog',title:'Suas anotações ficaram aqui',text:'Clique neste botão quando quiser registrar ou consultar uma anotação sem ocupar espaço no dashboard.'},
  {page:'inicio',selector:'.dashboard-income [data-add="receitas"]',title:'Adicione receitas mais rápido',text:'Clique aqui para cadastrar uma nova receita. O botão fica direto no card para reduzir passos.'},
  {page:'inicio',selector:'.dashboard-expense',title:'Veja suas despesas',text:'Este card mostra previsto, pago e a pagar. Clique no card para abrir os detalhes; os pagamentos ficam separados entre Pendentes e Pagos.'},
  {page:'inicio',selector:'.dashboard-flow',title:'Acompanhe o fluxo',text:'Veja aqui como receitas e despesas se comportam no período selecionado e acompanhe o balanço atual e a previsão.'},
  {page:'receitas',selector:'.statement-toolbar',title:'Busque e filtre receitas',text:'Nesta tela você pode pesquisar, trocar o período e filtrar por recebido, parcial ou a receber.'},
  {page:'despesas',selector:'#page-despesas .action-button',title:'Organize suas despesas',text:'Use este botão para lançar despesas únicas, parceladas, mensais fixas, variáveis ou com data final.'},
  {page:'economia',selector:'#economyForm',title:'Controle sua reserva',text:'Registre aqui o que você guardou ou retirou. O Banco Economia fica separado do fluxo mensal para facilitar a leitura.'},
  {page:'inicio',selector:()=>desktop.matches?'.sidebar-nav':'.bottom-nav',title:'Navegue por aqui',text:'Use esta navegação para alternar entre Visão geral, Receitas, Despesas, Economia e Ajustes. Pronto — a nova versão é sua.'}
];
function productTourSelector(step){return typeof step.selector==='function'?step.selector():step.selector;}
function clearProductTourTarget(){if(productTourTarget)productTourTarget.classList.remove('product-tour-target-pulse');productTourTarget=null;}
function finishProductTour(){
  if(state.uid)remember(productTourKey(state.uid),'true');
  clearProductTourTarget();productTourIndex=-1;$('productTour').hidden=true;showPage('inicio',{animate:false,focus:false});
}
function positionProductTour(){
  if(productTourIndex<0||$('productTour').hidden)return;
  const step=productTourSteps[productTourIndex],target=document.querySelector(productTourSelector(step));
  if(!target||target.hidden)return;
  clearProductTourTarget();productTourTarget=target;target.classList.add('product-tour-target-pulse');
  const rect=target.getBoundingClientRect(),pad=8,spot=$('productTourSpotlight'),tip=$('productTourTip');
  const top=Math.max(6,rect.top-pad),left=Math.max(6,rect.left-pad),right=Math.min(innerWidth-6,rect.right+pad),bottom=Math.min(innerHeight-6,rect.bottom+pad);
  Object.assign(spot.style,{top:`${top}px`,left:`${left}px`,width:`${Math.max(20,right-left)}px`,height:`${Math.max(20,bottom-top)}px`});
  tip.style.left='12px';tip.style.top='12px';
  const tipRect=tip.getBoundingClientRect(),gap=12,maxLeft=Math.max(10,innerWidth-tipRect.width-10);
  let tipLeft=Math.min(maxLeft,Math.max(10,rect.left+(rect.width-tipRect.width)/2));
  let tipTop=bottom+gap;
  if(tipTop+tipRect.height>innerHeight-10)tipTop=top-tipRect.height-gap;
  if(tipTop<10)tipTop=Math.max(10,Math.min(innerHeight-tipRect.height-10,(innerHeight-tipRect.height)/2));
  Object.assign(tip.style,{left:`${tipLeft}px`,top:`${tipTop}px`});
}
function showProductTourStep(index){
  if(index<0||index>=productTourSteps.length){finishProductTour();return;}
  productTourIndex=index;const step=productTourSteps[index];
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  if(state.currentPage!==step.page)showPage(step.page,{animate:false,focus:false});
  $('productTour').hidden=false;$('productTourCount').textContent=`${index+1} de ${productTourSteps.length}`;$('productTourTitle').textContent=step.title;$('productTourText').textContent=step.text;
  $('productTourBack').hidden=index===0;$('productTourNext').textContent=index===productTourSteps.length-1?'Concluir':'Próximo';
  const token=++productTourPositionToken;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(token!==productTourPositionToken)return;
    const target=document.querySelector(productTourSelector(step));
    if(target)target.scrollIntoView({block:'center',inline:'nearest',behavior:reducedMotion.matches?'auto':'smooth'});
    setTimeout(()=>{if(token===productTourPositionToken)positionProductTour();},reducedMotion.matches?20:260);
  }));
}
function maybeStartProductTour(){
  if(!state.uid||stored(productTourKey(state.uid),'false')==='true'||productTourIndex>=0)return;
  setTimeout(()=>{if(state.uid&&state.ready&&stored(productTourKey(state.uid),'false')!=='true')showProductTourStep(0);},350);
}
$('productTourNext').addEventListener('click',()=>showProductTourStep(productTourIndex+1));
$('productTourBack').addEventListener('click',()=>showProductTourStep(productTourIndex-1));
$('productTourSkip').addEventListener('click',finishProductTour);
addEventListener('resize',()=>{if(productTourIndex>=0)positionProductTour();});
addEventListener('scroll',()=>{if(productTourIndex>=0)positionProductTour();},{passive:true,capture:true});
const savedTheme=stored('temaSolon','claro'),savedFont=stored('fonteSolon','Urbanist, sans-serif');$('themeSelect').value=['claro','escuro','margaridas'].includes(savedTheme)?savedTheme:'claro';$('fontSelect').value=[...$('fontSelect').options].some(option=>option.value===savedFont)?savedFont:'Urbanist, sans-serif';applyAppearance();
// A seleção do tema é provisória; somente Salvar configurações aplica e persiste a preferência.
$('profileForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;const session=state.session,uid=state.uid;
  const nome=$('profileName').value.trim(),sobrenome=$('profileSurname').value.trim(),apelido=$('profileNickname').value.trim()||nome,sexo=$('profileSex').value,file=$('profilePhoto').files[0];
  const theme=$('themeSelect').value,font=$('fontSelect').value;
  form.dataset.busy='true';const button=form.querySelector('[type=submit]');const controls=[...form.querySelectorAll('input,select,button')];controls.forEach(control=>control.disabled=true);
  try {if(!nome||!sobrenome)throw new Error('Preencha nome e sobrenome.');const profile={nome,sobrenome,apelido,sexo,temaPadrao:theme,fontePadrao:font};if(file)profile.fotoPerfil=await readPhoto(file);await repository.saveProfile(uid,profile);if(state.session!==session)return;state.profile={...state.profile,...profile};remember('temaSolon',theme);remember('fonteSolon',font);applyAppearance();renderProfile();$('profilePhoto').value='';notify('Configurações salvas.');}
  catch(error){notify(errorMessage(error),true);}finally{delete form.dataset.busy;controls.forEach(control=>control.disabled=false);}
});
$('profilePhoto').addEventListener('change',async()=>{const session=state.session;try{const file=$('profilePhoto').files[0];if(file){const photo=await readPhoto(file);if(session===state.session){$('photoPreview').src=photo;$('photoPreview').hidden=false;}}}catch(error){$('profilePhoto').value='';notify(errorMessage(error),true);}});
const desktop=matchMedia('(min-width:900px)');
const mobileNavigation=matchMedia('(max-width:899px)');
const pageOrder=['inicio','receitas','despesas','economia','configuracoes'];
const appShell=document.querySelector('.app-shell');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function setSidebarCollapsed(collapsed,persist=true){
  appShell.classList.toggle('sidebar-collapsed',collapsed);
  $('sidebarCollapse').setAttribute('aria-pressed',String(collapsed));
  $('sidebarCollapse').setAttribute('aria-label',collapsed?'Expandir menu lateral':'Recolher menu lateral');
  if(persist)remember('sidebarCollapsed',String(collapsed));
}
setSidebarCollapsed(stored('sidebarCollapsed','false')==='true',false);
$('sidebarCollapse').addEventListener('click',()=>setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed')));
function setSettingsMenu(open,focus=false){
  $('settingsMenu').hidden=!open;$('settingsToggle').setAttribute('aria-expanded',String(open));
  if(focus){if(open)$('settingsMenu').querySelector('button').focus();else $('settingsToggle').focus();}
}
$('settingsToggle').addEventListener('click',()=>setSettingsMenu($('settingsMenu').hidden,true));
document.addEventListener('click',e=>{if(!$('settingsMenu').hidden&&!e.target.closest('.settings-anchor'))setSettingsMenu(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settingsMenu').hidden){e.preventDefault();setSettingsMenu(false,true);}});
function animatePage(target,direction){
  if(reducedMotion.matches)return;
  target.classList.remove('page-enter-forward','page-enter-back');void target.offsetWidth;
  target.classList.add(direction==='back'?'page-enter-back':'page-enter-forward');
  target.addEventListener('animationend',()=>target.classList.remove('page-enter-forward','page-enter-back'),{once:true});
}
function showPage(page,{direction,focus=true,animate=true}={}){
  if(!pageOrder.includes(page))return;
  const previous=state.currentPage,from=pageOrder.indexOf(previous),to=pageOrder.indexOf(page);
  const target=$(`page-${page}`);state.currentPage=page;
  document.querySelectorAll('.page').forEach(el=>el.hidden=el!==target);
  document.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  if(page==='configuracoes')$('settingsToggle').setAttribute('aria-current','page');else $('settingsToggle').removeAttribute('aria-current');
  setSettingsMenu(false);
  const visitFirst=!state.visitedPages.has(page);state.visitedPages.add(page);
  if(animate&&(previous!==page||visitFirst))animatePage(target,direction||(to<from?'back':'forward'));
  if(page==='inicio'&&state.ready&&!state.dashboardAnimated)render();
  if(focus)$('main').focus({preventScroll:true});
}
for(const button of document.querySelectorAll('[data-page]'))button.addEventListener('click',()=>showPage(button.dataset.page));
async function logout(){if(state.writing){notify('Aguarde a gravação terminar.',true);return;}try{await repository.logout();}catch(error){notify(errorMessage(error),true);}}
$('headerLogoutButton').addEventListener('click',logout);for(const button of document.querySelectorAll('[data-logout]'))button.addEventListener('click',logout);
$('notificationButton').addEventListener('click',()=>notify('A central de notificações já está preparada para uma próxima etapa.'));
function updateConnection(){
  const el=$('connectionStatus');let status='loading',text='Carregando dados…';
  if(!navigator.onLine){status='offline';text='Sem conexão. Os dados exibidos podem estar desatualizados; reconecte para salvar.';}
  else if(state.writing){status='saving';text='Salvando…';}
  else if(state.ready){status='ready';text='Dados carregados. Alterações são confirmadas na nuvem.';if(!state.connectionNotified){state.connectionNotified=true;notify('Dados sincronizados com a nuvem.');}}
  el.dataset.state=status;el.textContent=text;
}
addEventListener('online',updateConnection);addEventListener('offline',updateConnection);
let swipeStart=null;
$('main').addEventListener('touchstart',e=>{
  if(!mobileNavigation.matches||e.touches.length!==1||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,button,label'))return;
  const touch=e.touches[0];swipeStart={x:touch.clientX,y:touch.clientY,page:state.currentPage};
},{passive:true});
$('main').addEventListener('touchend',e=>{
  if(!swipeStart||!mobileNavigation.matches){swipeStart=null;return;}
  const touch=e.changedTouches[0],dx=touch.clientX-swipeStart.x,dy=touch.clientY-swipeStart.y;swipeStart=null;
  if(Math.abs(dx)<64||Math.abs(dx)<Math.abs(dy)*1.25)return;
  const index=pageOrder.indexOf(state.currentPage),next=index+(dx<0?1:-1);if(next<0||next>=pageOrder.length)return;
  showPage(pageOrder[next],{direction:dx<0?'forward':'back'});
},{passive:true});
$('monthFilter').value=today().slice(0,7);$('yearFilter').value=today().slice(0,4);
const DASHBOARD_MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function setDashboardPeriodMode(mode,doRender=true){
  state.dashboardPeriodMode=mode==='year'?'year':'month';
  for(const button of document.querySelectorAll('[data-period-mode]'))button.setAttribute('aria-pressed',String(button.dataset.periodMode===state.dashboardPeriodMode));
  $('monthFilter').hidden=state.dashboardPeriodMode!=='month';$('yearFilter').hidden=state.dashboardPeriodMode!=='year';
  if(doRender)render();
}
for(const button of document.querySelectorAll('[data-period-mode]'))button.addEventListener('click',()=>setDashboardPeriodMode(button.dataset.periodMode));
$('monthFilter').addEventListener('change',render);$('yearFilter').addEventListener('change',render);setDashboardPeriodMode('month',false);
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function action(text,handler,label=text){const button=node('button',text);button.type='button';button.setAttribute('aria-label',label);button.addEventListener('click',handler);return button;}
function list(id,items,renderer,empty){const target=$(id);target.replaceChildren();if(!items.length){target.append(node('li',empty,'empty'));return;}items.forEach(item=>target.append(renderer(item)));}
function normalizedSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function setIncomeScope(scope,doRender=true){
  const value=scope==='all'?'all':'month';
  for(const button of document.querySelectorAll('[data-income-scope]'))button.setAttribute('aria-pressed',String(button.dataset.incomeScope===value));
  $('incomeMonthFilter').hidden=value==='all';remember('incomeScope',value);state.incomeVisibleCount=30;if(doRender&&state.ready)renderIncomeStatement();
}
$('incomeMonthFilter').value=stored('incomeMonth',today().slice(0,7));$('incomeStatusFilter').value='all';
const savedIncomeScope=stored('incomeScope','month');setIncomeScope(savedIncomeScope,false);
for(const button of document.querySelectorAll('[data-income-scope]'))button.addEventListener('click',()=>setIncomeScope(button.dataset.incomeScope));
$('incomeMonthFilter').addEventListener('change',()=>{remember('incomeMonth',$('incomeMonthFilter').value);state.incomeVisibleCount=30;renderIncomeStatement();});
$('incomeStatusFilter').addEventListener('change',()=>{state.incomeVisibleCount=30;renderIncomeStatement();});
$('incomeSearch').addEventListener('input',()=>{state.incomeVisibleCount=30;renderIncomeStatement();});
$('incomeLoadMore').addEventListener('click',()=>{state.incomeVisibleCount+=30;renderIncomeStatement();});
function incomeStatus(row){
  if(row.settled)return {key:'received',label:'Recebido',className:'received'};
  if(row.partial)return {key:'partial',label:'Parcial',className:'partial'};
  return {key:'pending',label:'A receber',className:''};
}
function incomeStatementRows(){
  const scope=document.querySelector('[data-income-scope][aria-pressed="true"]')?.dataset.incomeScope||'month',month=$('incomeMonthFilter').value,status=$('incomeStatusFilter').value,query=normalizedSearch($('incomeSearch').value);
  const base=scope==='month'?occurrencesFor(state.data,month):occurrencesFor(state.data);
  if(scope==='all'){
    const current=occurrencesFor(state.data,today().slice(0,7));const seen=new Set(base.map(row=>`${row.collection}:${row.entryId}:${row.id}`));
    for(const row of current){const key=`${row.collection}:${row.entryId}:${row.id}`;if(!seen.has(key)){base.push(row);seen.add(key);}}
  }
  return base.filter(row=>{
    if(row.collection!=='receitas')return false;if(scope==='month'&&row.date.slice(0,7)!==month)return false;
    if(query&&!normalizedSearch(row.name).includes(query))return false;
    const rowStatus=incomeStatus(row).key;if(status!=='all'&&rowStatus!==status)return false;return true;
  }).sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'pt-BR'));
}
function incomeIconAction(label,entry){
  const button=action('',()=>label==='Editar'?openEntry('receitas',entry):remove('receitas',entry),`${label} ${entry.name}`);
  button.className=`expense-icon-action ${label==='Excluir'?'expense-icon-delete':'expense-icon-edit'}`;button.title=`${label} ${entry.name}`;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const paths=label==='Editar'?['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z','m15 5 4 4']:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 11v6','M14 11v6'];
  for(const d of paths){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.append(path);}button.append(svg);return button;
}
function renderIncomeOccurrence(row){
  const line=node('div',undefined,'income-card-period');line.dataset.occurrenceId=row.id;
  const details=node('div',undefined,'income-period-details'),status=incomeStatus(row);
  const date=row.estimated?row.date.slice(0,7).split('-').reverse().join('/'):displayDate(row.date);
  details.append(node('span',date,'income-period-date'),node('span',status.label,`statement-status ${status.className}`));
  const side=node('div',undefined,'income-period-side');side.append(node('strong',money(row.cents),'income'));
  const receiveLabel=row.settled?'Ver recebimentos':row.partial?'Registrar outro recebimento':'Registrar recebimento';
  const receive=action(receiveLabel,()=>settle(row),`${receiveLabel}: ${row.name} em ${date}`);receive.className='income-receive-action';if(!row.settled)receive.classList.add('primary-mini');side.append(receive);
  line.append(details,side);return line;
}
function renderIncomeCard(entry,rows){
  const li=node('li');li.className='income-entry-card';li.dataset.entryId=entry.id;
  const header=node('div',undefined,'income-card-header'),heading=node('div',undefined,'income-card-heading');
  heading.append(node('strong',entry.name));
  const type=entry.mode==='single'||entry.mode==='custom'?'Extra':entry.mode==='installments'||entry.category==='Fixa até'?'Fixa até':'Fixa';
  const description=entry.openEnded?'Recebimento mensal sem data final':entry.mode==='installments'?'Parcelamento existente':entry.mode==='single'?'Mês único':`${rows.length} competência(s) exibida(s)`;
  heading.append(node('span',`${type} · ${description}`,'income-card-subtitle'));
  const tools=node('div',undefined,'income-card-tools');tools.append(incomeIconAction('Editar',entry),incomeIconAction('Excluir',entry));
  header.append(heading,tools);li.append(header);
  const periods=node('div',undefined,'income-card-periods');for(const row of rows)periods.append(renderIncomeOccurrence(row));li.append(periods);return li;
}
function renderIncomeReviewEntry(entry){
  const li=node('li');li.dataset.entryId=entry.id;li.className='income-entry-card statement-review';
  const head=node('div',undefined,'income-card-header'),heading=node('div',undefined,'income-card-heading');
  heading.append(node('strong',entry.name),node('span','Revisão pendente · confirme as competências','income-card-subtitle'));
  const actions=node('div',undefined,'income-card-tools');actions.append(incomeIconAction('Editar',entry),incomeIconAction('Excluir',entry));head.append(heading,actions);li.append(head);return li;
}
function renderIncomeStatement(){
  if(!state.ready)return;
  const rows=incomeStatementRows(),query=normalizedSearch($('incomeSearch').value),issues=state.data.receitas.filter(entry=>entry.pendingReview&&(query?normalizedSearch(entry.name).includes(query):true));
  const planned=rows.reduce((sum,row)=>sum+row.cents,0),received=rows.reduce((sum,row)=>sum+row.paymentCents,0),pending=rows.reduce((sum,row)=>sum+row.outstandingCents,0);
  $('incomeStatementPlanned').textContent=money(planned);$('incomeStatementReceived').textContent=money(received);$('incomeStatementPending').textContent=money(pending);
  const groups=new Map();for(const row of rows){if(!groups.has(row.entryId))groups.set(row.entryId,[]);groups.get(row.entryId).push(row);}
  const total=groups.size+issues.length;$('incomeResultCount').textContent=total===1?'1 receita':`${total} receitas`;
  const target=$('incomeList');target.replaceChildren();issues.forEach(entry=>target.append(renderIncomeReviewEntry(entry)));
  const visible=[...groups.entries()].slice(0,state.incomeVisibleCount);
  for(const [id,group] of visible){const entry=state.data.receitas.find(item=>item.id===id);if(entry)target.append(renderIncomeCard(entry,group));}
  if(!total)target.append(node('li','Nenhuma receita encontrada para estes filtros.','empty'));
  $('incomeLoadMore').hidden=groups.size<=state.incomeVisibleCount;
  const remaining=Math.max(0,groups.size-state.incomeVisibleCount);$('incomeLoadMore').textContent=`Carregar mais (${remaining} restantes)`;
}
function dashboardPeriod(){
  if(state.dashboardPeriodMode==='year'){
    const year=String($('yearFilter').value||'').trim();if(!/^\d{4}$/.test(year))return null;
    return {mode:'year',value:year,label:year,prefix:`${year}-`};
  }
  const month=$('monthFilter').value;if(!/^\d{4}-\d{2}$/.test(month))return null;
  const [year,monthNumber]=month.split('-').map(Number);const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(year,monthNumber-1,1));
  return {mode:'month',value:month,label,prefix:month};
}
function dashboardSummary(period){
  if(period.mode==='month')return summarize(state.data,period.value);
  const rows=Array.from({length:12},(_,index)=>occurrencesFor(state.data,`${period.value}-${String(index+1).padStart(2,'0')}`)).flat();
  const incomeRows=rows.filter(row=>row.collection==='receitas'),expenseRows=rows.filter(row=>row.collection==='despesas');
  const sum=(items,key='cents')=>items.reduce((total,row)=>total+(row[key]||0),0),income=sum(incomeRows),expenses=sum(expenseRows),actualIncome=sum(incomeRows,'paymentCents'),actualExpenses=sum(expenseRows,'paymentCents');
  return {income,expenses,balance:income-expenses,actualIncome,actualExpenses,actualBalance:actualIncome-actualExpenses,commitment:income?expenses/income*100:expenses?null:0,rows};
}
function dashboardBreakdown(summary){
  const incomeRows=summary.rows.filter(row=>row.collection==='receitas'),expenseRows=summary.rows.filter(row=>row.collection==='despesas');
  const sum=(rows,key)=>rows.reduce((total,row)=>total+(row[key]||0),0);
  return {incomeReceived:sum(incomeRows,'paymentCents'),incomeReceivable:sum(incomeRows,'outstandingCents'),expensePaid:sum(expenseRows,'paymentCents'),expensePayable:sum(expenseRows,'outstandingCents')};
}
function dashboardSeries(summary,period){
  let labels,buckets;
  if(period.mode==='year'){labels=DASHBOARD_MONTHS;buckets=12;}
  else{const [year,month]=period.value.split('-').map(Number),days=new Date(year,month,0).getDate();buckets=Math.ceil(days/7);labels=Array.from({length:buckets},(_,i)=>{const start=i*7+1,end=Math.min(days,start+6);return start===end?String(start):`${start}–${end}`;});}
  const income=Array(buckets).fill(0),expense=Array(buckets).fill(0);
  for(const row of summary.rows){
    const index=period.mode==='year'?Number(row.date.slice(5,7))-1:Math.min(buckets-1,Math.floor((Number(row.date.slice(8,10))-1)/7));
    if(index<0||index>=buckets)continue;
    if(row.collection==='receitas')income[index]+=row.paymentCents||0;else expense[index]+=row.paymentCents||0;
  }
  return {labels,income,expense};
}
function renderFlowChart(series){
  const axis=$('flowAxis');axis.replaceChildren();axis.style.gridTemplateColumns=`repeat(${series.labels.length},minmax(0,1fr))`;series.labels.forEach(label=>axis.append(node('span',label)));
  const max=Math.max(0,...series.income,...series.expense),svg=$('flowLineChart'),empty=$('flowChartEmpty');
  $('flowChartSummary').textContent=`Receitas recebidas: ${money(series.income.reduce((a,b)=>a+b,0))}. Despesas pagas: ${money(series.expense.reduce((a,b)=>a+b,0))}.`;
  if(max<=0){$('flowIncomeLine').setAttribute('d','');$('flowExpenseLine').setAttribute('d','');svg.style.opacity='.35';empty.hidden=false;return;}
  empty.hidden=true;svg.style.opacity='1';const width=600,height=180,padX=10,padY=14,count=series.labels.length;
  const path=values=>values.map((value,index)=>{const x=count===1?width/2:padX+index*(width-padX*2)/(count-1),y=height-padY-(value/max)*(height-padY*2);return `${index?'L':'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;}).join(' ');
  $('flowIncomeLine').setAttribute('d',path(series.income));$('flowExpenseLine').setAttribute('d',path(series.expense));
}
function setDashboardMetrics(summary,breakdown,commitment,animate=false){
  $('balanceTotal').className=summary.balance<0?'expense':'income';const actualBalance=summary.income-breakdown.expensePaid;$('actualBalanceTotal').className=actualBalance<0?'expense':'income';$('incomeForecast').className=summary.balance<0?'expense':'income';
  const totalMovement=summary.income+summary.expenses,incomeShare=totalMovement?summary.income/totalMovement*100:0,expenseShare=totalMovement?summary.expenses/totalMovement*100:0;
  const setFrame=progress=>{
    const eased=1-Math.pow(1-progress,3);
    $('incomeTotal').textContent=money(Math.round(summary.income*eased));$('expenseTotal').textContent=money(Math.round(summary.expenses*eased));$('balanceTotal').textContent=money(Math.round(summary.balance*eased));$('actualBalanceTotal').textContent=money(Math.round(actualBalance*eased));
    $('incomeForecast').textContent=money(Math.round(summary.balance*eased));$('incomeReceivable').textContent=money(Math.round(breakdown.incomeReceivable*eased));$('expensePaid').textContent=money(Math.round(breakdown.expensePaid*eased));$('expensePayable').textContent=money(Math.round(breakdown.expensePayable*eased));
    $('analysisIncomeShare').textContent=`${Math.round(incomeShare*eased)}%`;$('analysisExpenseShare').textContent=`${Math.round(expenseShare*eased)}%`;$('analysisIncomeBar').style.width=`${incomeShare*eased}%`;$('analysisExpenseBar').style.width=`${expenseShare*eased}%`;
    $('commitmentValue').textContent=commitment===null?(progress<1?'0%':'Sem renda'):`${Math.round(commitment*eased)}%`;const width=commitment===null?100:Math.min(100,Math.max(0,commitment))*eased;$('commitmentBar').style.width=`${width}%`;$('commitmentBar').dataset.level=commitment===null||commitment>100?'danger':commitment>80?'warning':'ok';
  };
  if(!animate||reducedMotion.matches){setFrame(1);if(state.currentPage==='inicio')state.dashboardAnimated=true;return;}
  state.dashboardAnimated=true;const token=++state.metricAnimationToken,start=performance.now(),duration=760,grid=document.querySelector('.dashboard-grid');grid?.classList.add('first-load');
  const tick=now=>{if(token!==state.metricAnimationToken)return;const progress=Math.min(1,(now-start)/duration);setFrame(progress);if(progress<1)requestAnimationFrame(tick);else setTimeout(()=>grid?.classList.remove('first-load'),520);};requestAnimationFrame(tick);
}
function dashboardContext(){const period=dashboardPeriod();if(!period)return null;const summary=dashboardSummary(period),breakdown=dashboardBreakdown(summary);return {period,summary,breakdown};}
function dashboardDetailRows(rows){const body=$('dashboardDetailBody');body.replaceChildren();rows.forEach(([label,value])=>{const row=node('div',undefined,'dashboard-detail-row');row.append(node('span',label),node('strong',value));body.append(row);});}
function defaultExpenseDetailMonth(period){
  if(period.mode==='month')return period.value;const current=today().slice(0,7);return current.startsWith(`${period.value}-`)?current:`${period.value}-01`;
}
function renderExpenseModalDetails(){
  const month=$('dashboardExpenseMonth').value,pendingTarget=$('dashboardExpenseDetailList'),paidTarget=$('dashboardExpensePaidList'),paidSection=$('dashboardExpensePaid'),paidWasOpen=paidSection.open;
  pendingTarget.replaceChildren();paidTarget.replaceChildren();if(!/^\d{4}-\d{2}$/.test(month)){return;}
  const rows=occurrencesFor(state.data,month).filter(row=>row.collection==='despesas').sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'pt-BR'));
  const pendingRows=rows.filter(row=>!row.settled),paidRows=rows.filter(row=>row.settled),planned=rows.reduce((sum,row)=>sum+row.cents,0),paid=rows.reduce((sum,row)=>sum+row.paymentCents,0);
  $('dashboardExpenseDetailSummary').textContent=`${rows.length} item(ns) · ${money(planned)} previstos · ${money(paid)} pagos`;
  $('dashboardExpensePendingCount').textContent=String(pendingRows.length);$('dashboardExpensePaidCount').textContent=String(paidRows.length);paidSection.hidden=!paidRows.length;paidSection.open=paidRows.length?paidWasOpen:false;
  const expenseItem=(row,isPaid=false)=>{
    const li=node('li',undefined,`dashboard-expense-detail-item${isPaid?' is-paid':''}`),copy=node('div'),value=node('div',undefined,'dashboard-expense-detail-value');
    copy.append(node('strong',row.name),node('small',`${row.category||'Despesa'} · ${displayDate(row.date)} · ${isPaid?'Pago':row.partial?'Parcial':'Pendente'}`));
    value.append(node('strong',money(row.cents)),node('small',isPaid?`Pago ${money(row.paymentCents)}${row.settledDate?` · ${displayDate(row.settledDate)}`:''}`:row.paymentCents?`Pago ${money(row.paymentCents)} · resta ${money(row.outstandingCents)}`:`A pagar ${money(row.outstandingCents)}`));
    if(!isPaid){const pay=action('Marcar como pago',()=>settle(row),`Marcar como pago: ${row.name}`);pay.className='dashboard-expense-detail-pay';value.append(pay);}
    li.append(copy,value);return li;
  };
  if(!rows.length){pendingTarget.append(node('li','Nenhuma despesa neste mês.','dashboard-expense-detail-empty'));return;}
  if(!pendingRows.length)pendingTarget.append(node('li','Nenhuma despesa pendente.','dashboard-expense-detail-empty'));else pendingRows.forEach(row=>pendingTarget.append(expenseItem(row)));
  paidRows.forEach(row=>paidTarget.append(expenseItem(row,true)));
}
function setExpenseDetailsVisible(show){
  $('dashboardExpenseDetails').hidden=!show;$('dashboardDetailMore').textContent=show?'Ocultar detalhes':'Mais detalhes';if(show)renderExpenseModalDetails();
}
function openDashboardDetail(kind){
  const context=dashboardContext();if(!context)return;const {period,summary,breakdown}=context,dialog=$('dashboardDetailDialog'),action=$('dashboardDetailAction'),more=$('dashboardDetailMore');dialog.dataset.kind=kind;
  const labels={receitas:['Receitas','Detalhes das receitas'],despesas:['Despesas','Detalhes das despesas'],fluxo:['Fluxo','Resumo do período']};const [eyebrow,title]=labels[kind]||labels.fluxo;$('dashboardDetailEyebrow').textContent=eyebrow;$('dashboardDetailTitle').textContent=title;
  setExpenseDetailsVisible(false);more.hidden=kind!=='despesas';
  if(kind==='receitas'){dashboardDetailRows([['Período',period.label],['Receitas',money(summary.income)],['Previsão',money(summary.balance)],['A receber',money(breakdown.incomeReceivable)]]);action.hidden=false;action.textContent='Abrir receitas';action.dataset.targetPage='receitas';}
  else if(kind==='despesas'){dashboardDetailRows([['Período',period.label],['Previsto',money(summary.expenses)],['Pago',money(breakdown.expensePaid)],['A pagar',money(breakdown.expensePayable)]]);$('dashboardExpenseMonth').value=defaultExpenseDetailMonth(period);action.hidden=false;action.textContent='Abrir despesas';action.dataset.targetPage='despesas';}
  else{dashboardDetailRows([['Período',period.label],['Balanço atual',money(summary.income-breakdown.expensePaid)],['Previsão',money(summary.balance)],['Comprometimento',summary.commitment===null?'Sem renda':`${Math.round(summary.commitment)}%`]]);action.hidden=true;delete action.dataset.targetPage;}
  dialog.showModal();
}
for(const card of document.querySelectorAll('[data-dashboard-detail]'))card.addEventListener('click',()=>openDashboardDetail(card.dataset.dashboardDetail));
$('dashboardDetailMore').addEventListener('click',()=>setExpenseDetailsVisible($('dashboardExpenseDetails').hidden));$('dashboardExpenseMonth').addEventListener('change',renderExpenseModalDetails);
$('closeDashboardDetail').addEventListener('click',()=>$('dashboardDetailDialog').close());$('dashboardDetailAction').addEventListener('click',()=>{const target=$('dashboardDetailAction').dataset.targetPage;if(target){$('dashboardDetailDialog').close();showPage(target);}});

function reviewIssues(){
  const issues=[];
  for(const collection of ['receitas','despesas'])for(const entry of state.data[collection]){
    if(entry.pendingReview)issues.push({collection,id:entry.id,name:entry.name,detail:'Datas pendentes. Este lançamento está fora dos totais.'});
    else if(entry.mode==='legacy'&&entry.occurrences.some(item=>item.estimated))issues.push({collection,id:entry.id,name:entry.name,detail:'Confirme os dias preservados na migração antiga.'});
  }
  return issues;
}
function focusIssue(issue){
  showPage(issue.collection,{direction:pageOrder.indexOf(issue.collection)>=pageOrder.indexOf(state.currentPage)?'forward':'back'});
  if(issue.collection==='receitas'){$('incomeSearch').value='';$('incomeStatusFilter').value='all';setIncomeScope('all',false);state.incomeVisibleCount=30;renderIncomeStatement();}
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const listId=issue.collection==='receitas'?'incomeList':'expenseList',target=[...$(listId).querySelectorAll('[data-entry-id]')].find(el=>el.dataset.entryId===issue.id);
    if(!target)return;target.tabIndex=-1;target.classList.remove('issue-highlight');void target.offsetWidth;target.classList.add('issue-highlight');target.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'center'});target.focus({preventScroll:true});setTimeout(()=>target.classList.remove('issue-highlight'),1700);
  }));
}
function renderReviewNotice(){
  const issues=reviewIssues(),notice=$('reviewNotice');notice.replaceChildren();notice.hidden=!issues.length;if(!issues.length)return;
  const head=node('div',undefined,'warning-head');head.append(node('span','!','warning-symbol'),node('span',issues.length===1?'1 ajuste precisa da sua atenção':`${issues.length} ajustes precisam da sua atenção`));notice.append(head);
  issues.forEach(issue=>{const button=node('button',undefined,'warning-item');button.type='button';const copy=node('span',undefined,'warning-copy');copy.append(node('strong',issue.name),node('small',issue.detail));button.append(copy,node('span','→','warning-arrow'));button.addEventListener('click',()=>focusIssue(issue));notice.append(button);});
}
function renderExpenseList(){
  const month=state.expenseFilterMonth;
  const entries=month===null?state.data.despesas:state.data.despesas.filter(entry=>!entry.pendingReview&&occurrencesFor({...state.data,despesas:[entry]},month).some(row=>row.collection==='despesas'));
  list('expenseList',entries,entry=>renderEntry(entry,'despesas'),month===null?'Nenhuma despesa adicionada.':'Nenhuma despesa neste mês.');
  $('expenseFilterStatus').textContent=month===null?'Todas as despesas':`Exibindo despesas de ${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1))}`;
}
const expenseMonthNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let expenseDraftMonth=today().slice(0,7);
function setExpensePickerOpen(open){
  $('expensePeriodPicker').hidden=!open;
  $('expensePeriodToggle').setAttribute('aria-expanded',String(open));
  if(!open)setExpenseYearOpen(false);
}
function setExpenseYearOpen(open){
  $('expenseYearOptions').hidden=!open;
  $('expenseYearToggle').setAttribute('aria-expanded',String(open));
}
function updateExpensePicker(){
  const [year,month]=expenseDraftMonth.split('-').map(Number);
  $('expenseYearLabel').textContent=String(year);
  $('expensePeriodLabel').textContent=expenseMonthNames[month-1]+' / '+year;
  const months=$('expenseMonthOptions');months.replaceChildren();
  expenseMonthNames.forEach((name,i)=>{
    const button=node('button',name,'expense-month-option');button.type='button';
    const selected=i+1===month;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));
    button.addEventListener('click',()=>{expenseDraftMonth=year+'-'+String(i+1).padStart(2,'0');updateExpensePicker();});
    months.append(button);
  });
  const years=$('expenseYearOptions');years.replaceChildren();
  const currentYear=Number(today().slice(0,4)),first=Math.min(year-12,currentYear-12),last=Math.max(year+12,currentYear+12);
  for(let y=last;y>=first;y--){
    const button=node('button',String(y),'expense-year-option');button.type='button';
    button.classList.toggle('is-selected',y===year);button.setAttribute('aria-pressed',String(y===year));
    button.addEventListener('click',()=>{expenseDraftMonth=y+'-'+String(month).padStart(2,'0');updateExpensePicker();setExpenseYearOpen(false);});
    years.append(button);
  }
}
updateExpensePicker();
$('expensePeriodToggle').addEventListener('click',()=>setExpensePickerOpen($('expensePeriodPicker').hidden));
$('expenseYearToggle').addEventListener('click',()=>setExpenseYearOpen($('expenseYearOptions').hidden));
$('expenseFilterApply').addEventListener('click',()=>{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(expenseDraftMonth)){notify('Selecione um mês e ano válidos.',true);return;}
  state.expenseFilterMonth=expenseDraftMonth;setExpensePickerOpen(false);if(state.ready)renderExpenseList();
});
$('expenseFilterAll').addEventListener('click',()=>{state.expenseFilterMonth=null;expenseDraftMonth=today().slice(0,7);updateExpensePicker();setExpensePickerOpen(false);if(state.ready)renderExpenseList();});
document.addEventListener('click',event=>{if(!event.target.closest('.expense-period-wrap'))setExpensePickerOpen(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('expensePeriodPicker').hidden){setExpensePickerOpen(false);$('expensePeriodToggle').focus();}});
function render(){
  if(!state.ready)return;
  const context=dashboardContext();if(!context)return;const {period,summary,breakdown}=context,commitment=summary.commitment;
  $('actualSummary').textContent=`No período selecionado: ${money(summary.income)} em receitas − ${money(breakdown.expensePaid)} em despesas pagas = ${money(summary.income-breakdown.expensePaid)} de balanço atual.`;
  setDashboardMetrics(summary,breakdown,commitment,state.currentPage==='inicio'&&!state.dashboardAnimated);renderFlowChart(dashboardSeries(summary,period));
  const hasData=summary.income||summary.expenses;let status='Sem dados',tone='neutral',icon='→',description='Sem movimentação no período.';
  if(hasData&&summary.balance<0){status='Atenção';tone='negative';icon='↘';description=`Previsão de déficit de ${money(Math.abs(summary.balance))}.`;}
  else if(hasData&&summary.balance>0){status='Positiva';tone='positive';icon='↗';description=`Previsão de superávit de ${money(summary.balance)}.`;}
  else if(hasData){status='Equilíbrio';description='Receitas e despesas previstas estão equilibradas.';}
  $('monthStatus').textContent=status;$('monthStatus').dataset.tone=tone;$('trendIcon').textContent=icon;$('monthDescription').textContent=description;
  renderReviewNotice();
  renderIncomeStatement();renderExpenseList();
  if($('dashboardDetailDialog').open&&$('dashboardDetailDialog').dataset.kind==='despesas'&&!$('dashboardExpenseDetails').hidden)renderExpenseModalDetails();
  $('economyBalance').textContent=money(economyBalance(state.data));$('economyBalance').className=economyBalance(state.data)<0?'expense':'income';
  list('economyList',state.data.economia||[],renderEconomyItem,'Nenhuma movimentação na sua reserva.');
  list('notesList',state.data.itens,item=>{const li=node('li');li.append(node('span',item.text));const actions=node('div',undefined,'row-actions');actions.append(action('Excluir',()=>remove('itens',item),`Excluir anotação: ${item.text}`));li.append(actions);return li;},'Nenhuma anotação.');
}
function renderEntry(entry,collection){
  const li=node('li'),head=node('div',undefined,'entry-heading');if(collection==='despesas')li.classList.add('expense-entry');li.dataset.entryId=entry.id;li.tabIndex=-1;if(entry.pendingReview||(entry.mode==='legacy'&&entry.occurrences.some(p=>p.estimated)))li.classList.add('has-issue');head.append(node('strong',entry.name),node('span',money(entry.amountCents),`amount ${collection==='receitas'?'income':'expense'}`));li.append(head);
  const occurrences=entry.occurrences;const modeLabel=entry.mode==='monthly'?'mensalidade(s) — valor por mês':entry.mode==='custom'?'competência(s) escolhida(s) — valor por competência':'parcela(s) — valor total';li.append(node('p',entry.pendingReview?'Revisão pendente: defina as datas para incluir nos totais.':entry.openEnded?`Mensal fixa · desde ${displayDate(entry.firstDate)} · sem data final`:entry.category==='Fixa até'?`Fixa até · ${entry.count} mês(es) · ${displayDate(entry.firstDate)} a ${displayDate(entry.endDate||occurrences.at(-1)?.date)}`:`${occurrences.length} ${modeLabel} · ${displayDate(occurrences[0]?.date)} a ${displayDate(occurrences.at(-1)?.date)}`));
  if(collection!=='despesas'){if(entry.mode==='legacy'&&occurrences.some(p=>p.estimated))li.append(node('p','Dias de vencimento a confirmar; meses originais preservados.'));else if(occurrences.some(p=>p.estimated))li.append(node('p','Competências mensais preservadas do sistema anterior.'));}
  const actions=node('div',undefined,'row-actions');if(collection==='despesas'){
    actions.classList.add('expense-entry-actions');
    for(const [label,icon,handler] of [['Editar','book-open-pen',()=>openEntry(collection,entry)],['Excluir','trash-2',()=>remove(collection,entry)]]){
      const button=action('',handler,`${label} ${entry.name}`);button.className=`expense-icon-action ${label==='Excluir'?'expense-icon-delete':'expense-icon-edit'}`;button.title=`${label} ${entry.name}`;
      const glyph=document.createElementNS('http://www.w3.org/2000/svg','svg');glyph.setAttribute('viewBox','0 0 24 24');glyph.setAttribute('fill','none');glyph.setAttribute('stroke','currentColor');glyph.setAttribute('stroke-width','1.9');glyph.setAttribute('stroke-linecap','round');glyph.setAttribute('stroke-linejoin','round');glyph.setAttribute('aria-hidden','true');
      const paths=label==='Editar'?['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z','m15 5 4 4']:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 11v6','M14 11v6'];
      paths.forEach(d=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);glyph.append(path);});button.append(glyph);actions.append(button);
    }
  }else actions.append(action('Editar',()=>openEntry(collection,entry),`Editar ${entry.name}`),action('Excluir',()=>remove(collection,entry),`Excluir ${entry.name}`));li.append(actions);return li;
}
function renderOccurrence(row){
  const li=node('li'),head=node('div',undefined,'entry-heading');head.append(node('strong',row.name),node('span',money(row.cents),`amount ${row.collection==='receitas'?'income':'expense'}`));li.append(head);
  const verb=row.collection==='receitas'?'Recebido':'Pago';let status;
  if(row.settled)status=`${verb} integralmente${row.settledDate?` em ${displayDate(row.settledDate)}`:''}`;
  else if(row.partial)status=`${verb} parcialmente: ${money(row.paymentCents)} · resta ${money(row.outstandingCents)}`;
  else status=row.estimated?'Dia a confirmar':row.date<today()?'Em atraso':'Pendente';
  li.append(node('p',`${row.estimated?row.date.slice(0,7).split('-').reverse().join('/') : displayDate(row.date)} · ${row.index}/${row.count} · ${status}`));
  const actionLabel=row.settled?'Ver pagamentos':row.partial?(row.collection==='receitas'?'Registrar outro recebimento':'Registrar outro pagamento'):(row.collection==='receitas'?'Registrar recebimento':'Registrar pagamento');
  const actions=node('div',undefined,'row-actions');actions.append(action(actionLabel,()=>settle(row)));li.append(actions);return li;
}
function renderEconomyItem(item){
  const li=node('li'),head=node('div',undefined,'entry-heading'),signed=item.kind==='withdraw'?-item.cents:item.cents;
  head.append(node('strong',item.name),node('span',`${signed>=0?'+':'−'} ${money(Math.abs(signed))}`,`amount ${signed>=0?'income':'expense'}`));li.append(head,node('p',`${item.kind==='withdraw'?'Retirada':'Depósito'} · ${displayDate(item.date)}`));
  const actions=node('div',undefined,'row-actions');actions.append(action('Excluir',()=>remove('economia',item),`Excluir movimentação ${item.name}`));li.append(actions);return li;
}
let pendingDelete=null,deleteInProgress=false;
function closeDeleteConfirm(){if(deleteInProgress)return;$('deleteConfirmDialog').close();pendingDelete=null;}
function remove(collection,entry){
  if(deleteInProgress)return;
  pendingDelete={collection,id:entry.id,revision:entry.revision,name:entry.name};
  const label=collection==='itens'?'esta anotação':collection==='economia'?'esta movimentação':collection==='receitas'?'esta receita':'esta despesa';
  $('deleteConfirmTitle').textContent='Excluir '+label+'?';
  $('deleteConfirmDescription').textContent=collection==='receitas'||collection==='despesas'
    ?'Deseja excluir “'+entry.name+'” e todos os seus períodos e registros de '+(collection==='receitas'?'recebimento':'pagamento')+'? Esta ação não pode ser desfeita.'
    :'Deseja excluir “'+(entry.name||'item')+'”? Esta ação não pode ser desfeita.';
  $('deleteConfirmError').hidden=true;$('deleteConfirmError').textContent='';
  $('deleteConfirmDialog').showModal();$('cancelDeleteConfirm').focus();
}
$('cancelDeleteConfirm').addEventListener('click',closeDeleteConfirm);
$('deleteConfirmDialog').addEventListener('cancel',event=>{event.preventDefault();closeDeleteConfirm();});
$('acceptDeleteConfirm').addEventListener('click',async()=>{
  if(!pendingDelete||deleteInProgress)return;
  const {collection,id,revision}=pendingDelete;deleteInProgress=true;
  $('acceptDeleteConfirm').disabled=true;$('cancelDeleteConfirm').disabled=true;
  $('acceptDeleteConfirm').textContent='Excluindo...';
  try{
    await write({type:'remove',collection,id,expectedRevision:revision});
    $('deleteConfirmDialog').close();pendingDelete=null;notify('Item excluído com sucesso.');
  }catch(error){
    $('deleteConfirmError').textContent=errorMessage(error);$('deleteConfirmError').hidden=false;
  }finally{
    deleteInProgress=false;$('acceptDeleteConfirm').disabled=false;$('cancelDeleteConfirm').disabled=false;
    $('acceptDeleteConfirm').textContent='Sim, excluir';
  }
});
$('openNotesDialog').addEventListener('click',()=>{$('notesDialog').showModal();requestAnimationFrame(()=>$('noteText').focus());});
$('closeNotesDialog').addEventListener('click',()=>{if(!$('noteForm').dataset.busy)$('notesDialog').close();});
$('notesDialog').addEventListener('cancel',e=>{if($('noteForm').dataset.busy)e.preventDefault();});
$('noteForm').addEventListener('submit',async e=>{e.preventDefault();const text=$('noteText').value.trim();if(!text||state.writing)return;const id=crypto.randomUUID();const button=e.currentTarget.querySelector('button');button.disabled=true;$('noteText').disabled=true;try{await write({type:'add',collection:'itens',id,entry:{id,text}});$('noteText').value='';notify('Anotação salva.');}catch(error){notify(errorMessage(error),true);}finally{button.disabled=false;$('noteText').disabled=false;}});
$('economyDate').value=today();
$('economyForm').addEventListener('submit',e=>{e.preventDefault();const id=crypto.randomUUID();let value;try{value=cents($('economyValue').value);if(!$('economyName').value.trim())throw new Error('Informe o motivo da movimentação.');if(!validDate($('economyDate').value))throw new Error('Informe uma data válida.');}catch(error){$('economyError').textContent=errorMessage(error);return;}const entry={id,name:$('economyName').value.trim(),kind:$('economyKind').value,cents:value,date:$('economyDate').value,revision:0};formTask(e.currentTarget,'economyError',async()=>{await write({type:'add',collection:'economia',id,entry});e.currentTarget.reset();$('economyDate').value=today();notify('Movimentação da reserva salva.');});});
for(const button of document.querySelectorAll('[data-add]'))button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openEntry(button.dataset.add);});
function renderCustomMonths(){
  const target=state.editing?.collection==='receitas'?$('incomeChosenMonths'):$('customMonthList');target.replaceChildren();
  state.customMonths.sort().forEach(month=>{const chip=node('span',undefined,'month-chip');chip.append(node('span',month.split('-').reverse().join('/')));const removeButton=action('×',()=>{state.customMonths=state.customMonths.filter(value=>value!==month);state.dirty=true;renderCustomMonths();previewSchedule();},`Remover ${month}`);removeButton.className='month-chip-remove';chip.append(removeButton);target.append(chip);});
}
$('addCustomMonth').addEventListener('click',()=>{const month=$('customMonthInput').value;if(!/^\d{4}-\d{2}$/.test(month)){notify('Escolha uma competência válida.',true);return;}if(!state.customMonths.includes(month))state.customMonths.push(month);$('customMonthInput').value='';state.dirty=true;renderCustomMonths();previewSchedule();});
function customRangeMonths(start,end){
  if(!/^\d{4}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}$/.test(end||''))return [];
  const [sy,sm]=start.split('-').map(Number),[ey,em]=end.split('-').map(Number),first=sy*12+sm-1,last=ey*12+em-1;if(last<first||last-first+1>360)return [];
  return Array.from({length:last-first+1},(_,i)=>{const value=first+i,y=Math.floor(value/12),m=value%12+1;return `${y}-${String(m).padStart(2,'0')}`;});
}
function syncCustomRange(source){
  const start=$('customRangeStart'),end=$('customRangeEnd');
  if(start.value){end.min=start.value;if(source==='start'&&end.value&&end.value<start.value)end.value=start.value;}else end.removeAttribute('min');
  if(end.value){start.max=end.value;if(source==='end'&&start.value&&start.value>end.value)start.value=end.value;}else start.removeAttribute('max');
  const months=customRangeMonths(start.value,end.value);$('customRangeHint').textContent=months.length?`${months.length} competência(s) serão adicionadas.`:'Selecione o início e o fim.';
}
$('customRangeStart').addEventListener('change',()=>syncCustomRange('start'));$('customRangeEnd').addEventListener('change',()=>syncCustomRange('end'));
$('addCustomRange').addEventListener('click',()=>{
  const months=customRangeMonths($('customRangeStart').value,$('customRangeEnd').value);if(!months.length){notify('Escolha um intervalo válido de até 360 meses.',true);return;}
  state.customMonths=[...new Set([...state.customMonths,...months])].sort();state.dirty=true;renderCustomMonths();previewSchedule();notify(`${months.length} competência(s) adicionadas.`);
});

let incomePeriodStart=today().slice(0,7),incomePeriodEnd='',incomePickerDraft=today().slice(0,7);
function setIncomePickerOpen(open){$('incomePeriodPicker').hidden=!open;$('incomePeriodToggle').setAttribute('aria-expanded',String(open));$('incomeYearOptions').hidden=true;$('incomeYearToggle').setAttribute('aria-expanded','false');}
function renderIncomePeriod(){
  if(!state.editing||state.editing.collection!=='receitas')return;
  const type=$('incomeMode').value,selected=state.customMonths;
  const slots=$('incomePeriodSelections');slots.replaceChildren();
  if(type!=='extra'){
    const start=action('Início: '+incomePeriodStart.split('-').reverse().join('/'),()=>{incomePickerDraft=incomePeriodStart;updateIncomePicker();setIncomePickerOpen(true);},'Selecionar início');
    start.className='income-period-slot';start.dataset.target='start';slots.append(start);
    if(type==='until'){const end=action('Fim: '+(incomePeriodEnd?incomePeriodEnd.split('-').reverse().join('/'):'Selecionar'),()=>{incomePickerDraft=incomePeriodEnd||incomePeriodStart;updateIncomePicker();setIncomePickerOpen(true);},'Selecionar fim');end.className='income-period-slot';end.dataset.target='end';slots.append(end);}
  }
  $('incomeChosenMonths').hidden=type!=='extra';if(type==='extra')renderCustomMonths();
  $('incomePeriodLabel').textContent=type==='extra'?'Adicionar mês':type==='until'?'Selecionar período':'Selecionar mês inicial';
  updateIncomePicker();
}
let incomePickerTarget='start';
function updateIncomePicker(){
  const [year,month]=incomePickerDraft.split('-').map(Number);
  $('incomeYearLabel').textContent=String(year);
  const target=$('incomeMonthOptions');target.replaceChildren();
  expenseMonthNames.forEach((name,i)=>{const btn=node('button',name,'expense-month-option');btn.type='button';btn.classList.toggle('is-selected',i+1===month);btn.setAttribute('aria-pressed',String(i+1===month));btn.addEventListener('click',()=>{
    const chosen=year+'-'+String(i+1).padStart(2,'0');const type=$('incomeMode').value;
    if(type==='extra'){if(!state.customMonths.includes(chosen))state.customMonths.push(chosen);state.customMonths.sort();}
    else if(type==='fixed'||incomePickerTarget==='start'){incomePeriodStart=chosen;if(type==='until'&&incomePeriodEnd&&incomePeriodEnd<chosen)incomePeriodEnd='';}
    else incomePeriodEnd=chosen;
    incomePickerDraft=chosen;state.dirty=true;setIncomePickerOpen(false);renderIncomePeriod();previewSchedule();
  });target.append(btn);});
  const years=$('incomeYearOptions');years.replaceChildren();const now=Number(today().slice(0,4));for(let y=Math.max(year+12,now+12);y>=Math.min(year-12,now-12);y--){const btn=node('button',String(y),'expense-year-option');btn.type='button';btn.classList.toggle('is-selected',y===year);btn.addEventListener('click',()=>{incomePickerDraft=y+'-'+String(month).padStart(2,'0');updateIncomePicker();$('incomeYearOptions').hidden=true;$('incomeYearToggle').setAttribute('aria-expanded','false');});years.append(btn);}
}
$('incomePeriodToggle').addEventListener('click',()=>{incomePickerTarget=$('incomeMode').value==='until'&&incomePeriodEnd?'end':'start';incomePickerDraft=incomePickerTarget==='end'?incomePeriodEnd:incomePeriodStart;updateIncomePicker();setIncomePickerOpen($('incomePeriodPicker').hidden);});
$('incomePeriodSelections').addEventListener('click',e=>{const btn=e.target.closest('[data-target]');if(btn)incomePickerTarget=btn.dataset.target;});
$('incomeYearToggle').addEventListener('click',()=>{const open=$('incomeYearOptions').hidden;$('incomeYearOptions').hidden=!open;$('incomeYearToggle').setAttribute('aria-expanded',String(open));});
document.addEventListener('click',e=>{if(!e.target.closest('.income-picker-anchor')&&!e.target.closest('.income-period-selections'))setIncomePickerOpen(false);});

function openEntry(collection,entry=null){
  if(!state.ready){notify('Aguarde os dados carregarem.',true);return;}
  state.editing={collection,entry:entry?structuredClone(entry):null,id:entry?.id||crypto.randomUUID()};state.dirty=false;state.customMonths=entry&&collection==='receitas'&&['single','custom'].includes(entry.mode)?(entry.occurrences||[]).map(p=>p.date.slice(0,7)):entry?.mode==='custom'?(entry.occurrences||[]).map(p=>p.date.slice(0,7)):[];
  $('entryForm').reset();incomePeriodStart=entry?.firstDate?.slice(0,7)||today().slice(0,7);incomePeriodEnd=entry?.endDate?.slice(0,7)||entry?.occurrences?.at(-1)?.date?.slice(0,7)||'';incomePickerDraft=incomePeriodStart;$('customRangeStart').removeAttribute('max');$('customRangeEnd').removeAttribute('min');$('customRangeHint').textContent='Selecione o início e o fim.';renderCustomMonths();$('entryError').textContent='';$('entryTitle').textContent=`${entry?'Editar':'Adicionar'} ${collection==='receitas'?'receita':'despesa'}`;
  $('entryName').value=entry?.name||'';$('entryValue').value=entry ? (entry.amountCents/100).toFixed(2) : '';
  const legacy=entry?.mode==='legacy'&&!entry.pendingReview;
  $('entryMode').querySelector('[value=legacy]').hidden=!legacy;
  $('entryMode').value=legacy?'legacy':entry?.mode==='legacy'?'installments':entry?.mode||'single';
  $('incomeMode').value=entry?.mode==='single'||entry?.mode==='custom'?'extra':entry?.mode==='installments'||entry?.mode==='monthly'&&entry?.category==='Fixa até'?'until':'fixed';
  $('entryDate').value=entry?.firstDate||today();$('entryEndDate').value=entry?.endDate||entry?.occurrences?.at(-1)?.date||today();$('entryCount').value=entry?.count||1;$('entryCategory').value=entry?.category||'Fixa';$('categoryField').hidden=collection==='receitas';
  $('legacyDatesList').replaceChildren();
  if(legacy)entry.occurrences.forEach((p,i)=>{const label=node('label',`Vencimento ${i+1}`);label.htmlFor=`legacy-date-${i}`;const input=node('input');input.id=label.htmlFor;input.type='date';input.value=p.date;input.required=true;input.min='1900-01-01';input.max='9999-12-31';$('legacyDatesList').append(label,input);});
  const settled=entry?.occurrences.some(p=>(p.payments||[]).length);
  $('entryHelp').textContent=settled?'Este lançamento já tem pagamentos ou recebimentos registrados. Você pode ajustar descrição e tipo; valores e competências ficam preservados.':entry?.pendingReview?'O registro antigo foi preservado. Informe a modalidade e as competências corretas.':'Mensal fixa se repete sem data final. Fixa até usa início e fim e calcula os meses automaticamente. Mensal variável usa a quantidade de meses.';
  updateEntryFields();$('entryDialog').showModal();$('entryName').focus();
}
function updateEntryFields(){
  const isIncome=state.editing?.collection==='receitas',incomeType=$('incomeMode').value;
  if(isIncome){$('entryMode').value=incomeType==='extra'?'custom':incomeType==='single'||incomeType==='installments'?incomeType:'monthly';$('entryCategory').value=incomeType==='until'?'Fixa até':'Fixa';}
  const mode=$('entryMode').value,settled=state.editing?.entry?.occurrences.some(p=>(p.payments||[]).length),legacy=mode==='legacy',custom=mode==='custom',collection=state.editing?.collection,category=collection==='receitas'?'Fixa':$('entryCategory').value,fixedMonthly=mode==='monthly'&&category==='Fixa',fixedUntil=mode==='monthly'&&category==='Fixa até';
  $('valueLabel').textContent=(mode==='monthly'||custom)?'Valor por competência (R$)':mode==='single'?'Valor (R$)':'Valor total (R$)';$('dateLabel').textContent=mode==='single'?'Data prevista':'Primeiro vencimento';
  $('countField').hidden=mode==='single'||legacy||custom||fixedMonthly||fixedUntil;$('endDateField').hidden=!fixedUntil;$('legacyDates').hidden=!legacy;$('customDates').hidden=!custom;$('customExpenseRange').hidden=!(custom&&collection==='despesas');$('entryDate').parentElement.hidden=(isIncome&&incomeType!=='single'&&incomeType!=='installments')||legacy||custom;
  $('incomeModeField').hidden=!isIncome;$('genericModeField').hidden=isIncome;$('incomePeriodFields').hidden=!isIncome||incomeType==='single'||incomeType==='installments';$('customDates').hidden=!custom||isIncome;
  if(isIncome&&incomeType!=='single'&&incomeType!=='installments'){$('entryDate').value=incomePeriodStart+'-01';if(incomeType==='until')$('entryEndDate').value=(incomePeriodEnd||incomePeriodStart)+'-01';$('endDateField').hidden=true;$('incomePeriodHint').textContent=incomeType==='extra'?'Escolha os meses em que receberá este valor.':incomeType==='fixed'?'Escolha o primeiro mês. A receita continuará mensalmente até você alterar.':'Escolha o primeiro e o último mês do período.';renderIncomePeriod();}

  for(const id of ['entryMode','entryValue','entryDate','entryEndDate','entryCount','customMonthInput','addCustomMonth','customRangeStart','customRangeEnd','addCustomRange'])$(id).disabled=!!settled||(legacy&&['entryDate','entryEndDate','entryCount'].includes(id));
  $('entryCount').required=mode==='installments'||(mode==='monthly'&&!fixedMonthly&&!fixedUntil);$('entryEndDate').required=fixedUntil&&!isIncome;$('entryDate').required=!legacy&&!custom&&(!isIncome||incomeType==='single'||incomeType==='installments');
  $('incomeMode').disabled=!!settled;$('incomePeriodToggle').disabled=!!settled;
  $('legacyDatesList').querySelectorAll('input').forEach(input=>input.disabled=!!settled||!legacy);$('customMonthList').querySelectorAll('button').forEach(button=>button.disabled=!!settled);
  previewSchedule();
}
function draftEntry(){
  const {entry,id}=state.editing;
  const income=state.editing.collection==='receitas',convertSingle=income&&entry?.mode==='single'&&$('incomeMode').value==='extra',convertInstallments=income&&entry?.mode==='installments'&&$('incomeMode').value==='until';
  if(entry&&(convertSingle||convertInstallments)){
    const originalMonths=(entry.occurrences||[]).map(p=>p.date.slice(0,7)).sort();
    const selectedMonths=convertSingle?[...state.customMonths].sort():customRangeMonths(incomePeriodStart,incomePeriodEnd);
    const sameMonths=originalMonths.length===selectedMonths.length&&originalMonths.every((m,i)=>m===selectedMonths[i]);
    if(sameMonths){
      const preserved=structuredClone(entry);
      preserved.name=$('entryName').value.trim();
      if(convertSingle){preserved.mode='custom';preserved.category='Fixa';preserved.count=preserved.occurrences.length;}
      else {preserved.mode='monthly';preserved.category='Fixa até';preserved.openEnded=false;preserved.endDate=preserved.occurrences.at(-1)?.date;preserved.count=preserved.occurrences.length;}
      return preserved;
    }
    if(entry.occurrences.some(p=>(p.payments||[]).length))throw new Error('Existem recebimentos registrados. Mantenha os meses originais para preservar os valores e as baixas.');
  }
  if(entry?.occurrences.some(p=>(p.payments||[]).length))return {...structuredClone(entry),name:$('entryName').value.trim(),category:$('entryCategory').value};
  if($('entryMode').value==='legacy'){
    const amount=cents($('entryValue').value),dates=[...$('legacyDatesList').querySelectorAll('input')].map(input=>input.value);
    if(dates.some(date=>!validDate(date))||new Set(dates).size!==dates.length)throw new Error('Confirme as datas, sem vencimentos duplicados.');
    if(amount<dates.length)throw new Error('Cada parcela precisa ter ao menos R$ 0,01.');
    const occurrences=entry.occurrences.map((p,i)=>({...p,date:dates[i],estimated:false,cents:Math.floor(amount/dates.length)+(i<amount%dates.length?1:0)})).sort((a,b)=>a.date.localeCompare(b.date));
    return {...structuredClone(entry),name:$('entryName').value.trim(),category:$('entryCategory').value,amountCents:amount,firstDate:occurrences[0].date,occurrences,pendingReview:false};
  }
  const category=state.editing.collection==='receitas'?($('incomeMode').value==='until'?'Fixa até':'Fixa'):$('entryCategory').value;
  if(state.editing.collection==='receitas'&&!['single','installments'].includes($('incomeMode').value)){$('entryDate').value=incomePeriodStart+'-01';$('entryEndDate').value=(incomePeriodEnd||incomePeriodStart)+'-01';if($('incomeMode').value==='until'&&(!incomePeriodEnd||incomePeriodEnd<incomePeriodStart))throw new Error('Selecione um período válido: mês inicial e final.');}
  const result=makeEntry({id,name:$('entryName').value,value:$('entryValue').value,date:$('entryDate').value,endDate:$('entryEndDate').value,count:$('entryCount').value,mode:$('entryMode').value,months:state.customMonths,category,revision:entry?.revision||0});
  if(entry?.legacy)result.legacy=structuredClone(entry.legacy);
  return result;
}
function previewSchedule(){try{const entry=draftEntry();if(entry.openEnded){$('schedulePreview').textContent=`Recorrência mensal fixa a partir de ${displayDate(entry.firstDate)}, sem data final. Valor mensal: ${money(entry.amountCents)}.`;return;}const rows=entry.occurrences,total=rows.reduce((s,p)=>s+p.cents,0);if(entry.category==='Fixa até'){$('schedulePreview').textContent=`${rows.length} mês(es) no intervalo de ${displayDate(entry.firstDate)} até ${displayDate(entry.endDate)}. Valor mensal: ${money(entry.amountCents)} · Total previsto: ${money(total)}.`;return;}$('schedulePreview').textContent=`${rows.length} vencimento(s): ${displayDate(rows[0].date)} a ${displayDate(rows.at(-1).date)}. Total do período: ${money(total)}.`;}catch{$('schedulePreview').textContent='Preencha os dados para conferir os vencimentos.';}}
$('entryForm').addEventListener('input',()=>{state.dirty=true;previewSchedule();});$('entryMode').addEventListener('change',updateEntryFields);$('incomeMode').addEventListener('change',()=>{state.dirty=true;setIncomePickerOpen(false);updateEntryFields();});$('entryCategory').addEventListener('change',()=>{state.dirty=true;updateEntryFields();});
function closeEntry(){if($('entryForm').dataset.busy)return;if(state.dirty&&!confirm('Descartar as alterações não salvas?'))return;$('entryDialog').close();state.editing=null;state.dirty=false;}
$('entryDialog').addEventListener('cancel',e=>{e.preventDefault();closeEntry();});$('closeEntry').addEventListener('click',closeEntry);$('cancelEntry').addEventListener('click',closeEntry);
$('entryForm').addEventListener('submit',e=>{
  e.preventDefault();let draft;try{draft=draftEntry();if(!draft.name||draft.name.length>160)throw new Error('Informe uma descrição com até 160 caracteres.');}catch(error){$('entryError').textContent=errorMessage(error);return;}
  const editing=state.editing;
  formTask(e.currentTarget,'entryError',async()=>{await write({type:editing.entry?'edit':'add',collection:editing.collection,id:editing.id,entry:draft,expectedRevision:editing.entry?.revision});state.dirty=false;$('entryDialog').close();state.editing=null;notify('Lançamento salvo.');});
});
function renderPaymentHistory(row){
  const target=$('paymentHistory');target.replaceChildren();
  if(!(row.payments||[]).length){target.append(node('p','Nenhuma baixa registrada ainda.','muted'));return;}
  target.append(node('strong',row.collection==='receitas'?'Recebimentos registrados':'Pagamentos registrados'));
  for(const payment of [...row.payments].sort((a,b)=>b.date.localeCompare(a.date))){
    const line=node('div',undefined,'payment-line');const when=payment.estimated?`${payment.date.slice(0,7).split('-').reverse().join('/')} · data exata não registrada`:displayDate(payment.date);const copy=node('span',`${when} · ${money(payment.cents)}`);const removeButton=action('Remover',async()=>{if(state.writing)return;if(!confirm(`Remover a baixa de ${money(payment.cents)}?`))return;removeButton.disabled=true;try{await write({type:'removePayment',collection:row.collection,id:row.entryId,occurrenceId:row.id,paymentId:payment.id,expectedRevision:row.revision});$('settleDialog').close();notify('Baixa removida.');}catch(error){removeButton.disabled=false;notify(errorMessage(error),true);}});removeButton.className='link danger-link';line.append(copy,removeButton);target.append(line);
  }
}
async function settle(row){
  state.settling=row;const receiving=row.collection==='receitas';$('settleTitle').textContent=receiving?'Registrar recebimento':'Registrar pagamento';
  $('settleDate').value=today();$('settleDate').max=today();$('settleDate').min='1900-01-01';$('settleError').textContent='';
  $('settleSummary').textContent=`Previsto: ${money(row.cents)} · já ${receiving?'recebido':'pago'}: ${money(row.paymentCents)} · restante: ${money(row.outstandingCents)}.`;
  $('settleValue').value=row.outstandingCents>0?(row.outstandingCents/100).toFixed(2):'';$('settleValue').max=(row.outstandingCents/100).toFixed(2);$('settleValue').disabled=row.outstandingCents===0;$('settleForm').querySelector('[type=submit]').disabled=row.outstandingCents===0;
  renderPaymentHistory(row);$('settleDialog').showModal();
}
$('cancelSettle').addEventListener('click',()=>{if(!$('settleForm').dataset.busy)$('settleDialog').close();});$('settleDialog').addEventListener('cancel',e=>{if($('settleForm').dataset.busy)e.preventDefault();});
$('settleForm').addEventListener('submit',e=>{e.preventDefault();const row=state.settling,date=$('settleDate').value;let amount;try{amount=cents($('settleValue').value);if(amount>row.outstandingCents)throw new Error(`O valor ultrapassa o restante de ${money(row.outstandingCents)}.`);}catch(error){$('settleError').textContent=errorMessage(error);return;}formTask(e.currentTarget,'settleError',async()=>{await write({type:'payment',collection:row.collection,id:row.entryId,occurrenceId:row.id,paymentId:crypto.randomUUID(),expectedRevision:row.revision,cents:amount,date});$('settleDialog').close();notify(row.collection==='receitas'?'Recebimento registrado.':'Pagamento registrado.');});});
$('exportButton').addEventListener('click',()=>{if(!state.ready)return;const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`meu-financeiro-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('clearButton').addEventListener('click',()=>{if(!state.ready)return;state.clearRevision=state.data.revision;$('clearForm').reset();$('clearError').textContent='';$('clearDialog').showModal();});
$('cancelClear').addEventListener('click',()=>{if(!$('clearForm').dataset.busy)$('clearDialog').close();});$('clearDialog').addEventListener('cancel',e=>{if($('clearForm').dataset.busy)e.preventDefault();});
$('clearForm').addEventListener('submit',e=>{e.preventDefault();if($('clearConfirmation').value!=='APAGAR')return;formTask(e.currentTarget,'clearError',async()=>{await write({type:'clear',expectedRevision:state.clearRevision});$('clearDialog').close();notify('Dados financeiros apagados.');});});
async function authChanged(user){
  const session=++state.session;state.unsubscribe?.();state.unsubscribe=null;state.uid=user?.uid||null;state.ready=false;state.profile={};state.data=normalize();
  setSettingsMenu(false);document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());state.editing=null;state.dirty=false;state.currentPage='inicio';state.visitedPages=new Set();state.dashboardAnimated=false;state.metricAnimationToken++;state.connectionNotified=false;state.incomeVisibleCount=30;$('notice').hidden=true;
  for(const id of ['incomeList','expenseList','economyList','notesList'])$(id).replaceChildren();for(const id of ['incomeTotal','expenseTotal','balanceTotal','actualBalanceTotal','incomeForecast','incomeReceivable','expensePaid','expensePayable','economyBalance'])$(id).textContent='R$ 0,00';$('actualSummary').textContent='';$('reviewNotice').hidden=true;
  renderProfile();$('commitmentValue').textContent='0%';$('commitmentBar').style.width='0%';$('analysisIncomeShare').textContent='0%';$('analysisExpenseShare').textContent='0%';$('analysisIncomeBar').style.width='0%';$('analysisExpenseBar').style.width='0%';$('monthStatus').textContent='Sem dados';$('monthStatus').dataset.tone='neutral';$('trendIcon').textContent='→';$('monthDescription').textContent='Sem movimentação no período.';$('profilePhoto').value='';$('noteText').value='';$('auth').hidden=!!user;$('app').hidden=!user;$('authLoading').hidden=true;
  $('senhaLogin').value='';$('senhaLogin').type='password';$('toggleLoginPassword').setAttribute('aria-pressed','false');$('toggleLoginPassword').setAttribute('aria-label','Mostrar senha');$('toggleLoginPassword').title='Mostrar senha';$('toggleLoginPassword').querySelector('.password-icon-show').hidden=false;$('toggleLoginPassword').querySelector('.password-icon-hide').hidden=true;$('senhaCadastro').value='';$('confirmaSenha').value='';$('sexoCadastro').value='';
  if(!user){showAuth('loginForm');renderProfile();return;}
  showPage('inicio',{animate:false,focus:false});updateConnection();
  state.unsubscribe=repository.watchFinance(user.uid,data=>{if(session!==state.session)return;state.data=data;state.ready=true;updateConnection();render();maybeStartProductTour();},error=>{if(session!==state.session)return;state.ready=false;$('connectionStatus').textContent=errorMessage(error);notify(errorMessage(error),true);});
  try{const profile=await repository.getProfile(user.uid);if(session===state.session){state.profile=profile;const cloudTheme=['claro','escuro','margaridas'].includes(profile.temaPadrao)?profile.temaPadrao:$('themeSelect').value;const cloudFont=[...$('fontSelect').options].some(option=>option.value===profile.fontePadrao)?profile.fontePadrao:$('fontSelect').value;$('themeSelect').value=cloudTheme||'claro';$('fontSelect').value=cloudFont||'Urbanist, sans-serif';remember('temaSolon',$('themeSelect').value);remember('fonteSolon',$('fontSelect').value);applyAppearance();renderProfile();if(!profile.nome||!profile.sobrenome)notify('Complete seu nome e sobrenome em Configurações.');}}catch(error){if(session===state.session)notify(errorMessage(error),true);}
}
try{repository=await import('./repository.js');repository.watchAuth(authChanged);}catch{ $('authLoading').hidden=true;$('authError').textContent='Não foi possível carregar o acesso. Verifique sua conexão e recarregue a página.'; }

addEventListener('beforeunload',event=>{if(state.dirty||state.writing){event.preventDefault();event.returnValue='';}});