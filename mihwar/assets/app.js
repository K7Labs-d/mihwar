/* ==========================================================================
   مِحور — التفاعلات
   ملف واحد يخدم الصفحتين؛ كل وحدة تتحقق من وجود عناصرها قبل الربط.
   جافاسكربت أصلي بلا اعتماديات.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------- تبديل الوضع ---------------------------- */

  function initTheme() {
    var toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      // القراءة من الحالة الفعلية المحسوبة، لا من السمة وحدها،
      // كي يعمل الضغط الأول بشكل صحيح عندما يكون المصدر تفضيل النظام.
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.hasAttribute('data-theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);

      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('mihwar-theme', next); } catch (e) { /* وضع التصفح الخاص */ }
      toggle.setAttribute('aria-label', next === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي');
    });
  }

  /* --------------------------- قائمة الجوّال --------------------------- */

  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var menu = document.getElementById('nav-menu');
    if (!toggle || !menu) return;

    var mq = window.matchMedia('(max-width: 900px)');

    function sync() {
      if (mq.matches) {
        menu.hidden = toggle.getAttribute('aria-expanded') !== 'true';
      } else {
        menu.hidden = false; // على سطح المكتب القائمة ظاهرة دائماً
      }
    }

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      sync();
    });

    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && mq.matches) {
        toggle.setAttribute('aria-expanded', 'false');
        sync();
      }
    });

    mq.addEventListener('change', sync);
    sync();
  }

  /* ------------------------- الأسئلة الشائعة ------------------------- */

  function initFaq() {
    var questions = document.querySelectorAll('.faq-q');
    if (!questions.length) return;

    questions.forEach(function (q) {
      q.addEventListener('click', function () {
        var open = q.getAttribute('aria-expanded') === 'true';
        q.setAttribute('aria-expanded', String(!open));
        var answer = document.getElementById(q.getAttribute('aria-controls'));
        if (answer) answer.hidden = open;
      });
    });
  }

  /* ------------------------------ التبويبات ------------------------------ */

  function initTabs() {
    var tablist = document.querySelector('[role="tablist"]');
    if (!tablist) return;

    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));

    function select(tab) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { select(tab); });

      // أسهم لوحة المفاتيح — معكوسة لأن الصفحة RTL
      tab.addEventListener('keydown', function (e) {
        var i = tabs.indexOf(tab);
        var next = null;
        if (e.key === 'ArrowLeft') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowRight') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next); next.focus(); }
      });
    });
  }

  /* --------------------- فلترة المعدات (الصفحة الرئيسية) --------------------- */

  function initFilter() {
    var grid = document.querySelector('[data-eq-grid]');
    if (!grid) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-category]'));
    var catButtons = Array.prototype.slice.call(document.querySelectorAll('[data-filter-cat]'));
    var searchInput = document.querySelector('[data-eq-search]');
    var citySelect = document.querySelector('[data-eq-city]');
    var empty = document.querySelector('[data-eq-empty]');
    var count = document.querySelector('[data-eq-count]');

    var activeCat = 'all';

    function apply() {
      var term = searchInput ? searchInput.value.trim().toLowerCase() : '';
      var city = citySelect ? citySelect.value : 'all';
      var visible = 0;

      cards.forEach(function (card) {
        var matchCat = activeCat === 'all' || card.dataset.category === activeCat;
        var matchCity = city === 'all' || card.dataset.city === city;
        var matchTerm = !term || card.dataset.search.toLowerCase().indexOf(term) !== -1;
        var show = matchCat && matchCity && matchTerm;
        card.hidden = !show;
        if (show) visible++;
      });

      if (empty) empty.hidden = visible !== 0;
      if (count) count.textContent = String(visible);
    }

    catButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        // إعادة الضغط على الفئة النشطة تلغي الفلترة
        activeCat = activeCat === btn.dataset.filterCat ? 'all' : btn.dataset.filterCat;
        catButtons.forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.filterCat === activeCat));
        });
        apply();
      });
    });

    if (searchInput) searchInput.addEventListener('input', apply);
    if (citySelect) citySelect.addEventListener('change', apply);

    // شريط بحث الهيرو يمرّر قيمته إلى نفس الفلترة
    var heroForm = document.querySelector('[data-hero-search]');
    if (heroForm) {
      heroForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var heroCat = heroForm.querySelector('[name="category"]');
        var heroCity = heroForm.querySelector('[name="city"]');

        if (heroCat) {
          activeCat = heroCat.value;
          catButtons.forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.filterCat === activeCat));
          });
        }
        if (heroCity && citySelect) citySelect.value = heroCity.value;

        apply();
        var target = document.getElementById('equipment');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    apply();
  }

  /* ------------------------ المعرض (صفحة المعدة) ------------------------ */

  function initGallery() {
    var thumbs = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-thumb]'));
    if (!thumbs.length) return;

    var views = Array.prototype.slice.call(document.querySelectorAll('[data-gallery-view]'));

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        thumbs.forEach(function (t) { t.setAttribute('aria-selected', String(t === thumb)); });
        views.forEach(function (v) {
          // العروض عناصر SVG، و«hidden» خاصية على HTMLElement فقط — إسنادها هنا
          // ينشئ خاصية زائدة دون أن يمسّ السمة، فنستخدم toggleAttribute المتاح على Element.
          v.toggleAttribute('hidden', v.dataset.galleryView !== thumb.dataset.galleryThumb);
        });
      });
    });
  }

  /* --------------------- حاسبة السعر (صفحة المعدة) --------------------- */

  function initCalculator() {
    var form = document.querySelector('[data-booking-form]');
    if (!form) return;

    // كل الأرقام استرشادية (placeholder) — راجع mihwar/README.md
    // الأسبوع بخصم يعادل 6 أيام، والشهر يعادل 21.4 يوماً تقريباً
    var RATES = { day: 3500, week: 21000, month: 75000 };  // ريال، للوحدة الواحدة
    var UNIT_LABEL = { day: 'يوم', week: 'أسبوع', month: 'شهر' };
    var OPERATOR_PER_DAY = 420;                            // أجرة المشغّل اليومية
    var DAYS_IN = { day: 1, week: 7, month: 30 };
    var TRANSPORT_FLAT = 900;                              // نقل ذهاباً وإياباً
    var VAT = 0.15;

    var els = {
      qty: form.querySelector('[data-qty-input]'),
      operator: form.querySelector('[data-opt-operator]'),
      transport: form.querySelector('[data-opt-transport]'),
      start: form.querySelector('[data-start-date]'),
      dateError: form.querySelector('[data-date-error]'),
      status: document.querySelector('[data-booking-status]')
    };

    var out = {
      headline: document.querySelector('[data-price-headline]'),
      headlineUnit: document.querySelector('[data-price-unit]'),
      base: document.querySelector('[data-sum-base]'),
      baseLabel: document.querySelector('[data-sum-base-label]'),
      operatorRow: document.querySelector('[data-row-operator]'),
      operator: document.querySelector('[data-sum-operator]'),
      transportRow: document.querySelector('[data-row-transport]'),
      transport: document.querySelector('[data-sum-transport]'),
      vat: document.querySelector('[data-sum-vat]'),
      total: document.querySelector('[data-sum-total]')
    };

    // -u-nu-latn يفرض الأرقام اللاتينية؛ 'ar-SA' وحدها تُخرج أرقاماً هندية
    var fmt = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 0 });
    function riyal(n) { return fmt.format(Math.round(n)) + ' ر.س'; }

    function currentPeriod() {
      var checked = form.querySelector('[name="period"]:checked');
      return checked ? checked.value : 'day';
    }

    function recalc() {
      var period = currentPeriod();
      var qty = Math.max(1, Math.min(10, parseInt(els.qty.value, 10) || 1));
      var rate = RATES[period];

      var base = rate * qty;
      var operatorFee = els.operator && els.operator.checked ? OPERATOR_PER_DAY * DAYS_IN[period] * qty : 0;
      var transportFee = els.transport && els.transport.checked ? TRANSPORT_FLAT * qty : 0;

      var subtotal = base + operatorFee + transportFee;
      var vat = subtotal * VAT;

      if (out.headline) out.headline.textContent = riyal(rate);
      if (out.headlineUnit) out.headlineUnit.textContent = '/ ' + UNIT_LABEL[period];
      if (out.baseLabel) out.baseLabel.textContent = 'الإيجار (' + qty + ' × ' + UNIT_LABEL[period] + ')';
      if (out.base) out.base.textContent = riyal(base);

      if (out.operatorRow) out.operatorRow.hidden = operatorFee === 0;
      if (out.operator) out.operator.textContent = riyal(operatorFee);
      if (out.transportRow) out.transportRow.hidden = transportFee === 0;
      if (out.transport) out.transport.textContent = riyal(transportFee);

      if (out.vat) out.vat.textContent = riyal(vat);
      if (out.total) out.total.textContent = riyal(subtotal + vat);
    }

    // منع التواريخ الماضية
    if (els.start) {
      var today = new Date();
      var iso = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
      els.start.min = iso;

      els.start.addEventListener('change', function () {
        var invalid = els.start.value !== '' && els.start.value < iso;
        if (els.dateError) els.dateError.hidden = !invalid;
        els.start.setAttribute('aria-invalid', String(invalid));
      });
    }

    // أزرار العدد
    form.querySelectorAll('[data-qty-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var step = parseInt(btn.dataset.qtyStep, 10);
        var next = (parseInt(els.qty.value, 10) || 1) + step;
        els.qty.value = String(Math.max(1, Math.min(10, next)));
        recalc();
      });
    });

    form.addEventListener('change', recalc);
    form.addEventListener('input', recalc);

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (els.start && !els.start.value) {
        if (els.dateError) {
          els.dateError.textContent = 'اختر تاريخ بدء التأجير.';
          els.dateError.hidden = false;
        }
        els.start.focus();
        return;
      }

      // لا يوجد backend — الإرسال محاكاة على مستوى الواجهة فقط
      if (els.status) {
        els.status.hidden = false;
        els.status.textContent = 'وصل طلبك. سيتواصل معك المالك لتأكيد التوفّر والسعر النهائي.';
        els.status.focus();
      }
    });

    recalc();
  }

  /* -------------------------------- التشغيل -------------------------------- */

  function init() {
    initTheme();
    initNav();
    initFaq();
    initTabs();
    initFilter();
    initGallery();
    initCalculator();

    // سنة التذييل
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
