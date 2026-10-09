/* nfcwork.ma — Espace client & gestion des factures (Firebase) */
(function(){
"use strict";

/* ---------- Firebase ---------- */
if(!window.FIREBASE_CONFIG||String(window.FIREBASE_CONFIG.apiKey).includes("COLLEZ")){
  document.getElementById("app").innerHTML='<div class="empty"><h3>Configuration manquante</h3><p>Remplissez le fichier config.js avec les informations de votre projet Firebase (voir GUIDE.md).</p></div>';
  return;
}
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth=firebase.auth();
const fs=firebase.firestore();
auth.languageCode="fr";
const ADMIN=String(window.ADMIN_EMAIL||"").trim().toLowerCase();

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const app=$("#app");
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>(Math.round((+n||0)*100)/100).toLocaleString("fr-MA",{minimumFractionDigits:2,maximumFractionDigits:2});
const dh=n=>fmt(n)+" DH";
const today=()=>new Date().toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date(d+"T00:00:00");x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const fdate=d=>d?new Date(d+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—";
const initials=n=>(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
function totals(inv){
  const sub=(inv.lines||[]).reduce((a,l)=>a+(+l.qty||0)*(+l.price||0),0);
  const rate=inv.tva?(+inv.tvaRate||0):0;const tva=sub*rate/100;
  return {sub,tva,rate,total:sub+tva};
}
function status(inv){
  if(inv.status==="paid")return["paid","Payée"];
  if(inv.status==="draft")return["draft","Brouillon"];
  if(inv.due&&inv.due<today())return["late","En retard"];
  return["sent","Envoyée"];
}
const authMsg=e=>({
  "auth/invalid-credential":"E-mail ou mot de passe incorrect.","auth/wrong-password":"E-mail ou mot de passe incorrect.",
  "auth/user-not-found":"Aucun compte avec cet e-mail.","auth/email-already-in-use":"Un compte existe déjà avec cet e-mail : connectez-vous.",
  "auth/weak-password":"Mot de passe trop court (6 caractères minimum).","auth/invalid-email":"Adresse e-mail invalide.",
  "auth/too-many-requests":"Trop de tentatives. Réessayez dans quelques minutes.","auth/network-request-failed":"Pas de connexion Internet."
}[e&&e.code]||"Une erreur est survenue, réessayez.");

/* ---------- state ---------- */
const S={services:[],clients:[],invoices:[],settings:{}};
const P={client:null,invoices:[],ready:false};
let role=null,user=null,tab="home",ptab="inv",invFilter="all",subs=[],confirmKey=null,draft=null;
const clientById=id=>S.clients.find(c=>c.id===id);
const unsubAll=()=>{subs.forEach(u=>{try{u()}catch(e){}});subs=[]};
const listen=(q,fn)=>subs.push(q.onSnapshot(fn,err=>{console.error(err);toast("Accès refusé ou connexion perdue.")}));
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));

/* public settings (name on login screen) */
fs.doc("settings/business").onSnapshot(s=>{S.settings=s.exists?s.data():{};$("#bizName").textContent=S.settings.name||"nfcwork.ma";if(role)render()},()=>{});

/* ---------- auth flow ---------- */
let authMode="login";
auth.onAuthStateChanged(u=>{
  unsubAll();closeModal();user=u;role=null;
  $("#tabs").hidden=true;$("#settingsBtn").hidden=true;$("#logoutBtn").hidden=!u;
  if(!u){$("#modeLabel").textContent="Espace client";renderAuth();return}
  if(!u.emailVerified){renderVerify();return}
  const email=(u.email||"").toLowerCase();
  if(email===ADMIN)startAdmin();else startClient(email);
});
function renderAuth(){
  const t={login:["Connexion","Accédez à vos factures et à votre espace."],signup:["Créer un compte","Utilisez l’e-mail que vous avez donné à "+esc(S.settings.name||"nfcwork.ma")+"."],reset:["Mot de passe oublié","Recevez un lien pour choisir un nouveau mot de passe."]}[authMode];
  app.innerHTML=`<div class="auth"><div class="card"><h2>${t[0]}</h2><p class="sub">${t[1]}</p>
  <form id="authForm" class="stack">
    <label class="f">E-mail<input id="a-email" type="email" autocomplete="email" required></label>
    ${authMode!=="reset"?`<label class="f">Mot de passe<input id="a-pass" type="password" minlength="6" autocomplete="${authMode==="signup"?"new-password":"current-password"}" required></label>`:""}
    <p class="err" id="a-err"></p>
    <button class="btn primary">${authMode==="login"?"Se connecter":authMode==="signup"?"Créer mon compte":"Envoyer le lien"}</button>
  </form>
  <div class="row between" style="margin-top:14px">
    ${authMode==="login"?`<button class="linkbtn" data-amode="signup">Créer un compte</button><button class="linkbtn" data-amode="reset">Mot de passe oublié ?</button>`:`<button class="linkbtn" data-amode="login">← Retour à la connexion</button>`}
  </div></div></div>`;
  $("#authForm").onsubmit=async e=>{e.preventDefault();
    const email=$("#a-email").value.trim(),pass=authMode!=="reset"?$("#a-pass").value:"";const btn=e.target.querySelector("button");btn.disabled=true;$("#a-err").textContent="";
    try{
      if(authMode==="login")await auth.signInWithEmailAndPassword(email,pass);
      else if(authMode==="signup"){const c=await auth.createUserWithEmailAndPassword(email,pass);await c.user.sendEmailVerification();}
      else{await auth.sendPasswordResetEmail(email);authMode="login";renderAuth();toast("Lien envoyé : vérifiez votre boîte mail.");return}
    }catch(err){$("#a-err").textContent=authMsg(err);btn.disabled=false}
  };
}
function renderVerify(){
  app.innerHTML=`<div class="auth"><div class="card"><h2>Vérifiez votre e-mail</h2>
  <p class="sub">Nous avons envoyé un lien à <b>${esc(user.email)}</b>. Cliquez dessus, puis revenez ici. Pensez à regarder dans les spams.</p>
  <div class="stack"><button class="btn primary" data-verified>J’ai cliqué sur le lien</button><button class="btn" data-resend>Renvoyer l’e-mail</button></div></div></div>`;
}

/* ---------- ADMIN ---------- */
function startAdmin(){
  role="admin";$("#tabs").hidden=false;$("#settingsBtn").hidden=false;$("#modeLabel").textContent="Espace gestion";
  listen(fs.collection("services"),s=>{S.services=rows(s).sort((a,b)=>(a.name||"").localeCompare(b.name||""));render()});
  listen(fs.collection("clients"),s=>{S.clients=rows(s).sort((a,b)=>(a.name||"").localeCompare(b.name||""));render()});
  listen(fs.collection("invoices"),s=>{S.invoices=rows(s).sort((a,b)=>(b.number||"").localeCompare(a.number||""));render()});
  render();
}
/* ---------- CLIENT ---------- */
function startClient(email){
  role="client";P.ready=false;P.client=null;P.invoices=[];$("#modeLabel").textContent="Espace client";
  listen(fs.collection("services"),s=>{S.services=rows(s).sort((a,b)=>(a.name||"").localeCompare(b.name||""));render()});
  listen(fs.collection("clients").where("email","==",email),s=>{P.client=s.empty?null:rows(s)[0];P.ready=true;render()});
  listen(fs.collection("invoices").where("clientEmail","==",email).where("visible","==",true),s=>{P.invoices=rows(s).sort((a,b)=>(b.number||"").localeCompare(a.number||""));render()});
  render();
}

/* ---------- render ---------- */
function render(){
  if(!role)return;
  if(role==="client"){renderPortal();return}
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===tab?"page":"false"));
  ({home:renderHome,invoices:renderInvoices,clients:renderClients,services:renderServices})[tab]();
}
function invRow(inv){
  const c=clientById(inv.clientId);const[st,lab]=status(inv);const t=totals(inv);
  return `<button class="item" data-open-inv="${esc(inv.id)}">
    <div class="main"><div class="t">${esc(c?c.name:"Client supprimé")}</div><div class="s"><span class="num">${esc(inv.number)}</span> · ${fdate(inv.date)}</div></div>
    <div class="amt"><div class="num">${dh(t.total)}</div><span class="pill ${st}">${lab}</span></div></button>`;
}
function renderHome(){
  const all=S.invoices,y=String(new Date().getFullYear());
  const paidYear=all.filter(i=>i.status==="paid"&&(i.date||"").startsWith(y)).reduce((a,i)=>a+totals(i).total,0);
  const open=all.filter(i=>i.status==="sent"),late=open.filter(i=>i.due&&i.due<today());
  const openAmt=open.reduce((a,i)=>a+totals(i).total,0),lateAmt=late.reduce((a,i)=>a+totals(i).total,0);
  app.innerHTML=`
  <div class="section-head"><div><div class="eyebrow">${new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div><h2>Tableau de bord</h2></div>
  <button class="btn primary" data-new-inv>＋ Nouvelle facture</button></div>
  ${!all.length&&!S.clients.length?`<div class="notice">Pour démarrer : remplissez les <b>Paramètres</b>, ajoutez vos <b>services</b>, puis vos <b>clients</b> (avec leur e-mail), et créez votre première facture.</div>`:""}
  <div class="kpis">
    <div class="kpi lead"><div class="eyebrow">Encaissé ${y}</div><b>${fmt(paidYear)} <small>DH</small></b></div>
    <div class="kpi"><div class="eyebrow">À encaisser</div><b>${fmt(openAmt)} <small>DH</small></b></div>
    <div class="kpi"><div class="eyebrow">En retard</div><b style="color:${late.length?"var(--bad)":"inherit"}">${fmt(lateAmt)} <small>DH</small></b></div>
    <div class="kpi"><div class="eyebrow">Clients</div><b>${S.clients.length}</b></div>
  </div>
  ${late.length?`<div class="section-head"><h3>À relancer</h3></div><div class="list" style="margin-bottom:22px">${late.map(invRow).join("")}</div>`:""}
  <div class="section-head"><h3>Dernières factures</h3>${all.length?`<button class="btn sm ghost" data-goto="invoices">Tout voir</button>`:""}</div>
  ${all.length?`<div class="list">${all.slice(0,5).map(invRow).join("")}</div>`:`<div class="empty"><h3>Aucune facture pour l’instant</h3><p>Vos factures apparaîtront ici avec leur statut.</p><button class="btn primary" data-new-inv>Créer une facture</button></div>`}`;
}
function renderInvoices(){
  const f={all:"Toutes",sent:"Envoyées",late:"En retard",paid:"Payées",draft:"Brouillons"};
  const list=S.invoices.filter(i=>invFilter==="all"||status(i)[0]===invFilter);
  app.innerHTML=`<div class="section-head"><h2>Factures</h2><button class="btn primary" data-new-inv>＋ Nouvelle</button></div>
  <div class="filters">${Object.entries(f).map(([k,v])=>`<button class="chip" data-filter="${k}" aria-pressed="${invFilter===k}">${v}</button>`).join("")}</div>
  ${list.length?`<div class="list">${list.map(invRow).join("")}</div>`:`<div class="empty"><h3>Rien ici</h3><p>${S.invoices.length?"Aucune facture avec ce statut.":"Créez votre première facture."}</p></div>`}`;
}
function renderClients(){
  app.innerHTML=`<div class="section-head"><h2>Clients</h2><button class="btn primary" data-new-client>＋ Client</button></div>
  ${S.clients.length?`<div class="list">${S.clients.map(c=>{
    const inv=S.invoices.filter(i=>i.clientId===c.id);const due=inv.filter(i=>i.status==="sent").reduce((a,i)=>a+totals(i).total,0);
    return `<button class="item" data-open-client="${esc(c.id)}"><div class="avatar">${esc(initials(c.name))}</div>
    <div class="main"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.email||c.phone||"Pas d’e-mail : pas d’accès à l’espace")}</div></div>
    <div class="amt"><div class="s muted" style="font-size:12px">${inv.length} facture${inv.length>1?"s":""}</div>${due?`<div class="num" style="color:var(--warn)">${dh(due)}</div>`:""}</div></button>`}).join("")}</div>`:
  `<div class="empty"><h3>Aucun client</h3><p>Ajoutez un client avec son e-mail : il pourra créer son compte et voir ses factures.</p><button class="btn primary" data-new-client>Ajouter un client</button></div>`}`;
}
function renderServices(){
  app.innerHTML=`<div class="section-head"><div><h2>Services</h2><div class="muted" style="font-size:13.5px">Ce catalogue est visible par vos clients connectés.</div></div><button class="btn primary" data-new-service>＋ Service</button></div>
  ${S.services.length?`<div class="list">${S.services.map(s=>`<button class="item" data-open-service="${esc(s.id)}"><div class="main"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.desc||"")}</div></div><div class="amt num">${dh(s.price)}${s.unit?`<div class="s muted" style="font-size:12px">/ ${esc(s.unit)}</div>`:""}</div></button>`).join("")}</div>`:
  `<div class="empty"><h3>Catalogue vide</h3><p>Ajoutez ce que vous vendez : carte NFC personnalisée, plaque avis Google…</p><button class="btn primary" data-new-service>Ajouter un service</button></div>`}`;
}
function contactHtml(){const b=S.settings;return b.phone||b.email?`<div class="paper" style="margin-top:22px"><div class="eyebrow">Contact ${esc(b.name||"nfcwork.ma")}</div><div style="margin-top:6px" class="num">${esc(b.phone||"")}</div><div>${esc(b.email||"")}</div></div>`:""}
function renderPortal(){
  const tabs=`<div class="filters"><button class="chip" data-ptab="inv" aria-pressed="${ptab==="inv"}">Mes factures</button><button class="chip" data-ptab="svc" aria-pressed="${ptab==="svc"}">Nos services</button></div>`;
  if(ptab==="svc"){
    app.innerHTML=tabs+`<div class="hero-pub"><div class="eyebrow tap-arc">Technologie sans contact</div><h2>Nos services</h2><p>${esc(S.settings.tagline||"Cartes de visite NFC et solutions sans contact pour professionnels au Maroc.")}</p></div>
    ${S.services.length?`<div class="svc-grid">${S.services.map(s=>`<div class="svc"><h3>${esc(s.name)}</h3><p>${esc(s.desc||"")}</p><div class="price">${dh(s.price)}${s.unit?` <span class="muted" style="font-size:13px">/ ${esc(s.unit)}</span>`:""}</div></div>`).join("")}</div>`:`<div class="empty"><p>Catalogue en préparation.</p></div>`}${contactHtml()}`;return}
  if(!P.ready){app.innerHTML=tabs+`<div class="empty"><h3>Chargement…</h3></div>`;return}
  if(!P.client){app.innerHTML=tabs+`<div class="empty"><h3>Compte pas encore relié</h3><p>Votre e-mail <b>${esc(user.email)}</b> n’est pas encore enregistré comme client. Contactez ${esc(S.settings.name||"nfcwork.ma")} pour qu’il l’ajoute à votre fiche.</p></div>${contactHtml()}`;return}
  const inv=P.invoices;
  const due=inv.filter(i=>i.status!=="paid").reduce((a,i)=>a+totals(i).total,0),paid=inv.filter(i=>i.status==="paid").reduce((a,i)=>a+totals(i).total,0);
  app.innerHTML=tabs+`<div class="section-head" style="margin-top:6px"><div><div class="eyebrow">Espace client</div><h2>Bonjour ${esc(P.client.name)}</h2></div></div>
  <div class="kpis" style="margin-top:0"><div class="kpi ${due?"lead":""}"><div class="eyebrow">Reste à payer</div><b>${fmt(due)} <small>DH</small></b></div><div class="kpi"><div class="eyebrow">Déjà payé</div><b>${fmt(paid)} <small>DH</small></b></div></div>
  ${inv.length?`<div class="list">${inv.map(i=>{const[st,lab]=status(i);return `<button class="item" data-popen="${esc(i.id)}"><div class="main"><div class="t num">${esc(i.number)}</div><div class="s">${fdate(i.date)} · échéance ${fdate(i.due)}</div></div><div class="amt"><div class="num">${dh(totals(i).total)}</div><span class="pill ${st}">${lab}</span></div></button>`}).join("")}</div>`:`<div class="empty"><h3>Aucune facture</h3><p>Vos factures apparaîtront ici dès leur émission.</p></div>`}
  ${contactHtml()}`;
}

