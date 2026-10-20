/* NFCWORK — 🌐 Mon site : changer les images de nfcwork.ma depuis l'Espace (admin)
   settings/site = { json: '{"slots":{"hero":"<id>", ...}}' } · chaque image : settings/mimg-<id> { data, site: true } */
(function () {
  "use strict";
  const A = () => window.NFCW_APP;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SLOTS = [
    ["hero", "📱 Grand téléphone en haut", ""], ["heroL", "📱 Téléphone gauche (haut)", "fidelite.jpg"], ["heroR", "📱 Téléphone droite (haut)", "avis.jpg"], ["menu", "🍽 Menu digital · téléphone 1", ""], ["menu2", "🍽 Menu digital · téléphone 2", "menu-commande.jpg"],
    ["fidelite", "🎁 Carte fidélité", "fidelite.jpg"], ["avis", "⭐ Avis Google", "avis.jpg"], ["stand", "🪑 Plaques de table", "stand.png"],
    ["profil", "👤 Carte de visite NFC", "profil.jpg"], ["wifi", "📶 Wi-Fi", "wifi.jpg"], ["tv", "📺 Menu TV", "tv.jpg"],
    ["location", "🚗 Location de voitures", "location.jpg"], ["liens", "🔗 Page liens", "liens.jpg"], ["cle", "🔑 Porte-clés", "cle.jpg"]
  ];
  const rid = () => Math.random().toString(36).slice(2, 12);
  function jpeg(f) {
    return new Promise((ok, ko) => {
      const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(u); let k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement("canvas"), g = c.getContext("2d");
        for (let q = .86, i = 0; i < 10; i++) { c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); const d = c.toDataURL("image/jpeg", q); if (d.length < 900000) return ok(d); if (q > .6) q -= .08; else k *= .85; }
        ko(new Error("trop lourde"));
      };
      im.onerror = () => { URL.revokeObjectURL(u); ko(new Error("illisible")); }; im.src = u;
    });
  }
  async function ouvrir() {
    const ap = A(), fs = ap.fs;
    let S = {};
    try { const d = await fs.doc("settings/site").get(); if (d.exists) S = JSON.parse(d.data().json || "{}").slots || {}; } catch (e) {}
    const imgs = {};
    await Promise.all(Object.values(S).filter(Boolean).map(async id => { try { const d = await fs.doc("settings/mimg-" + id).get(); if (d.exists) imgs[id] = d.data().data; } catch (e) {} }));
    const sauver = async () => { let cur = {}; try { const d = await fs.doc("settings/site").get(); if (d.exists) cur = JSON.parse(d.data().json || "{}") || {}; } catch (e) {} cur.slots = S; await fs.doc("settings/site").set({ json: JSON.stringify(cur), maj: new Date().toISOString() }); };
    const draw = () => {
      ap.openModal(`${ap.head("🌐 Mon site · images")}<a class="btn primary block" href="../index.html?edition=1" style="margin-bottom:12px">✏️ Modifier tout le site (textes, images, couleurs)</a><p class="muted" style="margin:0 0 12px">Ou changez seulement les images de <b>nfcwork.ma</b> ici. Elles apparaissent sur le site en quelques secondes. « Par défaut » remet l’image d’origine.</p>
        <div class="stack" style="gap:10px">${SLOTS.map(([k, n, def]) => { const src = S[k] && imgs[S[k]] ? imgs[S[k]] : def ? "../assets/img/site/" + def : "";
          return `<div class="grow" style="gap:12px;flex-wrap:wrap"><div style="width:64px;height:84px;border-radius:12px;overflow:hidden;background:var(--surface);border:1px solid var(--line);flex:none;display:grid;place-items:center">${src ? `<img src="${esc(src)}" style="width:100%;height:100%;object-fit:cover;object-position:top">` : `<span style="font-size:11px;text-align:center;color:var(--muted)">menu<br>animé</span>`}</div>
            <div style="flex:1;min-width:140px"><b>${esc(n)}</b><div class="muted" style="font-size:12.5px">${S[k] ? "✅ Votre image" : def ? "Image par défaut" : "Menu exemple animé (par défaut)"}</div></div>
            <div class="row" style="gap:6px"><label class="btn sm primary">📷 Changer<input type="file" accept="image/*" hidden data-ms="${k}"></label>${S[k] ? `<button class="btn sm ghost" data-md="${k}">Par défaut</button>` : ""}</div></div>`; }).join("")}</div>
        <p class="muted" style="font-size:12.5px;margin-top:12px">💡 Pour les téléphones : une capture d’écran en hauteur. Pour les plaques et la TV : une photo en largeur.</p>`);
      document.querySelectorAll("[data-ms]").forEach(inp => inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return; const k = inp.dataset.ms;
        try { ap.toast("Envoi…"); const data = await jpeg(f), id = rid(); await fs.doc("settings/mimg-" + id).set({ data, site: true, maj: new Date().toISOString() });
          const old = S[k]; S[k] = id; imgs[id] = data; await sauver(); if (old) fs.doc("settings/mimg-" + old).delete().catch(() => {}); ap.toast("✅ Image changée sur le site"); draw(); }
        catch (e) { console.error(e); ap.toast(/illisible|lourde/.test(e.message) ? "Image illisible : faites une capture d’écran." : "Échec de l’envoi.", true); }
      });
      document.querySelectorAll("[data-md]").forEach(b => b.onclick = async () => { const k = b.dataset.md, old = S[k]; delete S[k]; try { await sauver(); if (old) fs.doc("settings/mimg-" + old).delete().catch(() => {}); ap.toast("Image par défaut remise"); draw(); } catch (e) { ap.toast("Échec.", true); } });
    };
    draw();
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-g='site']"); if (b) { e.preventDefault(); e.stopPropagation(); ouvrir(); } }, true);
  window.NFCW_MONSITE = { ouvrir };
})();
