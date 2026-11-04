// Scripts lancés avant l'affichage de l'app. Ils étaient écrits dans index.html ; ils sont dans ce fichier
// pour que la règle de sécurité CSP puisse interdire tout script écrit dans la page (audit C-043).

// Une seule adresse pour l'app (audit C-111) : les adresses techniques Firebase renvoient vers arvela.fr.
// Sauf les aperçus de test (arvela-app--nom.web.app), qui servent à vérifier une version avant sa publication.
(function () {
  var h = location.hostname;
  if ((/\.web\.app$/.test(h) || /\.firebaseapp\.com$/.test(h)) && h.indexOf('--') < 0 && location.pathname.indexOf('/__/') !== 0) {
    location.replace('https://arvela.fr' + location.pathname + location.search + location.hash);
  }
})();

// Version jour par défaut ; nuit ou automatique seulement si l'utilisatrice l'a choisi. Appliqué avant l'affichage.
(function () {
  var t = null;
  try { t = localStorage.getItem('pam-theme'); } catch (e) {}
  if (t !== 'auto') document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
