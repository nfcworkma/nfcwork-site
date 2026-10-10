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
/* images produits du site (assets/img/) proposées pour les services */
const IMAGES=[["assets/img/carte.jpg","Carte de visite NFC"],["assets/img/google.jpg","Plaque avis Google"],["assets/img/menu.jpg","Menu digital NFC + QR"],["assets/img/wifi.jpg","Plaque Wi-Fi"],["assets/img/led.jpg","Caisson LED"],["assets/img/packs.jpg","Packs"]];
const imgSrc=p=>IMAGES.some(x=>x[0]===p)?"../"+p:"";
/* commandes */
const OSTEPS=[["new","Nouvelle"],["confirmed","Confirmée"],["preparing","En préparation"],["ready","Prête"],["delivered","Livrée"]];
const OLABEL={quote:"Devis demandé",...Object.fromEntries(OSTEPS),cancelled:"Annulée"};
const OPILL={quote:"new",new:"new",confirmed:"sent",preparing:"sent",ready:"sent",delivered:"paid",cancelled:"late"};
const oStep=o=>OSTEPS.findIndex(x=>x[0]===o.status);
const oNext=o=>{if(o.status==="quote")return OSTEPS[1];const i=oStep(o);return i>=0&&i<OSTEPS.length-1?OSTEPS[i+1]:null};
const oTotal=o=>(o.lines||[]).reduce((a,l)=>a+(+l.qty||0)*(+l.price||0),0);
const oAmount=o=>o.status==="quote"&&!oTotal(o)?"Sur devis":dh(oTotal(o));
const oPill=o=>`<span class="pill ${OPILL[o.status]||"draft"}">${esc(OLABEL[o.status]||o.status)}</span>`;
const fdt=iso=>iso?new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
function orderNumber(pre="CMD"){const a="ABCDEFGHJKMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<5;i++)s+=a[Math.floor(Math.random()*a.length)];return pre+"-"+s}
function waNumber(p){let d=String(p||"").replace(/\D/g,"");if(d.startsWith("00"))d=d.slice(2);if(d.startsWith("0"))d="212"+d.slice(1);return d.length>=9?d:""}
/* réclamations */
const CSTEPS=[["open","Ouverte"],["progress","En cours"],["resolved","Résolue"]];
const CLABEL=Object.fromEntries(CSTEPS),CPILL={open:"late",progress:"sent",resolved:"paid"};
const cPill=c=>`<span class="pill ${CPILL[c.status]||"draft"}">${esc(CLABEL[c.status]||c.status)}</span>`;
const CLAIM_TYPES=["Retard de livraison","Produit cassé / défectueux","NFC ou QR ne fonctionne pas","Erreur de design ou d'informations","Modifier mes informations","Problème de paiement","Autre"];
/* catalogue du site (../assets/js/catalog.js) : catégories et import */
const CATS=[["carte","Cartes NFC"],["google","Google Reviews"],["menu","Menus"],["wifi","Wi-Fi"],["led","LED"],["packs","Packs"]];
const CATLABEL=Object.fromEntries(CATS);
const CAT_UNIT={carte:"carte",google:"plaque",menu:"",wifi:"plaque",led:"caisson",packs:"pack"};
const svcSort=(a,b)=>{const ia=CATS.findIndex(c=>c[0]===a.category),ib=CATS.findIndex(c=>c[0]===b.category);return (ia<0?99:ia)-(ib<0?99:ib)||(a.order??99)-(b.order??99)||(a.name||"").localeCompare(b.name||"")};
const fromPrice=s=>{const ps=(s.options||[]).filter(o=>!o.yearly).map(o=>+o.price||0);return ps.length?Math.min(...ps):+s.price||0};
const siteConf=()=>typeof CONFIG!=="undefined"?CONFIG:{};
const optTag=t=>t.rec?"Recommandé":t.best?"Best seller":t.prem?"Premium":t.launch?"Prix de lancement":"";
function catalogDocs(){
  if(typeof CATALOG==="undefined")return null;
  const docs=[];
  CATALOG.forEach((c,ci)=>{
    if(c.id==="packs")c.tiers.forEach((t,ti)=>docs.push(["pack-"+t.k,{name:"Pack "+t.n,desc:t.f.fr.join(" · "),price:t.p,oldPrice:t.old||null,unit:CAT_UNIT.packs,category:"packs",image:c.img,tag:optTag(t),options:[],source:"catalog",order:ti}]));
    else docs.push(["cat-"+c.id,{name:c.name.fr,desc:c.intro.fr,short:c.short.fr,price:Math.min(...c.tiers.filter(t=>!t.yr).map(t=>t.p)),oldPrice:null,unit:CAT_UNIT[c.id]||"",category:c.id,image:c.img,tag:"",source:"catalog",order:ci,
      options:c.tiers.map(t=>({key:t.k,name:typeof t.n==="string"?t.n:t.n.fr,price:t.p,features:t.f.fr,tag:optTag(t),yearly:!!t.yr}))}]);
  });
  return docs;
}
/* aide & guides (repris de faq.html, conditions.html, contact.html et du catalogue) */
const GUIDES=[
  ["Utiliser votre carte NFC",["<b>iPhone</b> (XR et plus récent) : déverrouillez l’écran et approchez le <b>haut</b> de l’iPhone de la carte. Touchez la notification qui s’affiche.","<b>Android</b> : vérifiez que le NFC est activé (Paramètres → Connexions → NFC), puis approchez le <b>milieu du dos</b> du téléphone de la carte, écran déverrouillé.","Aucune application n’est nécessaire. Sans NFC, scannez simplement le <b>QR code</b> avec l’appareil photo.","Astuce : une coque épaisse ou métallique peut gêner la lecture."]],
  ["Modifier votre profil digital",["Vos informations (téléphone, réseaux, adresse…) sont modifiables à tout moment, <b>sans changer la carte ou la plaque</b>.","Envoyez-nous les changements sur WhatsApp, ou faites une demande « Modifier mes informations » dans Réclamation / SAV.","Nous mettons à jour et vous confirmons."]],
  ["Installer la plaque Google Reviews",["La plaque arrive <b>déjà programmée</b> vers votre page d’avis Google.","Placez-la là où le client attend : près de la caisse, sur le comptoir ou sur les tables, bien visible.","Testez avec votre propre téléphone : il doit ouvrir votre page d’avis.","Invitez vos clients : « Approchez votre téléphone pour nous laisser un avis ». Sans NFC, ils scannent le QR."]],
  ["Plaque Wi-Fi",["Vos clients se connectent au Wi-Fi <b>sans demander le mot de passe</b> : ils approchent leur téléphone ou scannent le QR.","Modèle Standard : un marqueur est offert pour écrire le nom du réseau et le mot de passe.","Vous changez de mot de passe Wi-Fi ? Contactez-nous pour mettre la plaque à jour."]],
  ["Menu digital NFC + QR",["Placez les supports sur les tables ou au comptoir : le menu s’ouvre d’une touche ou d’un scan.","Changement de prix ou de plats : modification de menu <b>+20 DH</b>, ou <b>abonnement annuel 249 DH</b> (mises à jour illimitées + support toute l’année)."]],
  ["Livraison et délais",["Nous livrons <b>partout au Maroc</b>.","Casablanca : <b>30 DH</b>. Autres villes : frais confirmés avec vous selon la ville.","Le délai est confirmé selon la ville et le design. Vous suivez chaque étape dans « Mes commandes »."]],
  ["Paiement",["<b>Virement bancaire</b> ou <b>cash à la livraison</b>.","Le mode de paiement est confirmé avec vous lors de la confirmation de la commande."]],
  ["Garantie et SAV",["Nous envoyons toujours un <b>aperçu du design</b> et n’imprimons qu’après votre validation.","Produit arrivé défectueux ou qui ne fonctionne pas ? Faites une réclamation : nous trouvons une solution (réparation, reprogrammation ou échange)."]]
];
const FAQ=[["Faut-il une application pour le NFC ?","Non. Il suffit d’approcher le téléphone de la carte ou de la plaque. Sans NFC, on scanne le QR code."],["Ça marche avec iPhone et Android ?","Oui, avec la plupart des smartphones récents. Le QR code fonctionne avec tous les téléphones."],["Quel est le délai de livraison ?","Nous livrons partout au Maroc. Le délai est confirmé selon la ville et le design."],["Combien coûte la livraison ?","Casablanca : 30 DH. Autres villes : confirmé avec vous selon la ville."],["Puis-je voir le design avant impression ?","Oui, nous envoyons toujours un aperçu et n’imprimons qu’après votre accord."],["Puis-je modifier les informations plus tard ?","Oui, à tout moment, sans changer la carte ou la plaque. Modification de menu +20 DH, ou abonnement annuel 249 DH."],["Comment payer ?","Par virement bancaire ou cash à la livraison, confirmé avec vous à la confirmation de la commande."],["J’ai un problème avec ma commande ?","Ouvrez une réclamation depuis « Mes commandes » ou l’onglet Aide : nous vous répondons au plus vite."]];
const authMsg=e=>({
  "auth/invalid-credential":"E-mail ou mot de passe incorrect.","auth/wrong-password":"E-mail ou mot de passe incorrect.",
  "auth/user-not-found":"Aucun compte avec cet e-mail.","auth/email-already-in-use":"Un compte existe déjà avec cet e-mail : connectez-vous.",
  "auth/weak-password":"Mot de passe trop court (6 caractères minimum).","auth/invalid-email":"Adresse e-mail invalide.",
  "auth/too-many-requests":"Trop de tentatives. Réessayez dans quelques minutes.","auth/network-request-failed":"Pas de connexion Internet."
}[e&&e.code]||"Une erreur est survenue, réessayez.");

/* ---------- state ---------- */
const S={services:[],clients:[],invoices:[],orders:[],claims:[],creations:[],mods:[],settings:{}};
const P={client:null,invoices:[],orders:[],claims:[],creations:[],mods:[],ready:false};
let role=null,user=null,tab="home",ptab="home",invFilter="all",ordFilter="open",oseg="orders",catFilter="all",subs=[],confirmKey=null,draft=null;
let cart={},cartNote="",sending=false;
const clientById=id=>S.clients.find(c=>c.id===id);
const unsubAll=()=>{subs.forEach(u=>{try{u()}catch(e){}});subs=[]};
const listen=(q,fn)=>subs.push(q.onSnapshot(fn,err=>{console.error(err);toast("Accès refusé ou connexion perdue.")}));
/* collections récentes (produits NFC, demandes) : si les règles Firestore ne sont pas encore à jour, on reste silencieux */
const listenDiscret=(q,fn)=>subs.push(q.onSnapshot(fn,err=>console.warn("Firestore :",err&&err.code)));
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));

/* public settings (name on login screen) */
fs.doc("settings/business").onSnapshot(s=>{S.settings=s.exists?s.data():{};$("#bizName").textContent=S.settings.name||"nfcwork.ma";if(role)render()},()=>{});

