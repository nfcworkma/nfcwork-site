(function () {
  "use strict";
  // Marketplace public : liste tous les menus actifs créés dans l'Espace, avec leur logo.
  // Chaque établissement apparaît automatiquement dès qu'il a un menu actif.
  const DOC = "https://firestore.googleapis.com/v1/projects/nfcwork-espace/databases/(default)/documents/settings/";
  const app = document.getElementById("app");
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = { resto: ["🍽", "Restaurant · Café"], boutique: ["🛍", "Boutique"], salon: ["💈", "Salon · Beauté"], hotel: ["🏨", "Hôtel"], location: ["🚗", "Location"] };
  const imgCache = {};

  async function lire(id) {
    try { const r = await fetch(DOC + id, { cache: "no-store" }); if (!r.ok) return null; return (await r.json()).fields || {}; }
    catch (e) { return null; }
  }
  function parse(f) { try { return JSON.parse((f && f.json && f.json.stringValue) || "{}"); } catch (e) { return {}; } }

  async function photo(id) {
    if (!id) return "";
    if (id.startsWith("u:")) return "https://images.unsplash.com/photo-" + id.slice(2) + "?auto=format&fit=crop&w=160&q=70";
    if (id.startsWith("/")) return id;
    if (id.startsWith("o:")) return "";
    if (imgCache[id]) return imgCache[id];
    const f = await lire("mimg-" + id);
    const d = f && f.data && f.data.stringValue;
    if (d && d.startsWith("data:image/")) { imgCache[id] = d; return d; }
    return "";
  }

  function etat(html) { app.innerHTML = html; }
  function vide() {
    etat('<div class="empty"><div><div style="font-size:52px">🍽</div><h2>Bientôt disponible</h2><p>Les restaurants partenaires arrivent très vite.</p></div></div>');
  }

  async function charger() {
    const lf = await lire("menus");
    if (lf === null) { etat('<div class="empty"><div><div style="font-size:48px">📡</div><h2>Connexion impossible</h2><p>Vérifiez votre connexion et réessayez.</p></div></div>'); return; }
    let liste = [];
    try { liste = JSON.parse((lf.json && lf.json.stringValue) || "[]"); } catch (e) {}
    liste = liste.filter(m => m && m.slug && m.actif !== false && !m.arch && !m.corb);
    if (!liste.length) { vide(); return; }

    const restos = [];
    for (const e of liste) {
      const f = await lire("menu-" + e.slug);
      if (!f) continue;
      const m = parse(f);
      if (m.actif === false) continue;
      restos.push({ slug: e.slug, nom: m.nom || e.nom || e.slug, type: m.type || "resto", logo: m.logo || "", slogan: m.slogan || "", livraison: m.livraison || {} });
    }
    if (!restos.length) { vide(); return; }
    rendre(restos);
    // charger les logos en parallèle
    restos.forEach(async r => {
      const el = app.querySelector('.logo[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(r.slug) : r.slug) + '"]');
      if (!el) return;
      const d = await photo(r.logo);
      if (d) { el.style.backgroundImage = "url(" + d + ")"; el.textContent = ""; el.classList.add("img"); }
    });
  }

  function rendre(restos) {
    etat('<div class="bar"><h1>NFCWORK</h1><span class="loc">📍 Kénitra</span></div>' +
      '<div class="pad"><div class="search">🔎 Rechercher un restaurant…</div>' +
      '<div class="sec">' + restos.length + ' établissement' + (restos.length > 1 ? "s" : "") + '</div>' +
      restos.map(r => {
        const t = TYPES[r.type] || TYPES.resto, em = t[0], ty = t[1];
        const liv = r.livraison && r.livraison.actif;
        const badge = liv
          ? '<span class="liv">🛵 ' + (r.livraison.frais ? esc(String(r.livraison.frais)) + " DH" : "Livraison") + '</span>'
          : '<span>🍽 Sur place</span>';
        return '<a class="rcard" href="/menu/' + encodeURIComponent(r.slug) + (liv ? "?livraison" : "") + '">' +
          '<span class="logo" data-slug="' + esc(r.slug) + '">' + em + '</span>' +
          '<span class="info"><span class="nm">' + esc(r.nom) + '</span>' +
          '<span class="ty">' + esc(r.slogan || ty) + '</span>' +
          '<span class="meta">' + badge + '</span></span>' +
          '<span class="chev">›</span></a>';
      }).join("") +
      '<footer>Propulsé par <b>NFCWORK</b> · Le digital qui ramène des clients</footer></div>');
  }

  charger();
})();
