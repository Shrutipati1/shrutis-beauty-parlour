/* admin shell: sidebar + toast + appointment status */
(function () {
  'use strict';
  var toast = document.getElementById('adminToast');
  window.adminToast = function (text, isError) {
    if (!toast) return;
    toast.textContent = text;
    toast.className = 'admin-toast' + (isError ? ' error' : '');
    toast.hidden = false;
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(function () { toast.hidden = true; }, 4000);
  };

  var menuBtn = document.getElementById('adminMenu');
  var side = document.getElementById('adminSide');
  if (menuBtn && side) {
    menuBtn.addEventListener('click', function () { side.classList.toggle('open'); });
    document.addEventListener('click', function (e) {
      if (side.classList.contains('open') && !side.contains(e.target) && e.target !== menuBtn) side.classList.remove('open');
    });
  }

  window.csrfToken = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  var postJSON = function (url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
      body: JSON.stringify(body || {})
    });
  };
  window.adminPost = postJSON;

  document.querySelectorAll('[data-action][data-id]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var status = btn.dataset.action;
      var id = btn.dataset.id;
      if (status === 'cancelled' && !window.confirm('Cancel this appointment? The slot will be released.')) return;
      btn.disabled = true;
      try {
        var res = await postJSON('/admin/appointments/' + id + '/status', { status: status });
        var json = await res.json();
        window.adminToast(json.message || 'Updated.', !json.success);
        if (json.success) setTimeout(function () { window.location.reload(); }, 800);
        else btn.disabled = false;
      } catch (err) {
        window.adminToast('Network error.', true);
        btn.disabled = false;
      }
    });
  });
})();