/* مِحور — إدارة محلية تجريبية بلا قاعدة بيانات
   البيانات والتنسيق ومسميات الحالات كلها من assets/data.js، وهو نفسه
   المصدر الذي يقرأ منه الموقع العام. */

(function () {
  'use strict';

  var components = window.MihwarComponents;
  var data = window.MihwarData;

  var AUTH_KEY = 'mihwar-admin-auth';
  var AUTH_TTL = 12 * 60 * 60 * 1000;   // اثنتا عشرة ساعة
  var DEMO_PASSWORD = 'Mihwar123';
  var DEMO_IDENTITIES = ['admin@mihwar.local', '0500000000'];

  var STATUS_LABELS = data.ORDER_STATUS_LABELS;
  var EQUIPMENT_STATUS_LABELS = data.EQUIPMENT_STATUS_LABELS;
  var OWNER_VERIFICATION_LABELS = data.OWNER_VERIFICATION_LABELS;
  var DOCUMENT_STATUS_LABELS = data.DOCUMENT_STATUS_LABELS;

  var escapeHTML = data.escapeHTML;
  var formatDate = data.formatDate;
  var formatDateTime = data.formatDateTime;
  var formatNumber = data.formatNumber;
  var formatRiyal = data.formatRiyal;

  /* ------------------------------- الجلسة -------------------------------
     الجلسة في localStorage لا sessionStorage، كي لا يُطرد المستخدم عند فتح
     أي سجل في تبويب جديد؛ ومدّتها محدودة فلا تبقى مفتوحة إلى الأبد. */

  function readAuth() {
    try {
      var auth = JSON.parse(localStorage.getItem(AUTH_KEY));
      return Boolean(auth && auth.loggedIn === true && (Date.now() - (auth.at || 0)) < AUTH_TTL);
    } catch (e) {
      return false;
    }
  }

  function clearAuth() {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* لا شيء */ }
  }

  function loadState() { return data.load(); }
  function saveState(state) { return data.save(state); }

  window.MihwarAdmin = {
    AUTH_KEY: AUTH_KEY,
    STATUS_LABELS: STATUS_LABELS,
    EQUIPMENT_STATUS_LABELS: EQUIPMENT_STATUS_LABELS,
    OWNER_VERIFICATION_LABELS: OWNER_VERIFICATION_LABELS,
    DOCUMENT_STATUS_LABELS: DOCUMENT_STATUS_LABELS,
    RECORD_STATUS_LABELS: data.RECORD_STATUS_LABELS,
    PAYMENT_STATUS_LABELS: data.PAYMENT_STATUS_LABELS,
    readAuth: readAuth,
    clearAuth: clearAuth,
    loadState: loadState,
    saveState: saveState,
    escapeHTML: escapeHTML,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatNumber: formatNumber,
    formatRiyal: formatRiyal,
    normalizePhone: data.normalizePhone,
    // مسمّى عربي لأي حالة عامة (حجز، صيانة، عملية مالية) بدل إظهار المفتاح خاماً
    recordStatusLabel: function (status) {
      if (!status) return 'غير محددة';
      return data.RECORD_STATUS_LABELS[status] || data.PAYMENT_STATUS_LABELS[status] || status;
    }
  };

  /* ----------------------------- تسجيل الدخول ----------------------------- */

  function initLogin() {
    var form = document.querySelector('[data-login-form]');
    if (!form) return false;

    if (readAuth()) {
      location.replace('index.html');
      return true;
    }

    var error = document.querySelector('[data-login-error]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var identity = form.elements.identity.value.trim().toLowerCase();
      var password = form.elements.password.value;
      var identityValid = DEMO_IDENTITIES.indexOf(identity) !== -1;

      if (!identityValid || password !== DEMO_PASSWORD) {
        error.textContent = 'بيانات الدخول غير صحيحة. استخدم البيانات التجريبية الموضحة أدناه.';
        error.hidden = false;
        form.elements.identity.focus();
        return;
      }

      error.hidden = true;
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ loggedIn: true, identity: identity, at: Date.now() }));
      } catch (e) {
        error.textContent = 'تعذّر بدء الجلسة المحلية في هذا المتصفح.';
        error.hidden = false;
        return;
      }
      location.replace('index.html');
    });

    return true;
  }

  /* ------------------------------ لوحة العمليات ------------------------------ */

  function initDashboard() {
    var ordersBody = document.querySelector('[data-orders-body]');
    if (!ordersBody) return;
    if (!readAuth()) {
      location.replace('login.html');
      return;
    }

    var state = loadState();
    var equipmentBody = document.querySelector('[data-equipment-body]');
    var ownersBody = document.querySelector('[data-owners-body]');
    var ownerSearch = document.querySelector('[data-owner-search]');
    var ownerCityFilter = document.querySelector('[data-owner-city]');
    var ownerVerificationFilter = document.querySelector('[data-owner-verification]');
    var ownerEditDialog = document.querySelector('[data-owner-edit-dialog]');
    var ownerEditForm = document.querySelector('[data-owner-edit-form]');
    var ownerEditTitle = document.querySelector('[data-owner-edit-title]');
    var ownerEditSubmit = document.querySelector('[data-owner-edit-submit]');
    var customersBody = document.querySelector('[data-customers-body]');
    var conversationsBody = document.querySelector('[data-conversations-body]');
    var dialog = document.querySelector('[data-equipment-dialog]');
    var equipmentForm = document.querySelector('[data-equipment-form]');
    var dialogTitle = document.querySelector('[data-equipment-dialog-title]');
    var conversationDialog = document.querySelector('[data-conversation-dialog]');
    var conversationTitle = document.querySelector('[data-conversation-title]');
    var conversationMeta = document.querySelector('[data-conversation-meta]');
    var conversationMessages = document.querySelector('[data-conversation-messages]');
    var attentionList = document.querySelector('[data-attention-list]');
    var attentionTotal = document.querySelector('[data-attention-total]');
    var operationsActivity = document.querySelector('[data-operations-activity]');
    var globalSearchShell = document.querySelector('[data-global-search-shell]');
    var globalSearchInput = document.querySelector('[data-global-search]');
    var globalSearchResults = document.querySelector('[data-global-search-results]');
    var manualOrderDialog = document.querySelector('[data-manual-order-dialog]');
    var manualOrderForm = document.querySelector('[data-manual-order-form]');
    var manualOrderEmpty = document.querySelector('[data-manual-order-empty]');
    var manualOrderSubmit = document.querySelector('[data-manual-order-submit]');
    var messageDialog = document.querySelector('[data-message-dialog]');
    var messageForm = document.querySelector('[data-message-form]');
    var messageEmpty = document.querySelector('[data-message-empty]');
    var messageSubmit = document.querySelector('[data-message-submit]');
    var toast = document.querySelector('[data-admin-toast]');
    var toastTimer;

    function getOwner(ownerId) {
      return state.owners.find(function (owner) { return owner.id === ownerId; });
    }

    function getEquipment(equipmentId) {
      return state.equipment.find(function (item) { return item.id === equipmentId; });
    }

    function ownerEquipment(ownerId) {
      return state.equipment.filter(function (item) { return item.ownerId === ownerId; });
    }

    function ownerOrders(ownerId) {
      return state.orders.filter(function (order) { return order.ownerId === ownerId; });
    }

    function equipmentOrders(equipmentId) {
      return state.orders.filter(function (order) { return order.equipmentId === equipmentId; });
    }

    function ownerVerificationBadge(status) {
      var safeStatus = OWNER_VERIFICATION_LABELS[status] ? status : 'pending';
      return components.StatusBadge({ label: OWNER_VERIFICATION_LABELS[safeStatus], tone: safeStatus });
    }

    function latestOwnerActivity(owner) {
      var activity = Array.isArray(owner.activity) ? owner.activity.slice() : [];
      if (owner.lastLogin) activity.push({ at: owner.lastLogin });
      activity.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
      return activity.length ? activity[0].at : null;
    }

    function addOwnerActivity(owner, type, title) {
      if (!Array.isArray(owner.activity)) owner.activity = [];
      owner.activity.unshift({ id: data.nextId('AC'), type: type, title: title, at: new Date().toISOString() });
    }

    function addRecordActivity(record, type, title) {
      if (!Array.isArray(record.activity)) record.activity = [];
      record.activity.unshift({ id: data.nextId('AC'), type: type, title: title, at: new Date().toISOString() });
      record.updatedAt = new Date().toISOString();
    }

    function getCustomer(customerId) {
      return state.customers.find(function (customer) { return customer.id === customerId; });
    }

    function emptyRow(message, columns) {
      return '<tr><td class="empty-table-cell" colspan="' + columns + '">' + escapeHTML(message) + '</td></tr>';
    }

    function showToast(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
    }

    function timelineHTML(items, emptyTitle, emptyDescription) {
      return components.Timeline({
        items: items.map(function (item) { return { title: item.title, meta: item.meta, timeLabel: formatDateTime(item.at) }; }),
        emptyTitle: emptyTitle,
        emptyDescription: emptyDescription
      });
    }

    function renderAttention() {
      var now = Date.now();
      var closedStatuses = ['completed', 'closed', 'cancelled', 'rejected'];
      var newOrders = state.orders.filter(function (order) { return order.status === 'new'; }).length;
      var pendingEquipment = state.equipment.filter(function (item) { return item.status === 'pending' || item.status === 'pending_review'; }).length;
      var pendingOwners = state.owners.filter(function (owner) { return owner.verification === 'pending'; }).length;
      var followUps = state.orders.filter(function (order) {
        var dueValue = order.dueAt || order.endDate;
        return Boolean(order.needsFollowUp || (dueValue && new Date(dueValue).getTime() < now && closedStatuses.indexOf(order.status) === -1));
      }).length;
      var unreadMessages = state.conversations.reduce(function (count, conversation) {
        return count + (Number(conversation.unread) || 0);
      }, 0);
      var missingOwnerDocuments = state.owners.filter(function (owner) { return !owner.documents || !owner.documents.length; }).length;
      var missingEquipmentDocuments = state.equipment.filter(function (item) { return !item.documents || !item.documents.length; }).length;
      var rejectedDocuments = state.owners.reduce(function (count, owner) {
        return count + owner.documents.filter(function (doc) { return doc.status === 'rejected'; }).length;
      }, 0) + state.equipment.reduce(function (count, item) {
        return count + item.documents.filter(function (doc) { return doc.status === 'rejected'; }).length;
      }, 0);

      var items = [
        { count: newOrders, title: 'طلبات جديدة', description: 'بانتظار بدء المتابعة', target: 'orders', tone: 'primary' },
        { count: unreadMessages, title: 'رسائل غير مقروءة', description: 'بانتظار الرد', target: 'conversations', tone: 'primary' },
        { count: pendingEquipment, title: 'معدات بانتظار المراجعة', description: 'تحتاج قرار عرض', target: 'equipment', tone: 'warning' },
        { count: pendingOwners, title: 'ملاك بانتظار التحقق', description: 'تحتاج مراجعة بياناتهم', target: 'owners', tone: 'warning' },
        { count: followUps, title: 'طلبات تحتاج متابعة', description: 'متأخرة أو معلّمة للمتابعة', target: 'orders', tone: 'danger' },
        { count: missingOwnerDocuments + missingEquipmentDocuments + rejectedDocuments, title: 'مستندات ناقصة أو مرفوضة', description: 'تحتاج استكمالًا أو مراجعة', target: 'owners', tone: 'danger' }
      ].filter(function (item) { return item.count > 0; });

      if (!items.length) {
        attentionList.innerHTML = '<div class="operations-empty"><span aria-hidden="true">✓</span><strong>لا توجد إجراءات معلقة حاليًا</strong><p>ستظهر هنا العناصر التي تحتاج تدخلًا عند توفرها.</p></div>';
        attentionTotal.hidden = true;
        return;
      }

      var total = items.reduce(function (sum, item) { return sum + item.count; }, 0);
      attentionTotal.textContent = formatNumber(total) + ' معلّق';
      attentionTotal.hidden = false;
      attentionList.innerHTML = items.map(function (item) {
        return '<button class="attention-item attention-item-' + item.tone + '" type="button" data-attention-target="' + item.target + '">' +
          '<span class="attention-count"><bdi>' + formatNumber(item.count) + '</bdi></span>' +
          '<span><strong>' + item.title + '</strong><small>' + item.description + '</small></span>' +
          '<span class="attention-arrow" aria-hidden="true">←</span></button>';
      }).join('');
    }

    function collectRecentActivity() {
      var items = [];
      function collect(record, meta) {
        (record.activity || []).forEach(function (activity) {
          if (activity && activity.at) items.push({ title: activity.title, at: activity.at, meta: meta });
        });
      }
      state.owners.forEach(function (owner) {
        collect(owner, owner.name);
        if (owner.lastLogin) items.push({ title: 'تسجيل دخول', at: owner.lastLogin, meta: owner.name });
      });
      state.equipment.forEach(function (item) { collect(item, item.name); });
      state.orders.forEach(function (order) { collect(order, order.id); });
      state.customers.forEach(function (customer) { collect(customer, customer.name); });
      return items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); }).slice(0, 10);
    }

    function renderOperationsActivity() {
      operationsActivity.innerHTML = timelineHTML(collectRecentActivity(), 'لا يوجد نشاط مسجل', 'ستظهر هنا الإجراءات الحقيقية عند تنفيذها داخل لوحة الإدارة.');
    }

    function renderSummary() {
      renderAttention();
      renderOperationsActivity();
    }

    function orderTone(status) {
      if (['completed', 'closed', 'returned'].indexOf(status) !== -1) return 'verified';
      if (status === 'cancelled' || status === 'rejected') return 'rejected';
      return 'pending';
    }

    function renderOrders() {
      if (!state.orders.length) {
        ordersBody.innerHTML = emptyRow('لا توجد طلبات حتى الآن.', 6);
        return;
      }
      ordersBody.innerHTML = state.orders.map(function (order) {
        var customer = getCustomer(order.customerId);
        var linkedEquipment = state.equipment.find(function (item) { return item.id === order.equipmentId || (!order.equipmentId && item.name === order.equipment); });
        var status = STATUS_LABELS[order.status] || order.status || 'غير محددة';
        return '<tr data-record-type="order" data-record-id="' + escapeHTML(order.id) + '">' +
          '<td data-label="رقم الطلب"><a class="record-link cell-title" href="order.html?id=' + encodeURIComponent(order.id) + '"><bdi>' + escapeHTML(order.id) + '</bdi></a>' +
            (order.source === 'public' ? '<span class="cell-sub">من الموقع العام</span>' : '') + '</td>' +
          '<td data-label="المستأجر">' + (customer ? '<a class="record-link" href="index.html?recordType=customer&amp;recordId=' + encodeURIComponent(customer.id) + '#customers">' + escapeHTML(order.renter || customer.name) + '</a>' : escapeHTML(order.renter || '—')) + '</td>' +
          '<td data-label="المعدة">' + (linkedEquipment ? '<a class="record-link" href="equipment.html?id=' + encodeURIComponent(linkedEquipment.id) + '">' + escapeHTML(linkedEquipment.name) + '</a>' : escapeHTML(order.equipment || '—')) + '</td>' +
          '<td data-label="التاريخ"><bdi>' + escapeHTML(formatDate(order.startDate || order.date || order.createdAt)) + '</bdi></td>' +
          '<td data-label="الحالة">' + components.StatusBadge({ label: status, tone: orderTone(order.status) }) + '</td>' +
          '<td data-label="الإجراءات"><div class="table-actions"><a class="table-action table-action-primary" href="order.html?id=' + encodeURIComponent(order.id) + '">عرض الملف</a>' +
            '<button class="table-action table-action-danger" type="button" data-delete-order="' + escapeHTML(order.id) + '">حذف</button></div></td>' +
          '</tr>';
      }).join('');
    }

    function renderEquipment() {
      if (!state.equipment.length) {
        equipmentBody.innerHTML = emptyRow('لا توجد معدات مدرجة. استخدم «إضافة معدة» لبدء القائمة.', 6);
        return;
      }
      equipmentBody.innerHTML = state.equipment.map(function (item) {
        var owner = getOwner(item.ownerId);
        var isActive = data.isListed(item);
        var statusTone = isActive ? 'admin-badge-active' : 'admin-badge-paused';
        return '<tr data-record-type="equipment" data-record-id="' + escapeHTML(item.id) + '">' +
          '<td data-label="المعدة"><a class="record-link cell-title" href="equipment.html?id=' + encodeURIComponent(item.id) + '">' + escapeHTML(item.name) + '</a><span class="cell-sub">' + escapeHTML(item.category) + ' · <bdi>' + escapeHTML(item.id) + '</bdi></span></td>' +
          '<td data-label="المالك">' + (owner ? '<a class="record-link" href="owner.html?id=' + encodeURIComponent(owner.id) + '">' + escapeHTML(owner.name) + '</a>' : 'غير محدد') + '</td>' +
          '<td data-label="المدينة">' + escapeHTML(item.city) + '</td>' +
          '<td data-label="السعر اليومي"><bdi>' + escapeHTML(formatRiyal(item.dailyRate)) + '</bdi></td>' +
          '<td data-label="حالة العرض"><span class="admin-badge ' + statusTone + '">' + escapeHTML(EQUIPMENT_STATUS_LABELS[item.status] || item.status || 'غير محددة') + '</span></td>' +
          '<td data-label="الإجراءات"><div class="table-actions"><a class="table-action table-action-primary" href="equipment.html?id=' + encodeURIComponent(item.id) + '">عرض الملف</a>' +
            '<button class="table-action" type="button" data-edit-equipment="' + escapeHTML(item.id) + '">تعديل</button>' +
            '<button class="table-action" type="button" data-toggle-equipment="' + escapeHTML(item.id) + '">' + (isActive ? 'إيقاف العرض' : 'إعادة العرض') + '</button>' +
            '<button class="table-action table-action-danger" type="button" data-delete-equipment="' + escapeHTML(item.id) + '">حذف</button></div></td>' +
          '</tr>';
      }).join('');
    }

    function renderOwners() {
      if (!state.owners.length) {
        ownersBody.innerHTML = emptyRow('لا يوجد ملاك معدات مسجلون حتى الآن.', 8);
        return;
      }

      var term = ownerSearch.value.trim().toLowerCase();
      var city = ownerCityFilter.value;
      var verification = ownerVerificationFilter.value;
      var filteredOwners = state.owners.filter(function (owner) {
        var matchTerm = !term || owner.name.toLowerCase().indexOf(term) !== -1 || String(owner.contact || '').toLowerCase().indexOf(term) !== -1;
        var matchCity = city === 'all' || owner.city === city;
        var matchVerification = verification === 'all' || owner.verification === verification;
        return matchTerm && matchCity && matchVerification;
      });

      if (!filteredOwners.length) {
        ownersBody.innerHTML = emptyRow('لا توجد نتائج مطابقة للبحث والفلاتر الحالية.', 8);
        return;
      }

      ownersBody.innerHTML = filteredOwners.map(function (owner) {
        var equipmentCount = ownerEquipment(owner.id).length;
        var ordersCount = ownerOrders(owner.id).length;
        var phone = data.normalizePhone(owner.contact);
        var whatsapp = phone.length >= 9
          ? '<a class="table-action" href="https://wa.me/' + phone + '" target="_blank" rel="noopener">واتساب</a>'
          : '<button class="table-action" type="button" disabled title="أضف رقم التواصل أولًا">واتساب</button>';
        var suspended = owner.accountStatus === 'suspended';
        return '<tr data-record-type="owner" data-record-id="' + escapeHTML(owner.id) + '">' +
          '<td data-label="المالك"><span class="cell-title">' + escapeHTML(owner.name) + '</span><span class="cell-sub"><bdi>' + escapeHTML(owner.id) + '</bdi></span></td>' +
          '<td data-label="وسيلة التواصل"><bdi>' + escapeHTML(owner.contact || '—') + '</bdi></td>' +
          '<td data-label="المدينة">' + escapeHTML(owner.city) + '</td>' +
          '<td data-label="التحقق">' + ownerVerificationBadge(owner.verification) + '</td>' +
          '<td data-label="عدد المعدات"><bdi>' + formatNumber(equipmentCount) + '</bdi></td>' +
          '<td data-label="عدد الطلبات"><bdi>' + formatNumber(ordersCount) + '</bdi></td>' +
          '<td data-label="آخر نشاط"><bdi>' + escapeHTML(formatDateTime(latestOwnerActivity(owner))) + '</bdi></td>' +
          '<td data-label="الإجراءات"><div class="table-actions"><a class="table-action table-action-primary" href="owner.html?id=' + encodeURIComponent(owner.id) + '">عرض الملف</a>' +
            '<button class="table-action" type="button" data-edit-owner="' + escapeHTML(owner.id) + '">تعديل</button>' + whatsapp +
            '<button class="table-action ' + (suspended ? 'table-action-success' : 'table-action-danger') + '" type="button" data-toggle-owner="' + escapeHTML(owner.id) + '">' + (suspended ? 'تفعيل الحساب' : 'إيقاف الحساب') + '</button>' +
            '<button class="table-action table-action-danger" type="button" data-delete-owner="' + escapeHTML(owner.id) + '">حذف</button></div></td>' +
          '</tr>';
      }).join('');
    }

    function fillOwnerCityFilter() {
      var selected = ownerCityFilter.value || 'all';
      var cities = state.owners.map(function (owner) { return owner.city; }).filter(Boolean).filter(function (city, index, list) {
        return list.indexOf(city) === index;
      }).sort();
      ownerCityFilter.innerHTML = '<option value="all">كل المدن</option>' + cities.map(function (city) {
        return '<option value="' + escapeHTML(city) + '">' + escapeHTML(city) + '</option>';
      }).join('');
      ownerCityFilter.value = cities.indexOf(selected) !== -1 ? selected : 'all';
    }

    function openOwnerEdit(owner) {
      ownerEditForm.reset();
      ownerEditForm.elements.ownerId.value = owner ? owner.id : '';
      ownerEditTitle.textContent = owner ? 'تعديل ملف المالك' : 'إضافة مالك';
      ownerEditSubmit.textContent = owner ? 'حفظ التعديلات' : 'إضافة المالك';
      if (owner) {
        ownerEditForm.elements.name.value = owner.name;
        ownerEditForm.elements.contact.value = owner.contact || '';
        ownerEditForm.elements.city.value = owner.city || '';
        ownerEditForm.elements.verification.value = owner.verification || 'pending';
      } else {
        ownerEditForm.elements.verification.value = 'pending';
      }
      if (typeof ownerEditDialog.showModal === 'function') ownerEditDialog.showModal();
      else ownerEditDialog.setAttribute('open', '');
      ownerEditForm.elements.name.focus();
    }

    function closeOwnerEdit() {
      if (typeof ownerEditDialog.close === 'function') ownerEditDialog.close();
      else ownerEditDialog.removeAttribute('open');
    }

    function toggleOwnerAccount(owner) {
      owner.accountStatus = owner.accountStatus === 'suspended' ? 'active' : 'suspended';
      addOwnerActivity(owner, owner.accountStatus === 'suspended' ? 'account_suspended' : 'account_activated', owner.accountStatus === 'suspended' ? 'إيقاف الحساب' : 'تفعيل الحساب');
      saveState(state);
      renderOwners();
      showToast(owner.accountStatus === 'suspended' ? 'تم إيقاف حساب المالك.' : 'تم تفعيل حساب المالك.');
    }

    /* ------------------------------- الحذف -------------------------------
       الحذف يرفض ترك سجلات يتيمة، فيمنع حذف مالك أو معدة مرتبطة بسجلات أخرى. */

    function deleteOwner(owner) {
      var linkedEquipment = ownerEquipment(owner.id).length;
      var linkedOrders = ownerOrders(owner.id).length;
      if (linkedEquipment || linkedOrders) {
        showToast('لا يمكن حذف المالك قبل فكّ ارتباطه بـ ' + formatNumber(linkedEquipment) + ' معدة و' + formatNumber(linkedOrders) + ' طلب.');
        return;
      }
      if (!window.confirm('هل تريد حذف ملف «' + owner.name + '» نهائيًا؟')) return;
      state.owners = state.owners.filter(function (row) { return row.id !== owner.id; });
      state.conversations = state.conversations.filter(function (row) { return row.ownerId !== owner.id; });
      saveState(state);
      renderAll();
      showToast('تم حذف ملف المالك.');
    }

    function deleteEquipment(item) {
      var linkedOrders = equipmentOrders(item.id).length;
      if (linkedOrders) {
        showToast('لا يمكن حذف المعدة لارتباطها بـ ' + formatNumber(linkedOrders) + ' طلب.');
        return;
      }
      if (!window.confirm('هل تريد حذف «' + item.name + '» من الكتالوج نهائيًا؟')) return;
      state.equipment = state.equipment.filter(function (row) { return row.id !== item.id; });
      saveState(state);
      renderAll();
      showToast('تم حذف المعدة من الكتالوج.');
    }

    function deleteOrder(order) {
      if (!window.confirm('هل تريد حذف الطلب ' + order.id + ' نهائيًا؟')) return;
      state.orders = state.orders.filter(function (row) { return row.id !== order.id; });
      state.conversations = state.conversations.filter(function (row) { return row.orderId !== order.id; });
      saveState(state);
      renderAll();
      showToast('تم حذف الطلب.');
    }

    function renderCustomers() {
      if (!state.customers.length) {
        customersBody.innerHTML = emptyRow('لا توجد بيانات عملاء حتى الآن.', 6);
        return;
      }
      customersBody.innerHTML = state.customers.map(function (customer) {
        return '<tr data-record-type="customer" data-record-id="' + escapeHTML(customer.id) + '">' +
          '<td data-label="العميل"><span class="cell-title">' + escapeHTML(customer.name) + '</span><span class="cell-sub"><bdi>' + escapeHTML(customer.id) + '</bdi></span></td>' +
          '<td data-label="وسيلة التواصل"><bdi>' + escapeHTML(customer.contact) + '</bdi></td>' +
          '<td data-label="المدينة">' + escapeHTML(customer.city) + '</td>' +
          '<td data-label="الطلبات"><bdi>' + formatNumber(customer.orders) + '</bdi></td>' +
          '<td data-label="الزيارات"><bdi>' + formatNumber(customer.visits) + '</bdi></td>' +
          '<td data-label="آخر زيارة"><bdi>' + escapeHTML(formatDate(customer.lastVisit)) + '</bdi></td>' +
          '</tr>';
      }).join('');
    }

    function renderConversations() {
      if (!state.conversations.length) {
        conversationsBody.innerHTML = emptyRow('لا توجد محادثات حتى الآن.', 5);
        return;
      }
      conversationsBody.innerHTML = state.conversations.map(function (conversation) {
        var customer = getCustomer(conversation.customerId);
        var conversationOwner = getOwner(conversation.ownerId);
        var conversationOrder = conversation.orderId ? state.orders.find(function (order) { return order.id === conversation.orderId; }) : null;
        var latest = conversation.messages[conversation.messages.length - 1];
        var unread = conversation.unread ? '<span class="unread-count" aria-label="' + formatNumber(conversation.unread) + ' رسائل غير مقروءة">' + formatNumber(conversation.unread) + '</span>' : '';
        return '<tr>' +
          '<td data-label="العميل"><span class="cell-title">' + escapeHTML(customer ? customer.name : (conversationOwner ? conversationOwner.name : 'مستلم غير محدد')) + unread + '</span><span class="cell-sub"><bdi>' + escapeHTML(conversation.id) + '</bdi></span></td>' +
          '<td data-label="المعدة">' + escapeHTML(conversation.equipment || 'رسالة إدارية') + '</td>' +
          '<td data-label="آخر رسالة"><span class="conversation-preview">' + escapeHTML(latest ? latest.text : 'لا توجد رسائل') + '</span></td>' +
          '<td data-label="آخر تحديث"><bdi>' + escapeHTML(formatDateTime(conversation.updatedAt)) + '</bdi></td>' +
          '<td data-label="الإجراء"><div class="table-actions">' + (conversationOrder ? '<a class="table-action table-action-primary" href="order.html?id=' + encodeURIComponent(conversationOrder.id) + '">عرض الطلب</a>' : '') + '<button class="table-action" type="button" data-view-conversation="' + escapeHTML(conversation.id) + '">عرض المحادثة</button></div></td>' +
          '</tr>';
      }).join('');
    }

    function hideGlobalSearchResults() {
      globalSearchResults.hidden = true;
      globalSearchInput.setAttribute('aria-expanded', 'false');
    }

    function globalSearchGroups(term) {
      function includes(value) { return String(value || '').toLowerCase().indexOf(term) !== -1; }
      return [
        {
          type: 'owner', title: 'الملاك', items: state.owners.filter(function (owner) {
            return includes(owner.id) || includes(owner.name) || includes(owner.contact) || includes(owner.city);
          }).map(function (owner) { return { id: owner.id, label: owner.name, meta: [owner.contact, owner.city].filter(Boolean).join(' · ') }; })
        },
        {
          type: 'customer', title: 'العملاء', items: state.customers.filter(function (customer) {
            return includes(customer.id) || includes(customer.name) || includes(customer.contact) || includes(customer.city);
          }).map(function (customer) { return { id: customer.id, label: customer.name, meta: [customer.contact, customer.city].filter(Boolean).join(' · ') }; })
        },
        {
          type: 'equipment', title: 'المعدات', items: state.equipment.filter(function (item) {
            var owner = getOwner(item.ownerId);
            return includes(item.id) || includes(item.name) || includes(item.category) || includes(item.city) || (owner && includes(owner.name));
          }).map(function (item) { return { id: item.id, label: item.name, meta: [item.category, item.city].filter(Boolean).join(' · ') }; })
        },
        {
          type: 'order', title: 'الطلبات', items: state.orders.filter(function (order) {
            var customer = getCustomer(order.customerId);
            return includes(order.id) || includes(order.renter) || includes(order.equipment) || (customer && includes(customer.name));
          }).map(function (order) { return { id: order.id, label: order.id, meta: [order.renter, order.equipment].filter(Boolean).join(' · ') }; })
        }
      ].filter(function (group) { return group.items.length; });
    }

    function renderGlobalSearch() {
      var term = globalSearchInput.value.trim().toLowerCase();
      if (!term) {
        hideGlobalSearchResults();
        globalSearchResults.innerHTML = '';
        return;
      }
      var groups = globalSearchGroups(term);
      globalSearchResults.hidden = false;
      globalSearchInput.setAttribute('aria-expanded', 'true');
      if (!groups.length) {
        globalSearchResults.innerHTML = '<div class="global-search-empty"><strong>لا توجد نتائج</strong><span>جرّب الاسم أو رقم التواصل أو رقم السجل.</span></div>';
        return;
      }
      globalSearchResults.innerHTML = groups.map(function (group) {
        return '<section class="global-result-group"><h3>' + group.title + '</h3>' + group.items.slice(0, 6).map(function (item) {
          return '<button type="button" data-search-result-type="' + group.type + '" data-search-result-id="' + escapeHTML(item.id) + '"><span><strong>' + escapeHTML(item.label) + '</strong><small>' + escapeHTML(item.meta || item.id) + '</small></span><bdi>' + escapeHTML(item.id) + '</bdi></button>';
        }).join('') + '</section>';
      }).join('');
    }

    function focusRecord(type, id) {
      var sectionByType = { equipment: 'equipment', customer: 'customers', order: 'orders', owner: 'owners' };
      var sectionId = sectionByType[type];
      if (!sectionId) return;
      location.hash = sectionId;
      window.setTimeout(function () {
        document.querySelectorAll('.record-highlight').forEach(function (row) { row.classList.remove('record-highlight'); });
        var row = document.querySelector('[data-record-type="' + type + '"][data-record-id="' + CSS.escape(id) + '"]');
        if (row) {
          row.classList.add('record-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.setTimeout(function () { row.classList.remove('record-highlight'); }, 2600);
        }
      }, 80);
    }

    function openSearchResult(type, id) {
      hideGlobalSearchResults();
      globalSearchInput.value = '';
      if (type === 'owner') {
        location.href = 'owner.html?id=' + encodeURIComponent(id);
        return;
      }
      if (type === 'equipment') {
        location.href = 'equipment.html?id=' + encodeURIComponent(id);
        return;
      }
      if (type === 'order') {
        location.href = 'order.html?id=' + encodeURIComponent(id);
        return;
      }
      focusRecord(type, id);
    }

    function openManualOrder() {
      manualOrderForm.reset();
      var customerOptions = state.customers.map(function (customer) {
        return '<option value="' + escapeHTML(customer.id) + '">' + escapeHTML(customer.name) + '</option>';
      }).join('');
      var equipmentOptions = state.equipment.map(function (item) {
        return '<option value="' + escapeHTML(item.id) + '">' + escapeHTML(item.name) + '</option>';
      }).join('');
      manualOrderForm.elements.customerId.innerHTML = '<option value="">اختر العميل</option>' + customerOptions;
      manualOrderForm.elements.equipmentId.innerHTML = '<option value="">اختر المعدة</option>' + equipmentOptions;
      manualOrderForm.elements.startDate.value = data.todayISO();
      var missing = [];
      if (!state.customers.length) missing.push('عميل مسجل');
      if (!state.equipment.length) missing.push('معدة مسجلة');
      manualOrderEmpty.hidden = !missing.length;
      manualOrderEmpty.textContent = missing.length ? 'يلزم وجود ' + missing.join(' و') + ' قبل إنشاء الطلب.' : '';
      manualOrderSubmit.disabled = Boolean(missing.length);
      if (typeof manualOrderDialog.showModal === 'function') manualOrderDialog.showModal();
      else manualOrderDialog.setAttribute('open', '');
    }

    function closeManualOrder() {
      if (typeof manualOrderDialog.close === 'function') manualOrderDialog.close();
      else manualOrderDialog.removeAttribute('open');
    }

    function openMessageForm() {
      messageForm.reset();
      var ownerOptions = state.owners.map(function (owner) {
        return '<option value="owner:' + escapeHTML(owner.id) + '">مالك — ' + escapeHTML(owner.name) + '</option>';
      }).join('');
      var customerOptions = state.customers.map(function (customer) {
        return '<option value="customer:' + escapeHTML(customer.id) + '">عميل — ' + escapeHTML(customer.name) + '</option>';
      }).join('');
      messageForm.elements.recipient.innerHTML = '<option value="">اختر المستلم</option>' + ownerOptions + customerOptions;
      var noRecipients = !state.owners.length && !state.customers.length;
      messageEmpty.hidden = !noRecipients;
      messageEmpty.textContent = noRecipients ? 'أضف مالكًا أو عميلًا أولًا لإرسال رسالة.' : '';
      messageSubmit.disabled = noRecipients;
      if (typeof messageDialog.showModal === 'function') messageDialog.showModal();
      else messageDialog.setAttribute('open', '');
    }

    function closeMessageForm() {
      if (typeof messageDialog.close === 'function') messageDialog.close();
      else messageDialog.removeAttribute('open');
    }

    function renderAll() {
      renderSummary();
      renderOrders();
      renderEquipment();
      fillOwnerCityFilter();
      renderOwners();
      renderCustomers();
      renderConversations();
      if (globalSearchInput.value.trim()) renderGlobalSearch();
    }

    function openDialog(item) {
      equipmentForm.reset();
      equipmentForm.elements.equipmentId.value = item ? item.id : '';
      dialogTitle.textContent = item ? 'تعديل المعدة' : 'إضافة معدة';
      if (item) {
        equipmentForm.elements.name.value = item.name;
        var owner = getOwner(item.ownerId);
        equipmentForm.elements.ownerName.value = owner ? owner.name : '';
        equipmentForm.elements.category.value = item.category;
        equipmentForm.elements.city.value = item.city;
        equipmentForm.elements.dailyRate.value = String(item.dailyRate);
        equipmentForm.elements.status.value = item.status;
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      equipmentForm.elements.name.focus();
    }

    function closeDialog() {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    function openConversation(conversation) {
      var customer = getCustomer(conversation.customerId);
      var conversationOwner = getOwner(conversation.ownerId);
      conversationTitle.textContent = customer ? customer.name : (conversationOwner ? conversationOwner.name : 'المحادثة');
      conversationMeta.textContent = (conversation.equipment || 'رسالة إدارية') + ' · ' + formatDateTime(conversation.updatedAt);
      conversationMessages.innerHTML = conversation.messages.map(function (message) {
        var isAdmin = message.from === 'admin';
        return '<article class="conversation-message ' + (isAdmin ? 'conversation-message-admin' : '') + '">' +
          '<header><strong>' + (isAdmin ? 'فريق مِحور' : 'العميل') + '</strong><bdi>' + escapeHTML(formatDateTime(message.time)) + '</bdi></header>' +
          '<p>' + escapeHTML(message.text) + '</p>' +
          '</article>';
      }).join('');

      // فتح المحادثة يُعلّمها مقروءة — وإلا بقي العدّاد معلّقاً إلى الأبد
      if (conversation.unread) {
        conversation.unread = 0;
        saveState(state);
        renderSummary();
        renderConversations();
      }

      if (typeof conversationDialog.showModal === 'function') conversationDialog.showModal();
      else conversationDialog.setAttribute('open', '');
    }

    function closeConversation() {
      if (typeof conversationDialog.close === 'function') conversationDialog.close();
      else conversationDialog.removeAttribute('open');
    }

    document.querySelectorAll('[data-add-equipment]').forEach(function (button) {
      button.addEventListener('click', function () { openDialog(null); });
    });

    document.querySelectorAll('[data-add-owner]').forEach(function (button) {
      button.addEventListener('click', function () { openOwnerEdit(null); });
    });

    document.querySelectorAll('[data-create-order]').forEach(function (button) {
      button.addEventListener('click', openManualOrder);
    });

    document.querySelectorAll('[data-send-message]').forEach(function (button) {
      button.addEventListener('click', openMessageForm);
    });

    attentionList.addEventListener('click', function (event) {
      var button = event.target.closest('[data-attention-target]');
      if (button) location.hash = button.dataset.attentionTarget;
    });

    globalSearchInput.addEventListener('input', renderGlobalSearch);
    globalSearchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        hideGlobalSearchResults();
        globalSearchInput.blur();
      }
    });
    globalSearchResults.addEventListener('click', function (event) {
      var button = event.target.closest('[data-search-result-type]');
      if (button) openSearchResult(button.dataset.searchResultType, button.dataset.searchResultId);
    });
    document.addEventListener('click', function (event) {
      if (!globalSearchShell.contains(event.target)) hideGlobalSearchResults();
    });

    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', closeDialog);
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog();
    });

    ownerSearch.addEventListener('input', renderOwners);
    ownerCityFilter.addEventListener('change', renderOwners);
    ownerVerificationFilter.addEventListener('change', renderOwners);

    ownersBody.addEventListener('click', function (event) {
      var editButton = event.target.closest('[data-edit-owner]');
      var toggleButton = event.target.closest('[data-toggle-owner]');
      var deleteButton = event.target.closest('[data-delete-owner]');
      if (editButton) {
        var ownerToEdit = getOwner(editButton.dataset.editOwner);
        if (ownerToEdit) openOwnerEdit(ownerToEdit);
      }
      if (toggleButton) {
        var ownerToToggle = getOwner(toggleButton.dataset.toggleOwner);
        if (ownerToToggle) toggleOwnerAccount(ownerToToggle);
      }
      if (deleteButton) {
        var ownerToDelete = getOwner(deleteButton.dataset.deleteOwner);
        if (ownerToDelete) deleteOwner(ownerToDelete);
      }
    });

    ordersBody.addEventListener('click', function (event) {
      var deleteButton = event.target.closest('[data-delete-order]');
      if (!deleteButton) return;
      var order = state.orders.find(function (row) { return row.id === deleteButton.dataset.deleteOrder; });
      if (order) deleteOrder(order);
    });

    document.querySelectorAll('[data-close-owner-edit]').forEach(function (button) {
      button.addEventListener('click', closeOwnerEdit);
    });

    ownerEditDialog.addEventListener('click', function (event) {
      if (event.target === ownerEditDialog) closeOwnerEdit();
    });

    ownerEditForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!ownerEditForm.reportValidity()) return;
      var owner = getOwner(ownerEditForm.elements.ownerId.value);
      var isNewOwner = !owner;
      if (isNewOwner) {
        owner = {
          id: data.nextId('OW'),
          name: ownerEditForm.elements.name.value.trim(),
          contact: ownerEditForm.elements.contact.value.trim(),
          city: ownerEditForm.elements.city.value.trim(),
          verification: ownerEditForm.elements.verification.value,
          accountStatus: 'active',
          lastLogin: null,
          documents: [],
          ratings: [],
          activity: [],
          earnings: { transactions: [] }
        };
        state.owners.unshift(owner);
        addOwnerActivity(owner, 'owner_added', 'إضافة مالك');
      } else {
        owner.name = ownerEditForm.elements.name.value.trim();
        owner.contact = ownerEditForm.elements.contact.value.trim();
        owner.city = ownerEditForm.elements.city.value.trim();
        owner.verification = ownerEditForm.elements.verification.value;
        addOwnerActivity(owner, 'owner_updated', 'تعديل بيانات المالك');
      }
      saveState(state);
      closeOwnerEdit();
      renderAll();
      showToast(isNewOwner ? 'تمت إضافة المالك.' : 'تم حفظ بيانات المالك.');
    });

    document.querySelectorAll('[data-close-manual-order]').forEach(function (button) {
      button.addEventListener('click', closeManualOrder);
    });
    manualOrderDialog.addEventListener('click', function (event) {
      if (event.target === manualOrderDialog) closeManualOrder();
    });
    manualOrderForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!manualOrderForm.reportValidity() || manualOrderSubmit.disabled) return;
      var customer = getCustomer(manualOrderForm.elements.customerId.value);
      var equipment = getEquipment(manualOrderForm.elements.equipmentId.value);
      if (!customer || !equipment) {
        showToast('تعذّر إنشاء الطلب لعدم اكتمال السجلات المرتبطة.');
        return;
      }

      var startDate = manualOrderForm.elements.startDate.value;
      var endDate = manualOrderForm.elements.endDate.value;
      if (endDate && endDate < startDate) {
        showToast('تاريخ النهاية يسبق تاريخ البداية.');
        return;
      }

      // القيمة إمّا يكتبها المشغّل أو تُحتسب من سعر المعدة ومدة الإيجار
      var typedValue = parseInt(manualOrderForm.elements.value.value, 10);
      var days = endDate ? data.daysBetween(startDate, endDate) : 1;
      var value = isNaN(typedValue)
        ? Math.round(equipment.dailyRate * days * (1 + data.VAT))
        : typedValue;
      var now = new Date().toISOString();

      var order = {
        id: data.nextId('MH'),
        customerId: customer.id,
        ownerId: equipment.ownerId,
        equipmentId: equipment.id,
        renter: customer.name,
        equipment: equipment.name,
        startDate: startDate,
        endDate: endDate,
        date: startDate,
        status: manualOrderForm.elements.status.value,
        value: value,
        deliveryLocation: manualOrderForm.elements.location.value.trim(),
        source: 'admin',
        createdAt: now,
        activity: [],
        timeline: [{ id: data.nextId('TL'), stage: 'new', title: 'تم إنشاء الطلب', meta: 'طلب يدوي من اللوحة', at: now }],
        notes: [],
        documents: [],
        payment: { status: 'pending', total: value, paid: 0, due: value, transactions: [] }
      };
      addRecordActivity(order, 'order_created', 'إنشاء طلب يدوي');
      state.orders.unshift(order);
      var orderOwner = getOwner(order.ownerId);
      if (orderOwner) addOwnerActivity(orderOwner, 'order_created', 'إنشاء طلب يدوي');
      saveState(state);
      closeManualOrder();
      renderAll();
      showToast('تم إنشاء الطلب ' + order.id + '.');
    });

    document.querySelectorAll('[data-close-message]').forEach(function (button) {
      button.addEventListener('click', closeMessageForm);
    });
    messageDialog.addEventListener('click', function (event) {
      if (event.target === messageDialog) closeMessageForm();
    });
    messageForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!messageForm.reportValidity() || messageSubmit.disabled) return;
      var recipientParts = messageForm.elements.recipient.value.split(':');
      var recipientType = recipientParts[0];
      var recipientId = recipientParts.slice(1).join(':');
      var recipient = recipientType === 'owner' ? getOwner(recipientId) : getCustomer(recipientId);
      if (!recipient) {
        showToast('تعذّر العثور على المستلم.');
        return;
      }
      var conversation = state.conversations.find(function (item) {
        return !item.equipment && ((recipientType === 'owner' && item.ownerId === recipientId) || (recipientType === 'customer' && item.customerId === recipientId));
      });
      var now = new Date().toISOString();
      if (!conversation) {
        conversation = {
          id: data.nextId('CV'),
          ownerId: recipientType === 'owner' ? recipientId : null,
          customerId: recipientType === 'customer' ? recipientId : null,
          equipment: '',
          unread: 0,
          updatedAt: now,
          messages: []
        };
        state.conversations.unshift(conversation);
      }
      conversation.messages.push({ from: 'admin', text: messageForm.elements.message.value.trim(), time: now });
      conversation.updatedAt = now;
      if (recipientType === 'owner') addOwnerActivity(recipient, 'message_sent', 'إرسال رسالة إدارية');
      else addRecordActivity(recipient, 'message_sent', 'إرسال رسالة إدارية');
      saveState(state);
      closeMessageForm();
      renderAll();
      showToast('تم تسجيل الرسالة في المحادثات.');
    });

    document.querySelectorAll('[data-close-conversation]').forEach(function (button) {
      button.addEventListener('click', closeConversation);
    });

    conversationDialog.addEventListener('click', function (event) {
      if (event.target === conversationDialog) closeConversation();
    });

    conversationsBody.addEventListener('click', function (event) {
      var button = event.target.closest('[data-view-conversation]');
      if (!button) return;
      var conversation = state.conversations.find(function (item) { return item.id === button.dataset.viewConversation; });
      if (conversation) openConversation(conversation);
    });

    equipmentBody.addEventListener('click', function (event) {
      var editButton = event.target.closest('[data-edit-equipment]');
      var toggleButton = event.target.closest('[data-toggle-equipment]');
      var deleteButton = event.target.closest('[data-delete-equipment]');

      if (editButton) {
        var itemToEdit = getEquipment(editButton.dataset.editEquipment);
        if (itemToEdit) openDialog(itemToEdit);
      }

      if (deleteButton) {
        var itemToDelete = getEquipment(deleteButton.dataset.deleteEquipment);
        if (itemToDelete) deleteEquipment(itemToDelete);
      }

      if (toggleButton) {
        var item = getEquipment(toggleButton.dataset.toggleEquipment);
        if (!item) return;

        // نفس منطق صفحة المعدة: الإيقاف يحفظ الحالة السابقة ليستعيدها التفعيل،
        // فلا تقفز معدة «بانتظار المراجعة» إلى العرض بضغطة واحدة.
        var listed = data.isListed(item);
        if (listed) {
          item.previousStatus = item.status;
          item.status = 'paused';
        } else {
          item.status = item.previousStatus && item.previousStatus !== 'paused' && item.previousStatus !== 'suspended'
            ? item.previousStatus
            : 'active';
        }

        var title = listed ? 'إيقاف عرض معدة' : 'إعادة عرض معدة';
        addRecordActivity(item, 'equipment_status', title);
        var owner = getOwner(item.ownerId);
        if (owner) addOwnerActivity(owner, 'equipment_status', title);
        saveState(state);
        renderSummary();
        renderEquipment();
        renderOwners();
        showToast(listed ? 'تم إيقاف عرض المعدة.' : 'أُعيد عرض المعدة.');
      }
    });

    equipmentForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!equipmentForm.reportValidity()) return;

      var id = equipmentForm.elements.equipmentId.value;
      var existing = getEquipment(id);
      var ownerName = equipmentForm.elements.ownerName.value.trim();
      var owner = state.owners.find(function (item) { return item.name.toLowerCase() === ownerName.toLowerCase(); });
      if (!owner) {
        owner = {
          id: data.nextId('OW'),
          name: ownerName,
          contact: '',
          city: equipmentForm.elements.city.value,
          verification: 'pending',
          accountStatus: 'active',
          lastLogin: null,
          documents: [],
          ratings: [],
          activity: [],
          earnings: { transactions: [] }
        };
        state.owners.push(owner);
      }
      var values = {
        name: equipmentForm.elements.name.value.trim(),
        ownerId: owner.id,
        category: equipmentForm.elements.category.value,
        city: equipmentForm.elements.city.value,
        dailyRate: Math.max(1, parseInt(equipmentForm.elements.dailyRate.value, 10) || 1),
        status: equipmentForm.elements.status.value
      };

      if (existing) {
        var previousRate = existing.dailyRate;
        Object.assign(existing, values);
        if (previousRate !== values.dailyRate) {
          addOwnerActivity(owner, 'price_updated', 'تعديل سعر معدة');
          addRecordActivity(existing, 'price_updated', 'تعديل سعر المعدة');
        }
        showToast('تم حفظ تعديلات المعدة.');
      } else {
        values.id = data.nextId('EQ');
        values.availability = 'available';
        values.icon = 'i-excavator';
        values.highlights = [];
        values.specs = [];
        values.terms = [];
        values.included = [];
        values.excluded = [];
        values.documents = [];
        values.maintenance = [];
        values.bookings = [];
        values.activity = [];
        values.createdAt = new Date().toISOString();
        addRecordActivity(values, 'equipment_added', 'إضافة معدة');
        state.equipment.unshift(values);
        addOwnerActivity(owner, 'equipment_added', 'إضافة معدة');
        showToast('تمت إضافة المعدة إلى القائمة.');
      }

      saveState(state);
      closeDialog();
      renderAll();
    });

    document.querySelectorAll('[data-logout]').forEach(function (button) {
      button.addEventListener('click', function () {
        clearAuth();
        location.replace('login.html');
      });
    });

    // إعادة البيانات التجريبية — مخرج آمن بعد العبث بالنموذج
    document.querySelectorAll('[data-reset-data]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!window.confirm('سيُحذف كل ما أدخلته على هذا الجهاز وتعود البيانات التجريبية. متابعة؟')) return;
        state = data.reset();
        saveState(state);
        renderAll();
        showToast('أُعيدت البيانات التجريبية.');
      });
    });

    renderAll();
    var linkedRecord = new URLSearchParams(location.search);
    var linkedType = linkedRecord.get('recordType');
    var linkedId = linkedRecord.get('recordId');
    if (linkedType && linkedId) focusRecord(linkedType, linkedId);
  }

  if (!initLogin()) initDashboard();
})();
