/* =========================================================
   NFCWORK — CATALOGUE PRODUITS
   Pour changer un prix: modifie "p". Pour ajouter un produit:
   copie un bloc { k:..., n:..., p:..., f:{ar:[],fr:[]} }.
   rec:1 = Recommandé · prem:1 = Premium · best:1 = Best seller
   launch:1 = Prix de lancement · old = ancien prix barré · yr:1 = par an
   ========================================================= */
const CATALOG = [
 {id:"carte", img:"assets/img/carte.jpg",
  name:{ar:"بطاقة أعمال NFC",fr:"Carte NFC Business"},
  short:{ar:"معلوماتك المهنية فلمسة وحدة",fr:"Vos infos pro en un seul geste"},
  intro:{ar:"جميع معلوماتك المهنية فلمسة وحدة: واتساب، الهاتف، إنستغرام، Google Maps والموقع.",fr:"Toutes vos informations professionnelles en un seul geste : WhatsApp, téléphone, réseaux, Google Maps, site web."},
  tiers:[
   {k:"std",n:"Standard",p:99,f:{ar:["بطاقة NFC سوداء (بدون طباعة)","ملف رقمي بسيط","الاسم + الوظيفة","الهاتف، واتساب، الإيميل","QR + برمجة NFC"],fr:["Carte NFC noire (sans impression)","Profil digital simple","Nom + fonction","Téléphone, WhatsApp, e-mail","QR Code + programmation NFC"]}},
   {k:"pro",n:"Pro",p:149,rec:1,f:{ar:["كل مميزات ستاندارد","تصميم مخصص للملف الرقمي","الصورة / الشعار","جميع شبكات التواصل","زر حفظ جهة الاتصال","Google Maps + الموقع"],fr:["Tout le Standard","Design personnalisé du profil","Photo / logo","Tous les réseaux sociaux","Bouton « Enregistrer le contact »","Google Maps + site web"]}},
   {k:"prem",n:"Premium",p:199,prem:1,f:{ar:["كل مميزات برو","تصميم بريميوم حسب الطلب","ملف رقمي متقدم","معرض صور","هوية بصرية كاملة"],fr:["Tout le Pro","Design premium sur mesure","Profil digital avancé","Galerie photos","Branding complet"]}}]},

 {id:"google", img:"assets/img/google.jpg",
  name:{ar:"لوحة تقييمات Google",fr:"Plaque Google Reviews"},
  short:{ar:"جمع تقييمات أكثر بسرعة",fr:"Plus d'avis clients, plus vite"},
  intro:{ar:"الزبون كيقرب التيليفون ولا كيسكاني QR وكيوصل نيشان لصفحة التقييم ديالكم.",fr:"Le client approche son téléphone ou scanne le QR et arrive directement sur votre page d'avis."},
  tiers:[
   {k:"std",n:"Standard",p:99,f:{ar:["لوحة NFC (الموديل الأصلي)","QR لتقييمات Google","التحويل لصفحة Google","برمجة NFC وإعداد","تركيب سهل"],fr:["Plaque NFC (modèle original)","QR Code Google Reviews","Redirection vers la page Google","Programmation NFC","Installation facile"]}},
   {k:"pro",n:"Pro",p:149,rec:1,f:{ar:["كل مميزات الأساسية","تصميم مخصص","شعار المحل وألوانه","NFC + QR","رسالة مخصصة","اختبار ونصائح التركيب"],fr:["Tout le Standard","Design personnalisé","Logo et couleurs du commerce","NFC + QR Code","Message personnalisé","Test + conseils de placement"]}},
   {k:"prem",n:"Premium",p:199,prem:1,f:{ar:["كل مميزات برو","تصميم 100% مخصص","هوية بصرية متكاملة","دعوة / رسالة مخصصة","دعم ما بعد البيع"],fr:["Tout le Pro","Design 100% personnalisé","Branding complet","Call-to-action personnalisé","Support après-vente"]}}]},

 {id:"menu", img:"assets/img/menu.jpg",
  name:{ar:"منيو رقمي NFC + QR",fr:"Menu digital NFC + QR"},
  short:{ar:"منيو عصري ديما محدّث",fr:"Un menu moderne, toujours à jour"},
  intro:{ar:"منيو عصري ديما محدّث، بالصور والأسعار، كيتفتح فالتيليفون بلمسة ولا سكان.",fr:"Un menu moderne, toujours à jour, avec photos et prix, ouvert d'une touche ou d'un scan."},
  tiers:[
   {k:"std",n:"Standard",p:199,f:{ar:["لوحة / حامل NFC","QR + منيو رقمي","التصنيفات، المنتجات، الأسعار","الصور","إعداد أولي + برمجة NFC"],fr:["Plaque / support NFC","QR Code + menu digital","Catégories, produits, prix","Photos","Configuration initiale + NFC"]}},
   {k:"pro",n:"Pro",p:299,rec:1,f:{ar:["كل مميزات الأساسية","تصميم مخصص بشعار المطعم","صور الأطباق والأوصاف","4 ديال الثيمات للاختيار","سهولة التعديل"],fr:["Tout le Standard","Design personnalisé + logo","Photos et descriptions des plats","4 thèmes au choix","Modifications faciles"]}},
   {k:"prem",n:"Premium",p:399,prem:1,f:{ar:["كل مميزات برو","تصميم فاخر حسب الطلب","الطلب عبر واتساب","صور كبيرة للأطباق","هوية كاملة + دعم"],fr:["Tout le Pro","Design premium sur mesure","Commande des clients sur WhatsApp","Grandes photos des plats","Branding complet + support"]}},
   {k:"sub",n:{ar:"اشتراك سنوي للمنيو",fr:"Abonnement annuel menu"},p:249,yr:1,f:{ar:["تحديثات غير محدودة","دعم تقني طول العام"],fr:["Mises à jour illimitées","Support technique toute l'année"]}}]},

 {id:"wifi", img:"assets/img/wifi.jpg",
  name:{ar:"لوحة واي فاي",fr:"Plaque Wi-Fi"},
  short:{ar:"اتصال سريع بلا كلمة السر",fr:"Connexion rapide, sans mot de passe"},
  intro:{ar:"زبناءكم كيتصلو بالواي فاي بلا ما يسولو على كلمة السر. مع قلم هدية.",fr:"Vos clients se connectent au Wi-Fi sans demander le mot de passe. Marqueur offert."},
  tiers:[
   {k:"std",n:"Standard",p:79,f:{ar:["لوحة واي فاي + قلم هدية","اسم الشبكة وكلمة السر","إعداد الشبكة","تركيب سهل"],fr:["Plaque Wi-Fi + marqueur cadeau","Nom du Wi-Fi et mot de passe","Configuration du réseau","Installation facile"]}},
   {k:"pro",n:"Pro",p:99,rec:1,f:{ar:["كل مميزات الأساسية","تصميم مخصص","الشعار وألوان العلامة","QR Code","اختبار الاتصال"],fr:["Tout le Standard","Design personnalisé","Logo et couleurs de la marque","QR Code","Test de connexion"]}},
   {k:"prem",n:"Premium",p:149,prem:1,f:{ar:["كل مميزات برو","NFC + QR","تصميم فاخر حسب الطلب","رسالة مخصصة","دعم ما بعد البيع"],fr:["Tout le Pro","NFC + QR Code","Design premium sur mesure","Message personnalisé","Support après-vente"]}}]},

 // Clé NFC : designs = modèles au choix (un par clé) · nb = nombre de clés dans l'offre
 {id:"cle", img:"assets/img/produits/cle-nfc-cover.webp",
  name:{ar:"مفتاح NFC",fr:"Clé NFC"},
  short:{ar:"الواي فاي، البروفايل، المنيو ولا التقييمات فلمسة",fr:"Wi-Fi, profil, menu ou avis en un tap"},
  intro:{ar:"شاركو الواي فاي ديالكم فلمسة وحدة. ولا البروفايل، المنيو ولا تقييمات Google. 5 ديزاينات للاختيار.",fr:"Partagez votre Wi-Fi en un seul tap. Profil, menu ou avis Google aussi. 5 designs au choix."},
  designs:[
   {k:"wifi",n:{ar:"واي فاي",fr:"Wi-Fi"},img:"assets/img/produits/cle-nfc-wifi.webp"},
   {k:"contact",n:{ar:"جهة الاتصال",fr:"Contact"},img:"assets/img/produits/cle-nfc-contact.webp"},
   {k:"menu",n:{ar:"منيو",fr:"Menu"},img:"assets/img/produits/cle-nfc-menu.webp",
    // formule du menu digital (prix d'une clé Menu = prix de l'offre + plus) — c'est NFCWORK qui remplit le menu
    formules:[{k:"",n:"Standard",plus:0,i:{ar:"صور المنيو ديالكم",fr:"Photos de votre carte"}},
              {k:"pro",n:"Pro",plus:50,i:{ar:"منيو مصمم بالصور والأثمنة",fr:"Menu designé, photos et prix"}},
              {k:"premium",n:"Premium",plus:150,i:{ar:"تصميم فاخر + الطلب عبر واتساب",fr:"Design premium + commande WhatsApp"}}]},
   {k:"google",n:{ar:"تقييمات Google",fr:"Avis Google"},img:"assets/img/produits/cle-nfc-google.webp"},
   {k:"barber",n:{ar:"حلاق",fr:"Barber"},img:"assets/img/produits/cle-nfc-barber.webp"}],
  tiers:[
   {k:"x1",n:{ar:"مفتاح واحد",fr:"1 clé"},p:99,nb:1,f:{ar:["مفتاح NFC واحد","ديزاين من اختيارك","واجد للاستعمال"],fr:["1 clé NFC","Design au choix","Prête à l'emploi"]}},
   {k:"x3",n:{ar:"باقة 3 مفاتيح",fr:"Pack 3 clés"},p:249,nb:3,rec:1,f:{ar:["3 مفاتيح NFC","ديزاين مختلف لكل مفتاح","واجدين للاستعمال"],fr:["3 clés NFC","Un design différent par clé","Prêtes à l'emploi"]}},
   {k:"x5",n:{ar:"باقة 5 مفاتيح",fr:"Pack 5 clés"},p:399,nb:5,f:{ar:["5 مفاتيح NFC","ديزاين مختلف لكل مفتاح","واجدين للاستعمال"],fr:["5 clés NFC","Un design différent par clé","Prêtes à l'emploi"]}}]},

 {id:"led", img:"assets/img/led.jpg",
  name:{ar:"صندوق LED مضيء",fr:"Caisson LED"},
  short:{ar:"اجذبوا الانتباه نهاراً وليلاً",fr:"Attirez l'attention jour et nuit"},
  intro:{ar:"لوحة إعلانية مضيئة كتجذب الزبناء نهاراً وليلاً. للعروض، القوائم والجديد.",fr:"Un caisson lumineux qui attire les clients jour et nuit. Pour promotions, menus et nouveautés."},
  tiers:[
   {k:"a4",n:"A4 · 21 × 29,7 cm",p:499,launch:1,f:{ar:["إضاءة LED قوية","تصميم مخصص لنشاطك","تركيب سهل","استهلاك منخفض"],fr:["Éclairage LED puissant","Visuel personnalisé","Installation simple","Faible consommation"]}},
   {k:"a3",n:"A3 · 29,7 × 42 cm",p:699,launch:1,rec:1,f:{ar:["إضاءة LED قوية","تصميم مخصص لنشاطك","رؤية أكبر ووضوح أعلى","تركيب سهل"],fr:["Éclairage LED puissant","Visuel personnalisé","Grande visibilité","Installation simple"]}}]},

 {id:"packs", img:"assets/img/packs.jpg",
  name:{ar:"الباقات",fr:"Packs"},
  short:{ar:"حلول متكاملة بثمن أحسن",fr:"Solutions complètes, meilleur prix"},
  intro:{ar:"باقات متكاملة بثمن أحسن، مع تصميم وإعداد كامل.",fr:"Des solutions complètes à meilleur prix, design et configuration inclus."},
  tiers:[
   {k:"starter",n:"Starter",p:249,old:298,f:{ar:["بطاقة NFC Business Pro","لوحة تقييمات Google"],fr:["Carte NFC Business Pro","Plaque Google Reviews"]}},
   {k:"professional",n:"Professional",p:249,f:{ar:["بطاقة NFC Business","ملف رقمي احترافي","واتساب، هاتف، إيميل، إنستغرام","Google Maps + QR"],fr:["Carte NFC Business","Profil digital professionnel","WhatsApp, téléphone, e-mail, Instagram","Google Maps + QR Code"]}},
   {k:"cafe",n:"Café",p:499,f:{ar:["منيو رقمي NFC + QR","لوحة تقييمات Google","لوحة واي فاي NFC","تصميم وإعداد كامل"],fr:["Menu digital NFC + QR","Plaque Google Reviews","Plaque Wi-Fi NFC","Design + configuration complète"]}},
   {k:"business",n:"Business",p:499,rec:1,best:1,f:{ar:["منيو رقمي NFC","تقييمات Google NFC","واي فاي NFC","تصميم مخصص + QR","دعم ما بعد البيع"],fr:["Menu digital NFC","Google Reviews NFC","Wi-Fi NFC","Design personnalisé + QR","Support après-vente"]}},
   {k:"restaurant",n:"Restaurant",p:599,launch:1,f:{ar:["منيو رقمي NFC + QR","لوحة تقييمات Google","لوحة واي فاي NFC","تصميم، إعداد واختبار","دعم ما بعد البيع"],fr:["Menu digital NFC + QR","Plaque Google Reviews","Plaque Wi-Fi NFC","Design, configuration, test","Support après-vente"]}},
   {k:"premium",n:"Premium",p:799,prem:1,f:{ar:["بطاقة NFC Business Pro","منيو رقمي NFC","تقييمات Google + واي فاي NFC","تصميم بريميوم","دعم ما بعد البيع"],fr:["Carte NFC Business PRO","Menu digital NFC","Google Reviews + Wi-Fi NFC","Design premium","Support après-vente"]}}]}
];
