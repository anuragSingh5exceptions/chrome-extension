(function (root) {
  'use strict';
  const DAY = 86400000;
  function weekendCountdown(now = new Date()) {
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const target = new Date(now);
    target.setHours(0,0,0,0);
    target.setDate(target.getDate() + (isWeekend ? (day === 6 ? 2 : 1) : 6 - day));
    const minutes = Math.max(0, Math.ceil((target - now) / 60000));
    return { isWeekend, target, days:Math.floor(minutes / 1440), hours:Math.floor(minutes % 1440 / 60), minutes:minutes % 60 };
  }
  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose both dates.');
    const [year,month,day] = value.split('-').map(Number);
    if (year < 1000 || year > 9999) throw new Error('Choose dates between years 1000 and 9999.');
    const date = new Date(Date.UTC(year,month - 1,day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Choose a valid calendar date.');
    return date;
  }
  function countWeekendDays(startValue, endValue) {
    const start = parseDate(startValue), end = parseDate(endValue);
    if (end < start) throw new Error('End date must be on or after the start date.');
    const totalDays = Math.round((end - start) / DAY) + 1;
    const weeks = Math.floor(totalDays / 7);
    let weekendDays = weeks * 2;
    for (let offset = 0; offset < totalDays % 7; offset++) {
      const day = (start.getUTCDay() + offset) % 7;
      if (day === 0 || day === 6) weekendDays++;
    }
    return { totalDays, weekendDays, weekdays:totalDays - weekendDays };
  }
  function initWidget(document, now = () => new Date()) {
    const $ = id => document.getElementById(id);
    function update() {
      const current = now();
      const result = weekendCountdown(current);
      $('weekend-days').textContent = String(result.days).padStart(2,'0');
      $('weekend-hours').textContent = String(result.hours).padStart(2,'0');
      $('weekend-minutes').textContent = String(result.minutes).padStart(2,'0');
      $('weekend-state').textContent = result.isWeekend ? "It’s the weekend. Make it yours." : 'Your next pause is on its way.';
      document.querySelector('.weekend-countdown').setAttribute('aria-label', result.isWeekend ? 'Time remaining in the weekend' : 'Time until the weekend');
      const targetDate = result.target.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
      $('weekend-target').textContent = `${result.isWeekend ? 'Until' : 'Starts'} ${targetDate} · 12 AM`;
      document.querySelectorAll('[data-weekday]').forEach(day => {
        const today = Number(day.dataset.weekday) === current.getDay();
        day.classList.toggle('is-today',today);
        if (today) day.setAttribute('aria-current','date'); else day.removeAttribute('aria-current');
      });
    }
    const current = now();
    const dateString = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    $('weekend-start').value = dateString(current);
    const monthEnd = new Date(current.getFullYear(),current.getMonth()+1,0);
    $('weekend-end').value = dateString(monthEnd);
    $('weekend-form').addEventListener('submit',event => {
      event.preventDefault();
      try {
        const result = countWeekendDays($('weekend-start').value,$('weekend-end').value);
        $('weekend-result').textContent = `${result.weekendDays} weekend ${result.weekendDays === 1 ? 'day' : 'days'} · ${result.totalDays} total ${result.totalDays === 1 ? 'day' : 'days'}`;
      } catch (error) { $('weekend-result').textContent = error.message; }
    });
    for (const id of ['weekend-start','weekend-end']) $(id).addEventListener('input',() => { $('weekend-result').textContent = ''; });
    document.addEventListener('visibilitychange',() => { if (!document.hidden) update(); });
    update();
    return {update};
  }
  const api = { weekendCountdown, countWeekendDays, parseDate, initWidget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.WeekendCalculator = api;
    const widget = initWidget(root.document);
    root.setInterval(widget.update,30000);
  }
})(globalThis);
