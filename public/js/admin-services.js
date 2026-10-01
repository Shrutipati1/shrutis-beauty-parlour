/* admin CRUD helpers: edit-in-place forms + delete */
(function () {
  'use strict';
  var toast = window.adminToast || function () {};

  /* submit the entity form as JSON-ish FormData and reload on success */
  function wireForm(formId, endpoint, msgId) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = msgId ? document.getElementById(msgId) : null;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        var res = await fetch(endpoint, { method: 'POST', body: withCsrf(new FormData(form)) });
        var json = await res.json();
        toast(json.message || 'Saved.', !json.success);
        if (json.success) setTimeout(function () { window.location.reload(); }, 700);
      } catch (err) {
        toast('Network error — please try again.', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  /* read a JSON island rendered by the view (safe for text with quotes/apostrophes) */
  function dataset(id) {
    var node = document.getElementById(id);
    if (!node) return [];
    try { return JSON.parse(node.textContent); } catch (e) { return []; }
  }
  var servicesData = dataset('servicesData');
  var reviewsData = dataset('reviewsData');
  var galleryData = dataset('galleryData');
  var faqsData = dataset('faqsData');

  function fill(formId, data, numberFields) {
    var form = document.getElementById(formId);
    if (!form) return;
    (numberFields || []).forEach(function (f) { form.elements[f].value = ''; });
    Object.keys(data || {}).forEach(function (key) {
      if (form.elements[key]) form.elements[key].value = data[key];
    });
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var name = form.elements.name || form.elements.title || form.elements.question;
    if (name) setTimeout(function () { name.focus(); }, 350);
  }

  function del(path, name) {
    if (name && !window.confirm('Delete “' + name + '”? This cannot be undone.')) return;
    fetch(path, {
      method: 'POST',
      headers: { 'X-CSRF-Token': window.csrfToken || (document.querySelector('meta[name="csrf-token"]') || {}).content || '' }
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        toast(json.message || 'Deleted.', !json.success);
        if (json.success) setTimeout(function () { window.location.reload(); }, 700);
      })
      .catch(function () { toast('Network error.', true); });
  }

  function withCsrf(formData) {
    var token = window.csrfToken || (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
    if (token) formData.set('_csrf', token);
    return formData;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    var editService = t.closest('[data-edit-service]');
    if (editService) {
      var s = servicesData.find(function (x) { return String(x.id) === editService.dataset.editService; }) || {};
      fill('serviceForm', {
        id: s.id, name: s.name, category: s.category, price: s.price,
        duration: s.duration, description: s.description, active: s.active ? '1' : '0', sort_order: s.sort_order
      }, ['image', 'image_url']);
      return;
    }
    var delService = t.closest('[data-delete-service]');
    if (delService) return del('/admin/services/' + delService.dataset.deleteService + '/delete', delService.dataset.name);

    var editReview = t.closest('[data-edit-review]');
    if (editReview) {
      var r = reviewsData.find(function (x) { return String(x.id) === editReview.dataset.editReview; }) || {};
      fill('reviewForm', {
        id: r.id, name: r.name, rating: r.rating, body: r.body,
        is_sample: r.is_sample ? '1' : '0', published: r.published ? '1' : '0'
      }, []);
      return;
    }
    var delReview = t.closest('[data-delete-review]');
    if (delReview) return del('/admin/reviews/' + delReview.dataset.deleteReview + '/delete');

    var editGallery = t.closest('[data-edit-gallery]');
    if (editGallery) {
      var g = galleryData.find(function (x) { return String(x.id) === editGallery.dataset.editGallery; }) || {};
      fill('galleryForm', { id: g.id, title: g.title, category: g.category, sort_order: g.sort_order, image_url: g.image_url }, ['image']);
      return;
    }
    var delGallery = t.closest('[data-delete-gallery]');
    if (delGallery) return del('/admin/gallery/' + delGallery.dataset.deleteGallery + '/delete');

    var editFaq = t.closest('[data-edit-faq]');
    if (editFaq) {
      var f = faqsData.find(function (x) { return String(x.id) === editFaq.dataset.editFaq; }) || {};
      fill('faqForm', { id: f.id, question: f.question, answer: f.answer, sort_order: f.sort_order, active: f.active ? '1' : '0' }, []);
      return;
    }
    var delFaq = t.closest('[data-delete-faq]');
    if (delFaq) return del('/admin/faqs/' + delFaq.dataset.deleteFaq + '/delete');

    var resetBtn = t.closest('[id$="Reset"]');
    if (resetBtn) {
      var rf = document.getElementById(resetBtn.id.replace('Reset', 'Form'));
      if (rf) rf.reset();
    }
  });

  wireForm('serviceForm', '/admin/services/save');
  wireForm('reviewForm', '/admin/reviews/save');
  wireForm('galleryForm', '/admin/gallery/save');
  wireForm('faqForm', '/admin/faqs/save');

  /* password change */
  var pw = document.getElementById('passwordForm');
  if (pw) {
    pw.addEventListener('submit', function (e) {
      e.preventDefault();
      var out = document.getElementById('passwordMsg');
      fetch('/admin/change-password', { method: 'POST', headers: { 'X-CSRF-Token': window.csrfToken || '' }, body: withCsrf(new FormData(pw)) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          out.textContent = res.j.message;
          out.className = 'form-msg ' + (res.ok ? 'success' : 'error');
          if (res.ok) pw.reset();
        })
        .catch(function () {
          out.textContent = 'Network error.';
          out.className = 'form-msg error';
        });
    });
  }
})();