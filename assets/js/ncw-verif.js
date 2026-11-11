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
