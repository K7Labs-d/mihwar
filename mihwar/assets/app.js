/* ==========================================================================
   مِحور — التفاعلات
   ملف واحد يخدم صفحات الموقع العام؛ كل وحدة تتحقق من وجود عناصرها قبل الربط.
   جافاسكربت أصلي بلا اعتماديات، والبيانات كلها من assets/data.js.
   ========================================================================== */

(function () {
  'use strict';

  var data = window.MihwarData;

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

  /* ===================== الكتالوج (الصفحة الرئيسية) =====================
     البطاقات تُبنى من assets/data.js، فما تعتمده الإدارة يظهر هنا مباشرة.
     ==================================================================== */

  function ownerNameOf(state, item) {
    var owner = state.owners.find(function (o) { return o.id === item.ownerId; });
    return owner ? owner.name : 'مالك غير محدد';
  }

  function availabilityBadge(item) {
    if (data.isAvailable(item)) return '<span class="badge badge-ok">متاحة الآن</span>';
    var note = item.availabilityNote || 'محجوزة حالياً';
    return '<span class="badge badge-warn">' + data.escapeHTML(note) + '</span>';
  }

  function cardHTML(state, item) {
    var href = data.detailHref(item, '');
    var specs = item.highlights.slice(0, 3).map(function (spec) {
      return '<li>' + data.escapeHTML(spec) + '</li>';
    }).join('');

    return '<article class="eq-card" data-category="' + data.escapeHTML(data.categoryKey(item.category)) + '"' +
      ' data-city="' + data.escapeHTML(data.cityKey(item.city)) + '"' +
      ' data-search="' + data.escapeHTML(item.search) + '">' +
      '<div class="eq-media" style="color:var(--primary)">' +
        '<svg viewBox="0 0 160 100" aria-hidden="true"><use href="#' + data.escapeHTML(item.icon) + '"/></svg>' +
        availabilityBadge(item) +
      '</div>' +
      '<div class="eq-body">' +
        '<h3><a href="' + data.escapeHTML(href) + '">' + data.escapeHTML(item.name) + '</a></h3>' +
        '<p class="eq-meta">' + data.escapeHTML(ownerNameOf(state, item)) + ' · ' + data.escapeHTML(item.city) + '</p>' +
        '<ul class="eq-specs">' + specs + '</ul>' +
        '<div class="eq-foot">' +
          '<p class="eq-price">يبدأ من <strong>' + data.escapeHTML(data.formatRiyal(item.dailyRate)) + '</strong> / يوم</p>' +
          '<a class="btn btn-ghost" href="' + data.escapeHTML(href) + '">التفاصيل</a>' +
        '</div>' +
      '</div>' +
      '</article>';
  }

  function fillCitySelects(listed) {
    var cities = [];
    listed.forEach(function (item) {
      var key = data.cityKey(item.city);
      if (key && cities.indexOf(key) === -1) cities.push(key);
    });

    document.querySelectorAll('[data-city-options]').forEach(function (select) {
      var current = select.value;
      select.innerHTML = '<option value="all">كل المدن</option>' + cities.map(function (key) {
        return '<option value="' + data.escapeHTML(key) + '">' + data.escapeHTML(data.cityLabel(key)) + '</option>';
      }).join('');
      if (current && cities.indexOf(current) !== -1) select.value = current;
    });
  }

  function fillCategoryCounts(listed) {
    document.querySelectorAll('[data-cat-count]').forEach(function (el) {
      var key = el.dataset.catCount;
      var count = listed.filter(function (item) { return data.categoryKey(item.category) === key; }).length;
      el.textContent = data.countLabel(count, { one: 'معدة واحدة', two: 'معدتان', few: 'معدات', many: 'معدة' });
    });
  }

  function initCatalog() {
    var grid = document.querySelector('[data-eq-grid]');
    if (!grid || !data) return;

    var state = data.load();
    var listed = state.equipment.filter(data.isListed);

    grid.innerHTML = listed.map(function (item) { return cardHTML(state, item); }).join('');
    fillCitySelects(listed);
    fillCategoryCounts(listed);
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
      if (count) count.textContent = data.formatNumber(visible);
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

  /* ===================== صفحة المعدة المولّدة =====================
     تخدم كل معدة لا تملك صفحة مكتوبة يدوياً، وتُبنى من نفس بيانات الكتالوج.
     ============================================================== */

  function specTable(rows) {
    if (!rows.length) return '<p class="empty-state">لم يسجّل المالك تفاصيل في هذا القسم بعد.</p>';
    return '<div class="table-wrap"><table class="spec-table"><tbody>' + rows.map(function (row) {
      return '<tr><th scope="row">' + data.escapeHTML(row.label) + '</th><td>' + data.escapeHTML(row.value) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function checkList(items, kind) {
    if (!items.length) return '<p class="empty-state">لا توجد عناصر مسجّلة.</p>';
    var icon = kind === 'no' ? '#i-dash' : '#i-check';
    return '<ul class="check-list ' + kind + '">' + items.map(function (item) {
      return '<li><svg aria-hidden="true"><use href="' + icon + '"/></svg> ' + data.escapeHTML(item) + '</li>';
    }).join('') + '</ul>';
  }

  function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function setHTML(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.innerHTML = value;
  }

  function initEquipmentPage() {
    var host = document.querySelector('[data-equipment-page]');
    if (!host || !data) return;

    var state = data.load();
    var id = new URLSearchParams(location.search).get('id');
    var item = state.equipment.find(function (row) { return row.id === id || row.slug === id; });

    if (!item || !data.isListed(item)) {
      var missing = document.querySelector('[data-equipment-missing]');
      if (missing) missing.hidden = false;
      return;
    }

    // المعدة التي لها صفحة مكتوبة يدوياً تُحوَّل إليها بدل تكرار المحتوى
    if (item.detailPath) {
      location.replace('../' + item.detailPath);
      return;
    }

    var owner = state.owners.find(function (row) { return row.id === item.ownerId; });
    var ownerLabel = owner ? owner.name : 'مالك غير محدد';
    var rates = data.rates(item);

    document.title = item.name + ' للتأجير — مِحور';
    var description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', item.name + ' للتأجير في ' + item.city + ' من ' + ownerLabel +
        '. المواصفات وشروط المالك وتقدير استرشادي للتكلفة عبر منصّة مِحور.');
    }

    host.hidden = false;

    setText('[data-eq-crumb-category]', item.category);
    setText('[data-eq-crumb-name]', item.name);
    setText('[data-eq-city-badge]', item.city);
    setHTML('[data-eq-availability]', availabilityBadge(item));
    setText('[data-eq-title]', item.name);
    setHTML('[data-eq-sub]',
      (item.model ? data.escapeHTML(item.model) + ' — ' : '') + data.escapeHTML(item.summary || '') +
      ' معروضة من <strong>' + data.escapeHTML(ownerLabel) + '</strong>.');
    setHTML('[data-eq-icon]', '<use href="#' + data.escapeHTML(item.icon) + '"/>');

    setText('[data-eq-owner-avatar]', ownerLabel.trim().charAt(0) || 'م');
    setText('[data-eq-owner-name]', ownerLabel);
    setText('[data-eq-owner-meta]',
      'مالك المعدة · ' + item.city + (owner && owner.memberSince ? ' · مُدرج في مِحور منذ ' + owner.memberSince : ''));
    setHTML('[data-eq-owner-docs]', item.documents
      .filter(function (doc) { return doc.status === 'verified'; })
      .map(function (doc) {
        return '<span class="badge badge-ok"><svg aria-hidden="true"><use href="#i-check"/></svg> ' +
          data.escapeHTML(doc.name || doc.type) + '</span>';
      }).join('') || '<span class="badge badge-neutral">مستندات قيد المراجعة</span>');

    setHTML('[data-eq-specs]', specTable(item.specs));
    setHTML('[data-eq-terms]', specTable(item.terms));
    setHTML('[data-eq-included]', checkList(item.included, 'yes'));
    setHTML('[data-eq-excluded]', checkList(item.excluded, 'no'));
    setHTML('[data-eq-renter-docs]', checkList(data.RENTER_DOCUMENTS, 'yes'));
    setHTML('[data-eq-verified-docs]', checkList(data.VERIFIED_DOCUMENTS, 'yes'));
    setText('[data-eq-owner-terms-name]', ownerLabel);

    // معدات ذات صلة — من نفس الفئة أولاً ثم من بقية الكتالوج
    var related = state.equipment.filter(function (row) {
      return row.id !== item.id && data.isListed(row);
    }).sort(function (a, b) {
      return (b.category === item.category ? 1 : 0) - (a.category === item.category ? 1 : 0);
    }).slice(0, 3);

    setHTML('[data-eq-related]', related.map(function (row) {
      return '<div class="card"><h3>' + data.escapeHTML(row.name) + '</h3>' +
        '<p>' + data.escapeHTML(row.highlights.join(' · ')) + ' · ' + data.escapeHTML(row.city) + '</p>' +
        '<p class="eq-price" style="margin-block-start:.75rem">يبدأ من <strong>' +
        data.escapeHTML(data.formatRiyal(row.dailyRate)) + '</strong> / يوم</p>' +
        '<a class="btn btn-ghost" href="' + data.escapeHTML(data.detailHref(row, '../')) +
        '" style="margin-block-start:1rem">التفاصيل</a></div>';
    }).join(''));

    var form = document.querySelector('[data-booking-form]');
    if (form) form.dataset.equipmentId = item.id;

    setText('[data-eq-operator-note]', data.formatRiyal(data.operatorRate(item)) + ' / يوم تشغيل');
    setText('[data-eq-transport-note]', data.formatRiyal(data.transportRate(item)) + ' ذهاباً وإياباً');
    setText('[data-eq-week-rate]', data.formatRiyal(rates.week));
    setText('[data-eq-month-rate]', data.formatRiyal(rates.month));
  }

  /* --------------------- حاسبة السعر (صفحة المعدة) --------------------- */

  function initCalculator() {
    var form = document.querySelector('[data-booking-form]');
    if (!form || !data) return;

    var state = data.load();
    var equipmentId = form.dataset.equipmentId;
    var item = state.equipment.find(function (row) { return row.id === equipmentId; });
    if (!item) return;

    var owner = state.owners.find(function (row) { return row.id === item.ownerId; });

    // كل الأرقام استرشادية (placeholder) — راجع mihwar/README.md
    var RATES = data.rates(item);
    var UNIT_LABEL = { day: 'يوم', week: 'أسبوع', month: 'شهر' };
    var DAYS_IN = { day: 1, week: 7, month: 30 };
    var OPERATOR_PER_DAY = data.operatorRate(item);
    var TRANSPORT_FLAT = data.transportRate(item);

    var els = {
      qty: form.querySelector('[data-qty-input]'),
      operator: form.querySelector('[data-opt-operator]'),
      transport: form.querySelector('[data-opt-transport]'),
      start: form.querySelector('[data-start-date]'),
      dateError: form.querySelector('[data-date-error]'),
      renter: form.querySelector('[data-renter-name]'),
      phone: form.querySelector('[data-renter-phone]'),
      location: form.querySelector('[data-renter-location]'),
      formError: form.querySelector('[data-booking-error]'),
      submit: form.querySelector('button[type="submit"]'),
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

    function riyal(n) { return data.formatRiyal(Math.round(n)); }

    function currentPeriod() {
      var checked = form.querySelector('[name="period"]:checked');
      return checked ? checked.value : 'day';
    }

    function totals() {
      var period = currentPeriod();
      var qty = Math.max(1, Math.min(10, parseInt(els.qty.value, 10) || 1));
      var rate = RATES[period];

      var base = rate * qty;
      var operatorFee = els.operator && els.operator.checked ? OPERATOR_PER_DAY * DAYS_IN[period] * qty : 0;
      var transportFee = els.transport && els.transport.checked ? TRANSPORT_FLAT * qty : 0;
      var subtotal = base + operatorFee + transportFee;

      return {
        period: period, qty: qty, rate: rate, base: base,
        operatorFee: operatorFee, transportFee: transportFee,
        subtotal: subtotal, vat: subtotal * data.VAT, total: subtotal * (1 + data.VAT)
      };
    }

    function recalc() {
      var sum = totals();

      if (out.headline) out.headline.textContent = riyal(sum.rate);
      if (out.headlineUnit) out.headlineUnit.textContent = '/ ' + UNIT_LABEL[sum.period];
      if (out.baseLabel) out.baseLabel.textContent = 'الإيجار (' + sum.qty + ' × ' + UNIT_LABEL[sum.period] + ')';
      if (out.base) out.base.textContent = riyal(sum.base);

      if (out.operatorRow) out.operatorRow.hidden = sum.operatorFee === 0;
      if (out.operator) out.operator.textContent = riyal(sum.operatorFee);
      if (out.transportRow) out.transportRow.hidden = sum.transportFee === 0;
      if (out.transport) out.transport.textContent = riyal(sum.transportFee);

      if (out.vat) out.vat.textContent = riyal(sum.vat);
      if (out.total) out.total.textContent = riyal(sum.total);
    }

    // منع التواريخ الماضية
    var todayISO = data.todayISO();
    if (els.start) {
      els.start.min = todayISO;
      els.start.addEventListener('change', function () {
        var invalid = els.start.value !== '' && els.start.value < todayISO;
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

    function fail(message, field) {
      if (els.formError) {
        els.formError.textContent = message;
        els.formError.hidden = false;
      }
      if (field) field.focus();
    }

    function addDays(iso, days) {
      var end = new Date(iso + 'T12:00:00');
      end.setDate(end.getDate() + days);
      return end.getFullYear() + '-' +
        String(end.getMonth() + 1).padStart(2, '0') + '-' +
        String(end.getDate()).padStart(2, '0');
    }

    /* إرسال الطلب يُنشئ سجلاً حقيقياً في التخزين المحلي، فيظهر في لوحة الإدارة */
    function submitRequest(sum) {
      var latest = data.load();
      var name = els.renter ? els.renter.value.trim() : 'زائر الموقع';
      var phone = els.phone ? els.phone.value.trim() : '';
      var digits = data.normalizePhone(phone);
      var startDate = els.start ? els.start.value : '';
      var endDate = startDate ? addDays(startDate, DAYS_IN[sum.period] * sum.qty) : '';
      var now = new Date().toISOString();
      var value = Math.round(sum.total);

      var customer = digits && latest.customers.find(function (row) {
        return data.normalizePhone(row.contact) === digits;
      });

      if (!customer) {
        customer = {
          id: data.nextId('CU'), name: name, contact: phone, city: item.city,
          orders: 0, visits: 1, lastVisit: todayISO, activity: []
        };
        latest.customers.unshift(customer);
      }
      customer.orders = (Number(customer.orders) || 0) + 1;
      customer.lastVisit = todayISO;

      var order = {
        id: data.nextId('MH'),
        customerId: customer.id,
        ownerId: item.ownerId,
        equipmentId: item.id,
        renter: name,
        equipment: item.name,
        startDate: startDate,
        endDate: endDate,
        date: startDate,
        status: 'new',
        value: value,
        deliveryLocation: els.location ? els.location.value.trim() : '',
        source: 'public',
        createdAt: now,
        updatedAt: now,
        activity: [{ id: data.nextId('AC'), type: 'order_created', title: 'وصل طلب من الموقع', meta: item.name, at: now }],
        timeline: [{ id: data.nextId('TL'), stage: 'new', title: 'تم إنشاء الطلب', meta: 'من الموقع العام', at: now }],
        notes: [],
        documents: [],
        payment: { status: 'pending', total: value, paid: 0, due: value, transactions: [] }
      };
      latest.orders.unshift(order);

      latest.conversations.unshift({
        id: data.nextId('CV'),
        customerId: customer.id,
        ownerId: item.ownerId,
        orderId: order.id,
        equipment: item.name,
        unread: 1,
        updatedAt: now,
        messages: [{
          from: 'customer',
          text: 'طلب تأجير ' + item.name + ' لمدة ' + sum.qty + ' ' + UNIT_LABEL[sum.period] +
            (order.deliveryLocation ? ' — موقع التسليم: ' + order.deliveryLocation : ''),
          time: now
        }]
      });

      return { order: order, saved: data.save(latest) };
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (els.formError) els.formError.hidden = true;

      if (els.renter && !els.renter.value.trim()) {
        fail('اكتب اسم المنشأة أو الشخص المستأجر.', els.renter);
        return;
      }
      if (els.phone && data.normalizePhone(els.phone.value).length < 9) {
        fail('اكتب رقم جوال صحيح ليتواصل معك المالك.', els.phone);
        return;
      }
      if (els.start && !els.start.value) {
        if (els.dateError) {
          els.dateError.textContent = 'اختر تاريخ بدء التأجير.';
          els.dateError.hidden = false;
        }
        els.start.focus();
        return;
      }

      var result = submitRequest(totals());

      if (els.status) {
        els.status.hidden = false;
        els.status.textContent = result.saved
          ? 'وصل طلبك برقم ' + result.order.id + '. سيتواصل معك ' +
            (owner ? owner.name : 'المالك') + ' لتأكيد التوفّر والسعر النهائي.'
          : 'وصل طلبك. سيتواصل معك المالك لتأكيد التوفّر والسعر النهائي.';
        els.status.focus();
      }
      if (els.submit) els.submit.disabled = true;
    });

    recalc();
  }

  /* -------------------------------- التشغيل -------------------------------- */

  function init() {
    initTheme();
    initNav();
    initFaq();
    initCatalog();
    initFilter();
    initEquipmentPage();
    initTabs();
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
