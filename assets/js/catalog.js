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
   {k:"pro",n:"Pro",p:299,rec:1,f:{ar:["كل مميزات الأساسية","تصميم مخصص بشعار المطعم","صور الأطباق والأوصاف","عدة لغات FR / AR / EN","سهولة التعديل"],fr:["Tout le Standard","Design personnalisé + logo","Photos et descriptions des plats","Plusieurs langues FR / AR / EN","Modifications faciles"]}},
   {k:"prem",n:"Premium",p:399,prem:1,f:{ar:["كل مميزات برو","تصميم فاخر حسب الطلب","منيو رقمي متطور","معرض صور","هوية كاملة + دعم"],fr:["Tout le Pro","Design premium sur mesure","Menu digital avancé","Galerie photos","Branding complet + support"]}},
   {k:"sub",n:{ar:"اشتراك سنوي للمنيو",fr:"Abonnement annuel menu"},p:249,yr:1,f:{ar:["تحديثات غير محدودة","دعم تقني طول العام"],fr:["Mises à jour illimitées","Support technique toute l'année"]}}]},

 {id:"wifi", img:"assets/img/wifi.jpg",
  name:{ar:"لوحة واي فاي",fr:"Plaque Wi-Fi"},
  short:{ar:"اتصال سريع بلا كلمة السر",fr:"Connexion rapide, sans mot de passe"},
  intro:{ar:"زبناءكم كيتصلو بالواي فاي بلا ما يسولو على كلمة السر. مع قلم هدية.",fr:"Vos clients se connectent au Wi-Fi sans demander le mot de passe. Marqueur offert."},
  tiers:[
   {k:"std",n:"Standard",p:79,f:{ar:["لوحة واي فاي + قلم هدية","اسم الشبكة وكلمة السر","إعداد الشبكة","تركيب سهل"],fr:["Plaque Wi-Fi + marqueur cadeau","Nom du Wi-Fi et mot de passe","Configuration du réseau","Installation facile"]}},
   {k:"pro",n:"Pro",p:99,rec:1,f:{ar:["كل مميزات الأساسية","تصميم مخصص","الشعار وألوان العلامة","QR Code","اختبار الاتصال"],fr:["Tout le Standard","Design personnalisé","Logo et couleurs de la marque","QR Code","Test de connexion"]}},
   {k:"prem",n:"Premium",p:149,prem:1,f:{ar:["كل مميزات برو","NFC + QR","تصميم فاخر حسب الطلب","رسالة مخصصة","دعم ما بعد البيع"],fr:["Tout le Pro","NFC + QR Code","Design premium sur mesure","Message personnalisé","Support après-vente"]}}]},

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
