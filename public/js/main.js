/* public site behaviour */
(function () {
  'use strict';

  /* header scroll state */
  var header = document.getElementById('siteHeader');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* mobile nav */
  var toggle = document.getElementById('menuToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    var close = function () {
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    };
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  /* scroll reveal */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* category filters (services + gallery) */
  document.querySelectorAll('[data-filter-tabs]').forEach(function (tabs) {
    var scope = tabs.parentElement;
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      tabs.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.dataset.filter;
      var blocks = scope.querySelectorAll('[data-category]');
      var visible = 0;
      blocks.forEach(function (block) {
        var show = filter === 'all' || block.dataset.category === filter;
        block.classList.toggle('is-hidden', !show);
        if (show) visible++;
      });
      var empty = scope.querySelector('[data-empty]');
      if (empty) empty.hidden = visible !== 0;
    });
  });

  /* gallery lightbox */
  var lightbox = document.getElementById('lightbox');
  if (lightbox) {
    var lbImg = lightbox.querySelector('img');
    var lbCap = lightbox.querySelector('.lb-caption');
    var openLb = function (full, caption) {
      lbImg.src = full;
      lbImg.alt = caption || '';
      lbCap.textContent = caption || '';
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    };
    var closeLb = function () {
      lightbox.hidden = true;
      document.body.style.overflow = '';
    };
    document.querySelectorAll('[data-lightbox]').forEach(function (btn) {
      btn.addEventListener('click', function () { openLb(btn.dataset.full, btn.dataset.caption); });
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.closest('.lb-close')) closeLb();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lightbox.hidden) closeLb();
    });
  }

  /* home quick-book: jump to the booking page with the service preselected */
  var quickForm = document.querySelector('[data-quick-booking]');
  if (quickForm) {
    var dateInput = quickForm.querySelector('input[name="date"]');
    if (dateInput) {
      var today = new Date();
      dateInput.min = today.toISOString().slice(0, 10);
      if (!dateInput.value) dateInput.value = dateInput.min;
    }
    quickForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(quickForm);
      var params = new URLSearchParams();
      if (data.get('service_id')) params.set('service', data.get('service_id'));
      if (data.get('date')) params.set('date', data.get('date'));
      window.location.href = '/book' + (params.toString() ? '?' + params.toString() : '');
    });
  }

  /* prefill booking page date from ?date= */
  var bookingDate = new URLSearchParams(window.location.search).get('date');
  var dateField = document.getElementById('dateInput');
  if (bookingDate && dateField && !dateField.value) dateField.value = bookingDate;

  /* preselect bridal services when coming from the bridal page */
  var category = new URLSearchParams(window.location.search).get('category');
  var serviceSelect = document.getElementById('serviceSelect');
  if (category === 'bridal' && serviceSelect) {
    var option = Array.from(serviceSelect.options).find(function (o) { return o.dataset.category === 'Bridal'; });
    if (option) serviceSelect.value = option.value;
  }
})();