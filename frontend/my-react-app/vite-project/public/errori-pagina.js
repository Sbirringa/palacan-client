// public/errori-pagina.js  [palacan-l1a]
// Avviso degli errori JavaScript in cima alla pagina: era uno script dentro index.html, identico. Ora e' un file
// a parte perche' la Content-Security-Policy non ammette script nella pagina.
(function () {
  function showError(message) {
    var existing = document.getElementById('__diag_error_overlay');
    var box = existing || document.createElement('div');
    box.id = '__diag_error_overlay';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;' +
      'background:#7a1010;color:#fff;font:12px/1.4 monospace;padding:10px;' +
      'max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-word;';
    box.textContent = (box.textContent ? box.textContent + '\n\n---\n\n' : '') + message;
    if (!existing) document.body.appendChild(box);
  }
  window.addEventListener('error', function (e) {
    showError('ERRORE JS: ' + (e.message || '') + '\n' + (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '') + '\n' + (e.error && e.error.stack ? e.error.stack : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    var text = reason && reason.stack ? reason.stack : String(reason);
    showError('PROMISE NON GESTITA: ' + text);
  });
})();