/* ---------- auth flow ---------- */
let authMode="login";
auth.onAuthStateChanged(u=>{
  unsubAll();closeModal();user=u;role=null;
  $("#tabs").hidden=true;$("#ptabs").hidden=true;$("#settingsBtn").hidden=true;$("#profileBtn").hidden=true;$("#logoutBtn").hidden=!u;
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
  listen(fs.collection("services"),s=>{S.services=rows(s).sort(svcSort);render()});
  listen(fs.collection("clients"),s=>{S.clients=rows(s).sort((a,b)=>(a.name||"").localeCompare(b.name||""));render()});
  listen(fs.collection("invoices"),s=>{S.invoices=rows(s).sort((a,b)=>(b.number||"").localeCompare(a.number||""));render()});
  listen(fs.collection("orders"),s=>{S.orders=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  listen(fs.collection("claims"),s=>{S.claims=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  listenDiscret(fs.collection("creations"),s=>{S.creations=rows(s).sort((a,b)=>(tsDate(b.modifieLe)||0)-(tsDate(a.modifieLe)||0));render()});
  listenDiscret(fs.collection("modifications"),s=>{S.mods=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  render();
}
/* ---------- CLIENT ---------- */
function startClient(email){
  role="client";P.ready=false;P.client=null;P.invoices=[];P.orders=[];P.claims=[];P.creations=[];P.mods=[];$("#modeLabel").textContent="Espace client";
  $("#ptabs").hidden=false;$("#profileBtn").hidden=false;
  listen(fs.collection("services"),s=>{S.services=rows(s).sort(svcSort);render()});
  listen(fs.collection("clients").where("email","==",email),s=>{P.client=s.empty?null:rows(s)[0];P.ready=true;render()});
  listen(fs.collection("invoices").where("clientEmail","==",email).where("visible","==",true),s=>{P.invoices=rows(s).sort((a,b)=>(b.number||"").localeCompare(a.number||""));render()});
  listen(fs.collection("orders").where("clientEmail","==",email),s=>{P.orders=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  listen(fs.collection("claims").where("clientEmail","==",email),s=>{P.claims=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  listenDiscret(fs.collection("creations").where("clientEmail","==",email),s=>{P.creations=rows(s).filter(c=>c.statut!=="desactivee").sort((a,b)=>(tsDate(b.modifieLe)||0)-(tsDate(a.modifieLe)||0));render()});
  listenDiscret(fs.collection("modifications").where("clientEmail","==",email),s=>{P.mods=rows(s).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));render()});
  render();
}

/* ---------- render ---------- */
function render(){
  if(!role)return;
  if(role==="client"){renderPortal();return}
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===tab?"page":"false"));
  const n=todo().total,bd=$("#ordBadge");
  if(bd){bd.textContent=n;bd.hidden=!n}
  ({home:renderHome,orders:renderOrders,nfc:renderNfc,invoices:renderInvoices,clients:renderClients,services:renderServices})[tab]();
}
function invRow(inv){
  const c=clientById(inv.clientId);const[st,lab]=status(inv);const t=totals(inv);
  return `<button class="item" data-open-inv="${esc(inv.id)}">
    <div class="main"><div class="t">${esc(c?c.name:"Client supprimé")}</div><div class="s"><span class="num">${esc(inv.number)}</span> · ${fdate(inv.date)}</div></div>
    <div class="amt"><div class="num">${dh(t.total)}</div><span class="pill ${st}">${lab}</span></div></button>`;
}
function todo(){
  const o=S.orders.filter(x=>x.status==="new").length,q=S.orders.filter(x=>x.status==="quote").length,c=S.claims.filter(x=>x.status==="open").length,m=S.mods.filter(x=>x.status==="new").length;
  return {o,q,c,m,total:o+q+c+m};
}
function todoTiles(){
  const t=todo(),tile=(seg,n,lab,sub)=>`<button class="todo${n?" on":""}" data-goseg="${seg}"><span class="todo-n num">${n}</span><span class="todo-l">${lab}</span><span class="todo-s">${sub}</span></button>`;
  return `<div class="todos">${tile("orders",t.o,"Nouvelles commandes","à confirmer")}${tile("quotes",t.q,"Devis demandés","à chiffrer")}${tile("claims",t.c,"Réclamations","ouvertes")}${tile("mods",t.m,"Demandes de modif.","nouvelles")}</div>${nfcActifsHtml()}`;
}
function renderHome(){
  const all=S.invoices,y=String(new Date().getFullYear());
  const paidYear=all.filter(i=>i.status==="paid"&&(i.date||"").startsWith(y)).reduce((a,i)=>a+totals(i).total,0);
  const open=all.filter(i=>i.status==="sent"),late=open.filter(i=>i.due&&i.due<today());
  const openAmt=open.reduce((a,i)=>a+totals(i).total,0),lateAmt=late.reduce((a,i)=>a+totals(i).total,0);
  app.innerHTML=`
  <div class="section-head"><div><div class="eyebrow">${new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div><h2>Tableau de bord</h2></div>
  <button class="btn primary" data-new-inv>＋ Nouvelle facture</button></div>
  <div class="eyebrow" style="margin-bottom:8px">À traiter</div>${todoTiles()}
  ${!S.services.length?`<div class="notice row between" style="margin-bottom:12px"><span>Votre catalogue est vide : importez les produits du site en un clic.</span><button class="btn sm primary" data-goto="services">Catalogue</button></div>`:""}
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
  const n=(catalogDocs()||[]).length;
  app.innerHTML=`<div class="section-head"><div><h2>Services</h2><div class="muted" style="font-size:13.5px">Ce catalogue est visible par vos clients connectés.</div></div><button class="btn primary" data-new-service>＋ Service</button></div>
  <div class="notice row between" style="margin-bottom:14px"><span>Importer les <b>${n} produits et packs</b> du site (prix de <span class="num">catalog.js</span>). Sans doublon : un 2ᵉ clic met à jour.</span><button class="btn sm primary" data-import-cat>Importer le catalogue du site</button></div>
  ${S.services.length?`<div class="list">${S.services.map(s=>`<button class="item" data-open-service="${esc(s.id)}">${imgSrc(s.image)?`<img class="thumb" src="${esc(imgSrc(s.image))}" alt="">`:`<div class="thumb"></div>`}<div class="main"><div class="t">${esc(s.name)}</div><div class="s">${esc(CATLABEL[s.category]||"Sans catégorie")}${s.options&&s.options.length?` · ${s.options.length} options`:""}</div></div><div class="amt num">${s.options&&s.options.length?`<div class="s muted" style="font-size:11px">dès</div>`:""}${dh(fromPrice(s))}${s.unit?`<div class="s muted" style="font-size:12px">/ ${esc(s.unit)}</div>`:""}</div></button>`).join("")}</div>`:
  `<div class="empty"><h3>Catalogue vide</h3><p>Importez les produits du site, ou ajoutez ce que vous vendez à la main.</p><button class="btn primary" data-import-cat>Importer le catalogue du site</button></div>`}`;
}
async function importCatalog(btn){
  const docs=catalogDocs();if(!docs){toast("Catalogue du site introuvable (assets/js/catalog.js).");return}
  if(btn)btn.disabled=true;
  const batch=fs.batch();docs.forEach(([id,d])=>batch.set(fs.doc("services/"+id),d,{merge:true}));
  const ok=await guard(batch.commit(),docs.length+" produits importés / mis à jour");
  if(btn)btn.disabled=false;return ok;
}
function orderCard(o){
  const c=o.clientId?clientById(o.clientId):null,nx=oNext(o),inv=S.invoices.find(i=>i.orderId===o.id);
  return `<div class="ocard${o.status==="new"?" is-new":""}">
    <button class="ocard-main" data-o-open="${esc(o.id)}">
      <div class="row between"><span class="num" style="font-weight:600">${esc(o.number)}</span>${oPill(o)}</div>
      <div class="t">${esc(c?c.name:o.clientName||o.clientEmail)}</div>
      <div class="s">${(o.lines||[]).map(l=>`${esc(l.qty)}× ${esc(l.name)}`).join(", ")}</div>
      ${typesCommande(o).length?`<div class="tchips">${typeChips(typesCommande(o))}${o.infos&&Object.keys(o.infos).length?'<span class="tchip ok">📝 infos reçues</span>':""}</div>`:""}
      <div class="row between s"><span>${fdt(o.createdAt)}</span><b class="num" style="color:var(--fg)">${oAmount(o)}</b></div>
      ${o.quote&&o.quote.deadline?`<div class="s">Délai souhaité : ${esc(o.quote.deadline)}</div>`:""}
      ${o.note?`<div class="onote">« ${esc(o.note)} »</div>`:""}
    </button>
    ${nx||inv?`<div class="ocard-act">${nx?`<button class="btn sm primary" data-o-set="${esc(nx[0])}" data-oid="${esc(o.id)}">→ ${nx[1]}</button>`:"<span></span>"}${inv?`<span class="muted" style="font-size:12.5px">Facture ${esc(inv.number)}</span>`:""}</div>`:""}
  </div>`;
}
function claimCard(c){
  return `<div class="ocard${c.status==="open"?" is-new":""}"><button class="ocard-main" data-c-open="${esc(c.id)}">
    <div class="row between"><span class="num" style="font-weight:600">${esc(c.number)}</span>${cPill(c)}</div>
    <div class="t">${esc(c.type)}</div>
    <div class="s">${esc(c.clientName||c.clientEmail)}${c.orderNumber?` · commande ${esc(c.orderNumber)}`:""}</div>
    <div class="onote" style="font-style:normal">${esc((c.description||"").slice(0,140))}${(c.description||"").length>140?"…":""}</div>
    <div class="s">${fdt(c.createdAt)}</div></button></div>`;
}
function renderOrders(){
  const t=todo(),seg=(k,lab,n)=>`<button class="seg-b" data-oseg="${k}" aria-pressed="${oseg===k}">${lab}${n?` <span class="badge-i">${n}</span>`:""}</button>`;
  let body;
  if(oseg==="mods"){
    const list=S.mods;
    body=list.length?`<div class="stack">${list.map(modCard).join("")}</div>`:`<div class="empty"><h3>Aucune demande de modification</h3><p>Quand un client demande un changement (prix, numéro, mot de passe…), il apparaît ici.</p></div>`;
  }else if(oseg==="claims"){
    const list=S.claims;
    body=list.length?`<div class="stack">${list.map(claimCard).join("")}</div>`:`<div class="empty"><h3>Aucune réclamation</h3><p>Les réclamations de vos clients apparaîtront ici.</p></div>`;
  }else if(oseg==="quotes"){
    const list=S.orders.filter(o=>o.status==="quote");
    body=list.length?`<div class="stack">${list.map(orderCard).join("")}</div>`:`<div class="empty"><h3>Aucun devis en attente</h3><p>Les demandes de devis apparaîtront ici. Une fois le prix accepté, passez-les en « Confirmée ».</p></div>`;
  }else{
    const f={open:"En cours",new:"Nouvelles",delivered:"Livrées",cancelled:"Annulées",all:"Toutes"};
    const base=S.orders.filter(o=>o.status!=="quote");
    const list=base.filter(o=>ordFilter==="all"||(ordFilter==="open"?!["delivered","cancelled"].includes(o.status):o.status===ordFilter));
    body=`<div class="filters">${Object.entries(f).map(([k,v])=>`<button class="chip" data-ofilter="${k}" aria-pressed="${ordFilter===k}">${v}</button>`).join("")}</div>
    ${list.length?`<div class="stack">${list.map(orderCard).join("")}</div>`:`<div class="empty"><h3>Aucune commande ici</h3><p>${base.length?"Aucune commande avec ce statut.":"Les commandes de vos clients apparaîtront ici."}</p></div>`}`;
  }
  app.innerHTML=`<div class="section-head"><div><h2>Suivi clients</h2><div class="muted" style="font-size:13.5px">Commandes, devis, réclamations et demandes de modification envoyés depuis l’espace client.</div></div></div>
  <div class="seg seg4">${seg("orders","Commandes",t.o)}${seg("quotes","Devis",t.q)}${seg("claims","Réclam.",t.c)}${seg("mods","Modifs",t.m)}</div>${body}`;
}
function quoteHtml(q){
  if(!q)return"";
  return `<div class="paper" style="margin-top:12px"><div class="eyebrow">Demande de devis</div><dl class="kv">
    <dt>Produit</dt><dd>${esc(q.product)}</dd><dt>Quantité</dt><dd class="num">${esc(q.qty)}</dd>
    ${q.need?`<dt>Besoin</dt><dd>${esc(q.need)}</dd>`:""}${q.print?`<dt>À imprimer</dt><dd>${esc(q.print)}</dd>`:""}<dt>Délai souhaité</dt><dd>${esc(q.deadline||"—")}</dd></dl></div>`;
}
function claimView(c){
  openModal(`${head(esc(c.number),cPill(c))}
  <div class="muted" style="font-size:14px;margin-bottom:12px">${esc(c.clientName||"Client")} · ${esc(c.clientEmail)}<br>Envoyée le ${fdt(c.createdAt)}${c.orderNumber?` · commande <b>${esc(c.orderNumber)}</b>`:""}</div>
  <div class="paper"><div class="eyebrow">${esc(c.type)}</div><p style="margin:6px 0 0;white-space:pre-wrap">${esc(c.description)}</p></div>
  <div class="eyebrow" style="margin:16px 0 8px">Statut</div>
  <div class="filters" style="flex-wrap:wrap">${CSTEPS.map(([k,v])=>`<button class="chip" data-c-set="${k}" data-cid="${esc(c.id)}" aria-pressed="${c.status===k}">${v}</button>`).join("")}</div>
  <form id="replyForm" class="stack" style="margin-top:12px"><label class="f">Réponse au client (visible dans son espace)<textarea id="c-reply" maxlength="1000">${esc(c.reply||"")}</textarea></label>
  <div class="row between"><span class="muted" style="font-size:12.5px">${(c.history||[]).map(h=>`${esc(CLABEL[h.status]||h.status)} ${fdt(h.at)}`).join(" → ")}</span><button class="btn primary">Enregistrer la réponse</button></div></form>`);
  $("#replyForm").onsubmit=async e=>{e.preventDefault();await guard(fs.doc("claims/"+c.id).update({reply:$("#c-reply").value.trim()}),"Réponse enregistrée")};
}
async function setClaimStatus(id,st){
  const c=S.claims.find(x=>x.id===id);if(!c||c.status===st)return;
  const upd={status:st,history:[...(c.history||[]),{status:st,at:new Date().toISOString()}]};
  if(await guard(fs.doc("claims/"+id).update(upd),"Réclamation : "+CLABEL[st])&&$("#modal").innerHTML)claimView({...c,...upd,reply:$("#c-reply")?$("#c-reply").value:c.reply});
}
function linesTable(o){
  return `<div class="tbl"><table><thead><tr><th>Service</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Montant</th></tr></thead>
  <tbody>${(o.lines||[]).map(l=>`<tr><td>${esc(l.name)}</td><td class="r num">${esc(l.qty)}</td><td class="r num">${fmt(l.price)}</td><td class="r num">${fmt(l.qty*l.price)}</td></tr>`).join("")}</tbody></table></div>
  <div class="totals num" style="margin-top:10px"><div class="grand"><span>Total</span><span>${dh(oTotal(o))}</span></div></div>`;
}
function historyHtml(o){
  return `<ol class="ohist">${(o.history||[]).map(h=>`<li><b>${esc(OLABEL[h.status]||h.status)}</b><span class="muted">${fdt(h.at)}</span></li>`).join("")}</ol>`;
}
function orderView(o){
  const c=o.clientId?clientById(o.clientId):S.clients.find(x=>x.email&&x.email===o.clientEmail),inv=S.invoices.find(i=>i.orderId===o.id);
  openModal(`${head(esc(o.number),oPill(o))}
  <div class="muted" style="font-size:14px;margin-bottom:12px">${esc(c?c.name:o.clientName||"Client sans fiche")} · ${esc(o.clientEmail)}${c&&c.phone?" · "+esc(c.phone):""}<br>${o.status==="quote"?"Demandé":"Commandée"} le ${fdt(o.createdAt)}${c&&(c.delivery||c.city)?`<br>Livraison : ${esc([c.delivery,c.city].filter(Boolean).join(", "))}`:""}</div>
  ${o.quote?quoteHtml(o.quote):`<div class="paper">${linesTable(o)}</div>`}
  ${o.note&&!o.quote?`<div class="notice" style="margin-top:12px;white-space:pre-wrap"><b>Note du client :</b> ${esc(o.note)}</div>`:""}
  ${infosHtml(o)}
  <div class="eyebrow" style="margin:16px 0 8px">Changer le statut</div>
  <div class="filters" style="flex-wrap:wrap">${[...(o.status==="quote"||o.quote?[["quote","Devis demandé"]]:[]),...OSTEPS,["cancelled","Annulée"]].map(([k,v])=>`<button class="chip" data-o-set="${k}" data-oid="${esc(o.id)}" aria-pressed="${o.status===k}">${v}</button>`).join("")}</div>
  <div class="eyebrow" style="margin:12px 0 6px">Historique</div>${historyHtml(o)}
  <div class="row" style="margin-top:16px">${inv?`<button class="btn" data-open-inv="${esc(inv.id)}">Voir la facture ${esc(inv.number)}</button>`:`<button class="btn primary" data-o-invoice="${esc(o.id)}">Créer la facture</button>`}</div>`);
}
async function setOrderStatus(id,st){
  const o=S.orders.find(x=>x.id===id);if(!o||o.status===st)return;
  const upd={status:st,history:[...(o.history||[]),{status:st,at:new Date().toISOString()}]};
  if(await guard(fs.doc("orders/"+id).update(upd),"Statut : "+OLABEL[st])&&$("#modal").innerHTML)orderView({...o,...upd});
}
function invoiceFromOrder(o){
  const c=(o.clientId&&clientById(o.clientId))||S.clients.find(x=>x.email&&x.email===o.clientEmail);
  if(!c){toast("Créez d’abord la fiche de ce client, puis recliquez sur « Créer la facture ».");clientForm({name:o.clientName||"",email:o.clientEmail});return}
  invoiceForm({number:nextNumber(),clientId:c.id,date:today(),due:addDays(today(),15),tva:true,tvaRate:20,status:"sent",notes:"Commande "+o.number,orderId:o.id,
    lines:(o.lines||[]).map(l=>{const s=S.services.find(x=>x.id===l.serviceId),op=s&&l.option?(s.options||[]).find(x=>x.key===l.option):null;
      return {serviceId:s&&!op?s.id:"",desc:l.name,qty:+l.qty||1,price:op?+op.price||0:s?+s.price||0:+l.price||0}})});
}
function contactHtml(){const b=S.settings;return b.phone||b.email?`<div class="paper" style="margin-top:22px"><div class="eyebrow">Contact ${esc(b.name||"nfcwork.ma")}</div><div style="margin-top:6px" class="num">${esc(b.phone||"")}</div><div>${esc(b.email||"")}</div></div>`:""}
/* ---------- panier client ---------- */
/* clé du panier : "idService" ou "idService|option" */
const svcById=id=>S.services.find(x=>x.id===id);
function cartItem(key){
  const [id,ok]=key.split("|"),s=svcById(id);if(!s)return null;
  const op=ok?(s.options||[]).find(o=>o.key===ok):null;if(ok&&!op)return null;
  return {serviceId:s.id,option:op?op.key:"",name:op?`${s.name} — ${op.name}`:s.name,price:op?+op.price||0:+s.price||0};
}
const lineKey=l=>l.serviceId+(l.option?"|"+l.option:"");
const cartLines=()=>Object.entries(cart).map(([k,q])=>{const it=cartItem(k);return it&&q>0?{...it,qty:q}:null}).filter(Boolean);
const cartCount=()=>cartLines().reduce((a,l)=>a+l.qty,0);
const typesPanier=()=>{const t=new Set();for(const l of cartLines())typesDeLigne(l).forEach(x=>t.add(x));return [...t]};
function cartBar(){
  const ls=cartLines();if(!ls.length)return"";
  return `<div style="height:64px"></div><div class="cartbar"><div class="cartbar-in"><div><b>${cartCount()} article${cartCount()>1?"s":""}</b><div class="num muted" style="font-size:13px">${dh(oTotal({lines:ls}))}</div></div><button class="btn primary" data-cart-open>Voir le panier</button></div></div>`;
}
const stepper=(key,q)=>`<div class="qty"><button type="button" data-cart-dec="${esc(key)}" aria-label="Moins">−</button><span class="num">${q}</span><button type="button" data-cart-inc="${esc(key)}" aria-label="Plus">+</button></div>`;
async function clientWrite(p){
  try{await p;return true}
  catch(e){console.error(e);toast(e&&e.code==="permission-denied"?"Action refusée : vérifiez que votre e-mail est confirmé.":"Échec de l’envoi, réessayez.");return false}
}
function cartView(){
  const ls=cartLines();
  if(!ls.length){closeModal();render();return}
  openModal(`${head("Mon panier")}
  <div class="stack">${ls.map(l=>`<div class="cline"><div class="main"><div class="t">${esc(l.name)}</div><div class="s num">${dh(l.price)} · ${dh(l.qty*l.price)}</div></div>${stepper(lineKey(l),l.qty)}</div>`).join("")}</div>
  <div class="totals num" style="margin-top:12px"><div class="grand"><span>Total</span><span>${dh(oTotal({lines:ls}))}</span></div></div>
  <form id="orderForm" class="stack" style="margin-top:14px">
    ${typesPanier().map(questionnaire).join("")}
    <label class="f">Précisions pour votre commande<textarea id="o-note" maxlength="1000" placeholder="Nom à imprimer, couleur, logo, adresse de livraison…">${esc(cartNote)}</textarea></label>
    ${P.client&&(P.client.delivery||P.client.city)?`<p class="muted" style="margin:0;font-size:13px">Livraison : ${esc([P.client.delivery,P.client.city].filter(Boolean).join(", "))} · <button type="button" class="linkbtn" data-profile>modifier</button></p>`:`<p class="muted" style="margin:0;font-size:13px">Pensez à indiquer votre adresse dans <button type="button" class="linkbtn" data-profile>Mon profil</button>.</p>`}
    <p class="muted" style="margin:0;font-size:13px">Les prix sont confirmés par ${esc(S.settings.name||"nfcwork.ma")} avant la préparation. Paiement par virement ou cash à la livraison.</p>
    <button class="btn primary" style="width:100%"${sending?" disabled":""}>Valider la commande</button>
  </form>`);
  $("#o-note").addEventListener("input",e=>cartNote=e.target.value);
  $("#orderForm").addEventListener("input",e=>{const q=e.target.dataset.q;if(!q)return;const [t,k]=q.split(".");(qInfos[t]=qInfos[t]||{})[k]=e.target.type==="checkbox"?e.target.checked:e.target.value});
  $("#orderForm").addEventListener("change",e=>{const q=e.target.dataset.q;if(!q)return;const [t,k]=q.split(".");(qInfos[t]=qInfos[t]||{})[k]=e.target.type==="checkbox"?e.target.checked:e.target.value});
  $("#orderForm").onsubmit=e=>{e.preventDefault();submitOrder()};
}
function baseOrder(status,pre){
  const now=new Date().toISOString();
  return {number:orderNumber(pre),clientId:P.client?P.client.id:"",clientEmail:(user.email||"").toLowerCase(),clientName:P.client?P.client.name||"":"",
    status,history:[{status,at:now}],createdAt:now};
}
async function submitOrder(){
  const lines=cartLines();if(!lines.length||sending)return;
  sending=true;const btn=$("#orderForm button:last-child");if(btn)btn.disabled=true;
  const ts=typesPanier(),miss=manquants(ts);
  if(miss.length&&!confirm("Il manque : "+miss.join(", ")+".\nEnvoyer quand même ? (vous pourrez compléter sur WhatsApp)")){sending=false;if(btn)btn.disabled=false;return}
  const data={...baseOrder("new","CMD"),lines,note:cartNote.trim().slice(0,1000),total:oTotal({lines})},infos=infosPanier(ts);
  if(Object.keys(infos).length)data.infos=infos;
  let ok=false;
  try{await fs.collection("orders").doc().set(data);ok=true}
  catch(e){console.error(e);
    if(data.infos&&e&&e.code==="permission-denied"){   /* règles pas encore à jour : on garde les réponses dans la note */
      const txt=Object.entries(data.infos).map(([t,o])=>"["+NFC_TYPES[t][1]+"] "+Object.entries(o).map(([k,v])=>(NOMS_CHAMPS[k]||k)+" : "+(v===true?"oui":v)).join(" · ")).join("\n");
      delete data.infos;data.note=((data.note?data.note+"\n":"")+txt).slice(0,1000);
      ok=await clientWrite(fs.collection("orders").doc().set(data))}
    else toast(e&&e.code==="permission-denied"?"Action refusée : vérifiez que votre e-mail est confirmé.":"Échec de l’envoi, réessayez.")}
  if(ok){cart={};cartNote="";qInfos={};orderDone(data);render()}
  else if(btn)btn.disabled=false;
  sending=false;
}
function waLink(text){const wa=waNumber(S.settings.phone)||siteConf().whatsapp||"";return wa?`https://wa.me/${wa}?text=${encodeURIComponent(text)}`:""}
function orderDone(o){
  const b=S.settings,isQ=o.status==="quote";
  const msg=isQ?`Bonjour ${b.name||"nfcwork.ma"}, je viens de demander le devis ${o.number} (${o.quote.qty}× ${o.quote.product}). Je vous envoie mon logo ici.`
    :`Bonjour ${b.name||"nfcwork.ma"}, je viens de passer la commande ${o.number} depuis mon espace client.\n`+o.lines.map(l=>`- ${l.qty}× ${l.name}`).join("\n")+`\nTotal : ${dh(o.total)}`;
  const wa=waLink(msg);
  openModal(`${head(isQ?"Demande envoyée":"Commande envoyée")}
  <div class="success-box"><div class="eyebrow">${isQ?"Votre numéro de devis":"Votre numéro de commande"}</div><div class="num" style="font-size:24px;font-weight:700;margin:4px 0">${esc(o.number)}</div>
  <p class="muted" style="margin:0">${isQ?"Nous étudions votre demande et revenons vers vous avec un prix.":"Nous l’avons bien reçue. Suivez son avancement dans « Mes commandes »."}</p></div>
  <div class="stack" style="margin-top:14px">
    ${wa?`<a class="btn wa" style="width:100%" href="${esc(wa)}" target="_blank" rel="noopener">${isQ?"Envoyer mon logo sur WhatsApp":"Prévenir sur WhatsApp"}</a>`:""}
    <button class="btn" data-ptab="ord" data-close>Voir mes commandes</button>
  </div>`);
}
function progressHtml(o){
  if(o.status==="cancelled")return `<div class="oprog cancelled"><span>Commande annulée</span></div>`;
  if(o.status==="quote")return `<div class="oprog quote"><span>Nous préparons votre devis</span></div>`;
  const cur=oStep(o);
  return `<div class="oprog" role="img" aria-label="Étape ${cur+1} sur ${OSTEPS.length} : ${esc(OLABEL[o.status]||"")}"><div class="oprog-bar">${OSTEPS.map((s,i)=>`<i class="${i<=cur?"on":""}"></i>`).join("")}</div>
  <div class="oprog-lab">${OSTEPS.map((s,i)=>`<span class="${i===cur?"cur":""}">${s[1]}</span>`).join("")}</div></div>`;
}
function myOrderCard(o,withActions){
  return `<div class="ocard"><div class="ocard-main" style="cursor:default">
    <div class="row between"><span class="num" style="font-weight:600">${esc(o.number)}</span>${oPill(o)}</div>
    <div class="s">${(o.lines||[]).map(l=>`${esc(l.qty)}× ${esc(l.name)}`).join(", ")}</div>
    <div class="row between s"><span>${fdt(o.createdAt)}</span><b class="num" style="color:var(--fg)">${oAmount(o)}</b></div>
    ${progressHtml(o)}
    ${o.note?`<div class="onote">« ${esc(o.note)} »</div>`:""}</div>
    ${withActions&&o.status!=="quote"?`<div class="ocard-act"><span></span><button class="btn sm ghost" data-claim="${esc(o.id)}">Signaler un problème</button></div>`:""}</div>`;
}
function myClaimCard(c){
  return `<div class="ocard"><div class="ocard-main" style="cursor:default">
    <div class="row between"><span class="num" style="font-weight:600">${esc(c.number)}</span>${cPill(c)}</div>
    <div class="t">${esc(c.type)}</div><div class="s">${c.orderNumber?`Commande ${esc(c.orderNumber)} · `:""}${fdt(c.createdAt)}</div>
    <div class="onote" style="font-style:normal">${esc(c.description)}</div>
    ${c.reply?`<div class="reply"><b>Réponse de ${esc(S.settings.name||"nfcwork.ma")} :</b> ${esc(c.reply)}</div>`:""}</div></div>`;
}

/* ---------- vues client ---------- */
const ICON={
  cart:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16l-1.5 12.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>`,
  quote:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h4"/></svg>`,
  help:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17.5v.01"/></svg>`
};
function renderPHome(){
  const name=P.client&&P.client.name?P.client.name:(user.email||"").split("@")[0];
  const cur=P.orders.filter(o=>!["delivered","cancelled","quote"].includes(o.status));
  const quotes=P.orders.filter(o=>o.status==="quote"),claims=P.claims.filter(c=>c.status!=="resolved");
  const due=P.invoices.filter(i=>i.status!=="paid").reduce((a,i)=>a+totals(i).total,0),last=P.invoices[0];
  const missing=P.client&&(!P.client.phone||!P.client.delivery);
  return `<div class="hello"><div class="eyebrow tap-arc">Espace client</div><h2>Bonjour ${esc(name)} 👋</h2><p class="muted" style="margin:4px 0 0">Suivez vos commandes, vos factures et trouvez de l’aide à tout moment.</p></div>
  <div class="quick">
    <button class="qa" data-ptab="cat">${ICON.cart}<b>Commander</b><span>Catalogue</span></button>
    <button class="qa" data-quote>${ICON.quote}<b>Demander un devis</b><span>Sur mesure</span></button>
    <button class="qa" data-ptab="help">${ICON.help}<b>Aide</b><span>Guides & SAV</span></button>
  </div>
  ${P.creations.length?`<div class="section-head" style="margin-top:4px"><h3>Mes produits NFC</h3><button class="btn sm ghost" data-ptab="nfc">Tout voir</button></div>
  <div class="nfc-mini">${P.creations.slice(0,3).map(c=>`<a class="nmini" href="${esc(c.lien)}" target="_blank" rel="noopener"><span>${(NFC_TYPES[c.type]||["❔"])[0]}</span><b>${esc(c.titre||c.slug)}</b><small>${(NFC_TYPES[c.type]||["",""])[1]}</small></a>`).join("")}</div>
  <button class="btn block" data-modreq="" style="margin:10px 0 16px">✏️ Demander une modification</button>`:""}
  ${P.ready&&!P.client?`<div class="notice" style="margin-bottom:14px">Votre e-mail <b>${esc(user.email)}</b> n’est pas encore relié à une fiche client. Vous pouvez déjà commander ; ${esc(S.settings.name||"nfcwork.ma")} créera votre fiche.</div>`:""}
  ${missing?`<div class="notice row between" style="margin-bottom:14px"><span>Complétez votre profil (téléphone, adresse de livraison) pour être livré plus vite.</span><button class="btn sm primary" data-profile>Mon profil</button></div>`:""}
  <div class="section-head" style="margin-top:4px"><h3>Commande en cours</h3>${P.orders.length?`<button class="btn sm ghost" data-ptab="ord">Tout voir</button>`:""}</div>
  ${cur.length?`<div class="stack">${cur.slice(0,2).map(o=>myOrderCard(o,false)).join("")}</div>`:`<div class="empty" style="padding:18px"><p>Aucune commande en cours.</p><button class="btn primary" data-ptab="cat">Voir le catalogue</button></div>`}
  ${quotes.length?`<div class="section-head" style="margin-top:18px"><h3>Devis en attente</h3></div><div class="stack">${quotes.map(o=>myOrderCard(o,false)).join("")}</div>`:""}
  <div class="kpis" style="margin-top:18px">
    <div class="kpi ${due?"lead":""}"><div class="eyebrow">Reste à payer</div><b>${fmt(due)} <small>DH</small></b></div>
    ${last?`<button class="kpi kpi-btn" data-popen="${esc(last.id)}"><div class="eyebrow">Dernière facture</div><b>${dh(totals(last).total)}</b><div class="row between" style="margin-top:4px"><span class="num muted" style="font-size:12px">${esc(last.number)}</span><span class="pill ${status(last)[0]}">${status(last)[1]}</span></div></button>`
      :`<div class="kpi"><div class="eyebrow">Dernière facture</div><b style="font-size:15px" class="muted">Aucune</b></div>`}
  </div>
  ${claims.length?`<div class="section-head"><h3>Réclamations en cours</h3></div><div class="stack">${claims.map(myClaimCard).join("")}</div>`:""}
  ${contactHtml()}`;
}
function renderCatalog(){
  const cats=CATS.filter(c=>S.services.some(s=>s.category===c[0]));
  const list=S.services.filter(s=>catFilter==="all"||s.category===catFilter);
  return `<div class="hero-pub"><div class="eyebrow tap-arc">Technologie sans contact</div><h2>Catalogue</h2><p>${esc(S.settings.tagline||"Cartes de visite NFC et solutions sans contact pour professionnels au Maroc.")}</p></div>
  ${cats.length?`<div class="filters"><button class="chip" data-catf="all" aria-pressed="${catFilter==="all"}">Tout</button>${cats.map(([k,v])=>`<button class="chip" data-catf="${k}" aria-pressed="${catFilter===k}">${v}</button>`).join("")}</div>`:""}
  ${list.length?`<div class="svc-grid">${list.map(s=>{const src=imgSrc(s.image),hasOpt=s.options&&s.options.length,q=hasOpt?0:cart[s.id]||0;
    return `<div class="svc">${src?`<div class="svc-ph"><img class="svc-img" src="${esc(src)}" alt="" loading="lazy">${s.tag?`<span class="svc-tag">${esc(s.tag)}</span>`:""}</div>`:""}<div class="svc-body">
      ${s.category?`<div class="eyebrow">${esc(CATLABEL[s.category]||"")}</div>`:""}<h3>${esc(s.name)}</h3><p>${esc(s.short||s.desc||"")}</p>
      <div class="svc-foot"><div class="price">${hasOpt?`<small class="from">à partir de</small>`:""}${dh(fromPrice(s))}${s.oldPrice?` <s class="muted" style="font-size:13px;font-weight:400">${dh(s.oldPrice)}</s>`:""}</div>
      ${hasOpt?`<button class="btn sm primary" data-svc-pick="${esc(s.id)}">Ajouter</button>`:q?stepper(s.id,q):`<button class="btn sm primary" data-cart-inc="${esc(s.id)}">Ajouter</button>`}</div></div></div>`}).join("")}</div>`
  :`<div class="empty"><p>Catalogue en préparation.</p></div>`}
  <div class="notice row between" style="margin-top:18px"><span>Besoin d’une grande quantité ou d’un produit sur mesure ?</span><button class="btn sm primary" data-quote>Demander un devis</button></div>`;
}
let pick=null;
function drawPicker(){
  const s=svcById(pick.id);if(!s){closeModal();return}
  const op=(s.options||[]).find(o=>o.key===pick.opt)||s.options[0];pick.opt=op.key;
  openModal(`${head(esc(s.name))}
  <p class="muted" style="margin:0 0 12px;font-size:14px">${esc(s.desc||"")}</p>
  <div class="stack" role="radiogroup" aria-label="Formule">${s.options.map(o=>`<button type="button" class="opt" role="radio" aria-checked="${o.key===op.key}" data-pick-opt="${esc(o.key)}">
    <div class="row between"><b>${esc(o.name)}${o.tag?` <span class="pill new" style="margin-left:4px">${esc(o.tag)}</span>`:""}</b><span class="num" style="font-weight:700">${dh(o.price)}${o.yearly?` <small class="muted">/ an</small>`:""}</span></div>
    ${o.key===op.key&&o.features&&o.features.length?`<ul class="feat">${o.features.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}</button>`).join("")}</div>
  <div class="row between" style="margin-top:14px"><span class="muted">Quantité</span><div class="qty"><button type="button" data-pick-q="-1" aria-label="Moins">−</button><span class="num">${pick.qty}</span><button type="button" data-pick-q="1" aria-label="Plus">+</button></div></div>
  <button class="btn primary" style="width:100%;margin-top:14px" data-pick-add>Ajouter au panier · ${dh(op.price*pick.qty)}</button>`);
}
function renderMyOrders(){
  const os=P.orders;
  return `<div class="section-head" style="margin-top:6px"><h2>Mes commandes</h2><button class="btn sm primary" data-ptab="cat">＋ Commander</button></div>
  ${os.length?`<div class="stack">${os.map(o=>myOrderCard(o,true)).join("")}</div>`
  :`<div class="empty"><h3>Aucune commande</h3><p>Choisissez vos produits dans le catalogue et commandez en quelques secondes.</p><button class="btn primary" data-ptab="cat">Voir le catalogue</button></div>`}
  <div class="section-head" style="margin-top:22px"><h3>Réclamations / SAV</h3><button class="btn sm" data-claim="">＋ Nouvelle</button></div>
  ${P.claims.length?`<div class="stack">${P.claims.map(myClaimCard).join("")}</div>`:`<p class="muted" style="margin:0;font-size:14px">Aucune réclamation. Un souci avec un produit ? Signalez-le ici, nous trouvons une solution.</p>`}`;
}
function renderMyInvoices(){
  if(!P.ready)return `<div class="empty"><h3>Chargement…</h3></div>`;
  if(!P.client)return `<div class="empty"><h3>Compte pas encore relié</h3><p>Votre e-mail <b>${esc(user.email)}</b> n’est pas encore enregistré comme client. ${esc(S.settings.name||"nfcwork.ma")} l’ajoutera à votre fiche ; vous pouvez déjà commander dans le catalogue.</p></div>${contactHtml()}`;
  const inv=P.invoices;
  const due=inv.filter(i=>i.status!=="paid").reduce((a,i)=>a+totals(i).total,0),paid=inv.filter(i=>i.status==="paid").reduce((a,i)=>a+totals(i).total,0);
  return `<div class="section-head" style="margin-top:6px"><h2>Mes factures</h2></div>
  <div class="kpis" style="margin-top:0"><div class="kpi ${due?"lead":""}"><div class="eyebrow">Reste à payer</div><b>${fmt(due)} <small>DH</small></b></div><div class="kpi"><div class="eyebrow">Déjà payé</div><b>${fmt(paid)} <small>DH</small></b></div></div>
  ${inv.length?`<div class="list">${inv.map(i=>{const[st,lab]=status(i);return `<button class="item" data-popen="${esc(i.id)}"><div class="main"><div class="t num">${esc(i.number)}</div><div class="s">${fdate(i.date)} · échéance ${fdate(i.due)}</div></div><div class="amt"><div class="num">${dh(totals(i).total)}</div><span class="pill ${st}">${lab}</span></div></button>`}).join("")}</div>`:`<div class="empty"><h3>Aucune facture</h3><p>Vos factures apparaîtront ici dès leur émission.</p></div>`}
  ${contactHtml()}`;
}
function renderHelp(){
  const c=siteConf(),b=S.settings,wa=waLink("Bonjour, j’ai une question.");
  const phone=b.phone||c.phoneDisplay||"",email=b.email||c.email||"";
  return `<div class="section-head" style="margin-top:6px"><div><h2>Aide & guides</h2><div class="muted" style="font-size:13.5px">Tout pour bien utiliser vos produits NFC.</div></div></div>
  <div class="eyebrow" style="margin-bottom:8px">Guides pas à pas</div>
  ${GUIDES.map(([t,steps],i)=>`<details class="acc"${i===0?" open":""}><summary>${esc(t)}</summary><ol class="guide">${steps.map(s=>`<li>${s}</li>`).join("")}</ol></details>`).join("")}
  <div class="eyebrow" style="margin:18px 0 8px">Questions fréquentes</div>
  ${FAQ.map(([q,a])=>`<details class="acc"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
  <div class="paper" style="margin-top:18px"><div class="eyebrow">Une question ? Un problème ?</div>
    <div class="stack" style="margin-top:10px">
      ${wa?`<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">Écrire sur WhatsApp</a>`:""}
      <button class="btn" data-claim="">Faire une réclamation / SAV</button>
      <button class="btn" data-quote>Demander un devis</button>
    </div>
    <dl class="kv" style="margin-top:12px">${phone?`<dt>Téléphone</dt><dd class="num"><a href="tel:${esc(String(phone).replace(/[^\d+]/g,""))}">${esc(phone)}</a></dd>`:""}${email?`<dt>E-mail</dt><dd><a href="mailto:${esc(email)}">${esc(email)}</a></dd>`:""}${c.instagram?`<dt>Instagram</dt><dd><a href="https://instagram.com/${esc(c.instagram)}" target="_blank" rel="noopener">@${esc(c.instagram)}</a></dd>`:""}<dt>Zone</dt><dd>Tout le Maroc</dd></dl>
  </div>`;
}

/* ---------- formulaires client ---------- */
function quoteForm(){
  const prods=S.services.map(s=>s.name);
  openModal(`${head("Demander un devis")}
  <form id="quoteForm" class="stack">
    <p class="muted" style="margin:0;font-size:13.5px">Grande quantité, design spécial, produit sur mesure : décrivez votre besoin, nous revenons vers vous avec un prix.</p>
    <div class="grid2"><label class="f">Produit<select id="q-prod">${prods.map(n=>`<option>${esc(n)}</option>`).join("")}<option>Autre / sur mesure</option></select></label>
    <label class="f">Quantité<input id="q-qty" type="number" min="1" max="10000" step="1" value="1" class="num" required></label></div>
    <label class="f">Votre besoin<textarea id="q-need" maxlength="1000" required placeholder="Ex. 50 cartes NFC pour mon équipe, avec le logo de l’entreprise"></textarea></label>
    <label class="f">Logo / infos à imprimer<textarea id="q-print" maxlength="500" placeholder="Noms, fonctions, slogan, couleurs… (le logo s’envoie sur WhatsApp après la demande)"></textarea></label>
    <label class="f">Délai souhaité<select id="q-dl"><option>Dès que possible</option><option>Sous une semaine</option><option>Sous deux semaines</option><option>Ce mois-ci</option><option>Pas pressé</option></select></label>
    <button class="btn primary" style="width:100%">Envoyer la demande</button>
  </form>`);
  $("#quoteForm").onsubmit=async e=>{e.preventDefault();if(sending)return;sending=true;const btn=e.target.querySelector("button");btn.disabled=true;
    const q={product:$("#q-prod").value,qty:Math.max(1,parseInt($("#q-qty").value,10)||1),need:$("#q-need").value.trim(),print:$("#q-print").value.trim(),deadline:$("#q-dl").value};
    const s=S.services.find(x=>x.name===q.product);
    const data={...baseOrder("quote","DEV"),lines:[{serviceId:s?s.id:"",option:"",name:q.product,qty:q.qty,price:0}],note:"",quote:q,total:0};
    if(await clientWrite(fs.collection("orders").doc().set(data))){orderDone(data);render()}else btn.disabled=false;
    sending=false};
}
function claimForm(orderId){
  const os=P.orders.filter(o=>o.status!=="quote");
  openModal(`${head("Réclamation / SAV")}
  <form id="claimForm" class="stack">
    <label class="f">Commande concernée<select id="r-order">${os.map(o=>`<option value="${esc(o.id)}"${o.id===orderId?" selected":""}>${esc(o.number)} · ${fdt(o.createdAt)}</option>`).join("")}<option value=""${!orderId?" selected":""}>Sans commande / autre</option></select></label>
    <label class="f">Problème<select id="r-type">${CLAIM_TYPES.map(t=>`<option>${esc(t)}</option>`).join("")}</select></label>
    <label class="f">Description<textarea id="r-desc" maxlength="2000" required placeholder="Expliquez ce qui se passe : depuis quand, sur quel produit, ce que vous avez déjà essayé…"></textarea></label>
    <p class="muted" style="margin:0;font-size:13px">Nous vous répondons ici, dans « Mes commandes », et si besoin sur WhatsApp.</p>
    <button class="btn primary" style="width:100%">Envoyer la réclamation</button>
  </form>`);
  $("#claimForm").onsubmit=async e=>{e.preventDefault();if(sending)return;sending=true;const btn=e.target.querySelector("button");btn.disabled=true;
    const o=P.orders.find(x=>x.id===$("#r-order").value),now=new Date().toISOString();
    const data={number:orderNumber("RC"),orderId:o?o.id:"",orderNumber:o?o.number:"",clientEmail:(user.email||"").toLowerCase(),clientName:P.client?P.client.name||"":"",
      type:$("#r-type").value,description:$("#r-desc").value.trim(),status:"open",history:[{status:"open",at:now}],createdAt:now};
    if(await clientWrite(fs.collection("claims").doc().set(data))){closeModal();ptab="ord";render();toast("Réclamation "+data.number+" envoyée")}else btn.disabled=false;
    sending=false};
}
function profileForm(){
  if(!P.client){openModal(`${head("Mon profil")}<div class="notice">Votre e-mail <b>${esc(user.email)}</b> n’est pas encore relié à une fiche client. ${esc(S.settings.name||"nfcwork.ma")} la crée lors de votre première commande ; vous pourrez ensuite compléter votre profil ici.</div>`);return}
  const c=P.client,cities=typeof CITIES!=="undefined"?CITIES:[];
  openModal(`${head("Mon profil")}
  <form id="profForm" class="stack">
    <label class="f">E-mail (identifiant, non modifiable)<input value="${esc(c.email)}" disabled></label>
    <label class="f">Nom ou société<input id="p-name" maxlength="100" required value="${esc(c.name)}"></label>
    <div class="grid2"><label class="f">Téléphone<input id="p-phone" type="tel" inputmode="tel" maxlength="30" value="${esc(c.phone)}" placeholder="06 …"></label>
    <label class="f">Ville<input id="p-city" list="p-cities" maxlength="60" value="${esc(c.city)}"></label></div>
    <datalist id="p-cities">${cities.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>
    <label class="f">Adresse de livraison<textarea id="p-deliv" maxlength="300" placeholder="Rue, numéro, quartier, repère…">${esc(c.delivery)}</textarea></label>
    <label class="f">ICE (si société)<input id="p-ice" inputmode="numeric" maxlength="20" value="${esc(c.ice)}" placeholder="15 chiffres"></label>
    <button class="btn primary" style="width:100%">Enregistrer</button>
  </form>`);
  $("#profForm").onsubmit=async e=>{e.preventDefault();
    const v={name:$("#p-name").value.trim(),phone:$("#p-phone").value.trim(),city:$("#p-city").value.trim(),delivery:$("#p-deliv").value.trim(),ice:$("#p-ice").value.trim()};
    const upd={};Object.keys(v).forEach(k=>{if((c[k]||"")!==v[k])upd[k]=v[k]});
    if(!Object.keys(upd).length){closeModal();return}
    if(await clientWrite(fs.doc("clients/"+c.id).update(upd))){closeModal();toast("Profil enregistré")}};
}
function renderPortal(){
  document.querySelectorAll("#ptabs .tab").forEach(b=>b.setAttribute("aria-current",b.dataset.ptab===ptab?"page":"false"));
  const n=P.orders.filter(o=>!["delivered","cancelled"].includes(o.status)).length,bd=$("#pordBadge");
  if(bd){bd.textContent=n;bd.hidden=!n}
  const v={home:renderPHome,cat:renderCatalog,ord:renderMyOrders,nfc:renderMyNfc,inv:renderMyInvoices,help:renderHelp}[ptab]||renderPHome;
  app.innerHTML=v()+cartBar();
}

/* ---------- Produits NFC (créations de l’outil) & demandes de modification ---------- */
const OUTIL_URL="http://localhost:8765/";
const NFC_TYPES={profil:["👤","Carte NFC"],avis:["⭐","Google Reviews"],wifi:["📶","Wi-Fi"],menu:["🍽️","Menu digital"],liens:["🔗","Page liens"]};
const NFC_STATUT={active:["paid","Active"],attente:["sent","En attente"],desactivee:["draft","Désactivée"]};
const MSTEPS=[["new","Nouvelle"],["progress","En cours"],["done","Faite"]];
const MLABEL=Object.fromEntries(MSTEPS),MPILL={new:"late",progress:"sent",done:"paid"};
const mPill=m=>`<span class="pill ${MPILL[m.status]||"draft"}">${esc(MLABEL[m.status]||m.status)}</span>`;
const nPill=c=>{const s=NFC_STATUT[c.statut]||NFC_STATUT.active;return `<span class="pill ${s[0]}">${s[1]}</span>`};
const tsDate=v=>v&&v.toDate?v.toDate():v?new Date(v):null;
const fts=v=>{const d=tsDate(v);return d&&!isNaN(d)?d.toLocaleString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—"};
const PACK_TYPES={starter:["profil","avis"],professional:["profil"],cafe:["menu","avis","wifi"],business:["menu","avis","wifi"],restaurant:["menu","avis","wifi"],premium:["profil","menu","avis","wifi"]};
const CAT_TYPE={carte:"profil",google:"avis",wifi:"wifi",menu:"menu",led:"liens"};
function typesDeLigne(l){const id=l.serviceId||"";if(id.startsWith("pack-"))return PACK_TYPES[id.slice(5)]||[];
  const s=S.services.find(x=>x.id===id),cat=s?s.category:(id.startsWith("cat-")?id.slice(4):"");return CAT_TYPE[cat]?[CAT_TYPE[cat]]:[]}
function typesCommande(o){const t=new Set(Object.keys(o.infos||{}).filter(k=>NFC_TYPES[k]));for(const l of o.lines||[])typesDeLigne(l).forEach(x=>t.add(x));return [...t]}
const typeChips=ts=>ts.map(t=>`<span class="tchip">${NFC_TYPES[t][0]} ${NFC_TYPES[t][1]}</span>`).join("");
/* questionnaires (mêmes champs que l’outil) */
const QFORMS={
 profil:[["nom","Nom complet",1],["entreprise","Entreprise"],["metiers","Métiers (un par ligne)",0,"area"],["telephone","Téléphone",1,"tel"],["whatsapp","WhatsApp (si différent)",0,"tel"],["email","E-mail",0,"email"],["instagram","Instagram"],["facebook","Facebook"],["linkedin","LinkedIn"],["tiktok","TikTok"],["site","Site web"],["adresse","Adresse"]],
 avis:[["commerce","Nom du commerce",1],["lien_google","Lien Google Maps de votre commerce"]],
 wifi:[["commerce","Nom du commerce",1],["ssid","Nom du réseau Wi-Fi",1],["motdepasse","Mot de passe Wi-Fi"],["securite","Sécurité",0,"select"],["cache","Réseau caché (invisible dans la liste)",0,"check"]],
 menu:[["nom","Nom du restaurant",1],["horaires","Horaires"],["whatsapp","WhatsApp",0,"tel"],["instagram","Instagram"],["adresse","Adresse"],["menu","Votre menu",0,"area","## Boissons\nCafé noir - 12\nJus d’orange - 18\n## Petit-déjeuner\nOmelette - 25"]],
 liens:[["nom","Nom",1],["slogan","Slogan"],["whatsapp","WhatsApp",0,"tel"],["localisation","Localisation (adresse ou lien Maps)"],["boutons_texte","Vos boutons (un par ligne : « Nom - lien »)",0,"area","Boutique - https://…\nCatalogue - https://…"]]};
let qInfos={};
function questionnaire(t){const v=qInfos[t]||{};
  const champ=([k,lab,req,kind,ph])=>{const val=v[k]??(kind==="select"?"WPA":"");
    if(kind==="check")return `<label class="check"><input type="checkbox" data-q="${t}.${k}"${val?" checked":""}> ${esc(lab)}</label>`;
    if(kind==="select")return `<label class="f">${esc(lab)}<select data-q="${t}.${k}">${[["WPA","WPA / WPA2 (le plus courant)"],["WEP","WEP (ancien)"],["nopass","Ouvert (sans mot de passe)"]].map(([a,b])=>`<option value="${a}"${val===a?" selected":""}>${b}</option>`).join("")}</select></label>`;
    const inp=kind==="area"?`<textarea data-q="${t}.${k}" maxlength="${k==="menu"?6000:1000}" placeholder="${esc(ph||"")}">${esc(val)}</textarea>`
      :`<input data-q="${t}.${k}" value="${esc(val)}" maxlength="300"${kind==="tel"?' type="tel" inputmode="tel"':kind==="email"?' type="email" inputmode="email" autocapitalize="off"':""}${/insta|face|link|tik|site|lien|ssid|motdepasse/.test(k)?' autocapitalize="off" autocorrect="off" spellcheck="false"':""}>`;
    return `<label class="f"><span>${esc(lab)}${req?' <span class="req">*</span>':""}</span>${inp}</label>`};
  return `<details class="qbox" open><summary>${NFC_TYPES[t][0]} Infos pour votre ${NFC_TYPES[t][1]}</summary><div class="stack" style="margin-top:10px">
    ${t==="wifi"?`<div class="notice" style="background:color-mix(in srgb,var(--warn) 14%,var(--surface))">⚠️ Le mot de passe sera visible par toute personne qui scanne la plaque. Conseil : un réseau « invités ».</div>`:""}
    ${QFORMS[t].map(champ).join("")}<p class="muted" style="margin:0;font-size:12.5px">Photo / logo : envoyez-les sur WhatsApp après la commande. Une case vide n’apparaîtra pas.</p></div></details>`}
function infosPanier(types){const out={};
  for(const t of types){const v=qInfos[t]||{},o={};for(const [k,,,kind] of QFORMS[t]){const x=v[k];if(kind==="check"){if(x)o[k]=true}else if(x!=null&&String(x).trim())o[k]=String(x).trim().slice(0,k==="menu"?6000:1000)}
    if(Object.keys(o).length)out[t]=o}
  return out}
function manquants(types){const m=[];for(const t of types)for(const [k,lab,req] of QFORMS[t])if(req&&!String((qInfos[t]||{})[k]||"").trim())m.push(NFC_TYPES[t][1]+" : "+lab);return m}
/* admin : lien vers l’outil, pré-rempli */
function b64(x){return btoa(unescape(encodeURIComponent(JSON.stringify(x)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function lienOutil(o,t){const i=(o.infos||{})[t]||{},c=(o.clientId&&clientById(o.clientId))||S.clients.find(x=>x.email&&x.email===o.clientEmail)||{};let p={...i};
  if(t==="profil"){p.nom=p.nom||c.name||o.clientName||"";p.telephone=p.telephone||c.phone||"";p.wa_meme=!p.whatsapp||waNumber(p.whatsapp)===waNumber(p.telephone);if(p.wa_meme)delete p.whatsapp;p.email=p.email||"";p.adresse=p.adresse||[c.delivery,c.city].filter(Boolean).join(", ")}
  if((t==="avis"||t==="wifi")&&!p.commerce)p.commerce=c.name||o.clientName||"";
  if((t==="menu"||t==="liens")&&!p.nom)p.nom=c.name||o.clientName||"";
  return OUTIL_URL+"#creer="+t+"&p="+b64(p)+"&commande="+encodeURIComponent(o.id)+"&client="+encodeURIComponent(o.clientEmail||"")}
const NOMS_CHAMPS={nom:"Nom",entreprise:"Entreprise",metiers:"Métiers",telephone:"Téléphone",whatsapp:"WhatsApp",email:"E-mail",instagram:"Instagram",facebook:"Facebook",linkedin:"LinkedIn",tiktok:"TikTok",site:"Site web",adresse:"Adresse",commerce:"Commerce",lien_google:"Lien Google",ssid:"Réseau Wi-Fi",motdepasse:"Mot de passe",securite:"Sécurité",cache:"Réseau caché",horaires:"Horaires",menu:"Menu",slogan:"Slogan",localisation:"Localisation",boutons_texte:"Boutons"};
function infosHtml(o){const ts=typesCommande(o);if(!ts.length)return"";
  return `<div class="eyebrow" style="margin:16px 0 8px">Produits NFC à créer</div><div class="stack">${ts.map(t=>{const i=(o.infos||{})[t]||{};
    return `<div class="paper"><div class="row between"><b>${NFC_TYPES[t][0]} ${NFC_TYPES[t][1]}</b><a class="btn sm primary" href="${esc(lienOutil(o,t))}" target="_blank" rel="noopener">Créer dans l’outil</a></div>
    ${Object.keys(i).length?`<dl class="kv">${Object.entries(i).map(([k,v])=>`<dt>${esc(NOMS_CHAMPS[k]||k)}</dt><dd style="white-space:pre-wrap">${esc(v===true?"oui":v)}</dd>`).join("")}</dl>`:`<p class="muted" style="margin:6px 0 0;font-size:13px">Pas encore d’infos : le formulaire de l’outil s’ouvrira avec le nom et le téléphone du client.</p>`}</div>`}).join("")}</div>
    <p class="muted" style="font-size:12.5px;margin:6px 0 0">« Créer dans l’outil » ouvre l’outil NFCWORK (sur le Mac, ou sur l’iPhone si l’outil est ouvert à l’adresse du Mac).</p>`}
/* admin : onglet Produits NFC */
let nfcFiltre="";
function renderNfc(){
  const nb={};for(const c of S.creations)nb[c.type]=(nb[c.type]||0)+1;
  const list=S.creations.filter(c=>!nfcFiltre||c.type===nfcFiltre);
  const cl=e=>{const c=S.clients.find(x=>x.email&&x.email===e);return c?c.name:e};
  app.innerHTML=`<div class="section-head"><div><h2>Produits NFC</h2><div class="muted" style="font-size:13.5px">Toutes les créations de l’outil (cartes, avis, Wi-Fi, menus, pages liens).</div></div><a class="btn primary" href="${OUTIL_URL}" target="_blank" rel="noopener">＋ Créer dans l’outil</a></div>
  <div class="filters"><button class="chip" data-nfcf="" aria-pressed="${!nfcFiltre}">Tout (${S.creations.length})</button>${Object.entries(NFC_TYPES).map(([k,[i,n]])=>`<button class="chip" data-nfcf="${k}" aria-pressed="${nfcFiltre===k}">${i} ${n}${nb[k]?" ("+nb[k]+")":""}</button>`).join("")}</div>
  ${list.length?`<div class="nfc-grid">${list.map(c=>`<div class="ncard"><div class="ncard-top">${c.qr?`<a href="${esc(c.qr)}" target="_blank" rel="noopener"><img class="nqr" src="${esc(c.qr)}" alt="QR" loading="lazy"></a>`:""}
    <div class="main"><div class="t">${(NFC_TYPES[c.type]||["❔"])[0]} ${esc(c.titre||c.slug)}</div><div class="s">${esc((NFC_TYPES[c.type]||["",c.type])[1])} · ${c.clientEmail?esc(cl(c.clientEmail)):"<i>sans client</i>"}</div>
    <a class="s nlien" href="${esc(c.lien)}" target="_blank" rel="noopener">${esc((c.lien||"").replace(/^https:\/\//,""))}</a><div class="s">Modifié le ${fts(c.modifieLe)} ${nPill(c)}</div></div></div>
    <div class="row"><a class="btn sm" href="${esc(c.lien)}" target="_blank" rel="noopener">Ouvrir</a><a class="btn sm" href="${OUTIL_URL}#modifier=${encodeURIComponent(c.slug||c.id)}" target="_blank" rel="noopener">Modifier dans l’outil</a></div></div>`).join("")}</div>`
  :`<div class="empty"><h3>Aucun produit NFC ${nfcFiltre?"de ce type":"pour l’instant"}</h3><p>Les créations de l’outil apparaissent ici dès que l’outil est relié à Firebase (clé du compte de service).</p></div>`}`}
/* admin : demandes de modification */
function modCard(m){return `<div class="ocard${m.status==="new"?" is-new":""}"><button class="ocard-main" data-m-open="${esc(m.id)}">
  <div class="row between"><span class="num" style="font-weight:600">${esc(m.number)}</span>${mPill(m)}</div>
  <div class="t">${(NFC_TYPES[m.type]||["❔"])[0]} ${esc(m.creationTitre||m.creationId)} · ${esc(m.quoi||"")}</div>
  <div class="s">${esc(m.clientName||m.clientEmail)} · ${fdt(m.createdAt)}</div>
  <div class="onote" style="font-style:normal">${esc((m.description||"").slice(0,140))}${(m.description||"").length>140?"…":""}</div></button></div>`}
function modView(m){const c=S.creations.find(x=>x.id===m.creationId||x.slug===m.creationId);
  openModal(`${head(esc(m.number),mPill(m))}
  <div class="muted" style="font-size:14px;margin-bottom:12px">${esc(m.clientName||"Client")} · ${esc(m.clientEmail)}<br>Envoyée le ${fdt(m.createdAt)}</div>
  <div class="paper"><div class="eyebrow">${(NFC_TYPES[m.type]||["❔"])[0]} ${esc(m.creationTitre||m.creationId)} · ${esc(m.quoi||"")}</div><p style="margin:6px 0 0;white-space:pre-wrap">${esc(m.description)}</p>
  ${m.nouveau?`<div class="eyebrow" style="margin-top:10px">Nouveau texte / prix / mot de passe</div><p style="margin:4px 0 0;white-space:pre-wrap">${esc(m.nouveau)}</p>`:""}</div>
  <div class="row" style="margin-top:12px">${c?`<a class="btn" href="${esc(c.lien)}" target="_blank" rel="noopener">Voir la page</a>`:""}<a class="btn primary" href="${OUTIL_URL}#modifier=${encodeURIComponent(m.creationId)}" target="_blank" rel="noopener">Modifier dans l’outil</a></div>
  <div class="eyebrow" style="margin:16px 0 8px">Statut</div>
  <div class="filters" style="flex-wrap:wrap">${MSTEPS.map(([k,v])=>`<button class="chip" data-m-set="${k}" data-mid="${esc(m.id)}" aria-pressed="${m.status===k}">${v}</button>`).join("")}</div>
  <form id="mReplyForm" class="stack" style="margin-top:12px"><label class="f">Réponse au client (visible dans son espace)<textarea id="m-reply" maxlength="1000">${esc(m.reply||"")}</textarea></label>
  <div class="row between"><span class="muted" style="font-size:12.5px">${(m.history||[]).map(h=>`${esc(MLABEL[h.status]||h.status)} ${fdt(h.at)}`).join(" → ")}</span><button class="btn primary">Enregistrer la réponse</button></div></form>`);
  $("#mReplyForm").onsubmit=async e=>{e.preventDefault();await guard(fs.doc("modifications/"+m.id).update({reply:$("#m-reply").value.trim()}),"Réponse enregistrée")}}
async function setModStatus(id,st){const m=S.mods.find(x=>x.id===id);if(!m||m.status===st)return;
  const upd={status:st,history:[...(m.history||[]),{status:st,at:new Date().toISOString()}]};
  if(await guard(fs.doc("modifications/"+id).update(upd),"Demande : "+MLABEL[st])&&$("#modal").innerHTML)modView({...m,...upd,reply:$("#m-reply")?$("#m-reply").value:m.reply})}
function nfcActifsHtml(){const act=S.creations.filter(c=>(c.statut||"active")==="active"),nb={};for(const c of act)nb[c.type]=(nb[c.type]||0)+1;
  return `<button class="nfc-sum" data-goto="nfc"><span class="eyebrow">Produits NFC actifs</span><span class="nfc-sum-l">${Object.entries(NFC_TYPES).map(([k,[i,n]])=>`<span>${i} <b class="num">${nb[k]||0}</b> ${n}</span>`).join("")}</span></button>`}
/* client : mes produits NFC */
const GUIDE_NFC=`<details class="acc"><summary>📲 Activer ma carte avec NFC Tools</summary><ol class="guide">
  <li>Installez l’application gratuite <b>NFC Tools</b> (App Store ou Google Play).</li><li>Ouvrez-la et touchez <b>Écrire</b>.</li>
  <li>Touchez <b>Ajouter un enregistrement</b>, puis <b>URL / URI</b>.</li><li>Collez le lien de votre produit (bouton « Copier le lien »), puis <b>OK</b>.</li>
  <li>Touchez <b>Écrire</b> et approchez la carte ou la plaque du <b>haut du téléphone</b> (iPhone) ou du <b>milieu du dos</b> (Android).</li>
  <li>« Écriture réussie » ✅ : testez en approchant un autre téléphone.</li></ol></details>`;
function myNfcCard(c){const t=NFC_TYPES[c.type]||["❔",c.type];
  return `<div class="ncard"><div class="ncard-top">${c.qr?`<a href="${esc(c.qr)}" target="_blank" rel="noopener" download><img class="nqr" src="${esc(c.qr)}" alt="QR de ${esc(c.titre)}" loading="lazy"></a>`:""}
  <div class="main"><div class="t">${t[0]} ${esc(c.titre||c.slug)}</div><div class="s">${t[1]} · mis à jour le ${fts(c.modifieLe)}</div><a class="s nlien" href="${esc(c.lien)}" target="_blank" rel="noopener">${esc((c.lien||"").replace(/^https:\/\//,""))}</a></div></div>
  <div class="row"><a class="btn sm primary" href="${esc(c.lien)}" target="_blank" rel="noopener">Voir</a><button class="btn sm" data-copylien="${esc(c.lien)}">Copier le lien</button>${c.qr?`<a class="btn sm" href="${esc(c.qr)}" target="_blank" rel="noopener" download>QR code</a>`:""}<button class="btn sm" data-modreq="${esc(c.id)}">Demander une modification</button></div></div>`}
function myModCard(m){return `<div class="ocard"><div class="ocard-main" style="cursor:default"><div class="row between"><span class="num" style="font-weight:600">${esc(m.number)}</span>${mPill(m)}</div>
  <div class="t">${(NFC_TYPES[m.type]||["❔"])[0]} ${esc(m.creationTitre||"")} · ${esc(m.quoi||"")}</div><div class="s">${fdt(m.createdAt)}</div>
  <div class="onote" style="font-style:normal">${esc(m.description)}</div>${m.reply?`<div class="reply"><b>Réponse de ${esc(S.settings.name||"nfcwork.ma")} :</b> ${esc(m.reply)}</div>`:""}</div></div>`}
function renderMyNfc(){const cs=P.creations;
  return `<div class="section-head" style="margin-top:6px"><div><h2>Mes produits NFC</h2><div class="muted" style="font-size:13.5px">Vos cartes, plaques et pages : lien, QR code et modifications.</div></div></div>
  ${cs.length?`<div class="nfc-grid">${cs.map(myNfcCard).join("")}</div>${GUIDE_NFC}`:`<div class="empty"><h3>Aucun produit NFC pour l’instant</h3><p>Vos produits apparaîtront ici dès qu’ils seront prêts.</p><button class="btn primary" data-ptab="cat">Voir le catalogue</button></div>`}
  <div class="section-head" style="margin-top:22px"><h3>Demandes de modification</h3>${cs.length?`<button class="btn sm" data-modreq="">＋ Nouvelle</button>`:""}</div>
  ${P.mods.length?`<div class="stack">${P.mods.map(myModCard).join("")}</div>`:`<p class="muted" style="margin:0;font-size:14px">Aucune demande. Un prix, un numéro ou un mot de passe à changer ? Demandez-le ici, rien à refaire sur votre carte.</p>`}`}
const QUOI={profil:["Téléphone / WhatsApp","E-mail","Réseaux sociaux","Photo","Entreprise / métiers","Adresse","Autre"],avis:["Lien Google","Logo","Autre"],
  wifi:["Mot de passe Wi-Fi","Nom du réseau","Autre"],menu:["Prix","Plats (ajout / retrait)","Disponibilité d’un plat","Horaires","Photos","Autre"],liens:["Boutons / liens","Logo","Slogan","Autre"]};
function modForm(id){const cs=P.creations;if(!cs.length){toast("Aucun produit NFC pour l’instant.");return}
  const c0=cs.find(c=>c.id===id)||cs[0];
  openModal(`${head("Demander une modification")}
  <form id="modForm" class="stack">
    <label class="f">Produit<select id="md-crea">${cs.map(c=>`<option value="${esc(c.id)}"${c.id===c0.id?" selected":""}>${(NFC_TYPES[c.type]||["❔"])[0]} ${esc(c.titre||c.slug)}</option>`).join("")}</select></label>
    <label class="f">Quoi changer ?<select id="md-quoi"></select></label>
    <label class="f">Description<textarea id="md-desc" maxlength="2000" required placeholder="Ex. mon numéro a changé, le café passe à 14 DH…"></textarea></label>
    <label class="f">Nouveau texte / prix / mot de passe (facultatif)<textarea id="md-nouveau" maxlength="2000" placeholder="Ex. 06 12 34 56 78"></textarea></label>
    <p class="muted" style="margin:0;font-size:13px">Pas besoin de reprogrammer votre carte : le lien reste le même.</p>
    <button class="btn primary" style="width:100%">Envoyer la demande</button></form>`);
  const majQuoi=()=>{const c=cs.find(x=>x.id===$("#md-crea").value);$("#md-quoi").innerHTML=(QUOI[c&&c.type]||["Autre"]).map(q=>`<option>${esc(q)}</option>`).join("")};
  majQuoi();$("#md-crea").onchange=majQuoi;
  $("#modForm").onsubmit=async e=>{e.preventDefault();if(sending)return;const desc=$("#md-desc").value.trim();if(!desc){toast("Décrivez la modification.");return}
    sending=true;const btn=e.target.querySelector("button:last-child");btn.disabled=true;
    const c=cs.find(x=>x.id===$("#md-crea").value),now=new Date().toISOString();
    const data={number:orderNumber("MOD"),creationId:c.id,creationTitre:(c.titre||c.slug||"").slice(0,200),type:c.type,quoi:$("#md-quoi").value,description:desc,
      nouveau:$("#md-nouveau").value.trim(),clientEmail:(user.email||"").toLowerCase(),clientName:P.client?P.client.name||"":"",status:"new",history:[{status:"new",at:now}],createdAt:now};
    if(await clientWrite(fs.collection("modifications").doc().set(data))){closeModal();ptab="nfc";render();toast("Demande "+data.number+" envoyée")}else btn.disabled=false;
    sending=false}}

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
   <label class="f">Catégorie<select id="sv-cat"><option value="">— Aucune —</option>${CATS.map(([k,v])=>`<option value="${k}"${s.category===k?" selected":""}>${v}</option>`).join("")}</select></label>
   ${s.options&&s.options.length?`<div class="paper" style="padding:12px 14px"><div class="eyebrow">Options importées du site</div>${s.options.map(o=>`<div class="row between" style="font-size:14px;margin-top:4px"><span>${esc(o.name)}${o.tag?` <span class="muted">· ${esc(o.tag)}</span>`:""}</span><span class="num">${dh(o.price)}${o.yearly?" / an":""}</span></div>`).join("")}<p class="muted" style="margin:8px 0 0;font-size:12.5px">Pour changer ces prix : modifiez <span class="num">assets/js/catalog.js</span>, puis « Importer le catalogue du site ».</p></div>`:""}
   <label class="f">Photo (images du site)<select id="sv-image"><option value="">— Sans photo —</option>${IMAGES.map(([p,n])=>`<option value="${esc(p)}"${s.image===p?" selected":""}>${esc(n)}</option>`).join("")}</select></label>
   <div class="img-preview" id="sv-prev">${imgSrc(s.image)?`<img src="${esc(imgSrc(s.image))}" alt="">`:`<span class="muted">Aucune photo</span>`}</div>
   <div class="row between">${s.id?`<button type="button" class="btn danger" data-del-service="${esc(s.id)}">Supprimer</button>`:"<span></span>"}<button class="btn primary">Enregistrer</button></div>
  </form>`);
  $("#sv-image").onchange=e=>{const src=imgSrc(e.target.value);$("#sv-prev").innerHTML=src?`<img src="${esc(src)}" alt="">`:`<span class="muted">Aucune photo</span>`};
  $("#svcForm").onsubmit=async e=>{e.preventDefault();
    const data={name:$("#sv-name").value.trim(),desc:$("#sv-desc").value.trim(),price:+$("#sv-price").value||0,unit:$("#sv-unit").value.trim(),image:$("#sv-image").value,category:$("#sv-cat").value};
    const ref=s.id?fs.doc("services/"+s.id):fs.collection("services").doc();
    if(await guard(ref.set(data,{merge:true}),"Service enregistré"))closeModal();};
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
   <label class="f">Adresse de livraison<input id="cl-deliv" value="${esc(c.delivery)}"></label>
   <div class="row between">${c.id?`<button type="button" class="btn danger" data-del-client="${esc(c.id)}">Supprimer</button>`:"<span></span>"}<button class="btn primary">Enregistrer</button></div>
  </form>`);
  $("#cliForm").onsubmit=async e=>{e.preventDefault();
    const email=$("#cl-email").value.trim().toLowerCase();
    if(email&&email===ADMIN){toast("Cet e-mail est celui de l’administrateur.");return}
    if(email&&S.clients.some(x=>x.email===email&&x.id!==c.id)){toast("Cet e-mail est déjà utilisé par un autre client.");return}
    const data={name:$("#cl-name").value.trim(),email,phone:$("#cl-phone").value.trim(),city:$("#cl-city").value.trim(),ice:$("#cl-ice").value.trim(),address:$("#cl-addr").value.trim(),delivery:$("#cl-deliv").value.trim()};
    const ref=c.id?fs.doc("clients/"+c.id):fs.collection("clients").doc();
    const batch=fs.batch();batch.set(ref,data);
    if(c.id&&c.email!==email){
      S.invoices.filter(i=>i.clientId===c.id).slice(0,200).forEach(i=>batch.update(fs.doc("invoices/"+i.id),{clientEmail:email}));
      S.orders.filter(o=>o.clientId===c.id).slice(0,200).forEach(o=>batch.update(fs.doc("orders/"+o.id),{clientEmail:email}));}
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
  if(d.ptab){ptab=d.ptab;if(d.close!=null)closeModal();window.scrollTo(0,0);render();return}
  if(role==="client"&&(d.cartInc||d.cartDec)){const id=d.cartInc||d.cartDec;cart[id]=Math.max(0,(cart[id]||0)+(d.cartInc?1:-1));if(!cart[id])delete cart[id];
    if($("#orderForm"))cartView();else{const y=window.scrollY;render();window.scrollTo(0,y)}return}
  if(role==="client"){
    if(d.cartOpen!=null){cartView();return}
    if(d.catf){catFilter=d.catf;render();return}
    if(d.svcPick){pick={id:d.svcPick,opt:"",qty:1};const s=svcById(d.svcPick);if(s){const r=(s.options||[]).find(o=>o.tag==="Recommandé");pick.opt=(r||s.options[0]).key}drawPicker();return}
    if(d.pickOpt){pick.opt=d.pickOpt;drawPicker();return}
    if(d.pickQ){pick.qty=Math.max(1,pick.qty+(+d.pickQ));drawPicker();return}
    if(d.pickAdd!=null){const k=pick.id+"|"+pick.opt;cart[k]=(cart[k]||0)+pick.qty;closeModal();const y=window.scrollY;render();window.scrollTo(0,y);toast("Ajouté au panier");return}
    if(d.quote!=null){quoteForm();return}
    if(d.modreq!=null){modForm(d.modreq);return}
    if(d.copylien){navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(d.copylien).then(()=>toast("Lien copié ✓"),()=>prompt("Copiez :",d.copylien)):prompt("Copiez :",d.copylien);return}
    if(d.claim!=null){claimForm(d.claim);return}
    if(d.profile!=null||el.id==="profileBtn"){profileForm();return}
  }
  if(d.popen){const i=P.invoices.find(x=>x.id===d.popen);if(i)portalInvoiceView(i);return}
  if(d.pprint){const i=P.invoices.find(x=>x.id===d.pprint);if(i)printInvoice(i,P.client||{});return}
  if(d.close!=null){closeModal();return}
  if(role!=="admin")return;
  if(el.classList.contains("tab")){tab=d.tab;window.scrollTo(0,0);render();return}
  if(d.goto){tab=d.goto;render();return}
  if(d.goseg){tab="orders";oseg=d.goseg;if(oseg==="orders")ordFilter="new";window.scrollTo(0,0);render();return}
  if(d.oseg){oseg=d.oseg;render();return}
  if(d.importCat!=null){importCatalog(el);return}
  if(d.cOpen){const c=S.claims.find(x=>x.id===d.cOpen);if(c)claimView(c);return}
  if(d.mOpen){const m=S.mods.find(x=>x.id===d.mOpen);if(m)modView(m);return}
  if(d.mSet&&d.mid){setModStatus(d.mid,d.mSet);return}
  if(d.nfcf!=null){nfcFiltre=d.nfcf;render();return}
  if(d.cSet&&d.cid){setClaimStatus(d.cid,d.cSet);return}
  if(d.filter){invFilter=d.filter;render();return}
  if(d.ofilter){ordFilter=d.ofilter;render();return}
  if(d.oOpen){const o=S.orders.find(x=>x.id===d.oOpen);if(o)orderView(o);return}
  if(d.oSet&&d.oid){setOrderStatus(d.oid,d.oSet);return}
  if(d.oInvoice){const o=S.orders.find(x=>x.id===d.oInvoice);if(o)invoiceFromOrder(o);return}
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
