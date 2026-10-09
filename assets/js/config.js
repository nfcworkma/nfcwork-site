/* =========================================================
   NFCWORK — CONFIGURATION
   Bdel hna l-ma3lomat dyalk (numéro, Instagram, livraison...)
   ========================================================= */
const CONFIG = {
  brand: "NFCWORK",
  // Numéro WhatsApp b format international (bla + w bla 0 f lowel)
  whatsapp: "212620666027",
  phoneDisplay: "+212 620 666 027",
  instagram: "nfcwork_ma",
  email: "nfcworkmacontact@gmail.com",

  // Lien dyal Google Sheets (Apps Script, kayt-sala b /exec). Khawi = ma kaytsjjel walo.
  // Chof GOOGLE-SHEETS.md
  sheetsUrl: "https://script.google.com/macros/s/AKfycbye82DTJ0LykzZs4XUX-u9Rh1MMk9OEqylX6n6dWfNi44goV6XFCKwf5fkHcZnRJoI_/exec",

  // Frais de livraison par ville (DH). Ville ma kaynach hna = "à confirmer"
  shipping: {
    "Casablanca": 30
  },

  // Prix dyal l-option "Design premium"
  designPremium: 50,

  // Préfixes dyal numéros
  orderPrefix: "NW",
  claimPrefix: "RC"
};

const CITIES = ["Casablanca","Rabat","Salé","Témara","Mohammedia","Marrakech","Fès","Meknès","Tanger","Tétouan","Agadir","Kénitra","El Jadida","Settat","Berrechid","Béni Mellal","Khouribga","Oujda","Nador","Safi","Essaouira","Laâyoune","Dakhla"];
const CITY_AR = {"Casablanca":"الدار البيضاء","Rabat":"الرباط","Salé":"سلا","Témara":"تمارة","Mohammedia":"المحمدية","Marrakech":"مراكش","Fès":"فاس","Meknès":"مكناس","Tanger":"طنجة","Tétouan":"تطوان","Agadir":"أكادير","Kénitra":"القنيطرة","El Jadida":"الجديدة","Settat":"سطات","Berrechid":"برشيد","Béni Mellal":"بني ملال","Khouribga":"خريبكة","Oujda":"وجدة","Nador":"الناظور","Safi":"آسفي","Essaouira":"الصويرة","Laâyoune":"العيون","Dakhla":"الداخلة"};
