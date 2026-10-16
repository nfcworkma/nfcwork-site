/* =========================================================
   NFCWORK — ESPACE EN ARABE (choix FR / عربي pour les commerçants)
   Traduit l'interface à l'affichage : textes, boutons, champs (placeholder), titres.
   Le choix est gardé sur l'appareil. Les données (noms, produits…) ne changent pas.
   ========================================================= */
(function () {
  "use strict";
  const CLE = "nfcwork-espace-lang";
  let lang = "fr";
  try { lang = localStorage.getItem(CLE) === "ar" ? "ar" : "fr"; } catch (e) {}

  const AR = {
    // connexion
    "Connexion": "تسجيل الدخول", "Accédez à vos factures et à votre espace.": "ادخل إلى فواتيرك وفضائك.",
    "Créer un compte": "إنشاء حساب", "Mot de passe oublié": "نسيت كلمة السر", "Mot de passe oublié ?": "نسيت كلمة السر؟",
    "Recevez un lien pour choisir un nouveau mot de passe.": "توصل برابط باش تختار كلمة سر جديدة.",
    "E-mail": "البريد الإلكتروني", "Mot de passe": "كلمة السر", "Se connecter": "دخول", "Créer mon compte": "إنشاء حسابي",
    "Envoyer le lien": "إرسال الرابط", "← Retour à la connexion": "← الرجوع لتسجيل الدخول",
    "Vérifiez votre e-mail": "تأكد من بريدك الإلكتروني", "J’ai cliqué sur le lien": "ضغطت على الرابط", "Renvoyer l’e-mail": "إعادة إرسال البريد",
    "Nous avons envoyé un lien à": "أرسلنا رابطاً إلى", ". Cliquez dessus, puis revenez ici. Pensez à regarder dans les spams.": ". اضغط عليه ثم ارجع هنا. شوف حتى فـ Spam.",
    "Utilisez l’e-mail que vous avez donné à": "استعمل البريد اللي عطيتي لـ",
    "Lien envoyé : vérifiez votre boîte mail.": "تم إرسال الرابط: شوف بريدك.",
    // en-tête et onglets
    "Espace client": "فضاء الزبون", "Espace client · nfcwork.ma": "فضاء الزبون · nfcwork.ma", "Mon profil": "حسابي", "Déconnexion": "خروج",
    "Paramètres": "الإعدادات", "Réglages": "الإعدادات", "🔗 Lien & QR": "🔗 الرابط و QR", "Chargement…": "جاري التحميل…", "Accueil": "الرئيسية", "Catalogue": "المنتجات", "Commandes": "الطلبات",
    "Mes commandes": "طلباتي", "Factures": "الفواتير", "Mes factures": "فواتيري", "Aide": "مساعدة", "Aide & guides": "المساعدة والشروحات",
    "Mes NFC": "منتجاتي NFC", "Mes produits NFC": "منتجاتي NFC", "Produits NFC": "منتجات NFC", "NFC": "NFC",
    // accueil client
    "Suivez vos commandes, vos factures et trouvez de l’aide à tout moment.": "تابع طلباتك وفواتيرك ولقا المساعدة فأي وقت.",
    "Choisissez vos produits dans le catalogue et commandez en quelques secondes.": "اختار المنتجات من الكاتالوج واطلب فثواني.",
    "Complétez votre profil (téléphone, adresse de livraison) pour être livré plus vite.": "كمّل حسابك (الهاتف وعنوان التوصيل) باش توصلك الطلبية بسرعة.",
    "Voir le catalogue": "شوف المنتجات", "Voir mes commandes": "شوف طلباتي", "Tout voir": "شوف كلشي", "Voir": "شوف", "Ouvrir": "فتح",
    "Commande en cours": "طلب جاري", "Aucune commande en cours.": "ما كاين حتى طلب جاري.", "Aucune commande": "ما كاين حتى طلب",
    "Dernière facture": "آخر فاتورة", "Aucune facture": "ما كاين حتى فاتورة", "Vos factures apparaîtront ici dès leur émission.": "الفواتير ديالك غادي يبانو هنا ملي يتصاوبو.",
    "Reste à payer": "الباقي للأداء", "Déjà payé": "مؤدّى", "Total": "المجموع", "Statut": "الحالة",
    "Ma carte fidélité · scanner & gérer": "كارطة الوفاء ديالي · سكانير والتسيير", "Carte fidélité": "كارطة الوفاء", "Votre carte fidélité": "كارطة الوفاء ديالك",
    "Compte pas encore relié": "الحساب مازال ما مربوط",
    // catalogue et panier
    "Commander": "اطلب", "＋ Commander": "＋ اطلب", "Mon panier": "السلة ديالي", "Voir le panier": "شوف السلة", "Valider la commande": "تأكيد الطلب",
    "Quantité": "الكمية", "Plus": "زيد", "Moins": "نقّص", "Ajouter": "زيد", "Annuler": "إلغاء", "Fermer": "سد", "Enregistrer": "حفظ", "OK": "واخا",
    "Catalogue en préparation.": "الكاتالوج كيتوجد.", "à partir de": "ابتداءً من", "DH": "درهم", "Formule": "الباقة",
    "Commande envoyée": "تم إرسال الطلب", "Nous l’avons bien reçue. Suivez son avancement dans « Mes commandes ».": "توصلنا بيه. تابعو فـ « طلباتي ».",
    "Votre numéro de commande": "رقم الطلب ديالك", "Précisions pour votre commande": "تفاصيل الطلب ديالك", "Adresse de livraison": "عنوان التوصيل",
    "Rue, numéro, quartier, repère…": "الزنقة، الرقم، الحي، علامة…", "Ville": "المدينة", "Téléphone": "الهاتف", "Prénom": "الاسم",
    "Pensez à indiquer votre adresse dans": "ما تنساش تكتب العنوان ديالك فـ",
    "Photo / logo : envoyez-les sur WhatsApp après la commande. Une case vide n’apparaîtra pas.": "الصورة / اللوغو: صيفطهم فالواتساب من بعد الطلب. الخانة الخاوية ما كتبانش.",
    "Envoyer mon logo sur WhatsApp": "صيفط اللوغو ديالي فالواتساب", "Prévenir sur WhatsApp": "علّم فالواتساب", "Écrire sur WhatsApp": "كتب فالواتساب",
    // devis / sur mesure
    "Demander un devis": "طلب عرض ثمن", "Besoin d’une grande quantité ou d’un produit sur mesure ?": "محتاج كمية كبيرة ولا منتوج على المقاس؟",
    "Grande quantité, design spécial, produit sur mesure : décrivez votre besoin, nous revenons vers vous avec un prix.": "كمية كبيرة، ديزاين خاص، منتوج على المقاس: وصف شنو بغيتي ونرجعو ليك بالثمن.",
    "Votre besoin": "شنو محتاج", "Ex. 50 cartes NFC pour mon équipe, avec le logo de l’entreprise": "مثلا: 50 كارطة NFC للفريق ديالي باللوغو ديال الشركة",
    "Délai souhaité": "الوقت اللي بغيتي", "Dès que possible": "فأقرب وقت", "Sous une semaine": "فسيمانة", "Sous deux semaines": "فجوج سيمانات", "Pas pressé": "ماشي مزروب",
    "Envoyer la demande": "إرسال الطلب", "Demande envoyée": "تم إرسال الطلب", "Nous préparons votre devis": "كنوجدو ليك عرض الثمن",
    "Nous étudions votre demande et revenons vers vous avec un prix.": "كنشوفو الطلب ديالك ونرجعو ليك بالثمن.", "Devis en attente": "عرض الثمن فالانتظار",
    "Votre numéro de devis": "رقم عرض الثمن", "Autre / sur mesure": "آخر / على المقاس", "Sur mesure": "على المقاس",
    // réclamations
    "Faire une réclamation / SAV": "شكاية / خدمة ما بعد البيع", "Signaler un problème": "بلّغ على مشكل", "Réclamations / SAV": "الشكايات / خدمة ما بعد البيع",
    "Réclamations en cours": "شكايات جارية", "Commande concernée": "الطلب المعني", "Sans commande / autre": "بلا طلب / آخر", "Problème": "المشكل",
    "Expliquez ce qui se passe : depuis quand, sur quel produit, ce que vous avez déjà essayé…": "شرح شنو واقع: من إمتى، فأي منتوج، وشنو جربتي…",
    "Envoyer la réclamation": "إرسال الشكاية", "Aucune réclamation. Un souci avec un produit ? Signalez-le ici, nous trouvons une solution.": "ما كاين حتى شكاية. عندك مشكل فشي منتوج؟ بلّغ هنا ونلقاو حل.",
    "Nous vous répondons ici, dans « Mes commandes », et si besoin sur WhatsApp.": "غادي نجاوبوك هنا فـ « طلباتي »، وإلا احتاج الأمر فالواتساب.",
    "Commande annulée": "طلب ملغى", "Échec de l’envoi, réessayez.": "ما تصيفطش، عاود جرب.",
    // aide
    "Questions fréquentes": "أسئلة متكررة", "Guides pas à pas": "شروحات خطوة بخطوة", "Guides & SAV": "الشروحات وخدمة ما بعد البيع",
    "Tout pour bien utiliser vos produits NFC.": "كلشي باش تخدم مزيان بمنتجات NFC ديالك.", "Une question ? Un problème ?": "عندك سؤال؟ مشكل؟",
    "Activer ma carte avec NFC Tools": "تفعيل الكارطة ديالي بـ NFC Tools", "Installez l’application gratuite": "ثبّت التطبيق المجاني",
    "(App Store ou Google Play).": "(App Store ولا Google Play).", "Ouvrez-la et touchez": "حلو وضغط على", "Écrire": "Écrire", "Ajouter un enregistrement": "Ajouter un enregistrement",
    "Collez le lien de votre produit (bouton « Copier le lien »), puis": "لصق الرابط ديال المنتوج (بوطونة « نسخ الرابط »)، ومن بعد",
    "et approchez la carte ou la plaque du": "وقرّب الكارطة ولا البلاكة من", "haut du téléphone": "الفوق ديال التيليفون", "milieu du dos": "الوسط ديال الظهر",
    "(iPhone) ou du": "(آيفون) ولا من", "(Android).": "(أندرويد).", ": testez en approchant un autre téléphone.": ": جرب بتقريب تيليفون آخر.",
    "Technologie sans contact": "تكنولوجيا بلا لمس",
    // produits NFC du client
    "Vos cartes, plaques et pages : lien, QR code et modifications.": "الكارطات والبلاكات والصفحات ديالك: الرابط، QR والتعديلات.",
    "Aucun produit NFC pour l’instant": "ما كاين حتى منتوج NFC دابا", "Aucun produit NFC pour l’instant.": "ما كاين حتى منتوج NFC دابا.",
    "Vos produits apparaîtront ici dès qu’ils seront prêts.": "المنتجات ديالك غادي يبانو هنا ملي يوجدو.",
    "Copier le lien": "نسخ الرابط", "Voir la page": "شوف الصفحة", "QR code": "رمز QR", "QR": "QR",
    "Demander une modification": "طلب تعديل", "Demandes de modification": "طلبات التعديل", "Quoi changer ?": "شنو نبدلو؟",
    "Nouveau texte / prix / mot de passe": "النص / الثمن / كلمة السر الجديدة", "Nouveau texte / prix / mot de passe (facultatif)": "النص / الثمن / كلمة السر الجديدة (اختياري)",
    "Ex. mon numéro a changé, le café passe à 14 DH…": "مثلا: الرقم ديالي تبدل، القهوة ولات بـ 14 درهم…",
    "Pas besoin de reprogrammer votre carte : le lien reste le même.": "ما محتاجش تعاود تبرمج الكارطة: الرابط كيبقى هو هو.",
    "Aucune demande. Un prix, un numéro ou un mot de passe à changer ? Demandez-le ici, rien à refaire sur votre carte.": "ما كاين حتى طلب. بغيتي تبدل ثمن ولا رقم ولا كلمة سر؟ طلبها هنا، بلا ما تعاود والو فالكارطة.",
    "Disponibilité d’un plat": "توفر شي طبق", "Carte NFC": "كارطة NFC", "Google Reviews": "تقييمات Google", "Wi-Fi": "واي فاي", "Menu digital": "منيو رقمي",
    "Page liens": "صفحة روابط", "Active": "مفعّلة", "En attente": "فالانتظار", "Désactivée": "متوقفة", "Nouvelle": "جديدة", "En cours": "جارية", "Faite": "تدارت",
    // profil
    "Nom complet": "الاسم الكامل", "Nom ou société": "الاسم ولا الشركة", "E-mail (identifiant, non modifiable)": "البريد (المعرّف، ما كيتبدلش)", "ICE (si société)": "ICE (إلا كانت شركة)",
    "Ex. 06 12 34 56 78": "مثلا 06 12 34 56 78", "Votre e-mail": "بريدك الإلكتروني",
    // fidélité commerçant
    "Fidélité": "الوفاء", "Cartes & employés": "الكارطات والخدامة", "📷 Scanner": "📷 سكانير", "Scanner": "سكانير", "🖨 Affiches & QR": "🖨 الملصقات و QR", "Affiches & QR": "الملصقات و QR",
    "Clients": "الزبناء", "Récompenses prêtes": "مكافآت واجدة", "Offertes": "متعطية", "Employés": "الخدامة", "＋ Employé": "＋ خدام",
    "Rechercher : prénom ou téléphone…": "قلب: الاسم ولا الهاتف…", "Aucun client ne correspond.": "ما كاين حتى زبون بهاد البحث.",
    "Pas encore de clients. Imprimez l’affiche : les clients scannent et créent leur carte.": "مازال ما كاين زبناء. طبع الملصق: الزبناء كيسكانيو وكيصاوبو الكارطة ديالهم.",
    "Ajoutez vos employés : chacun aura son code QR.": "زيد الخدامة ديالك: كل واحد غادي يكون عندو QR ديالو.", "Touchez pour le QR": "ضغط باش يبان QR",
    "Programme désactivé : les clients ne peuvent pas créer de carte.": "البرنامج متوقف: الزبناء ما يقدروش يصاوبو كارطة.",
    "Ajouter les articles": "زيد السلع", "Ajouter les points": "زيد النقط", "Montant de l’achat (DH)": "مبلغ الشراء (درهم)", "= 0 point": "= 0 نقطة",
    "Envoyer sa carte (WhatsApp)": "صيفط ليه الكارطة (واتساب)", "Retirer 1": "نقّص 1", "Supprimer cette carte": "حذف هاد الكارطة", "Confirmer la suppression": "تأكيد الحذف",
    "Qui a servi ?": "شكون خدم؟", "L’employé choisi gagne 1 point.": "الخدام اللي اخترتي كيربح نقطة.", "Personne / ne pas compter": "حتى واحد / ما نحسبش", "Le client choisira": "الزبون غادي يختار",
    "Visez la carte du client ou le code d’un employé.": "وجّه الكاميرا للكارطة ديال الزبون ولا QR ديال الخدام.", "Nouvel employé": "خدام جديد", "Son QR : il voit ses points du mois": "QR ديالو: كيشوف النقط ديالو ديال الشهر",
    "🖨 Imprimer son QR": "🖨 طبع QR ديالو", "Retirer cet employé": "حيد هاد الخدام", "Correction : +1 point": "تصحيح: +1 نقطة", "Ce mois-ci": "هاد الشهر",
    "🖨 Affiche A4 pour la caisse": "🖨 ملصق A4 للكيس", "🖨 12 stickers (tables, comptoir)": "🖨 12 ستيكر (الطوابل، الكونطوار)",
    "QR d’inscription : le client crée sa carte en 10 secondes. Ensuite, c’est vous qui scannez sa carte à chaque achat (impossible de tricher).": "QR ديال التسجيل: الزبون كيصاوب الكارطة ديالو فـ 10 ثواني. من بعد نتا اللي كتسكاني الكارطة ديالو فكل شراء (ما يمكنش الغش).",
    "1. Scannez · 2. Entrez votre prénom · 3. Montrez votre carte à chaque visite": "1. سكانيو · 2. كتب سميتك · 3. ورّي الكارطة فكل زيارة",
    "🎁 Récompense offerte": "🎁 تعطات المكافأة", "1 point retiré": "تنقصات نقطة", "Carte supprimée": "تحذفات الكارطة", "Points ajoutés ✓": "تزادو النقط ✓",
    "Lien et QR de la carte": "رابط و QR ديال الكارطة", "Lien d’inscription": "رابط التسجيل", "Télécharger le QR": "تحميل QR", "Lien copié": "تنسخ الرابط", "Partager sur WhatsApp": "بارطاجي فالواتساب",
    "Imprimez ce QR ou envoyez le lien : vos clients créent leur carte en 10 secondes.": "طبع هاد QR ولا صيفط الرابط: الزبناء كيصاوبو الكارطة ديالهم فـ 10 ثواني.",
    "🔗 Lien & QR code de la carte": "🔗 الرابط و QR ديال الكارطة", "🔗 Lien & QR": "🔗 الرابط و QR", "✅ Carte fidélité créée": "✅ تصاوبات كارطة الوفاء",
    "Voir la page client": "شوف صفحة الزبون", "Ouvrir le tableau de bord": "فتح لوحة التسيير", "Cartes fidélité": "كارطات الوفاء", "Vos commerces": "المحلات ديالك",
    "Points, récompenses et classement des employés.": "النقط، المكافآت وترتيب الخدامة.", "Carte introuvable dans ce commerce.": "الكارطة ما كايناش فهاد المحل.",
    "Montant trop petit pour 1 point.": "المبلغ صغير بزاف على نقطة وحدة."
  };
  // morceaux de phrase (textes construits avec des nombres)
  const MOTIFS = [
    [/^(\d+) pts$/, "$1 نقطة"], [/^= (\d+) points?$/, "= $1 نقطة"], [/^\+1 (.+)$/, "+1 $1"],
    [/^🏆 Gagnant de (.+?) : (.+)$/, "🏆 الفائز ديال $1: $2"], [/^Classement · (.+)$/, "الترتيب · $1"],
    [/^🎁 Offrir : (.+)$/, "🎁 عطيه: $1"], [/ · 🎁 récompense prête$/, " · 🎁 المكافأة واجدة"]
  ];

  const ATTRS = ["placeholder", "title", "aria-label"];
  const orig = new WeakMap();      // texte français d'origine de chaque nœud (pour revenir en FR)
  function trad(t) {
    const s = t.trim(); if (!s) return null;
    if (AR[s]) return t.replace(s, AR[s]);
    for (const [re, r] of MOTIFS) if (re.test(s)) return t.replace(s, s.replace(re, r));
    return null;
  }
  function traduireNoeud(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return;
      const v = n.nodeValue, r = trad(v);
      if (r != null && r !== v) { orig.set(n, v); n.nodeValue = r; }
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName)) return;
    for (const a of ATTRS) { const v = n.getAttribute && n.getAttribute(a); if (v) { const r = trad(v); if (r != null && r !== v) { n.setAttribute("data-fr-" + a, v); n.setAttribute(a, r); } } }
    for (const c of n.childNodes) traduireNoeud(c);
  }
  function revenirFR(n) {
    if (n.nodeType === 3) { if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); } return; }
    if (n.nodeType !== 1) return;
    for (const a of ATTRS) { const v = n.getAttribute("data-fr-" + a); if (v != null) { n.setAttribute(a, v); n.removeAttribute("data-fr-" + a); } }
    for (const c of n.childNodes) revenirFR(c);
  }

  let obs = null;
  function appliquer() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("ar", lang === "ar");
    if (lang === "ar") {
      traduireNoeud(document.body);
      if (!obs) {
        obs = new MutationObserver(ms => { for (const m of ms) { if (m.type === "characterData") traduireNoeud(m.target); else m.addedNodes.forEach(traduireNoeud); } });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    } else {
      if (obs) { obs.disconnect(); obs = null; }
      revenirFR(document.body);
    }
    const b = document.getElementById("langBtn"); if (b) b.textContent = lang === "ar" ? "FR" : "عربي";
  }

  function bouton() {
    const zone = document.querySelector(".top-in");
    if (!zone || document.getElementById("langBtn")) return;
    const b = document.createElement("button");
    b.id = "langBtn"; b.type = "button"; b.className = "btn sm ghost"; b.style.fontFamily = '"IBM Plex Sans Arabic","Readex Pro",sans-serif';
    b.setAttribute("aria-label", "Langue / اللغة");
    b.onclick = () => { lang = lang === "ar" ? "fr" : "ar"; try { localStorage.setItem(CLE, lang); } catch (e) {} appliquer(); };
    const sortie = document.getElementById("logoutBtn");
    if (sortie && sortie.parentNode === zone) zone.insertBefore(b, sortie); else zone.appendChild(b);
  }

  const st = document.createElement("style");
  st.textContent = 'html.ar body{font-family:"IBM Plex Sans Arabic","Readex Pro",system-ui,sans-serif}html.ar .num,html.ar input[type=tel],html.ar input[type=email]{direction:ltr;unicode-bidi:isolate}html.ar .muted,html.ar h2,html.ar h3{unicode-bidi:plaintext}';
  document.head.appendChild(st);
  const go = () => { bouton(); appliquer(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  window.NFCW_LANGUE = { get: () => lang };
})();
