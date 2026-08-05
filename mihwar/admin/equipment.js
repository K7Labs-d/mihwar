/* مِحور — ملف المعدة التشغيلي */

(function () {
  'use strict';

  var admin = window.MihwarAdmin;
  var components = window.MihwarComponents;
  var data = window.MihwarData;
  if (!admin || !components || !admin.readAuth()) {
    location.replace('login.html');
    return;
  }

  var state = admin.loadState();
  var equipmentId = new URLSearchParams(location.search).get('id');
  var equipment = state.equipment.find(function (item) { return item.id === equipmentId; });
  var owner = equipment ? state.owners.find(function (item) { return item.id === equipment.ownerId; }) : null;
  var content = document.querySelector('[data-equipment-content]');
  var notFound = document.querySelector('[data-equipment-not-found]');
  var breadcrumbHost = document.querySelector('[data-equipment-breadcrumb]');
  var pageHeaderHost = document.querySelector('[data-equipment-page-header]');
  var tabsHost = document.querySelector('[data-equipment-page-tabs]');
  var panel = document.querySelector('[data-equipment-page-panel]');
  var editDialog = document.querySelector('[data-equipment-page-edit-dialog]');
  var editForm = document.querySelector('[data-equipment-page-edit-form]');
  var statusDialog = document.querySelector('[data-equipment-status-dialog]');
  var statusForm = document.querySelector('[data-equipment-status-form]');
  var toast = document.querySelector('[data-equipment-toast]');
  var toastTimer;

  var EQUIPMENT_TABS = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'orders', label: 'الطلبات' },
    { id: 'bookings', label: 'الحجوزات' },
    { id: 'revenue', label: 'الإيرادات' },
    { id: 'documents', label: 'المستندات' },
    { id: 'maintenance', label: 'الصيانة' },
    { id: 'notes', label: 'الملاحظات' },
    { id: 'activity', label: 'سجل النشاط' }
  ];
  var validTabs = EQUIPMENT_TABS.map(function (tab) { return tab.id; });
  var currentTab = validTabs.indexOf(location.hash.slice(1)) !== -1 ? location.hash.slice(1) : 'overview';

  // المسميات كلها من طبقة البيانات المشتركة — لا نسخة ثانية تتفرّع عنها
  var EQUIPMENT_STATUS = admin.EQUIPMENT_STATUS_LABELS;
  var ORDER_STATUS = admin.STATUS_LABELS;

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function addActivity(type, title) {
    if (!Array.isArray(equipment.activity)) equipment.activity = [];
    equipment.activity.unshift({ id: 'AC-' + String(Date.now()), type: type, title: title, at: new Date().toISOString() });
    equipment.updatedAt = new Date().toISOString();
  }

  function relatedOrders() {
    return state.orders.filter(function (order) {
      return order.equipmentId === equipment.id || (!order.equipmentId && order.equipment === equipment.name);
    });
  }

  function getCustomer(customerId) {
    return state.customers.find(function (customer) { return customer.id === customerId; });
  }

  function dateValue(item, fields) {
    for (var index = 0; index < fields.length; index += 1) {
      if (item && item[fields[index]]) return new Date(item[fields[index]]).getTime() || 0;
    }
    return 0;
  }

  function latest(items, fields) {
    return items.slice().sort(function (a, b) { return dateValue(b, fields) - dateValue(a, fields); })[0] || null;
  }

  function orderHref(order) {
    return 'order.html?id=' + encodeURIComponent(order.id);
  }

  function customerHref(customer) {
    return customer ? 'index.html?recordType=customer&recordId=' + encodeURIComponent(customer.id) + '#customers' : 'index.html#customers';
  }

  function emptyState(title, description, action) {
    return components.EmptyState({
      title: title,
      description: description,
      className: 'owner-page-empty',
      action: action || null
    });
  }

  function badge(label, tone) {
    return components.StatusBadge({ label: label, tone: tone });
  }

  function equipmentBadge(status) {
    var label = EQUIPMENT_STATUS[status] || status || 'غير محددة';
    var tone = status === 'active' || status === 'displayed' ? 'verified' : (status === 'pending' || status === 'pending_review' ? 'pending' : 'rejected');
    return badge(label, tone);
  }

  function orderBadge(status) {
    var tone = ['completed', 'closed', 'returned'].indexOf(status) !== -1 ? 'verified' : (status === 'cancelled' || status === 'rejected' ? 'rejected' : 'pending');
    return badge(ORDER_STATUS[status] || status || 'غير محددة', tone);
  }

  function documentBadge(document) {
    var expired = document.expiresAt && new Date(document.expiresAt).getTime() < Date.now();
    if (expired) return badge('منتهي', 'rejected');
    var label = admin.DOCUMENT_STATUS_LABELS[document.status] || document.status || 'غير محددة';
    var tone = document.status === 'verified' ? 'verified' : (document.status === 'rejected' ? 'rejected' : 'pending');
    return badge(label, tone);
  }

  function activeOrder() {
    var activeStatuses = ['new', 'awaiting_owner', 'contacting', 'confirmed', 'in_progress'];
    return latest(relatedOrders().filter(function (order) { return activeStatuses.indexOf(order.status) !== -1; }), ['updatedAt', 'createdAt', 'date']);
  }

  function activityItems() {
    var items = [];
    (equipment.activity || []).forEach(function (item) {
      if (item.at) items.push({ title: item.title || 'نشاط على المعدة', meta: item.meta || '', at: item.at });
    });
    relatedOrders().forEach(function (order) {
      (order.activity || []).forEach(function (item) {
        if (item.at) items.push({ title: item.title || 'تحديث طلب', meta: 'الطلب ' + order.id, at: item.at });
      });
    });
    return items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function latestActivityDate() {
    var entries = activityItems();
    var dates = entries.map(function (item) { return item.at; });
    ['updatedAt', 'createdAt'].forEach(function (field) { if (equipment[field]) dates.push(equipment[field]); });
    dates.sort(function (a, b) { return new Date(b) - new Date(a); });
    return dates[0] || null;
  }

  function documentIssues() {
    var documents = Array.isArray(equipment.documents) ? equipment.documents : [];
    var issues = [];
    documents.forEach(function (document) {
      if (document.expiresAt && new Date(document.expiresAt).getTime() < Date.now()) {
        issues.push({ label: document.name || document.type || 'مستند', reason: 'منتهي' });
      } else if (document.status === 'rejected') {
        issues.push({ label: document.name || document.type || 'مستند', reason: 'مرفوض' });
      }
    });
    if (Array.isArray(equipment.requiredDocuments)) {
      equipment.requiredDocuments.forEach(function (required) {
        var found = documents.some(function (document) { return document.type === required || document.name === required; });
        if (!found) issues.push({ label: required, reason: 'غير مرفوع' });
      });
    }
    return issues;
  }

  function renderBreadcrumb() {
    breadcrumbHost.innerHTML = components.Breadcrumb({
      items: [
        { label: 'الرئيسية', href: 'index.html#summary' },
        { label: 'المعدات', href: 'index.html#equipment' },
        { label: equipment ? equipment.name : 'ملف المعدة', current: true }
      ]
    });
  }

  function refreshHeader() {
    owner = state.owners.find(function (item) { return item.id === equipment.ownerId; }) || null;
    var previewUrl = data.isListed(equipment) ? '../' + data.detailPath(equipment) : '';
    var imageUrl = typeof (equipment.imageUrl || equipment.image || equipment.photoUrl) === 'string' ? (equipment.imageUrl || equipment.image || equipment.photoUrl) : '';
    document.title = equipment.name + ' — مِحور';
    renderBreadcrumb();
    pageHeaderHost.innerHTML = components.PageHeader({
      imageUrl: imageUrl,
      imageAlt: 'صورة ' + equipment.name,
      avatar: '🚜',
      avatarClassName: 'equipment-page-media',
      title: equipment.name,
      badges: [equipmentBadge(equipment.status)],
      meta: [
        equipment.category || 'الفئة غير محددة',
        owner ? { label: owner.name, href: 'owner.html?id=' + encodeURIComponent(owner.id) } : 'لا يوجد مالك مرتبط',
        equipment.city || 'المدينة غير محددة',
        typeof equipment.dailyRate === 'number' ? admin.formatRiyal(equipment.dailyRate) + ' يوميًا' : 'السعر اليومي غير مسجل'
      ],
      supportingLabel: 'آخر نشاط',
      supportingValue: admin.formatDateTime(latestActivityDate()),
      actionsAriaLabel: 'إجراءات المعدة',
      actions: [
        { id: 'edit', label: 'تعديل' },
        { id: 'preview', label: 'معاينة في الموقع', href: previewUrl || null, target: previewUrl ? '_blank' : '', rel: previewUrl ? 'noopener' : '', disabled: !previewUrl, title: !previewUrl ? 'المعدة غير معروضة على الموقع حاليًا' : '' },
        { id: 'change-status', label: 'تغيير الحالة' },
        { id: 'toggle', label: equipment.status === 'paused' || equipment.status === 'suspended' ? 'تفعيل' : 'إيقاف', className: equipment.status === 'paused' || equipment.status === 'suspended' ? 'owner-account-action is-activate' : 'owner-account-action' },
        { id: 'owner', label: 'فتح ملف المالك', href: owner ? 'owner.html?id=' + encodeURIComponent(owner.id) : null, disabled: !owner, title: !owner ? 'لا يوجد مالك مرتبط' : '' }
      ]
    });
  }

  function overviewTab() {
    var orders = relatedOrders();
    var currentOrder = activeOrder();
    var lastOrder = latest(orders, ['updatedAt', 'createdAt', 'date']);
    var customer = lastOrder ? getCustomer(lastOrder.customerId) : null;
    var renterName = lastOrder ? (lastOrder.renter || (customer ? customer.name : '')) : '';
    var available = (equipment.status === 'active' || equipment.status === 'displayed') && !currentOrder;
    var issues = documentIssues();
    var note = equipment.operationalNote || (typeof equipment.notes === 'string' ? equipment.notes : '');

    return '<div class="owner-info-grid equipment-overview-grid">' +
      '<div><span>الحالة الحالية</span><strong>' + equipmentBadge(equipment.status) + '</strong></div>' +
      '<div><span>متاحة الآن</span><strong>' + (available ? 'نعم' : 'لا') + '</strong></div>' +
      '<div><span>الطلب النشط</span><strong>' + (currentOrder ? '<a class="record-link" href="' + orderHref(currentOrder) + '"><bdi>' + admin.escapeHTML(currentOrder.id) + '</bdi></a>' : 'لا يوجد') + '</strong></div>' +
      '<div><span>عدد الطلبات</span><strong>' + admin.formatNumber(orders.length) + '</strong></div>' +
      '<div><span>آخر مستأجر</span><strong>' + (renterName ? '<a class="record-link" href="' + customerHref(customer) + '">' + admin.escapeHTML(renterName) + '</a>' : 'لا يوجد') + '</strong></div>' +
      '<div><span>آخر تعديل</span><strong><bdi>' + admin.escapeHTML(admin.formatDateTime(equipment.updatedAt || equipment.createdAt)) + '</bdi></strong></div>' +
      '</div>' +
      '<div class="equipment-overview-sections">' +
        '<section><div class="owner-section-heading"><div><h2>المستندات الناقصة أو المنتهية</h2><p>بحسب المستندات والمتطلبات المسجلة لهذه المعدة.</p></div><button class="table-action" type="button" data-open-tab="documents">فتح المستندات</button></div>' +
          (issues.length ? '<div class="document-list">' + issues.map(function (issue) { return '<article class="document-row"><div><strong>' + admin.escapeHTML(issue.label) + '</strong><span>' + admin.escapeHTML(issue.reason) + '</span></div>' + badge(issue.reason, 'rejected') + '</article>'; }).join('') + '</div>' : emptyState('لا توجد مشكلات مستندية مسجلة', 'لم تُسجل مستندات ناقصة أو منتهية في بيانات هذه المعدة.')) +
        '</section>' +
        '<section><div class="owner-section-heading"><div><h2>ملاحظة تشغيلية</h2><p>الملاحظة المختصرة المسجلة على المعدة.</p></div><button class="table-action" type="button" data-open-tab="notes">فتح الملاحظات</button></div>' +
          (note ? '<div class="equipment-operational-note"><p>' + admin.escapeHTML(note) + '</p></div>' : emptyState('لا توجد ملاحظة تشغيلية', 'يمكن إضافة ملاحظة حقيقية من إجراء تعديل.')) +
        '</section>' +
      '</div>';
  }

  function ordersTab() {
    var orders = relatedOrders();
    if (!orders.length) return emptyState('لا توجد طلبات', 'لا توجد طلبات مرتبطة بهذه المعدة حتى الآن.', { href: 'index.html#orders', label: 'فتح قائمة الطلبات', variant: 'btn-ghost' });
    return '<div class="owner-section-heading"><div><h2>طلبات المعدة</h2><p>الطلبات المرتبطة بسجل هذه المعدة.</p></div><a class="btn btn-ghost" href="index.html#orders">قائمة الطلبات</a></div>' +
      '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>' + orders.map(function (order) {
        var customer = getCustomer(order.customerId);
        return '<tr><td data-label="رقم الطلب"><a class="record-link" href="' + orderHref(order) + '"><bdi>' + admin.escapeHTML(order.id) + '</bdi></a></td><td data-label="العميل"><a class="record-link" href="' + customerHref(customer) + '">' + admin.escapeHTML(order.renter || (customer ? customer.name : '—')) + '</a></td><td data-label="التاريخ"><bdi>' + admin.escapeHTML(admin.formatDate(order.date || order.createdAt)) + '</bdi></td><td data-label="الحالة">' + orderBadge(order.status) + '</td><td data-label="القيمة"><bdi>' + (typeof order.value === 'number' ? admin.escapeHTML(admin.formatRiyal(order.value)) : '—') + '</bdi></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function bookingsTab() {
    var bookings = Array.isArray(equipment.bookings) ? equipment.bookings : [];
    if (!bookings.length) return emptyState('لا توجد حجوزات', 'لا توجد حجوزات مسجلة لهذه المعدة.');
    return '<div class="document-list">' + bookings.map(function (booking) {
      var order = booking.orderId ? state.orders.find(function (item) { return item.id === booking.orderId; }) : null;
      return '<article class="document-row"><div><strong>' + (order ? '<a class="record-link" href="' + orderHref(order) + '">' + admin.escapeHTML(booking.label || order.id) + '</a>' : admin.escapeHTML(booking.label || booking.id || 'حجز')) + '</strong><span><bdi>' + admin.escapeHTML(admin.formatDate(booking.startDate)) + '</bdi>' + (booking.endDate ? ' — <bdi>' + admin.escapeHTML(admin.formatDate(booking.endDate)) + '</bdi>' : '') + '</span></div>' + badge(admin.recordStatusLabel(booking.status), booking.status === 'completed' ? 'verified' : 'pending') + '</article>';
    }).join('') + '</div>';
  }

  function revenueTab() {
    var earnings = equipment.earnings || {};
    var transactions = Array.isArray(earnings.transactions) ? earnings.transactions : [];
    var completedValues = relatedOrders().filter(function (order) { return order.status === 'completed' && typeof order.value === 'number'; });
    var total = typeof earnings.total === 'number' ? earnings.total : (completedValues.length ? completedValues.reduce(function (sum, order) { return sum + order.value; }, 0) : null);
    var summary = total === null ? '' : '<div class="owner-metric-grid owner-finance-grid"><article><span>إجمالي الإيرادات المسجلة</span><strong>' + admin.escapeHTML(admin.formatRiyal(total)) + '</strong><small>' + (typeof earnings.total === 'number' ? 'بحسب سجل الإيرادات' : 'محسوب من الطلبات المكتملة ذات القيمة المسجلة') + '</small></article></div>';
    if (!transactions.length) return summary + emptyState('لا توجد عمليات إيراد', 'ستظهر العمليات المالية عند تسجيل بيانات حقيقية لهذه المعدة.');
    return summary + '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>البيان</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>' + transactions.map(function (item) {
      return '<tr><td data-label="العملية"><bdi>' + admin.escapeHTML(item.id || '—') + '</bdi></td><td data-label="التاريخ"><bdi>' + admin.escapeHTML(admin.formatDate(item.date)) + '</bdi></td><td data-label="البيان">' + admin.escapeHTML(item.label || item.type || '—') + '</td><td data-label="الحالة">' + admin.escapeHTML(admin.recordStatusLabel(item.status)) + '</td><td data-label="القيمة"><bdi>' + (typeof item.amount === 'number' ? admin.escapeHTML(admin.formatRiyal(item.amount)) : '—') + '</bdi></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function documentsTab() {
    var documents = Array.isArray(equipment.documents) ? equipment.documents : [];
    if (!documents.length) return emptyState('لا توجد مستندات', 'لم تُرفع مستندات لهذه المعدة بعد.');
    return '<div class="document-list">' + documents.map(function (document) {
      var expiry = document.expiresAt ? 'ينتهي: ' + admin.formatDate(document.expiresAt) : (document.note || 'لا يوجد تاريخ انتهاء مسجل');
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(document.name || document.type || 'مستند') + '</strong><span><bdi>' + admin.escapeHTML(expiry) + '</bdi></span></div>' + documentBadge(document) + '</article>';
    }).join('') + '</div>';
  }

  function maintenanceTab() {
    var records = Array.isArray(equipment.maintenance) ? equipment.maintenance : [];
    if (!records.length) return emptyState('لا يوجد سجل صيانة', 'لم تُسجل أعمال صيانة لهذه المعدة.');
    return '<div class="document-list">' + records.map(function (record) {
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(record.title || record.type || 'صيانة') + '</strong><span>' + admin.escapeHTML(record.note || '') + '</span><small><bdi>' + admin.escapeHTML(admin.formatDate(record.date)) + '</bdi></small></div>' + badge(admin.recordStatusLabel(record.status), record.status === 'completed' ? 'verified' : 'pending') + '</article>';
    }).join('') + '</div>';
  }

  function notesTab() {
    var notes = Array.isArray(equipment.notes) ? equipment.notes : [];
    if (equipment.operationalNote) notes = [{ text: equipment.operationalNote, type: 'ملاحظة تشغيلية', at: equipment.updatedAt }].concat(notes);
    if (typeof equipment.notes === 'string' && equipment.notes) notes = [{ text: equipment.notes, type: 'ملاحظة تشغيلية', at: equipment.updatedAt }];
    if (!notes.length) return emptyState('لا توجد ملاحظات', 'لا توجد ملاحظات تشغيلية مسجلة على المعدة.');
    return '<div class="document-list">' + notes.map(function (note) {
      return '<article class="document-row equipment-note-row"><div><strong>' + admin.escapeHTML(note.type || note.title || 'ملاحظة') + '</strong><span>' + admin.escapeHTML(note.text || note.note || '') + '</span>' + (note.at || note.date ? '<small><bdi>' + admin.escapeHTML(admin.formatDateTime(note.at || note.date)) + '</bdi></small>' : '') + '</div></article>';
    }).join('') + '</div>';
  }

  function activityTab() {
    return components.Timeline({
      items: activityItems().map(function (item) { return { title: item.title, meta: item.meta, timeLabel: admin.formatDateTime(item.at) }; }),
      className: 'owner-activity-timeline',
      emptyTitle: 'لا يوجد نشاط مسجل',
      emptyDescription: 'ستظهر هنا الأنشطة الحقيقية المرتبطة بهذه المعدة وطلباتها.'
    });
  }

  var tabRenderers = {
    overview: overviewTab,
    orders: ordersTab,
    bookings: bookingsTab,
    revenue: revenueTab,
    documents: documentsTab,
    maintenance: maintenanceTab,
    notes: notesTab,
    activity: activityTab
  };

  function renderTabs() {
    tabsHost.innerHTML = components.EntityTabs({ tabs: EQUIPMENT_TABS, active: currentTab, panelId: 'equipment-tab-panel', ariaLabel: 'أقسام ملف المعدة' });
    panel.innerHTML = tabRenderers[currentTab]();
  }

  function renderPage() {
    refreshHeader();
    renderTabs();
  }

  function openEdit() {
    editForm.elements.name.value = equipment.name || '';
    editForm.elements.category.value = equipment.category || '';
    editForm.elements.city.value = equipment.city || '';
    editForm.elements.dailyRate.value = typeof equipment.dailyRate === 'number' ? String(equipment.dailyRate) : '';
    editForm.elements.operationalNote.value = equipment.operationalNote || (typeof equipment.notes === 'string' ? equipment.notes : '');
    editForm.elements.ownerId.innerHTML = '<option value="">بدون مالك مرتبط</option>' + state.owners.map(function (item) {
      return '<option value="' + admin.escapeHTML(item.id) + '"' + (item.id === equipment.ownerId ? ' selected' : '') + '>' + admin.escapeHTML(item.name) + '</option>';
    }).join('');
    editDialog.showModal();
  }

  function closeEdit() { editDialog.close(); }
  function openStatus() {
    statusForm.elements.status.value = EQUIPMENT_STATUS[equipment.status] ? equipment.status : 'active';
    if (equipment.status === 'displayed') statusForm.elements.status.value = 'active';
    if (equipment.status === 'pending') statusForm.elements.status.value = 'pending_review';
    if (equipment.status === 'suspended') statusForm.elements.status.value = 'paused';
    statusDialog.showModal();
  }
  function closeStatus() { statusDialog.close(); }

  if (!equipment) {
    renderBreadcrumb();
    notFound.hidden = false;
    return;
  }

  content.hidden = false;
  renderPage();

  components.bindEntityTabs(tabsHost, function (tabId) {
    if (validTabs.indexOf(tabId) === -1) return;
    currentTab = tabId;
    history.replaceState(null, '', location.pathname + location.search + '#' + currentTab);
    renderTabs();
  });

  panel.addEventListener('click', function (event) {
    var control = event.target.closest('[data-open-tab]');
    if (!control || validTabs.indexOf(control.dataset.openTab) === -1) return;
    currentTab = control.dataset.openTab;
    history.replaceState(null, '', location.pathname + location.search + '#' + currentTab);
    renderTabs();
    panel.focus();
  });

  pageHeaderHost.addEventListener('click', function (event) {
    var action = event.target.closest('[data-quick-action]');
    if (!action || action.getAttribute('aria-disabled') === 'true') return;
    if (action.dataset.quickAction === 'edit') openEdit();
    if (action.dataset.quickAction === 'change-status') openStatus();
    if (action.dataset.quickAction === 'toggle') {
      var stopped = equipment.status === 'paused' || equipment.status === 'suspended';
      var nextStatus = stopped ? (equipment.previousStatus && equipment.previousStatus !== 'paused' && equipment.previousStatus !== 'suspended' ? equipment.previousStatus : 'active') : 'paused';
      var confirmation = stopped ? 'هل تريد تفعيل عرض هذه المعدة؟' : 'هل تريد إيقاف عرض هذه المعدة؟';
      if (!window.confirm(confirmation)) return;
      if (!stopped) equipment.previousStatus = equipment.status;
      equipment.status = nextStatus;
      addActivity(stopped ? 'equipment_activated' : 'equipment_paused', stopped ? 'تفعيل عرض المعدة' : 'إيقاف عرض المعدة');
      admin.saveState(state);
      renderPage();
      showToast(stopped ? 'تم تفعيل عرض المعدة.' : 'تم إيقاف عرض المعدة.');
    }
  });

  document.querySelectorAll('[data-close-equipment-edit]').forEach(function (button) { button.addEventListener('click', closeEdit); });
  document.querySelectorAll('[data-close-equipment-status]').forEach(function (button) { button.addEventListener('click', closeStatus); });
  editDialog.addEventListener('click', function (event) { if (event.target === editDialog) closeEdit(); });
  statusDialog.addEventListener('click', function (event) { if (event.target === statusDialog) closeStatus(); });

  editForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!editForm.reportValidity()) return;
    var rateValue = editForm.elements.dailyRate.value;
    var previousName = equipment.name;
    equipment.name = editForm.elements.name.value.trim();
    equipment.category = editForm.elements.category.value.trim();
    equipment.city = editForm.elements.city.value.trim();
    equipment.ownerId = editForm.elements.ownerId.value;
    equipment.operationalNote = editForm.elements.operationalNote.value.trim();
    if (rateValue === '') delete equipment.dailyRate;
    else equipment.dailyRate = Math.max(0, Number(rateValue));
    state.orders.forEach(function (order) {
      if (order.equipmentId === equipment.id || (!order.equipmentId && order.equipment === previousName)) {
        order.equipmentId = equipment.id;
        order.equipment = equipment.name;
      }
    });
    addActivity('equipment_updated', 'تعديل بيانات المعدة');
    admin.saveState(state);
    closeEdit();
    renderPage();
    showToast('تم حفظ بيانات المعدة.');
  });

  statusForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!statusForm.reportValidity()) return;
    var previous = equipment.status;
    equipment.status = statusForm.elements.status.value;
    if (equipment.status === 'paused' || equipment.status === 'suspended') equipment.previousStatus = previous;
    else delete equipment.previousStatus;
    addActivity('equipment_status', 'تغيير حالة المعدة من «' + (EQUIPMENT_STATUS[previous] || previous) + '» إلى «' + EQUIPMENT_STATUS[equipment.status] + '»');
    admin.saveState(state);
    closeStatus();
    renderPage();
    showToast('تم تحديث حالة المعدة.');
  });

  document.querySelector('[data-equipment-logout]').addEventListener('click', function () {
    admin.clearAuth();
    location.replace('login.html');
  });
})();
