/* =========================================================
   NFCWORK — PAGE « ABONNEMENTS & SOLUTIONS » (solutions.html)
   Toutes les formules avec abonnement, les options et les nouveaux services.
   Pour changer un prix : modifie "setup" (mise en place) ou "mois".
   ========================================================= */
window.SOLUTIONS = {
  formules: [
    { k: "fid", ico: "🎁", setup: 990, mois: 149,
      n: { fr: "Fidélité", ar: "الوفاء" },
      pour: { fr: "Cafés, snacks, salons, pressing, lavage", ar: "القهاوي، السناك، الصالونات، البريسينغ، اللافاج" },
      f: { fr: ["Carte fidélité au logo, sur l’écran du téléphone", "Points par visite, article ou montant", "Vous scannez : impossible de tricher", "Classement et prime des employés", "Plaque comptoir « Ma carte » + affiche + 12 stickers", "Rapport du mois sur WhatsApp"],
           ar: ["كارطة الوفاء باللوغو ديالك، فشاشة التيليفون", "نقط على كل زيارة، سلعة ولا مبلغ", "نتا اللي كتسكاني: ما يمكنش الغش", "ترتيب الخدامة وبريم الشهر", "بلاكة الكونطوار « Ma carte » + ملصق + 12 ستيكر", "تقرير الشهر فالواتساب"] } },
    { k: "fidavis", ico: "⭐", setup: 1090, mois: 149,
      n: { fr: "Fidélité + Avis Google", ar: "الوفاء + تقييمات Google" },
      pour: { fr: "Salons de coiffure, beauté, boutiques", ar: "الحلاقة، التجميل، الحوانت" },
      f: { fr: ["Tout Fidélité", "Plaque avis Google Pro (NFC + QR)", "Plus de clients fidèles et plus d’avis"],
           ar: ["كلشي ديال الوفاء", "بلاكة تقييمات Google Pro (NFC + QR)", "زبناء أوفياء وتقييمات أكثر"] } },
    { k: "menu", ico: "🍽️", setup: 1490, mois: 149,
      n: { fr: "Menu Premium", ar: "منيو بريميوم" },
      pour: { fr: "Restaurants, snacks, pizzerias, cafés", ar: "الريسطوهات، السناك، البيتزا، القهاوي" },
      f: { fr: ["Menu complet avec photos, au logo", "Commande sur WhatsApp, sans commission", "Livraison : zone, minimum, position GPS", "Réservation de table", "Promos et happy hour programmés", "Menu sur écran TV inclus"],
           ar: ["منيو كامل بالتصاور واللوغو ديالك", "الطلب فالواتساب، بلا كوميسيون", "التوصيل: المنطقة، الحد الأدنى، موقع GPS", "حجز الطابلة", "برومو و Happy hour بالوقت", "المنيو فالتلفازة داخل"] } },
    { k: "duo", ico: "🏅", setup: 1990, mois: 249, star: true,
      n: { fr: "Menu + Fidélité", ar: "منيو + الوفاء" },
      pour: { fr: "Le duo qui remplit la salle et fait revenir", ar: "الثنائي اللي كيعمّر المحل وكيرجّع الزبناء" },
      f: { fr: ["Tout Menu Premium", "Tout Fidélité", "Plaque comptoir duo « Menu + Ma carte »", "Un seul tableau de bord"],
           ar: ["كلشي ديال منيو بريميوم", "كلشي ديال الوفاء", "بلاكة كونطوار مزدوجة « Menu + Ma carte »", "لوحة تسيير وحدة"] } },
    { k: "full", ico: "🏆", setup: 2490, mois: 299,
      n: { fr: "Commerce Complet", ar: "المحل الكامل" },
      pour: { fr: "Grands cafés, restaurants, lounges, hôtels", ar: "القهاوي الكبار، الريسطوهات، اللاونج، الأوطيلات" },
      f: { fr: ["Tout Menu + Fidélité", "Plaques avis Google et Wi-Fi Premium", "4 plaques de table « Menu + Ma carte »", "Page liens pour Instagram"],
           ar: ["كلشي ديال منيو + الوفاء", "بلاكات تقييمات Google والواي فاي Premium", "4 بلاكات للطوابل « Menu + Ma carte »", "صفحة روابط لإنستغرام"] } },
    { k: "essentiel", ico: "☕", setup: 399, mois: 25,
      n: { fr: "Menu Essentiel", ar: "المنيو الأساسي" },
      pour: { fr: "Petits cafés", ar: "القهاوي الصغار" },
      f: { fr: ["Jusqu’à 40 produits avec photos", "NFC + QR code", "Ou 249 DH par an"],
           ar: ["حتى 40 منتوج بالتصاور", "NFC + QR", "ولا 249 درهم فالعام"] } }
  ],
  // options comprises dans les formules Menu (et démonstrations)
  options: [
    { ico: "📺", n: { fr: "Menu sur écran TV", ar: "المنيو فالتلفازة" }, d: { fr: "Le menu défile tout seul sur la TV du commerce, avec photos, prix, promos et QR code pour commander.", ar: "المنيو كيدوز بوحدو فالتلفازة ديال المحل، بالتصاور والأثمنة والبرومو و QR باش يطلبو." }, demo: "/menu/tv/?m=demo-premium", inc: { fr: "Inclus Menu Premium", ar: "داخل فمنيو بريميوم" } },
    { ico: "📅", n: { fr: "Réservation de table", ar: "حجز الطابلة" }, d: { fr: "Jour, heure, nombre de personnes : la demande arrive sur votre WhatsApp.", ar: "النهار، الساعة، عدد الناس: الطلب كيوصلك فالواتساب." }, demo: "/menu/demo-premium", inc: { fr: "Inclus Menu Premium", ar: "داخل فمنيو بريميوم" } },
    { ico: "🔥", n: { fr: "Promos et happy hour", ar: "البرومو و Happy hour" }, d: { fr: "Un bandeau qui s’affiche tout seul aux jours et heures choisis : petit-déjeuner, happy hour, offre du jour.", ar: "بانر كيبان بوحدو فالأيام والساعات اللي اخترتي: الفطور، Happy hour، عرض النهار." }, demo: "/menu/demo-premium", inc: { fr: "Inclus Menu Premium", ar: "داخل فمنيو بريميوم" } },
    { ico: "🛵", n: { fr: "Livraison sans commission", ar: "التوصيل بلا كوميسيون" }, d: { fr: "Adresse, téléphone et position GPS du client (Google Maps et Plans d’Apple), directement sur WhatsApp.", ar: "العنوان، الهاتف وموقع GPS ديال الزبون (Google Maps و Apple Plans)، نيشان فالواتساب." }, demo: "/menu/demo-premium?livraison", inc: { fr: "Inclus Menu Premium", ar: "داخل فمنيو بريميوم" } },
    { ico: "💈", n: { fr: "Rendez-vous pour salons", ar: "المواعيد للصالونات" }, d: { fr: "Vos services et prix ; le client choisit, donne le jour et l’heure, et envoie la demande sur WhatsApp.", ar: "الخدمات والأثمنة ديالك؛ الزبون كيختار، كيعطي النهار والساعة، وكيصيفط الطلب فالواتساب." }, inc: { fr: "Formule Menu Premium, version salon", ar: "منيو بريميوم، نسخة الصالون" } },
    { ico: "🏨", n: { fr: "Room service pour hôtels", ar: "Room service للأوطيلات" }, d: { fr: "Un QR dans chaque chambre : la commande arrive à la réception avec le numéro de chambre.", ar: "QR فكل بيت: الطلب كيوصل للريسيبسيون مع رقم البيت." }, inc: { fr: "Formule Menu Premium, version hôtel", ar: "منيو بريميوم، نسخة الأوطيل" } },
    { ico: "🛍️", n: { fr: "Catalogue pour boutiques", ar: "كاتالوج للحوانت" }, d: { fr: "Vêtements, téléphones, cosmétiques : vos produits avec photos et prix, commande et livraison sur WhatsApp.", ar: "الحوايج، التيليفونات، الماكياج: المنتجات بالتصاور والأثمنة، الطلب والتوصيل فالواتساب." }, inc: { fr: "Formule Menu Premium, version boutique", ar: "منيو بريميوم، نسخة الحانوت" } },
    { ico: "📊", n: { fr: "Rapport du mois", ar: "تقرير الشهر" }, d: { fr: "Clients inscrits, clients revenus, récompenses, employé du mois : envoyé chaque mois sur WhatsApp.", ar: "الزبناء المسجلين، اللي رجعو، المكافآت، خدام الشهر: كيوصلك كل شهر فالواتساب." }, inc: { fr: "Inclus formules Fidélité", ar: "داخل فباقات الوفاء" } }
  ],
  // services en plus
  services: [
    { ico: "📍", n: { fr: "Gestion de votre fiche Google", ar: "تسيير فيشة Google ديالك" }, d: { fr: "Photos, horaires, publications et réponses aux avis : votre commerce monte sur Google Maps.", ar: "التصاور، الأوقات، البوسطات والجواب على التقييمات: المحل ديالك كيطلع فـ Google Maps." }, p: { fr: "199 DH / mois", ar: "199 درهم / شهر" } },
    { ico: "🌐", n: { fr: "Mini-site vitrine", ar: "سيت صغير (صفحة وحدة)" }, d: { fr: "Une page pro pour médecin, avocat, artisan, agence : services, photos, contact, carte.", ar: "صفحة احترافية للطبيب، المحامي، الصنايعي، الوكالة: الخدمات، التصاور، التواصل، الخريطة." }, p: { fr: "990 DH + 99 DH / mois", ar: "990 درهم + 99 درهم / شهر" } },
    { ico: "👥", n: { fr: "Cartes NFC pour équipes", ar: "كارطات NFC للفرقة" }, d: { fr: "Une carte par employé, toutes mises à jour depuis un seul endroit par l’entreprise.", ar: "كارطة لكل خدام، وكلهم كيتبدلو من بلاصة وحدة." }, p: { fr: "149 DH / carte + 99 DH / mois", ar: "149 درهم للكارطة + 99 درهم / شهر" } },
    { ico: "🎁", n: { fr: "Cartes cadeaux", ar: "بونات الهدية" }, d: { fr: "« Offrez 200 DH de soins » : cartes cadeaux imprimées avec QR, pour salons, spas et restaurants.", ar: "« هدية 200 درهم فالصالون »: بونات مطبوعة مع QR، للصالونات، السبا والريسطوهات." }, p: { fr: "Sur devis", ar: "حسب الطلب" } },
    { ico: "🏠", n: { fr: "Plaques NFC immobilier", ar: "بلاكات NFC للعقار" }, d: { fr: "« À vendre / À louer » avec QR : photos, prix et visite sur WhatsApp.", ar: "« للبيع / للكرا » مع QR: التصاور، الثمن والزيارة فالواتساب." }, p: { fr: "149 DH", ar: "149 درهم" } },
    { ico: "🎟️", n: { fr: "Badges et bracelets NFC", ar: "بادجات وبزالط NFC" }, d: { fr: "Salles de sport, événements, clubs : accès, profil ou lien en un geste.", ar: "صالات الرياضة، الإيفينمونات، الكلوبات: الدخول، البروفيل ولا الرابط بلمسة." }, p: { fr: "Dès 39 DH", ar: "ابتداءً من 39 درهم" } },
    { ico: "🚗", n: { fr: "Sticker NFC location de voiture", ar: "ستيكر NFC لكرا الطوموبيلات" }, d: { fr: "Dans la voiture : contrat, consignes, numéro d’urgence et localisation de l’agence.", ar: "فالطوموبيل: العقد، التعليمات، رقم الطوارئ وموقع الوكالة." }, p: { fr: "79 DH", ar: "79 درهم" } }
  ],
  txt: {
    fr: { k: "Abonnements & solutions", h: "Tout pour faire tourner <em>votre commerce</em>.", p: "Une mise en place payée une seule fois, puis un petit abonnement : hébergement, mises à jour illimitées et support inclus.",
      setup: "Mise en place", mois: "/ mois", dh: "DH", star: "Le plus choisi", want: "Je veux cette formule", pour: "Pour",
      band: [["📅", "À l’année", "12 mois au prix de 10"], ["🎁", "Offre de lancement", "1er mois offert"], ["🤝", "Sans engagement", "Arrêt à la fin de chaque mois"]],
      optH: "Les options de vos formules", optP: "Comprises dans les formules : on les active pour vous.", demo: "Voir la démo",
      srvH: "Services en plus", srvP: "Pour aller plus loin, quel que soit votre métier.", ask: "Demander",
      howH: "Comment ça marche", how: [["Vous choisissez", "La formule et les options, sur WhatsApp ou au commerce."], ["On crée tout", "Menu, photos, carte, plaques : prêt en quelques jours."], ["Vous encaissez", "Vos clients commandent, réservent et reviennent."]],
      ctaH: "On vous prépare une démo à votre nom ?", ctaP: "Envoyez le nom de votre commerce : on vous montre votre menu et votre carte fidélité avant de signer.", ctaB: "Recevoir ma démo",
      waF: "Bonjour, je suis intéressé par la formule ", waS: "Bonjour, je souhaite des infos sur : ", waD: "Bonjour, je veux une démo pour mon commerce : " },
    ar: { k: "الاشتراكات والحلول", h: "كلشي باش يخدم <em>المحل ديالك</em>.", p: "تجهيز كيتخلص مرة وحدة، ومن بعد اشتراك صغير: الاستضافة، التحديثات بلا حدود والدعم داخلين.",
      setup: "التجهيز", mois: "/ شهر", dh: "درهم", star: "الأكثر طلباً", want: "بغيت هاد الباقة", pour: "مناسبة لـ",
      band: [["📅", "بالعام", "12 شهر بثمن 10"], ["🎁", "عرض الإطلاق", "الشهر الأول فابور"], ["🤝", "بلا التزام", "توقف فآخر كل شهر"]],
      optH: "الخيارات ديال الباقات", optP: "داخلين فالباقات: حنا كنفعلوهم ليك.", demo: "شوف الديمو",
      srvH: "خدمات زايدة", srvP: "باش تمشي بعيد، كيفما كانت الحرفة ديالك.", ask: "طلب",
      howH: "كيفاش كتخدم", how: [["كتختار", "الباقة والخيارات، فالواتساب ولا فالمحل."], ["حنا كنوجدو كلشي", "المنيو، التصاور، الكارطة، البلاكات: واجدين فشي أيام."], ["نتا كتربح", "الزبناء كيطلبو، كيحجزو وكيرجعو."]],
      ctaH: "نوجدو ليك ديمو بسمية المحل ديالك؟", ctaP: "صيفط لينا سمية المحل: نورّيوك المنيو وكارطة الوفاء ديالك قبل ما توقع.", ctaB: "بغيت الديمو ديالي",
      waF: "السلام، بغيت معلومات على الباقة ", waS: "السلام، بغيت معلومات على: ", waD: "السلام، بغيت ديمو للمحل ديالي: " }
  }
};

