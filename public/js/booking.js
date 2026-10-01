/* booking page: live availability + submit */
(function () {
  'use strict';
  var form = document.getElementById('bookingForm');
  if (!form) return;

  var serviceSelect = document.getElementById('serviceSelect');
  var dateInput = document.getElementById('dateInput');
  var timeSelect = document.getElementById('timeSelect');
  var slotHint = document.getElementById('slotHint');
  var errorBox = document.getElementById('bookingError');
  var preview = document.getElementById('servicePreview');
  var total = document.getElementById('bookingTotal');
  var submitBtn = document.getElementById('bookingSubmit');

  var serviceMeta = function () {
    var opt = serviceSelect.options[serviceSelect.selectedIndex];
    if (!opt || !opt.value) return null;
    return {
      name: opt.textContent.trim().split('—')[0].trim(),
      price: +opt.dataset.price,
      duration: +opt.dataset.duration,
      category: opt.dataset.category,
      image: opt.dataset.image
    };
  };

  var money = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };

  function renderService() {
    var s = serviceMeta();
    if (!s) {
      preview.hidden = true;
      total.hidden = true;
      timeSelect.disabled = true;
      timeSelect.innerHTML = '<option value="">Select service &amp; date first</option>';
      return;
    }
    preview.hidden = false;
    var previewImg = preview.querySelector('img');
    if (s.image) { previewImg.src = s.image; previewImg.alt = s.name; previewImg.hidden = false; }
    else previewImg.hidden = true;
    preview.querySelector('strong').textContent = s.name;
    preview.querySelector('p').textContent = 'Sample price: ' + money(s.price) + ' · ' + s.duration + ' minutes';
    total.hidden = false;
    document.getElementById('totalService').textContent = s.name;
    document.getElementById('totalDuration').textContent = s.duration + ' min';
    document.getElementById('totalPrice').textContent = money(s.price);
    loadSlots();
  }

  async function loadSlots() {
    var s = serviceMeta();
    if (!s || !dateInput.value) {
      timeSelect.disabled = true;
      return;
    }
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Loading times…</option>';
    slotHint.classList.remove('error');
    slotHint.textContent = 'Checking availability…';

    try {
      var res = await fetch('/api/availability?serviceId=' + encodeURIComponent(serviceSelect.value) + '&date=' + encodeURIComponent(dateInput.value));
      var data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not load times.');

      if (data.closed || !data.slots.length) {
        timeSelect.innerHTML = '<option value="">No times available</option>';
        slotHint.classList.add('error');
        slotHint.textContent = data.message || 'No times available on this date. Please pick another day.';
        return;
      }

      var free = data.slots.filter(function (x) { return x.available; });
      timeSelect.innerHTML = '<option value="">Select a time</option>' +
        data.slots.map(function (s2) {
          return '<option value="' + s2.time + '"' + (s2.available ? '' : ' disabled') + '>' + s2.label + (s2.available ? '' : ' — booked') + '</option>';
        }).join('');
      timeSelect.disabled = free.length === 0;
      slotHint.classList.toggle('error', free.length === 0);
      slotHint.textContent = free.length
        ? free.length + ' time' + (free.length === 1 ? '' : 's') + ' available on this date.'
        : 'Fully booked on this date — please try another day.';
    } catch (err) {
      timeSelect.innerHTML = '<option value="">Could not load times</option>';
      slotHint.classList.add('error');
      slotHint.textContent = err.message;
    }
  }

  serviceSelect.addEventListener('change', renderService);
  dateInput.addEventListener('change', loadSlots);
  if (serviceSelect.value) renderService();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.hidden = true;
    var data = Object.fromEntries(new FormData(form).entries());

    if (!data.name || data.name.trim().length < 2) return fail('Please enter your full name.', 'name');
    if (!data.phone || data.phone.replace(/\D/g, '').length < 10) return fail('Please enter a valid 10-digit mobile number.', 'phone');
    if (!data.service_id) return fail('Please choose a service.', 'service_id');
    if (!data.date) return fail('Please choose a date.', 'date');
    if (!data.time) return fail('Please choose an available time slot.', 'time');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Confirming…';
    try {
      var res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var json = await res.json();
      if (!res.ok || !json.success) {
        fail(json.message || 'Something went wrong. Please try again.');
        if (json.field === 'time') loadSlots();
        return;
      }
      window.location.href = json.redirect;
    } catch (err) {
      fail('We could not reach the server. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Appointment';
    }
  });

  function fail(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    if (field) {
      var el = form.querySelector('[name="' + field + '"]');
      if (el) el.focus();
    }
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
})();