/* ---------- modals ---------- */
function openModal(html){$("#modal").innerHTML=`<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;const f=$("#modal input,#modal select");if(f)f.focus()}
function closeModal(){$("#modal").innerHTML=""}
const head=(t,extra="")=>`<div class="sheet-head"><h2 style="font-size:20px">${t}</h2><div class="row">${extra}<button class="btn sm ghost" data-close>Fermer</button></div></div>`;
async function guard(p,ok){try{await p;if(ok)toast(ok);return true}catch(e){console.error(e);toast(e&&e.code==="permission-denied"?"Action refusée : vérifiez l’e-mail admin dans config.js et firestore.rules.":"Échec de l’enregistrement, réessayez.");return false}}

function serviceForm(s){
  s=s||{};
  openModal(`${head(s.id?"Modifier le service":"Nouveau service")}
  <form id="svcForm" class="stack">
   <label class="f">Nom<input id="sv-name" required value="${esc(s.name)}" placeholder="Carte de visite NFC PVC"></label>
   <label class="f">Description<textarea id="sv-desc" placeholder="Impression recto-verso + configuration du profil">${esc(s.desc)}</textarea></label>
   <div class="grid2"><label class="f">Prix HT (DH)<input id="sv-price" type="number" min="0" step="0.01" required value="${esc(s.price??"")}"></label>
   <label class="f">Unité<input id="sv-unit" value="${esc(s.unit||"")}" placeholder="carte, mois, pièce…"></label></div>
   <div class="row between">${s.id?`<button type="button" class="btn danger" data-del-service="${esc(s.id)}">Supprimer</button>`:"<span></span>"}<button class="btn primary">Enregistrer</button></div>
  </form>`);
  $("#svcForm").onsubmit=async e=>{e.preventDefault();
    const data={name:$("#sv-name").value.trim(),desc:$("#sv-desc").value.trim(),price:+$("#sv-price").value||0,unit:$("#sv-unit").value.trim()};
    const ref=s.id?fs.doc("services/"+s.id):fs.collection("services").doc();
    if(await guard(ref.set(data),"Service enregistré"))closeModal();};
}
function clientForm(c){
  c=c||{};
  openModal(`${head(c.id?"Modifier le client":"Nouveau client")}
  <form id="cliForm" class="stack">
   <label class="f">Nom ou société<input id="cl-name" required value="${esc(c.name)}"></label>
   <label class="f">E-mail (sert à se connecter à l’espace client)<input id="cl-email" type="email" value="${esc(c.email)}"></label>
   <div class="grid2"><label class="f">Téléphone<input id="cl-phone" type="tel" value="${esc(c.phone)}" placeholder="06 …"></label>
   <label class="f">Ville<input id="cl-city" value="${esc(c.city)}"></label></div>
   <div class="grid2"><label class="f">ICE<input id="cl-ice" inputmode="numeric" value="${esc(c.ice)}" placeholder="15 chiffres"></label>
   <label class="f">Adresse<input id="cl-addr" value="${esc(c.address)}"></label></div>
   <div class="row between">${c.id?`<button type="button" class="btn danger" data-del-client="${esc(c.id)}">Supprimer</button>`:"<span></span>"}<button class="btn primary">Enregistrer</button></div>
  </form>`);
  $("#cliForm").onsubmit=async e=>{e.preventDefault();
    const email=$("#cl-email").value.trim().toLowerCase();
    if(email&&email===ADMIN){toast("Cet e-mail est celui de l’administrateur.");return}
    if(email&&S.clients.some(x=>x.email===email&&x.id!==c.id)){toast("Cet e-mail est déjà utilisé par un autre client.");return}
    const data={name:$("#cl-name").value.trim(),email,phone:$("#cl-phone").value.trim(),city:$("#cl-city").value.trim(),ice:$("#cl-ice").value.trim(),address:$("#cl-addr").value.trim()};
    const ref=c.id?fs.doc("clients/"+c.id):fs.collection("clients").doc();
    const batch=fs.batch();batch.set(ref,data);
    if(c.id&&c.email!==email)S.invoices.filter(i=>i.clientId===c.id).slice(0,450).forEach(i=>batch.update(fs.doc("invoices/"+i.id),{clientEmail:email}));
    if(await guard(batch.commit(),"Client enregistré"))closeModal();};
}
function clientView(c){
  const inv=S.invoices.filter(i=>i.clientId===c.id);
  const paid=inv.filter(i=>i.status==="paid").reduce((a,i)=>a+totals(i).total,0),due=inv.filter(i=>i.status==="sent").reduce((a,i)=>a+totals(i).total,0);
  openModal(`${head(esc(c.name),`<button class="btn sm" data-edit-client="${esc(c.id)}">Modifier</button>`)}
  <div class="muted" style="font-size:14px;margin-bottom:10px">${[c.email,c.phone,c.city,c.ice?"ICE "+c.ice:""].filter(Boolean).map(esc).join(" · ")||"Aucune coordonnée"}</div>
  ${c.email?`<div class="notice" style="margin-bottom:12px">Le client crée son compte avec <b>${esc(c.email)}</b> sur cette page et voit ses factures envoyées et payées.</div>`:`<div class="notice" style="margin-bottom:12px">Ajoutez un e-mail pour donner accès à l’espace client.</div>`}
  <div class="kpis" style="margin-top:0"><div class="kpi"><div class="eyebrow">Payé</div><b>${fmt(paid)} <small>DH</small></b></div><div class="kpi"><div class="eyebrow">Reste dû</div><b>${fmt(due)} <small>DH</small></b></div></div>
  <div class="section-head"><h3>Factures</h3><button class="btn sm primary" data-new-inv="${esc(c.id)}">＋ Facture</button></div>
  ${inv.length?`<div class="list">${inv.map(invRow).join("")}</div>`:`<div class="empty"><p>Pas encore de facture pour ce client.</p></div>`}`);
}
function nextNumber(){
  const pre=`FAC-${new Date().getFullYear()}-`;
  const max=S.invoices.map(i=>i.number||"").filter(n=>n.startsWith(pre)).map(n=>parseInt(n.slice(pre.length),10)||0).reduce((a,b)=>Math.max(a,b),0);
  return pre+String(max+1).padStart(3,"0");
}
const blankLine=()=>({serviceId:"",desc:"",qty:1,price:0});
function invoiceForm(inv,presetClient){
  if(!S.clients.length){toast("Ajoutez d’abord un client.");tab="clients";render();clientForm();return}
  draft=inv?JSON.parse(JSON.stringify(inv)):{number:nextNumber(),clientId:presetClient||S.clients[0].id,date:today(),due:addDays(today(),15),tva:true,tvaRate:20,status:"sent",notes:"",lines:[blankLine()]};
  if(!draft.lines||!draft.lines.length)draft.lines=[blankLine()];
  drawInvoiceForm();
}
function totHtml(t){return `<div><span class="muted">Total HT</span><span>${dh(t.sub)}</span></div>${t.rate?`<div><span class="muted">TVA ${t.rate} %</span><span>${dh(t.tva)}</span></div>`:""}<div class="grand"><span>Total TTC</span><span>${dh(t.total)}</span></div>`}
function drawInvoiceForm(){
  const d=draft;
  openModal(`${head(d.id?"Modifier "+esc(d.number):"Nouvelle facture")}
  <form id="invForm" class="stack">
   <div class="grid2"><label class="f">Client<select id="iv-client">${S.clients.map(c=>`<option value="${esc(c.id)}"${c.id===d.clientId?" selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
   <label class="f">N° facture<input id="iv-num" class="num" value="${esc(d.number)}" required></label></div>
   <div class="grid2"><label class="f">Date<input id="iv-date" type="date" value="${esc(d.date)}"></label>
   <label class="f">Échéance<input id="iv-due" type="date" value="${esc(d.due)}"></label></div>
   <div class="eyebrow" style="margin-top:4px">Lignes</div>
   ${d.lines.map((l,i)=>`<div class="line">
     <label class="f desc">Service<select data-l-svc="${i}"><option value="">— Ligne libre —</option>${S.services.map(s=>`<option value="${esc(s.id)}"${s.id===l.serviceId?" selected":""}>${esc(s.name)} · ${dh(s.price)}</option>`).join("")}</select></label>
     <label class="f">Désignation<input data-l-desc="${i}" value="${esc(l.desc)}"></label>
     <label class="f">Qté<input data-l-qty="${i}" type="number" min="0" step="1" class="num" value="${esc(l.qty)}"></label>
     <label class="f">P.U. HT<input data-l-price="${i}" type="number" min="0" step="0.01" class="num" value="${esc(l.price)}"></label>
     <button type="button" class="iconbtn" data-l-del="${i}" aria-label="Supprimer la ligne">✕</button></div>`).join("")}
   <button type="button" class="btn sm" data-l-add style="align-self:flex-start">＋ Ajouter une ligne</button>
   <div class="row between">
    <label class="check"><input type="checkbox" id="iv-tva"${d.tva?" checked":""}> Appliquer la TVA</label>
    <label class="f" style="flex-direction:row;align-items:center;gap:6px">Taux<input id="iv-rate" type="number" min="0" max="100" class="num" style="width:70px" value="${esc(d.tvaRate)}"${d.tva?"":" disabled"}>%</label>
   </div>
   <div class="totals num" id="iv-totals">${totHtml(totals(d))}</div>
   <label class="f">Statut<select id="iv-status">${[["draft","Brouillon (invisible pour le client)"],["sent","Envoyée"],["paid","Payée"]].map(([k,v])=>`<option value="${k}"${d.status===k?" selected":""}>${v}</option>`).join("")}</select></label>
   <label class="f">Note (conditions, RIB…)<textarea id="iv-notes">${esc(d.notes)}</textarea></label>
   <div class="row between"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary">Enregistrer la facture</button></div>
  </form>`);
  const form=$("#invForm");
  form.addEventListener("input",e=>{syncDraft();if(e.target.id==="iv-tva")$("#iv-rate").disabled=!draft.tva;$("#iv-totals").innerHTML=totHtml(totals(draft))});
  form.addEventListener("change",e=>{const i=e.target.dataset.lSvc;if(i!=null){syncDraft();const s=S.services.find(x=>x.id===e.target.value);if(s){draft.lines[i].desc=s.name;draft.lines[i].price=s.price}drawInvoiceForm()}});
  form.onsubmit=async e=>{e.preventDefault();syncDraft();
    draft.lines=draft.lines.filter(l=>l.desc||l.price);
    if(!draft.lines.length){toast("Ajoutez au moins une ligne.");draft.lines.push(blankLine());return}
    const c=clientById(draft.clientId)||{};
    const {id,...data}=draft;data.clientEmail=c.email||"";data.visible=data.status!=="draft";data.total=totals(data).total;
    const ref=id?fs.doc("invoices/"+id):fs.collection("invoices").doc();
    if(await guard(ref.set(data),"Facture enregistrée")){closeModal();invoiceView({id:ref.id,...data})}};
}
function syncDraft(){
  const v=id=>{const el=document.getElementById(id);return el?el.value:""};
  draft.clientId=v("iv-client");draft.number=v("iv-num").trim();draft.date=v("iv-date");draft.due=v("iv-due");
  draft.tva=$("#iv-tva").checked;draft.tvaRate=+v("iv-rate")||0;draft.status=v("iv-status");draft.notes=v("iv-notes");
  draft.lines.forEach((l,i)=>{const q=s=>document.querySelector(`[data-l-${s}="${i}"]`);l.serviceId=q("svc").value;l.desc=q("desc").value;l.qty=+q("qty").value||0;l.price=+q("price").value||0});
}
function paperHtml(inv,c){
  const t=totals(inv),b=S.settings;
  return `<div class="paper">
    <div class="paper-head"><div><div style="font-family:var(--display);font-size:20px;font-weight:700">${esc(b.name||"nfcwork.ma")}</div><div class="muted" style="font-size:13px">${[b.address,b.phone,b.email,b.ice?"ICE "+b.ice:""].filter(Boolean).map(esc).join("<br>")}</div></div>
    <div style="text-align:right"><div class="eyebrow">Facture</div><div class="num" style="font-size:16px">${esc(inv.number)}</div><div class="muted" style="font-size:13px">Émise le ${fdate(inv.date)}<br>Échéance ${fdate(inv.due)}</div></div></div>
    <div style="margin-bottom:14px"><div class="eyebrow">Facturé à</div><b>${esc(c.name)}</b><div class="muted" style="font-size:13px">${[c.address,c.city,c.phone,c.ice?"ICE "+c.ice:""].filter(Boolean).map(esc).join(" · ")}</div></div>
    <div class="tbl"><table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">P.U. HT</th><th class="r">Montant</th></tr></thead>
    <tbody>${(inv.lines||[]).map(l=>`<tr><td>${esc(l.desc)}</td><td class="r num">${esc(l.qty)}</td><td class="r num">${fmt(l.price)}</td><td class="r num">${fmt(l.qty*l.price)}</td></tr>`).join("")}</tbody></table></div>
    <div class="totals num" style="margin-top:12px">${totHtml(t)}</div>
    ${inv.notes?`<p class="muted" style="font-size:13px;white-space:pre-wrap;margin:14px 0 0">${esc(inv.notes)}</p>`:""}
  </div>`;
}
function invoiceView(inv){
  const c=clientById(inv.clientId)||{name:"Client supprimé"};const[st,lab]=status(inv);
  openModal(`${head(esc(inv.number),`<span class="pill ${st}">${lab}</span>`)}${paperHtml(inv,c)}
  <div class="row" style="margin-top:14px">
    ${inv.status!=="paid"?`<button class="btn primary" data-mark-paid="${esc(inv.id)}">Marquer payée</button>`:`<button class="btn" data-mark-unpaid="${esc(inv.id)}">Marquer non payée</button>`}
    <button class="btn" data-edit-inv="${esc(inv.id)}">Modifier</button>
    <button class="btn" data-print-inv="${esc(inv.id)}">Imprimer / PDF</button>
    <button class="btn danger" data-del-inv="${esc(inv.id)}">Supprimer</button>
  </div>`);
}
function portalInvoiceView(i){
  const[st,lab]=status(i);
  openModal(`${head(esc(i.number),`<span class="pill ${st}">${lab}</span>`)}${paperHtml(i,P.client||{})}
  <div class="row" style="margin-top:14px"><button class="btn primary" data-pprint="${esc(i.id)}">Imprimer / PDF</button></div>`);
}
function settingsForm(){
  const b=S.settings;
  openModal(`${head("Paramètres de l’entreprise")}
  <form id="setForm" class="stack">
   <p class="muted" style="margin:0;font-size:13.5px">Ces informations apparaissent sur chaque facture et dans l’espace client.</p>
   <label class="f">Nom commercial<input id="st-name" value="${esc(b.name||"nfcwork.ma")}"></label>
   <label class="f">Accroche<input id="st-tag" value="${esc(b.tagline||"")}" placeholder="Cartes de visite NFC pour professionnels"></label>
   <div class="grid2"><label class="f">Téléphone<input id="st-phone" value="${esc(b.phone||"")}"></label><label class="f">E-mail<input id="st-email" value="${esc(b.email||"")}"></label></div>
   <label class="f">Adresse<input id="st-addr" value="${esc(b.address||"")}"></label>
   <label class="f">ICE<input id="st-ice" value="${esc(b.ice||"")}"></label>
   <div class="row between"><span></span><button class="btn primary">Enregistrer</button></div></form>`);
  $("#setForm").onsubmit=async e=>{e.preventDefault();
    const data={name:$("#st-name").value.trim(),tagline:$("#st-tag").value.trim(),phone:$("#st-phone").value.trim(),email:$("#st-email").value.trim(),address:$("#st-addr").value.trim(),ice:$("#st-ice").value.trim()};
    if(await guard(fs.doc("settings/business").set(data),"Paramètres enregistrés"))closeModal();};
}
function printInvoice(inv,c){
  const t=totals(inv),b=S.settings;
  const rows=(inv.lines||[]).map(l=>`<tr><td>${esc(l.desc)}</td><td class=r>${esc(l.qty)}</td><td class=r>${fmt(l.price)}</td><td class=r>${fmt(l.qty*l.price)}</td></tr>`).join("");
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(inv.number)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;color:#05080f;max-width:760px;margin:32px auto;padding:0 20px;font-size:14px}h1{margin:0;font-size:22px}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1e90ff;padding-bottom:14px;margin-bottom:18px}.m{color:#5D6B66;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5D6B66;border-bottom:1px solid #ccc;padding:6px}td{padding:8px 6px;border-bottom:1px solid #e3e3e3}.r{text-align:right}.tot{margin-left:auto;width:260px;margin-top:14px}.tot div{display:flex;justify-content:space-between;padding:2px 0}.g{font-weight:bold;font-size:16px;border-top:1px solid #ccc;padding-top:6px!important}.bar{margin-bottom:20px}@media print{.bar{display:none}body{margin:0}}</style></head><body>
<div class="bar"><button onclick="print()" style="padding:10px 16px;font-size:15px">Imprimer / Enregistrer en PDF</button></div>
<div class="top"><div><h1>${esc(b.name||"nfcwork.ma")}</h1><div class="m">${[b.address,b.phone,b.email,b.ice?"ICE "+b.ice:""].filter(Boolean).map(esc).join("<br>")}</div></div>
<div style="text-align:right"><div class="m">FACTURE</div><b>${esc(inv.number)}</b><div class="m">Date : ${fdate(inv.date)}<br>Échéance : ${fdate(inv.due)}</div></div></div>
<div class="m">Facturé à</div><b>${esc(c.name)}</b><div class="m">${[c.address,c.city,c.phone,c.ice?"ICE "+c.ice:""].filter(Boolean).map(esc).join(" · ")}</div>
<table><thead><tr><th>Désignation</th><th class=r>Qté</th><th class=r>P.U. HT</th><th class=r>Montant (DH)</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>Total HT</span><span>${dh(t.sub)}</span></div>${t.rate?`<div><span>TVA ${t.rate} %</span><span>${dh(t.tva)}</span></div>`:""}<div class="g"><span>Total TTC</span><span>${dh(t.total)}</span></div></div>
${inv.notes?`<p class="m" style="white-space:pre-wrap;margin-top:24px">${esc(inv.notes)}</p>`:""}
${inv.status==="paid"?`<p style="margin-top:24px;color:#1C7C4A;font-weight:bold">PAYÉE</p>`:""}</body></html>`;
  const w=window.open(URL.createObjectURL(new Blob([html],{type:"text/html"})),"_blank");
  if(!w)toast("Autorisez les fenêtres pop-up pour imprimer.");
}

/* ---------- events ---------- */
document.addEventListener("click",async e=>{
  const el=e.target.closest("button,[data-scrim]");if(!el)return;
  if(el.matches("[data-scrim]")){if(e.target===el)closeModal();return}
  const d=el.dataset;
  if(el.id==="logoutBtn"){auth.signOut();return}
  if(d.amode){authMode=d.amode;renderAuth();return}
  if(d.verified!=null){await user.reload();if(auth.currentUser.emailVerified){await auth.currentUser.getIdToken(true);location.reload()}else toast("E-mail pas encore vérifié.");return}
  if(d.resend!=null){try{await user.sendEmailVerification();toast("E-mail renvoyé.")}catch(err){toast(authMsg(err))}return}
  if(d.ptab){ptab=d.ptab;render();return}
  if(d.popen){const i=P.invoices.find(x=>x.id===d.popen);if(i)portalInvoiceView(i);return}
  if(d.pprint){const i=P.invoices.find(x=>x.id===d.pprint);if(i)printInvoice(i,P.client||{});return}
  if(d.close!=null){closeModal();return}
  if(role!=="admin")return;
  if(el.classList.contains("tab")){tab=d.tab;window.scrollTo(0,0);render();return}
  if(d.goto){tab=d.goto;render();return}
  if(d.filter){invFilter=d.filter;render();return}
  if(el.id==="settingsBtn"){settingsForm();return}
  if(d.newInv!=null){invoiceForm(null,d.newInv||null);return}
  if(d.newClient!=null){clientForm();return}
  if(d.newService!=null){serviceForm();return}
  if(d.openInv){const i=S.invoices.find(x=>x.id===d.openInv);if(i){confirmKey=null;invoiceView(i)}return}
  if(d.openClient){const c=clientById(d.openClient);if(c)clientView(c);return}
  if(d.editClient){confirmKey=null;clientForm(clientById(d.editClient));return}
  if(d.openService){confirmKey=null;serviceForm(S.services.find(x=>x.id===d.openService));return}
  if(d.editInv){invoiceForm(S.invoices.find(x=>x.id===d.editInv));return}
  if(d.printInv){const i=S.invoices.find(x=>x.id===d.printInv);if(i)printInvoice(i,clientById(i.clientId)||{});return}
  if(d.lAdd!=null){syncDraft();draft.lines.push(blankLine());drawInvoiceForm();return}
  if(d.lDel!=null){syncDraft();draft.lines.splice(+d.lDel,1);if(!draft.lines.length)draft.lines.push(blankLine());drawInvoiceForm();return}
  if(d.markPaid||d.markUnpaid){const id=d.markPaid||d.markUnpaid,ns=d.markPaid?"paid":"sent";
    if(await guard(fs.doc("invoices/"+id).update({status:ns,visible:true,paidAt:ns==="paid"?today():null}),ns==="paid"?"Facture marquée payée":"Facture remise en attente")){const i=S.invoices.find(x=>x.id===id);if(i)invoiceView({...i,status:ns})}return}
  const del=(key,path)=>{if(confirmKey!==key){confirmKey=key;el.textContent="Confirmer la suppression";return}confirmKey=null;guard(fs.doc(path).delete(),"Supprimé").then(ok=>{if(ok)closeModal()})};
  if(d.delInv){del("i"+d.delInv,"invoices/"+d.delInv);return}
  if(d.delClient){if(S.invoices.some(i=>i.clientId===d.delClient)){toast("Ce client a des factures : supprimez-les d’abord.");return}del("c"+d.delClient,"clients/"+d.delClient);return}
  if(d.delService){del("s"+d.delService,"services/"+d.delService);return}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#modal").innerHTML)closeModal()});
})();
