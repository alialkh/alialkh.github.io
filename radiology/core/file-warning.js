// Classic script on purpose. Browsers refuse ES modules on file://, so a module could not show this message.
if (location.protocol === 'file:') {
  addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="margin:2rem;padding:1rem;max-width:40rem;font:16px/1.5 system-ui,sans-serif;background:#222;color:#eee;border-radius:8px">' +
      '<strong>This page needs a web server.</strong> Browsers block ES modules opened straight from a file. ' +
      'Run <code>python -m http.server 8000</code> in the <code>radiology</code> folder and open <code>http://localhost:8000</code>, or use the published site.</div>');
  });
}
