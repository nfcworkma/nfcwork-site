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
    "Montant trop petit pour 1 point.": "المبلغ صغير بزاف على نقطة وحدة.",
    "📊 Rapport du mois": "📊 تقرير الشهر", "Démo 2 min": "ديمو فدقيقتين", "Visites": "الزيارات", "Téléphone caisse": "تيليفون الكيس", "Le commerçant scanne": "المول كيسكاني", "✏️ Modifier": "✏️ بدّل", "🚫 Indispo": "🚫 ماشي متوفرة", "Mes menus": "المنيوات ديالي", "Mon commerce": "المحل ديالي", "🚫 Louée": "🚫 مكرية", "💰 Prix": "💰 الأثمنة", "💾 Enregistrer les prix": "💾 سجّل الأثمنة", "Voitures": "الطوموبيلات", "📥 Fichier": "📥 ملف", "💾 Fichier": "💾 ملف", "🕘 Historique": "🕘 السجل", "↩️ Revenir": "↩️ رجّع", "✅ Version en ligne": "✅ النسخة اللي فـ السيت", "🏪 Mon commerce": "🏪 المحل ديالي", "🚫 Épuisés": "🚫 سالاو", "👁 Voir": "👁 شوف", "🚫 Plats épuisés": "🚫 الأطباق اللي سالات", "✅ Dispo": "✅ كاين", "🚫 Épuisé": "🚫 سالا", "↩️ Tout remettre disponible": "↩️ رجّع كلشي كاين", "🔒 Son espace client": "🔒 الفضاء ديال الزبون", "💾 Enregistrer l’accès": "💾 سجّل الدخول", "⛔ Couper l’accès": "⛔ قطع الدخول", "📊 Visites": "📊 الزيارات", "Facture": "فاكتورة", "Guide": "الدليل", "📖 Guide": "📖 الدليل", "Application": "التطبيق", "Mois dernier": "الشهر اللي فات", "Pas encore de visites.": "مازال حتى زيارة.", "📋 Copier la règle": "📋 نسخ القاعدة", "Devis": "عرض الثمن", "Contrat": "العقد", "Prospects": "الزبناء المحتملين", "＋ Créer": "＋ صاوب", "Rappel": "تذكير", "Payé": "تخلص",
    "🔎 Chercher : client, menu, carte, facture…": "🔎 قلب: زبون، منيو، كارطة، فاتورة…", "⚡ Actions": "⚡ أعمال سريعة", "Appeler": "اتصل", "Menus TV": "منيوهات TV", "PDF → écran TV": "PDF ← شاشة TV", "Cartes, avis, Wi-Fi": "كارطات، تقييمات، واي فاي", "Créer sans Mac": "صاوب بلا ماك",
    "Menu digital": "منيو رقمي", "Carte digitale": "كارطة رقمية", "Avis Google": "تقييمات Google", "Page liens": "صفحة روابط", "Carte fidélité": "كارطة الوفاء", "Menu TV (PDF)": "منيو TV (PDF)", "Stand QR": "ستاند QR", "Facture": "فاتورة", "Envoyer sur WhatsApp": "صيفط فالواتساب", "Copier": "نسخ", "Rapport copié": "تنسخ التقرير",
    "Envoyez-le au commerçant chaque mois : il voit ce que la carte fidélité lui rapporte.": "صيفطو كل شهر: كتشوف شنو كتجيب ليك كارطة الوفاء."
  };
  // ajouts : tout ce que voit le commerçant (statuts, catalogue, formulaires, aide…)
  Object.assign(AR, {
    "Modifier le site": "تعديل السيت", "Menus": "المنيوهات", "Stands": "الستاندات", "Services": "الخدمات", "Retour": "رجوع",
    "Modifier les textes, prix et photos du site": "تعديل النصوص والأثمنة والصور ديال السيت", "Créer et modifier les menus digitaux": "إنشاء وتعديل المنيوهات الرقمية",
    "Stands QR : lier un stand imprimé à un menu ou un lien": "ستاندات QR: ربط ستاند مطبوع بمنيو ولا رابط", "Langue / اللغة": "اللغة",
    "Fidélité · nfcwork.ma": "الوفاء · nfcwork.ma", "Cartes clients & employés": "كارطات الزبناء والخدامة",
    // connexion / erreurs
    "E-mail ou mot de passe incorrect.": "البريد ولا كلمة السر غالطين.", "Aucun compte avec cet e-mail.": "ما كاين حتى حساب بهاد البريد.",
    "Un compte existe déjà avec cet e-mail : connectez-vous.": "كاين ديجا حساب بهاد البريد: دخل بيه.", "Mot de passe trop court (6 caractères minimum).": "كلمة السر قصيرة بزاف (6 حروف على الأقل).",
    "Adresse e-mail invalide.": "البريد الإلكتروني ماشي صحيح.", "Trop de tentatives. Réessayez dans quelques minutes.": "بزاف ديال المحاولات. عاود من بعد شي دقايق.",
    "Pas de connexion Internet.": "ما كاينش الأنترنيت.", "Une erreur est survenue, réessayez.": "وقع شي خطأ، عاود جرب.",
    "Accès refusé ou connexion perdue.": "الدخول مرفوض ولا تقطع الاتصال.", "Action refusée : vérifiez que votre e-mail est confirmé.": "العملية مرفوضة: تأكد بلي البريد ديالك مأكد.",
    "Connectez-vous avec le compte de votre commerce.": "دخل بالحساب ديال المحل ديالك.", "Pas encore de compte ?": "مازال ما عندكش حساب؟",
    "Créez-le dans l’Espace client": "صاوبو فـ فضاء الزبون", "Ouvrez le lien reçu par e-mail, puis revenez ici.": "حل الرابط اللي وصلك فالبريد، ومن بعد رجع هنا.",
    "Pas encore de programme fidélité": "مازال ما عندكش برنامج الوفاء", "Contactez NFCWORK pour activer la carte fidélité de votre commerce.": "تواصل مع NFCWORK باش نفعّلو كارطة الوفاء ديال المحل ديالك.",
    "WhatsApp NFCWORK": "واتساب NFCWORK", "Profil enregistré": "تسجل الحساب", "Lien copié": "تنسخ الرابط", "Copiez le lien :": "نسخ الرابط:", "Copiez :": "نسخ:",
    // statuts
    "Nouvelle": "جديدة", "Confirmée": "مأكدة", "En préparation": "كتوجد", "Prête": "واجدة", "Livrée": "توصلات", "Annulée": "ملغية", "Devis demandé": "طلب عرض الثمن",
    "Sur devis": "حسب العرض", "Payée": "مخلصة", "Brouillon": "مسودة", "En retard": "متأخرة", "Envoyée": "مرسلة", "Ouverte": "مفتوحة", "Résolue": "تحلّات", "Aucune": "والو",
    "Désactivé": "متوقف", "Visites": "الزيارات", "Articles": "السلع", "Montant": "المبلغ", "1 point par visite": "نقطة فكل زيارة", "1 point par article acheté": "نقطة على كل سلعة",
    "Points selon le montant en DH": "النقط حسب المبلغ بالدرهم", "/ mois": "/ شهر", "/ an": "/ عام", "une fois": "مرة وحدة",
    // catalogue
    "Tout": "كلشي", "Cartes NFC": "كارطات NFC", "Clés NFC": "سوارت NFC", "LED": "LED", "Packs": "الباقات", "Recommandé": "ننصحو بيه", "Best seller": "الأكثر مبيعاً",
    "Premium": "بريميوم", "Prix de lancement": "ثمن الإطلاق", "Ajouté au panier": "تزاد للسلة", "Cartes de visite NFC et solutions sans contact pour professionnels au Maroc.": "كارطات الزيارة NFC وحلول بلا لمس للمهنيين فالمغرب.",
    "modifier": "بدّل", "＋ Nouvelle": "＋ جديدة", "Supprimer": "حذف", "Retirer": "حيد",
    // questionnaires du panier
    "Nom": "الاسم", "Entreprise": "الشركة", "Métiers (un par ligne)": "المهن (وحدة فكل سطر)", "WhatsApp (si différent)": "واتساب (إلا كان مختلف)", "Site web": "الموقع",
    "Adresse": "العنوان", "Google Maps (lien de localisation)": "Google Maps (رابط الموقع)", "Nom du commerce": "سمية المحل", "Lien Google Maps de votre commerce": "رابط Google Maps ديال المحل ديالك",
    "Nom du réseau Wi-Fi": "سمية شبكة الواي فاي", "Mot de passe Wi-Fi": "كلمة السر ديال الواي فاي", "Sécurité": "الحماية", "Réseau caché (invisible dans la liste)": "شبكة مخبية (ما كتبانش فاللائحة)",
    "WPA / WPA2 (le plus courant)": "WPA / WPA2 (الأكثر استعمالاً)", "WEP (ancien)": "WEP (قديم)", "Ouvert (sans mot de passe)": "مفتوح (بلا كلمة سر)",
    "Le mot de passe sera visible par toute personne qui scanne la plaque. Conseil : un réseau « invités ».": "كلمة السر غادي تبان لأي واحد سكانا البلاكة. نصيحة: دير شبكة ديال « الضيوف ».",
    "Nom du restaurant": "سمية الريسطو", "Horaires": "الأوقات", "Votre menu": "المنيو ديالك", "Slogan": "الشعار", "Localisation (adresse ou lien Maps)": "الموقع (العنوان ولا رابط Maps)",
    "Vos boutons (un par ligne : « Nom - lien »)": "البوطونات ديالك (وحدة فكل سطر: « الاسم - الرابط »)", "Nom à imprimer, couleur, logo, adresse de livraison…": "الاسم اللي يتطبع، اللون، اللوغو، عنوان التوصيل…",
    "Logo / infos à imprimer": "اللوغو / المعلومات اللي تتطبع", "Noms, fonctions, slogan, couleurs… (le logo s’envoie sur WhatsApp après la demande)": "الأسماء، الوظائف، الشعار، الألوان… (اللوغو كيتصيفط فالواتساب من بعد الطلب)",
    "Description": "الوصف", "Zone": "المنطقة", "Tout le Maroc": "المغرب كامل", "Contact": "التواصل", "15 chiffres": "15 رقم", "06 …": "06 …",
    // réclamations / modifications
    "Réclamation / SAV": "شكاية / خدمة ما بعد البيع", "Retard de livraison": "تأخر التوصيل", "Produit cassé / défectueux": "منتوج مهرس / فيه عيب", "NFC ou QR ne fonctionne pas": "NFC ولا QR ما خدامش",
    "Erreur de design ou d'informations": "غلط فالتصميم ولا المعلومات", "Modifier mes informations": "تبديل المعلومات ديالي", "Problème de paiement": "مشكل فالأداء", "Autre": "آخر",
    "Produit": "المنتوج", "Téléphone / WhatsApp": "الهاتف / واتساب", "Réseaux sociaux": "شبكات التواصل", "Photo": "الصورة", "Entreprise / métiers": "الشركة / المهن", "Lien Google": "رابط Google",
    "Logo": "اللوغو", "Nom du réseau": "سمية الشبكة", "Prix": "الأثمنة", "Plats (ajout / retrait)": "الأطباق (زيادة / حذف)", "Photos": "الصور", "Boutons / liens": "البوطونات / الروابط",
    "Décrivez la modification.": "وصف التعديل اللي بغيتي.", "Ex. 06 12 34 56 78": "مثلا 06 12 34 56 78",
    // factures
    "Facture": "فاتورة", "Facturé à": "الفاتورة باسم", "Désignation": "البيان", "Qté": "الكمية", "Total HT": "المجموع بلا ضريبة", "Total TTC": "المجموع مع الضريبة", "Sous-total": "المجموع الجزئي",
    "Imprimer / PDF": "طبع / PDF", "Client supprimé": "زبون محذوف",
    // fidélité
    "Personne / passer": "حتى واحد / دوز", "Employé ajouté ✓": "تزاد الخدام ✓", "Employé retiré": "تحيد الخدام", "Cette carte n’appartient pas à vos commerces.": "هاد الكارطة ماشي ديال المحلات ديالك.",
    "Cet employé n’appartient pas à vos commerces.": "هاد الخدام ماشي من المحلات ديالك.", "Ce QR n’est pas une carte fidélité NFCWORK.": "هاد QR ماشي كارطة الوفاء ديال NFCWORK.",
    "Caméra indisponible. Vous pouvez aussi scanner la carte avec l’appareil photo du téléphone.": "الكاميرا ما خدامةش. تقدر حتى تسكاني الكارطة بكاميرا التيليفون.",
    "Sur Mac : Imprimer → « Enregistrer au format PDF » pour l’imprimeur. Le même lien peut aussi être programmé dans une plaque NFC.": "فالماك: طبع ← « حفظ بصيغة PDF » باش تعطيه للمطبعة. ونفس الرابط تقدر تبرمجو فبلاكة NFC.",
    "Carte fidélité · scannez pour créer votre carte": "كارطة الوفاء · سكاني باش تصاوب الكارطة ديالك", "Aucun programme": "ما كاين حتى برنامج",
    "Programme enregistré ✓": "تسجل البرنامج ✓", "Métiers enregistrés ✓": "تسجلو المهن ✓",
    // réglages (admin)
    "Nouveau programme": "برنامج جديد", "＋ Nouveau programme": "＋ برنامج جديد", "✏️ Métiers & prix": "✏️ المهن والأثمنة", "Métiers & prix": "المهن والأثمنة", "Programmes de vos clients": "البرامج ديال الزبناء ديالك",
    "＋ Créer un programme": "＋ إنشاء برنامج", "Créez le programme fidélité d’un commerce : type de points, récompense, employés.": "صاوب برنامج الوفاء لشي محل: نوع النقط، المكافأة، الخدامة.",
    "1 · Le métier": "1 · المهنة", "2 · Le commerce": "2 · المحل", "3 · La récompense": "3 · المكافأة", "E-mail du compte commerçant (il scannera les cartes)": "بريد حساب التاجر (هو اللي غادي يسكاني الكارطات)",
    "Couleur de la carte": "لون الكارطة", "Depuis le téléphone ou l’ordinateur. La carte prend sa couleur.": "من التيليفون ولا البيسي. الكارطة كتاخد اللون ديالو.", "📷 Importer le logo": "📷 زيد اللوغو",
    "Objectif": "الهدف", "Unité (coupes, cafés…)": "الوحدة (حسانات، قهاوي…)", "Récompense": "المكافأة", "💡 Idées : touchez pour remplir": "💡 أفكار: ضغط باش تعمّر",
    "Points des employés (classement du mois)": "نقط الخدامة (ترتيب الشهر)", "Plus d’options": "خيارات أخرى", "Comment le client gagne ses points": "كيفاش الزبون كيربح النقط",
    "Qui donne le point à l’employé": "شكون كيعطي النقطة للخدام", "Prime du mois (affichée aux employés)": "بريم الشهر (كيبان للخدامة)", "Prix de l’abonnement (DH)": "ثمن الاشتراك (درهم)",
    "Période": "المدة", "Comment ça marche (affiché au client, une étape par ligne)": "كيفاش كيخدم (كيبان للزبون، مرحلة فكل سطر)", "Programme actif": "البرنامج مفعّل",
    "Vos modèles : ils pré-remplissent chaque nouveau programme. Touchez un métier pour le modifier.": "النماذج ديالك: كيعمّرو كل برنامج جديد. ضغط على مهنة باش تبدلها.",
    "＋ Ajouter un métier": "＋ زيد مهنة", "Revenir aux modèles NFCWORK": "رجع للنماذج ديال NFCWORK", "Icône": "الأيقونة", "Nom du métier": "سمية المهنة", "Prix (DH)": "الثمن (درهم)",
    "Le client gagne des points par…": "الزبون كيربح النقط بـ…", "Points des employés activés par défaut": "نقط الخدامة مفعّلة من الأول",
    "💡 Idées de récompenses (une par ligne : « 10 cafés = 1 café offert » ou « 10 DH = 1 pt, 200 pts = -50 DH »)": "💡 أفكار المكافآت (وحدة فكل سطر: « 10 cafés = 1 café offert » ولا « 10 DH = 1 pt, 200 pts = -50 DH »)",
    "Le client": "الزبون", "Le commerçant": "التاجر", "Mensuel": "شهري", "Annuel": "سنوي"
  });
  // guides et questions fréquentes (générés depuis app.js)
  const GEN = {"txt":{"Utiliser votre carte NFC":"استعمال كارطة NFC ديالك","Astuce : une coque épaisse ou métallique peut gêner la lecture.":"نصيحة: الكوك الغليظة ولا ديال الحديد تقدر تعطل القراءة.","Modifier votre profil digital":"تبديل البروفيل الرقمي ديالك","Envoyez-nous les changements sur WhatsApp, ou faites une demande « Modifier mes informations » dans Réclamation / SAV.":"صيفط لينا التغييرات فالواتساب، ولا دير طلب « تبديل المعلومات ديالي » فالشكايات / خدمة ما بعد البيع.","Nous mettons à jour et vous confirmons.":"كنبدلو ونأكدو ليك.","Installer la plaque Google Reviews":"تركيب بلاكة تقييمات Google","Placez-la là où le client attend : près de la caisse, sur le comptoir ou sur les tables, bien visible.":"حطها فين كيتسنى الزبون: حدا الكيس، على الكونطوار ولا على الطوابل، باينة مزيان.","Testez avec votre propre téléphone : il doit ouvrir votre page d’avis.":"جرب بالتيليفون ديالك: خاصو يحل صفحة التقييمات ديالك.","Invitez vos clients : « Approchez votre téléphone pour nous laisser un avis ». Sans NFC, ils scannent le QR.":"عرض على الزبناء: « قرّب التيليفون ديالك باش تخلي لينا تقييم ». بلا NFC، كيسكانيو QR.","Plaque Wi-Fi":"بلاكة الواي فاي","Modèle Standard : un marqueur est offert pour écrire le nom du réseau et le mot de passe.":"موديل Standard: كنعطيوك ستيلو باش تكتب سمية الشبكة وكلمة السر.","Vous changez de mot de passe Wi-Fi ? Contactez-nous pour mettre la plaque à jour.":"بدلتي كلمة السر ديال الواي فاي؟ تواصل معانا باش نحدّثو البلاكة.","Menu digital NFC + QR":"منيو رقمي NFC + QR","Placez les supports sur les tables ou au comptoir : le menu s’ouvre d’une touche ou d’un scan.":"حط الحوامل على الطوابل ولا فالكونطوار: المنيو كيتحل بلمسة ولا بسكان.","Livraison et délais":"التوصيل والمدة","Le délai est confirmé selon la ville et le design. Vous suivez chaque étape dans « Mes commandes ».":"المدة كتأكد حسب المدينة والتصميم. وتقدر تتبع كل مرحلة فـ « طلباتي ».","Paiement":"الأداء","Le mode de paiement est confirmé avec vous lors de la confirmation de la commande.":"طريقة الأداء كنأكدوها معاك ملي كنأكدو الطلب.","Garantie et SAV":"الضمان وخدمة ما بعد البيع","Produit arrivé défectueux ou qui ne fonctionne pas ? Faites une réclamation : nous trouvons une solution (réparation, reprogrammation ou échange).":"المنتوج وصل خاسر ولا ما خدامش؟ دير شكاية: غادي نلقاو حل (إصلاح، إعادة البرمجة ولا التبديل).","Faut-il une application pour le NFC ?":"واش خاص تطبيق باش يخدم NFC؟","Non. Il suffit d’approcher le téléphone de la carte ou de la plaque. Sans NFC, on scanne le QR code.":"لا. غير قرّب التيليفون من الكارطة ولا البلاكة. بلا NFC، كتسكاني رمز QR.","Ça marche avec iPhone et Android ?":"واش كيخدم مع آيفون وأندرويد؟","Oui, avec la plupart des smartphones récents. Le QR code fonctionne avec tous les téléphones.":"إيه، مع أغلب التيليفونات الجداد. ورمز QR كيخدم مع جميع التيليفونات.","Quel est le délai de livraison ?":"شحال كتاخد مدة التوصيل؟","Nous livrons partout au Maroc. Le délai est confirmé selon la ville et le design.":"كنوصلو لجميع مدن المغرب. المدة كتأكد حسب المدينة والتصميم.","Combien coûte la livraison ?":"شحال ثمن التوصيل؟","Casablanca : 30 DH. Autres villes : confirmé avec vous selon la ville.":"الدار البيضاء: 30 درهم. المدن الأخرى: كنأكدوه معاك حسب المدينة.","Puis-je voir le design avant impression ?":"واش نقدر نشوف التصميم قبل الطباعة؟","Oui, nous envoyons toujours un aperçu et n’imprimons qu’après votre accord.":"إيه، ديما كنصيفطو ليك الشكل وما كنطبعو حتى توافق.","Puis-je modifier les informations plus tard ?":"واش نقدر نبدل المعلومات من بعد؟","Oui, à tout moment, sans changer la carte ou la plaque. Modification de menu +20 DH, ou abonnement annuel 249 DH.":"إيه، فأي وقت، بلا ما تبدل الكارطة ولا البلاكة. تعديل المنيو +20 درهم، ولا اشتراك عام 249 درهم.","Comment payer ?":"كيفاش نخلص؟","Par virement bancaire ou cash à la livraison, confirmé avec vous à la confirmation de la commande.":"بتحويل بنكي ولا كاش عند التوصيل، كنأكدوه معاك ملي كنأكدو الطلب.","J’ai un problème avec ma commande ?":"عندي مشكل فالطلب ديالي؟","Ouvrez une réclamation depuis « Mes commandes » ou l’onglet Aide : nous vous répondons au plus vite.":"فتح شكاية من « طلباتي » ولا من « مساعدة »: كنجاوبوك فأقرب وقت."},"html":{"<b>iPhone</b> (XR et plus récent) : déverrouillez l’écran et approchez le <b>haut</b> de l’iPhone de la carte. Touchez la notification qui s’affiche.":"<b>آيفون</b> (XR ولا أحدث): حل الشاشة وقرّب <b>الفوق</b> ديال الآيفون من الكارطة. ضغط على الإشعار اللي كيطلع.","<b>Android</b> : vérifiez que le NFC est activé (Paramètres → Connexions → NFC), puis approchez le <b>milieu du dos</b> du téléphone de la carte, écran déverrouillé.":"<b>أندرويد</b>: تأكد بلي NFC مشعول (الإعدادات ← الاتصالات ← NFC)، ومن بعد قرّب <b>الوسط ديال الظهر</b> ديال التيليفون من الكارطة، والشاشة محلولة.","Aucune application n’est nécessaire. Sans NFC, scannez simplement le <b>QR code</b> avec l’appareil photo.":"ما محتاج حتى تطبيق. بلا NFC، سكاني غير <b>رمز QR</b> بالكاميرا.","Vos informations (téléphone, réseaux, adresse…) sont modifiables à tout moment, <b>sans changer la carte ou la plaque</b>.":"المعلومات ديالك (الهاتف، الشبكات، العنوان…) تقدر تبدلها فأي وقت، <b>بلا ما تبدل الكارطة ولا البلاكة</b>.","La plaque arrive <b>déjà programmée</b> vers votre page d’avis Google.":"البلاكة كتوصل <b>مبرمجة من قبل</b> على صفحة التقييمات ديالك فـ Google.","Vos clients se connectent au Wi-Fi <b>sans demander le mot de passe</b> : ils approchent leur téléphone ou scannent le QR.":"الزبناء ديالك كيدخلو للواي فاي <b>بلا ما يسولو على كلمة السر</b>: كيقربو التيليفون ولا كيسكانيو QR.","Changement de prix ou de plats : modification de menu <b>+20 DH</b>, ou <b>abonnement annuel 249 DH</b> (mises à jour illimitées + support toute l’année).":"تبديل الأثمنة ولا الأطباق: تعديل المنيو <b>+20 درهم</b>، ولا <b>اشتراك عام 249 درهم</b> (تحديثات بلا حدود + دعم طول العام).","Nous livrons <b>partout au Maroc</b>.":"كنوصلو <b>لجميع مدن المغرب</b>.","Casablanca : <b>30 DH</b>. Autres villes : frais confirmés avec vous selon la ville.":"الدار البيضاء: <b>30 درهم</b>. المدن الأخرى: الثمن كنأكدوه معاك حسب المدينة.","<b>Virement bancaire</b> ou <b>cash à la livraison</b>.":"<b>تحويل بنكي</b> ولا <b>كاش عند التوصيل</b>.","Nous envoyons toujours un <b>aperçu du design</b> et n’imprimons qu’après votre validation.":"ديما كنصيفطو ليك <b>شكل التصميم</b> وما كنطبعو حتى توافق.","Installez l’application gratuite <b>NFC Tools</b> (App Store ou Google Play).":"ثبّت التطبيق المجاني <b>NFC Tools</b> (App Store ولا Google Play).","Ouvrez-la et touchez <b>Écrire</b>.":"حلّو وضغط على <b>Écrire</b> (كتابة).","Touchez <b>Ajouter un enregistrement</b>, puis <b>URL / URI</b>.":"ضغط على <b>Ajouter un enregistrement</b> (زيد تسجيل)، ومن بعد <b>URL / URI</b>.","Collez le lien de votre produit (bouton « Copier le lien »), puis <b>OK</b>.":"لصق الرابط ديال المنتوج ديالك (بوطونة « نسخ الرابط »)، ومن بعد <b>OK</b>.","Touchez <b>Écrire</b> et approchez la carte ou la plaque du <b>haut du téléphone</b> (iPhone) ou du <b>milieu du dos</b> (Android).":"ضغط على <b>Écrire</b> وقرّب الكارطة ولا البلاكة من <b>الفوق ديال التيليفون</b> (آيفون) ولا من <b>الوسط ديال الظهر</b> (أندرويد).","« Écriture réussie » <i class=\"ico ico-circle-check\" aria-hidden=\"true\"></i> : testez en approchant un autre téléphone.":"« Écriture réussie » (نجحات الكتابة) <i class=\"ico ico-circle-check\" aria-hidden=\"true\"></i>: جرّب بتقريب تيليفون آخر."}};
  Object.assign(AR, GEN.txt);
  const AR_HTML = GEN.html;
  // catalogue du site : chaque produit a déjà sa version arabe (assets/js/catalog.js)
  try {
    if (typeof CATALOG !== "undefined") CATALOG.forEach(c => {
      const paire = o => { if (o && o.fr && o.ar && !AR[o.fr]) AR[o.fr] = o.ar; };
      paire(c.name); paire(c.short); paire(c.intro);
      (c.tiers || []).forEach(t => { paire(t.n); if (t.f && t.f.fr && t.f.ar) t.f.fr.forEach((x, i) => { if (t.f.ar[i] && !AR[x]) AR[x] = t.f.ar[i]; }); });
    });
  } catch (e) {}

  // dates françaises (« 16 oct. 2026 », « 16 oct., 19:27 »)
  const MOIS = { "janv.": "يناير", "févr.": "فبراير", "mars": "مارس", "avr.": "أبريل", "mai": "ماي", "juin": "يونيو", "juil.": "يوليوز", "août": "غشت", "sept.": "شتنبر", "oct.": "أكتوبر", "nov.": "نونبر", "déc.": "دجنبر" };
  const DATE_RE = /\b(\d{1,2}) (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.),?/g;
  const dates = s => s.replace(DATE_RE, (m, j, mo) => j + " " + MOIS[mo] + (m.endsWith(",") ? "،" : ""));
  const T = s => { const r = trad(s); return r == null ? dates(s) : r; };   // traduit un morceau, sinon le garde (données)
  // phrases construites avec des nombres, des noms ou des dates
  const MOTIFS = [
    [/^([\d\s.,\u202f\u00a0]+) DH$/, "$1 درهم"], [/^(\d+) pts$/, "$1 نقطة"], [/^(\d+) pts = (.+)$/, "$1 نقطة = $2"], [/^(\d+) DH = 1 pt$/, "$1 درهم = 1 نقطة"], [/^= (\d+) points?$/, "= $1 نقطة"],
    [/^🏆 Gagnant de (.+?) : (.+)$/, "🏆 الفائز ديال $1: $2"], [/^Classement · (.+)$/, "الترتيب · $1"],
    [/^🎁 Offrir : (.+)$/, "🎁 عطيه: $1"], [/^(.*) · 🎁 récompense prête$/, (m, a) => a + " · 🎁 المكافأة واجدة"],
    [/^Bonjour (.+)$/, "مرحبا $1"], [/^Contact (.+)$/, "التواصل مع $1"], [/^Réponse de (.+) :$/, "جواب $1:"],
    [/^(\d+) articles?$/, "$1 منتوج"], [/^Ajouter au panier · (.+)$/, "زيد للسلة · $1"], [/^Livraison : (.+) ·$/, "التوصيل: $1 ·"], [/^Livraison : (.+)$/, "التوصيل: $1"],
    [/^Infos pour votre (.+)$/, (m, a) => "معلومات " + T(a)], [/^Étape (\d+) sur (\d+) : (.+)$/, (m, a, b, c) => "المرحلة " + a + " من " + b + ": " + T(c)],
    [/^(\d+)× (.+)$/, (m, a, b) => a + "× " + T(b)], [/^Pack (.+)$/, "باقة $1"], [/^(.+) — (.+)$/, (m, a, b) => T(a) + " — " + T(b)],
    [/^Commande (\S+) · (.+)$/, (m, a, b) => "الطلب " + a + " · " + dates(b)], [/^Commande (\S+)$/, "الطلب $1"],
    [/^(.+) · mis à jour le (.+)$/, (m, a, b) => T(a) + " · تحدّث ف " + dates(b)],
    [/^(.+) · échéance (.+)$/, (m, a, b) => dates(a) + " · آخر أجل " + dates(b)], [/^Émise le (.+)$/, (m, a) => "صدرت ف " + dates(a)], [/^Échéance (.+)$/, (m, a) => "آخر أجل " + dates(a)],
    [/^TVA (.+)$/, "الضريبة $1"], [/^Réclamation (\S+) envoyée$/, "تصيفطات الشكاية $1"], [/^Demande (\S+) envoyée$/, "تصيفط الطلب $1"],
    [/^Les prix sont confirmés par (.+) avant la préparation\. Paiement par virement ou cash à la livraison\.$/, "الأثمنة كيأكدها $1 قبل التوجاد. الأداء بتحويل بنكي ولا كاش عند التوصيل."],
    [/^Utilisez l’e-mail que vous avez donné à (.+)\.$/, "استعمل البريد اللي عطيتي لـ $1."],
    [/^n’est pas encore relié à une fiche client\. Vous pouvez déjà commander ; (.+) créera votre fiche\.$/, "مازال ما مربوط بحتى ملف زبون. تقدر تطلب من دابا؛ $1 غادي يصاوب الملف ديالك."],
    [/^n’est pas encore enregistré comme client\. (.+) l’ajoutera à votre fiche ; vous pouvez déjà commander dans le catalogue\.$/, "مازال ما مسجل كزبون. $1 غادي يزيدو للملف ديالك؛ وتقدر تطلب من الكاتالوج من دابا."],
    [/^n’est pas encore relié à une fiche client\. (.+) la crée lors de votre première commande ; vous pourrez ensuite compléter votre profil ici\.$/, "مازال ما مربوط بحتى ملف زبون. $1 كيصاوبو مع أول طلب ديالك؛ ومن بعد تقدر تكمّل الحساب ديالك هنا."],
    [/^(.*) · (\d+) récompenses? déjà offertes?$/, (m, a, n) => a + " · " + n + " مكافأة تعطات"], [/^\/ (\d+) (.+)$/, "/ $1 $2"],
    [/^\+(\d+) (.+?)(?: · \+1 pour (.+?)| · (le client choisira l’employé))? ✓$/, (m, n, u, e, v) => "+" + n + " " + (u === "point" ? "نقطة" : u) + (e ? " · +1 لـ " + e : v ? " · الزبون غادي يختار الخدام" : "") + " ✓"],
    [/^\+1 pour (.+)$/, "+1 لـ $1"], [/^Confirmer : retirer (.+)$/, "تأكيد: حيد $1"],
    [/^🖨 QR des employés \((\d+)\)$/, "🖨 QR ديال الخدامة ($1)"], [/^Carte fidélité · (.+)$/, "كارطة الوفاء · $1"], [/^QR de (.+)$/, "QR ديال $1"],
    [/^Il manque : (.+)\.\nEnvoyer quand même \? \(vous pourrez compléter sur WhatsApp\)$/, (m, a) => "ناقص: " + a.split(", ").map(x => x.split(" : ").map(T).join(": ")).join("، ") + ".\nنصيفطو واخا هاكا؟ (تقدر تكمّل فالواتساب)"],
    [/^(.+) · (.+)$/, (m) => { const ps = m.split(" · "), t = ps.map(T); return t.join(" · ") === m ? null : t.join(" · "); }]
  ];

  const ATTRS = ["placeholder", "title", "aria-label"];
  const orig = new WeakMap();      // texte français d'origine de chaque nœud (pour revenir en FR)
  function trad(t) {
    const m0 = String(t).match(/^(\s*)([\s\S]*?)(\s*)$/), s = m0[2].replace(/\s+/g, " ");
    if (!s || !/[A-Za-zÀ-ÿ]/.test(s)) return null;
    const res = v => m0[1] + v + m0[3];
    if (AR[s]) return res(AR[s]);
    const brut = m0[2];   // les boîtes de dialogue gardent leurs retours à la ligne
    for (const [re, r] of MOTIFS) {
      const x = brut.match(re) || s.match(re); if (!x) continue;
      const v = typeof r === "function" ? r(...x) : x[0].replace(re, r);
      if (v != null) return res(v);
    }
    const d = dates(s); if (d !== s) return res(d);
    return null;
  }
  const htmlOrig = new WeakMap();   // éléments traduits d'un bloc (texte avec du gras)
  const N = h => h.replace(/\s+/g, " ").trim();
  function traduireNoeud(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return;
      const v = n.nodeValue, r = trad(v);
      if (r != null && r !== v) { orig.set(n, v); n.nodeValue = r; }
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName)) return;
    if (n.firstElementChild && !htmlOrig.has(n)) { const h = AR_HTML[N(n.innerHTML)]; if (h) { htmlOrig.set(n, n.innerHTML); n.innerHTML = h; return; } }
    // une option sans valeur : on garde le texte français comme valeur (ce qui est enregistré ne change pas)
    if (n.nodeName === "OPTION" && !n.hasAttribute("value")) n.setAttribute("value", n.textContent);
    for (const a of ATTRS) { const v = n.getAttribute && n.getAttribute(a); if (v) { const r = trad(v); if (r != null && r !== v) { n.setAttribute("data-fr-" + a, v); n.setAttribute(a, r); } } }
    for (const c of n.childNodes) traduireNoeud(c);
  }
  function revenirFR(n) {
    if (n.nodeType === 3) { if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); } return; }
    if (n.nodeType !== 1) return;
    if (htmlOrig.has(n)) { n.innerHTML = htmlOrig.get(n); htmlOrig.delete(n); return; }
    for (const a of ATTRS) { const v = n.getAttribute("data-fr-" + a); if (v != null) { n.setAttribute(a, v); n.removeAttribute("data-fr-" + a); } }
    for (const c of n.childNodes) revenirFR(c);
  }

  // fenêtres du navigateur (confirmation, alerte, copie)
  ["confirm", "alert", "prompt"].forEach(f => { const o = window[f]; if (!o) return; window[f] = function (msg, ...r) { if (lang === "ar" && msg) { const t = trad(String(msg)); if (t != null) msg = t; } return o.call(window, msg, ...r); }; });
  let titreFR = null;
  let obs = null;
  function appliquer() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("ar", lang === "ar");
    if (titreFR == null) titreFR = document.title;
    document.title = lang === "ar" ? (trad(titreFR) || titreFR) : titreFR;
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
