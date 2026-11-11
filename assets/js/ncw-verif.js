/* NCW — aides partagées pour la vérification des comptes (livreur / commerçant).
   Compression d'image côté navigateur -> data-URI JPEG léger, stocké dans Firestore
   (pas de Firebase Storage : évite les soucis de CORS / bucket). */
(function () {
  "use strict";
  var NCW = window.NCW = window.NCW || {};

  function loadImg(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Fichier image requis"));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Image illisible")); };
      img.src = url;
    });
  }
  function draw(img, maxPx) {
    var w = img.width, h = img.height, r = Math.min(1, maxPx / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * r)), ch = Math.max(1, Math.round(h * r));
    var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
    return cv;
  }
  function bytesOf(durl) { var i = durl.indexOf(","); return Math.round((durl.length - i - 1) * 0.75); }

  // Prise de selfie en direct (caméra avant) avec un cadre circulaire.
  // Renvoie un data-URI JPEG. Rejette si la caméra est refusée/indisponible.
  NCW.captureSelfie = function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return reject(new Error("no-camera"));
      var ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0";
      ov.innerHTML =
        '<div style="position:relative;width:min(78vw,300px);height:min(78vw,300px);border-radius:50%;overflow:hidden;border:4px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.6)">' +
        '<video playsinline autoplay muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video></div>' +
        '<p style="color:#fff;font:600 15px -apple-system,system-ui;margin:22px 16px 18px;text-align:center">Mets ton visage dans le cercle 🙂</p>' +
        '<div style="display:flex;gap:14px"><button type="button" id="ncw-cap" style="background:#E07B0A;color:#fff;border:none;border-radius:999px;padding:15px 28px;font:800 16px -apple-system,system-ui;cursor:pointer">📸 Capturer</button>' +
        '<button type="button" id="ncw-cancel" style="background:#333;color:#fff;border:none;border-radius:999px;padding:15px 20px;font:700 15px -apple-system,system-ui;cursor:pointer">Annuler</button></div>';
      document.body.appendChild(ov);
      var video = ov.querySelector("video"), stream = null;
      function cleanup() { try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} ov.remove(); }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
        .then(function (s) { stream = s; video.srcObject = s; }).catch(function (e) { cleanup(); reject(e); });
      ov.querySelector("#ncw-cancel").onclick = function () { cleanup(); reject(new Error("annulé")); };
      ov.querySelector("#ncw-cap").onclick = function () {
        var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
        var s = Math.min(vw, vh), out = Math.min(900, s);
        var cv = document.createElement("canvas"); cv.width = out; cv.height = out;
        var ctx = cv.getContext("2d"); ctx.translate(out, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, out, out);
        var durl = cv.toDataURL("image/jpeg", 0.68); cleanup(); resolve(durl);
      };
    });
  };

  // Renvoie un data-URI JPEG dont la taille est <= targetKB (si possible),
  // en gardant la résolution la plus haute possible (on baisse d'abord la qualité).
  NCW.toDataURL = function (file, targetKB) {
    var target = (targetKB || 130) * 1024;
    var dims = [1400, 1200, 1024, 880, 740, 620];
    var quals = [0.72, 0.62, 0.52, 0.44, 0.38];
    return loadImg(file).then(function (img) {
      var last = "";
      for (var i = 0; i < dims.length; i++) {
        var cv = draw(img, dims[i]);
        for (var j = 0; j < quals.length; j++) {
          var d = cv.toDataURL("image/jpeg", quals[j]);
          last = d;
          if (bytesOf(d) <= target) return d;
        }
      }
      return last;
    });
  };
})();
