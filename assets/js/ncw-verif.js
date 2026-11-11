/* NCW — aides partagées pour la vérification des comptes (livreur / commerçant).
   Compression d'image côté navigateur + envoi vers Firebase Storage. */
(function () {
  "use strict";
  var NCW = window.NCW = window.NCW || {};

  // Redimensionne et compresse une image (max ~1400px, JPEG) → Blob léger.
  NCW.compress = function (file, maxPx, quality) {
    maxPx = maxPx || 1400; quality = quality || 0.72;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Fichier image requis"));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height, r = Math.min(1, maxPx / Math.max(w, h));
        var cw = Math.round(w * r), ch = Math.round(h * r);
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("Échec de compression")); }, "image/jpeg", quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Image illisible")); };
      img.src = url;
    });
  };

  // Compresse puis téléverse sur Storage, renvoie l'URL de téléchargement.
  NCW.uploadImage = function (file, path) {
    return NCW.compress(file).then(function (blob) {
      var ref = window.firebase.storage().ref().child(path);
      return ref.put(blob, { contentType: "image/jpeg" }).then(function () { return ref.getDownloadURL(); });
    });
  };
})();