window.SOLUTIONS_RENDER = function (lang, esc, waLink) {
  const S = window.SOLUTIONS, X = S.txt[lang] || S.txt.fr, L = o => (o && (o[lang] || o.fr)) || "";
  const prix = n => n.toLocaleString("fr-FR").replace(/ | /g, " ");
  const box = document.getElementById("solutions"); if (!box) return;
  box.innerHTML = `
  <section class="wrap page-head"><span class="eyebrow">${X.k}</span><h1>${X.h}</h1><p>${X.p}</p></section>
  <section class="wrap"><div class="sol-forms">${S.formules.map(f => `<article class="sol-f${f.star ? " star" : ""}">${f.star ? `<span class="sol-badge">${X.star}</span>` : ""}
      <h2><span>${f.ico}</span>${esc(L(f.n))}</h2><p class="sol-pour">${X.pour} : ${esc(L(f.pour))}</p>
      <div class="sol-pr"><div><small>${X.setup}</small><b class="num"><bdi dir="ltr">${prix(f.setup)}</bdi> <i>${X.dh}</i></b></div><div><small>${lang === "ar" ? "الاشتراك" : "Abonnement"}</small><b class="num"><bdi dir="ltr">${prix(f.mois)}</bdi> <i>${X.dh} ${X.mois}</i></b></div></div>
      <ul>${L(f.f).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <a class="btn ${f.star ? "primary" : ""} block" href="${waLink(X.waF + L(f.n))}" target="_blank" rel="noopener">${X.want}</a></article>`).join("")}</div>
    <div class="sol-band">${X.band.map(([i, a, b]) => `<div><b>${i} ${a}</b>${b}</div>`).join("")}</div></section>
  <section class="wrap section"><div class="sec-h"><div><h2>${X.optH}</h2><p>${X.optP}</p></div></div>
    <div class="sol-grid">${S.options.map(o => `<article class="sol-o"><span class="sol-ic">${o.ico}</span><h3>${esc(L(o.n))}</h3><p>${esc(L(o.d))}</p>
      <div class="sol-foot"><span class="sol-inc">${esc(L(o.inc))}</span>${o.demo ? `<a href="${o.demo}" target="_blank" rel="noopener">${X.demo} →</a>` : ""}</div></article>`).join("")}</div></section>
  <section class="wrap section"><div class="sec-h"><div><h2>${X.srvH}</h2><p>${X.srvP}</p></div></div>
    <div class="sol-grid">${S.services.map(o => `<article class="sol-o"><span class="sol-ic">${o.ico}</span><h3>${esc(L(o.n))}</h3><p>${esc(L(o.d))}</p>
      <div class="sol-foot"><b class="num">${esc(L(o.p))}</b><a href="${waLink(X.waS + L(o.n))}" target="_blank" rel="noopener">${X.ask} →</a></div></article>`).join("")}</div></section>
  <section class="wrap section"><div class="sec-h"><h2>${X.howH}</h2></div>
    <div class="sol-how">${X.how.map(([a, b], i) => `<div><i class="num">${i + 1}</i><b>${a}</b><p>${b}</p></div>`).join("")}</div></section>
  <section class="wrap section"><div class="sol-cta"><div><h2>${X.ctaH}</h2><p>${X.ctaP}</p></div><a class="btn wa lg" href="${waLink(X.waD)}" target="_blank" rel="noopener">${X.ctaB}</a></div></section>`;
};
