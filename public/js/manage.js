/* booking confirmation: cancel + reschedule */
(function () {
  'use strict';
  var ref = window.__bookingRef;
  if (!ref) return;

  var msg = document.getElementById('manageMsg');
  var cancelBtn = document.getElementById('cancelBtn');
  var rescheduleBtn = document.getElementById('rescheduleBtn');
  var form = document.getElementById('rescheduleForm');
  var reDate = document.getElementById('reDate');
  var reTime = document.getElementById('reTime');

  var base = window.__availBase || '';
  var hasService = /\?serviceId=\d+/.test(base);

  if (rescheduleBtn && form) {
    rescheduleBtn.addEventListener('click', function () {
      form.hidden = !form.hidden;
      if (!form.hidden && !reDate.value) {
        reDate.min = new Date().toISOString().slice(0, 10);
        reDate.value = reDate.min;
      }
    });

    reDate.addEventListener('change', loadTimes);

    async function loadTimes() {
      if (!hasService) {
        msg.textContent = 'This service is no longer in our menu. Please contact the salon to reschedule.';
        msg.className = 'form-msg error';
        return;
      }
      reTime.disabled = true;
      reTime.innerHTML = '<option>Loading…</option>';
      try {
        var res = await fetch(base + '&date=' + encodeURIComponent(reDate.value));
        var data = await res.json();
        if (!data.success) throw new Error(data.message);
        if (data.closed || !data.slots.filter(function (s) { return s.available; }).length) {
          reTime.innerHTML = '<option>No slots free</option>';
          msg.textContent = data.message || 'No times free on that date.';
          msg.className = 'form-msg error';
          return;
        }
        reTime.innerHTML = '<option value="">Select a time</option>' +
          data.slots.filter(function (s) { return s.available; })
            .map(function (s) { return '<option value="' + s.time + '">' + s.label + '</option>'; }).join('');
        reTime.disabled = false;
        msg.textContent = '';
        msg.className = 'form-msg';
      } catch (err) {
        reTime.innerHTML = '<option>Unavailable</option>';
        msg.textContent = err.message || 'Could not load times.';
        msg.className = 'form-msg error';
      }
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!reDate.value || !reTime.value) return;
      try {
        var res = await fetch('/booking/' + ref + '/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: reDate.value, time: reTime.value })
        });
        var json = await res.json();
        msg.textContent = json.message;
        msg.className = 'form-msg ' + (json.success ? 'success' : 'error');
        if (json.success) setTimeout(function () { window.location.href = json.redirect; }, 1200);
      } catch (err) {
        msg.textContent = 'Network error. Please try again.';
        msg.className = 'form-msg error';
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async function () {
      if (!window.confirm('Cancel this appointment? The slot will be released for other clients.')) return;
      cancelBtn.disabled = true;
      try {
        var res = await fetch('/booking/' + ref + '/cancel', { method: 'POST' });
        var json = await res.json();
        msg.textContent = json.message;
        msg.className = 'form-msg ' + (json.success ? 'success' : 'error');
        if (json.success) setTimeout(function () { window.location.reload(); }, 1200);
        else cancelBtn.disabled = false;
      } catch (err) {
        msg.textContent = 'Network error. Please try again.';
        msg.className = 'form-msg error';
        cancelBtn.disabled = false;
      }
    });
  }
})();