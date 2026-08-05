/* مِحور — ملف المالك التشغيلي */

(function () {
  'use strict';

  var admin = window.MihwarAdmin;
  var components = window.MihwarComponents;
  if (!admin || !components || !admin.readAuth()) {
    location.replace('login.html');
    return;
  }

  var state = admin.loadState();
  var ownerId = new URLSearchParams(location.search).get('id');
  var owner = state.owners.find(function (item) { return item.id === ownerId; });
  var content = document.querySelector('[data-owner-content]');
  var notFound = document.querySelector('[data-owner-not-found]');
  var breadcrumbHost = document.querySelector('[data-owner-breadcrumb]');
  var pageHeaderHost = document.querySelector('[data-owner-page-header]');
  var tabsHost = document.querySelector('[data-owner-page-tabs]');
  var panel = document.querySelector('[data-owner-page-panel]');
  var editDialog = document.querySelector('[data-owner-page-edit-dialog]');
  var editForm = document.querySelector('[data-owner-page-edit-form]');
  var toast = document.querySelector('[data-owner-toast]');
  var toastTimer;
  var OWNER_TABS = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'equipment', label: 'المعدات' },
    { id: 'orders', label: 'الطلبات' },
    { id: 'earnings', label: 'الأرباح' },
    { id: 'ratings', label: 'التقييمات' },
    { id: 'documents', label: 'المستندات' },
    { id: 'conversations', label: 'المحادثات' },
    { id: 'activity', label: 'سجل النشاط' }
  ];
  var validTabs = OWNER_TABS.map(function (tab) { return tab.id; });
  var currentTab = validTabs.indexOf(location.hash.slice(1)) !== -1 ? location.hash.slice(1) : 'overview';

  var EQUIPMENT_STATUS = {
    active: 'معروضة',
    displayed: 'معروضة',
    pending: 'بانتظار المراجعة',
    pending_review: 'بانتظار المراجعة',
    booked: 'محجوزة',
    unavailable: 'غير متاحة',
    paused: 'موقوفة',
    suspended: 'موقوفة'
  };

  var ORDER_STATUS = {
    new: 'جديد',
    awaiting_owner: 'بانتظار موافقة المالك',
    contacting: 'جارٍ التواصل',
    reviewed: 'تمت المراجعة',
    approved: 'تمت الموافقة',
    confirmed: 'مؤكد',
    in_progress: 'قيد التنفيذ',
    delivered: 'تم التسليم',
    returned: 'تم الإرجاع',
    completed: 'مكتمل',
    closed: 'مغلق',
    cancelled: 'ملغي',
    rejected: 'مرفوض'
  };

  var ACCOUNT_STATUS = {
    active: 'نشط',
    suspended: 'موقوف',
    inactive: 'غير نشط'
  };

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function normalizePhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.indexOf('05') === 0) digits = '966' + digits.slice(1);
    return digits;
  }

  function addActivity(type, title) {
    if (!Array.isArray(owner.activity)) owner.activity = [];
    owner.activity.unshift({ id: 'AC-' + String(Date.now()), type: type, title: title, at: new Date().toISOString() });
  }

  function ownerEquipment() {
    return state.equipment.filter(function (item) { return item.ownerId === owner.id; });
  }

  function ownerOrders() {
    return state.orders.filter(function (item) { return item.ownerId === owner.id; });
  }

  function ownerConversations() {
    return state.conversations.filter(function (item) { return item.ownerId === owner.id; });
  }

  function getCustomer(customerId) {
    return state.customers.find(function (customer) { return customer.id === customerId; });
  }

  function getOrderEquipment(order) {
    return state.equipment.find(function (item) {
      return item.id === order.equipmentId || (!order.equipmentId && item.name === order.equipment);
    });
  }

  function lastByDate(items, fields) {
    return items.slice().sort(function (a, b) {
      function value(item) {
        for (var index = 0; index < fields.length; index += 1) {
          if (item[fields[index]]) return new Date(item[fields[index]]).getTime() || 0;
        }
        return 0;
      }
      return value(b) - value(a);
    })[0] || null;
  }

  function emptyState(title, description, link) {
    return components.EmptyState({
      title: title,
      description: description,
      className: 'owner-page-empty',
      action: link ? { href: link.href, label: link.label, variant: 'btn-ghost' } : null
    });
  }

  function badge(label, tone) {
    return components.StatusBadge({ label: label, tone: tone });
  }

  function verificationBadge(status) {
    var safe = admin.OWNER_VERIFICATION_LABELS[status] ? status : 'pending';
    return badge(admin.OWNER_VERIFICATION_LABELS[safe], safe);
  }

  function accountBadge(status) {
    var safe = ACCOUNT_STATUS[status] ? status : 'active';
    return badge(ACCOUNT_STATUS[safe], safe === 'active' ? 'verified' : (safe === 'suspended' ? 'rejected' : 'pending'));
  }

  function equipmentBadge(status) {
    var label = EQUIPMENT_STATUS[status] || status || 'غير محددة';
    var tone = status === 'active' || status === 'displayed' ? 'verified' : (status === 'pending' || status === 'pending_review' ? 'pending' : 'rejected');
    return badge(label, tone);
  }

  function documentBadge(status) {
    var safe = admin.DOCUMENT_STATUS_LABELS[status] ? status : 'pending';
    return badge(admin.DOCUMENT_STATUS_LABELS[safe], safe);
  }

  function latestActivityDate() {
    var dates = [];
    (owner.activity || []).forEach(function (item) { if (item.at) dates.push(item.at); });
    if (owner.lastLogin) dates.push(owner.lastLogin);
    ownerConversations().forEach(function (item) { if (item.updatedAt) dates.push(item.updatedAt); });
    dates.sort(function (a, b) { return new Date(b) - new Date(a); });
    return dates[0] || null;
  }

  function timeline(items) {
    return components.Timeline({
      items: items.map(function (item) {
        return { title: item.title, meta: item.meta, timeLabel: admin.formatDateTime(item.at) };
      }),
      className: 'owner-activity-timeline',
      emptyTitle: 'لا يوجد نشاط مسجل',
      emptyDescription: 'ستظهر هنا الإجراءات الحقيقية المرتبطة بهذا المالك.'
    });
  }

  function renderBreadcrumb() {
    breadcrumbHost.innerHTML = components.Breadcrumb({
      items: [
        { label: 'الرئيسية', href: 'index.html#summary' },
        { label: 'ملاك المعدات', href: 'index.html#owners' },
        { label: owner ? owner.name : 'ملف المالك', current: true }
      ]
    });
  }

  function refreshHeader() {
    var phone = normalizePhone(owner.contact);
    document.title = owner.name + ' — مِحور';
    renderBreadcrumb();
    pageHeaderHost.innerHTML = components.PageHeader({
      avatar: owner.name.trim().charAt(0) || 'م',
      title: owner.name,
      badges: [verificationBadge(owner.verification), accountBadge(owner.accountStatus)],
      meta: [owner.contact || 'لا يوجد رقم تواصل', owner.city || 'المدينة غير محددة'],
      supportingLabel: 'آخر نشاط',
      supportingValue: admin.formatDateTime(latestActivityDate()),
      actionsAriaLabel: 'إجراءات المالك',
      actions: [
        { id: 'call', label: 'اتصال', href: phone.length >= 9 ? 'tel:+' + phone : null, disabled: phone.length < 9, title: phone.length < 9 ? 'أضف رقم التواصل أولًا' : '' },
        { id: 'whatsapp', label: 'واتساب', href: phone.length >= 9 ? 'https://wa.me/' + phone : null, target: '_blank', rel: 'noopener', disabled: phone.length < 9, title: phone.length < 9 ? 'أضف رقم التواصل أولًا' : '' },
        { id: 'edit', label: 'تعديل' },
        { id: 'verify', label: 'توثيق', hidden: owner.verification === 'verified' },
        { id: 'toggle-account', label: owner.accountStatus === 'suspended' ? 'تفعيل الحساب' : 'إيقاف الحساب', className: owner.accountStatus === 'suspended' ? 'owner-account-action is-activate' : 'owner-account-action' }
      ]
    });
  }

  function overviewTab() {
    var equipment = ownerEquipment();
    var orders = ownerOrders();
    var conversations = ownerConversations();
    var activeEquipment = equipment.filter(function (item) { return item.status === 'active' || item.status === 'displayed'; }).length;
    var openOrders = orders.filter(function (item) { return ['completed', 'closed', 'cancelled', 'rejected'].indexOf(item.status) === -1; }).length;
    var completedOrders = orders.filter(function (item) { return item.status === 'completed' || item.status === 'closed'; }).length;
    var ratings = Array.isArray(owner.ratings) ? owner.ratings.filter(function (item) { return typeof (item.value || item.score) === 'number'; }) : [];
    var ratingAverage = ratings.length ? ratings.reduce(function (sum, item) { return sum + Number(item.value || item.score); }, 0) / ratings.length : null;
    var documents = Array.isArray(owner.documents) ? owner.documents : [];
    var incompleteDocuments = documents.length ? documents.filter(function (item) { return item.status !== 'verified'; }).length : null;
    var lastOrder = lastByDate(orders, ['createdAt', 'date']);
    var lastConversation = lastByDate(conversations, ['updatedAt']);
    var linkedCustomers = orders.map(function (order) { return getCustomer(order.customerId); }).filter(Boolean).filter(function (customer, index, list) {
      return list.findIndex(function (item) { return item.id === customer.id; }) === index;
    });

    return '<div class="owner-metric-grid owner-operational-metrics">' +
      '<article><span>المعدات النشطة</span><strong>' + admin.formatNumber(activeEquipment) + '</strong></article>' +
      '<article><span>الطلبات المفتوحة</span><strong>' + admin.formatNumber(openOrders) + '</strong></article>' +
      '<article><span>الطلبات المكتملة</span><strong>' + admin.formatNumber(completedOrders) + '</strong></article>' +
      '<article><span>متوسط التقييم</span><strong>' + (ratingAverage === null ? '—' : admin.escapeHTML(ratingAverage.toFixed(1))) + '</strong><small>' + (ratingAverage === null ? 'لا توجد تقييمات' : admin.formatNumber(ratings.length) + ' تقييمات') + '</small></article>' +
      '<article><span>المستندات الناقصة</span><strong>' + (incompleteDocuments === null ? '—' : admin.formatNumber(incompleteDocuments)) + '</strong><small>' + (incompleteDocuments === null ? 'لا توجد مستندات' : 'بحسب المستندات المسجلة') + '</small></article>' +
      '<article><span>آخر طلب</span><strong class="metric-date">' + (lastOrder ? admin.escapeHTML(lastOrder.id) : '—') + '</strong><small>' + (lastOrder ? admin.escapeHTML(admin.formatDate(lastOrder.date || lastOrder.createdAt)) : 'لا توجد طلبات') + '</small></article>' +
      '<article><span>آخر تواصل</span><strong class="metric-date"><bdi>' + admin.escapeHTML(lastConversation ? admin.formatDateTime(lastConversation.updatedAt) : '—') + '</bdi></strong><small>' + (lastConversation ? 'محادثة مسجلة' : 'لا توجد محادثات') + '</small></article>' +
      '</div>' +
      '<section class="owner-relationships"><div class="panel-heading"><div><span class="eyebrow">الروابط التشغيلية</span><h2>السجلات المرتبطة</h2></div></div><div class="relationship-grid">' +
      '<a href="index.html#equipment"><span>المعدات</span><strong>' + admin.formatNumber(equipment.length) + '</strong><small>فتح قائمة المعدات</small></a>' +
      '<a href="index.html#orders"><span>الطلبات</span><strong>' + admin.formatNumber(orders.length) + '</strong><small>فتح قائمة الطلبات</small></a>' +
      '<a href="index.html#customers"><span>العملاء المرتبطون</span><strong>' + admin.formatNumber(linkedCustomers.length) + '</strong><small>فتح قائمة العملاء</small></a>' +
      '<a href="index.html#conversations"><span>المحادثات</span><strong>' + admin.formatNumber(conversations.length) + '</strong><small>فتح سجل المحادثات</small></a>' +
      '</div></section>';
  }

  function equipmentTab() {
    var equipment = ownerEquipment();
    if (!equipment.length) return emptyState('لا توجد معدات', 'لم تُربط أي معدة بهذا المالك حتى الآن.', { href: 'index.html#equipment', label: 'فتح قائمة المعدات' });
    return '<div class="owner-section-heading"><div><h2>معدات المالك</h2><p>المعدات المرتبطة بهذا الملف.</p></div><a class="btn btn-ghost" href="index.html#equipment">قائمة المعدات</a></div>' +
      '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>المعدة</th><th>الفئة</th><th>المدينة</th><th>السعر اليومي</th><th>الحالة</th><th>الانتقال</th></tr></thead><tbody>' + equipment.map(function (item) {
        return '<tr><td data-label="المعدة"><a class="record-link cell-title" href="equipment.html?id=' + encodeURIComponent(item.id) + '">' + admin.escapeHTML(item.name) + '</a><span class="cell-sub"><bdi>' + admin.escapeHTML(item.id) + '</bdi></span></td><td data-label="الفئة">' + admin.escapeHTML(item.category || '—') + '</td><td data-label="المدينة">' + admin.escapeHTML(item.city || '—') + '</td><td data-label="السعر اليومي"><bdi>' + (typeof item.dailyRate === 'number' ? admin.escapeHTML(admin.formatRiyal(item.dailyRate)) : '—') + '</bdi></td><td data-label="الحالة">' + equipmentBadge(item.status) + '</td><td data-label="الانتقال"><a class="table-action table-action-primary" href="equipment.html?id=' + encodeURIComponent(item.id) + '">عرض الملف</a></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function ordersTab() {
    var orders = ownerOrders();
    if (!orders.length) return emptyState('لا توجد طلبات', 'لا توجد طلبات مرتبطة بهذا المالك حتى الآن.', { href: 'index.html#orders', label: 'فتح قائمة الطلبات' });
    return '<div class="owner-section-heading"><div><h2>طلبات المالك</h2><p>الطلبات المرتبطة بمعداته.</p></div><a class="btn btn-ghost" href="index.html#orders">قائمة الطلبات</a></div>' +
      '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المعدة</th><th>التاريخ</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>' + orders.map(function (order) {
        var customer = getCustomer(order.customerId);
        var linkedEquipment = getOrderEquipment(order);
        var customerCell = customer
          ? '<a class="record-link" href="index.html?recordType=customer&amp;recordId=' + encodeURIComponent(customer.id) + '#customers">' + admin.escapeHTML(order.renter || customer.name) + '</a>'
          : admin.escapeHTML(order.renter || '—');
        var orderTone = ['completed', 'closed', 'returned'].indexOf(order.status) !== -1 ? 'verified' : (order.status === 'cancelled' || order.status === 'rejected' ? 'rejected' : 'pending');
        return '<tr><td data-label="رقم الطلب"><a class="record-link" href="order.html?id=' + encodeURIComponent(order.id) + '"><bdi>' + admin.escapeHTML(order.id) + '</bdi></a></td><td data-label="العميل">' + customerCell + '</td><td data-label="المعدة">' + (linkedEquipment ? '<a class="record-link" href="equipment.html?id=' + encodeURIComponent(linkedEquipment.id) + '">' + admin.escapeHTML(linkedEquipment.name) + '</a>' : admin.escapeHTML(order.equipment || '—')) + '</td><td data-label="التاريخ"><bdi>' + admin.escapeHTML(admin.formatDate(order.date || order.createdAt)) + '</bdi></td><td data-label="الحالة">' + badge(ORDER_STATUS[order.status] || order.status || 'غير محددة', orderTone) + '</td><td data-label="القيمة"><bdi>' + (typeof order.value === 'number' ? admin.escapeHTML(admin.formatRiyal(order.value)) : '—') + '</bdi></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function earningsTab() {
    var earnings = owner.earnings || {};
    var transactions = Array.isArray(earnings.transactions) ? earnings.transactions : [];
    var total = typeof earnings.total === 'number' ? earnings.total : null;
    var due = typeof earnings.due === 'number' ? earnings.due : null;
    var transferred = typeof earnings.transferred === 'number' ? earnings.transferred : null;
    var metrics = '<div class="owner-metric-grid owner-finance-grid"><article><span>إجمالي الإيرادات</span><strong>' + (total === null ? '—' : admin.escapeHTML(admin.formatRiyal(total))) + '</strong></article><article><span>المستحق</span><strong>' + (due === null ? '—' : admin.escapeHTML(admin.formatRiyal(due))) + '</strong></article><article><span>المحوّل</span><strong>' + (transferred === null ? '—' : admin.escapeHTML(admin.formatRiyal(transferred))) + '</strong></article></div>';
    if (!transactions.length) return metrics + emptyState('لا توجد عمليات مالية', 'ستظهر الإيرادات والمستحقات والتحويلات عند تسجيل عمليات حقيقية.');
    return metrics + '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>النوع</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>' + transactions.map(function (item) {
      return '<tr><td data-label="العملية"><bdi>' + admin.escapeHTML(item.id || '—') + '</bdi></td><td data-label="التاريخ"><bdi>' + admin.escapeHTML(admin.formatDate(item.date)) + '</bdi></td><td data-label="النوع">' + admin.escapeHTML(item.label || item.type || '—') + '</td><td data-label="الحالة">' + admin.escapeHTML(item.status || '—') + '</td><td data-label="القيمة"><bdi>' + (typeof item.amount === 'number' ? admin.escapeHTML(admin.formatRiyal(item.amount)) : '—') + '</bdi></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function ratingsTab() {
    var ratings = Array.isArray(owner.ratings) ? owner.ratings : [];
    if (!ratings.length) return emptyState('لا توجد تقييمات', 'لم يستلم هذا المالك أي تقييم بعد.');
    return '<div class="rating-list">' + ratings.map(function (item) {
      var score = item.value || item.score;
      return '<article class="rating-card"><header><strong>' + admin.escapeHTML(item.author || item.customer || 'تقييم مسجل') + '</strong><span>' + (typeof score === 'number' ? admin.escapeHTML(String(score)) + ' / 5' : '—') + '</span></header><p>' + admin.escapeHTML(item.comment || 'لا يوجد تعليق.') + '</p><small><bdi>' + admin.escapeHTML(admin.formatDate(item.date)) + '</bdi></small></article>';
    }).join('') + '</div>';
  }

  function documentsTab() {
    var documents = Array.isArray(owner.documents) ? owner.documents : [];
    if (!documents.length) return emptyState('لا توجد مستندات', 'لم تُرفع الهوية أو السجل التجاري أو مستندات المعدات بعد.');
    return '<div class="document-list">' + documents.map(function (item) {
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(item.name || item.type || 'مستند') + '</strong><span>' + admin.escapeHTML(item.note || 'مستند مرتبط بملف المالك') + '</span></div>' + documentBadge(item.status) + '</article>';
    }).join('') + '</div>';
  }

  function conversationsTab() {
    var conversations = ownerConversations();
    if (!conversations.length) return emptyState('لا توجد محادثات', 'لا توجد محادثات مرتبطة بهذا المالك حتى الآن.', { href: 'index.html#conversations', label: 'فتح سجل المحادثات' });
    return '<div class="document-list">' + conversations.map(function (conversation) {
      var customer = getCustomer(conversation.customerId);
      var latest = conversation.messages && conversation.messages.length ? conversation.messages[conversation.messages.length - 1] : null;
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(customer ? customer.name : (conversation.equipment || 'محادثة إدارية')) + '</strong><span>' + admin.escapeHTML(latest ? latest.text : 'لا توجد رسائل') + '</span><small><bdi>' + admin.escapeHTML(admin.formatDateTime(conversation.updatedAt)) + '</bdi></small></div><a class="table-action" href="index.html#conversations">فتح السجل</a></article>';
    }).join('') + '</div>';
  }

  function activityTab() {
    var activity = [];
    (owner.activity || []).forEach(function (item) { if (item.at) activity.push({ title: item.title, at: item.at, meta: 'ملف المالك' }); });
    if (owner.lastLogin) activity.push({ title: 'تسجيل دخول', at: owner.lastLogin, meta: owner.name });
    ownerEquipment().forEach(function (equipment) {
      (equipment.activity || []).forEach(function (item) { if (item.at) activity.push({ title: item.title, at: item.at, meta: equipment.name }); });
    });
    ownerOrders().forEach(function (order) {
      (order.activity || []).forEach(function (item) { if (item.at) activity.push({ title: item.title, at: item.at, meta: order.id }); });
    });
    activity.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return timeline(activity);
  }

  var tabRenderers = {
    overview: overviewTab,
    equipment: equipmentTab,
    orders: ordersTab,
    earnings: earningsTab,
    ratings: ratingsTab,
    documents: documentsTab,
    conversations: conversationsTab,
    activity: activityTab
  };

  function renderTab() {
    tabsHost.innerHTML = components.EntityTabs({
      tabs: OWNER_TABS,
      active: currentTab,
      panelId: 'owner-tab-panel',
      ariaLabel: 'أقسام ملف المالك',
      className: 'owner-page-tabs'
    });
    panel.innerHTML = tabRenderers[currentTab]();
  }

  function renderPage() {
    refreshHeader();
    renderTab();
  }

  function openEdit() {
    editForm.elements.name.value = owner.name;
    editForm.elements.contact.value = owner.contact || '';
    editForm.elements.city.value = owner.city || '';
    editForm.elements.verification.value = owner.verification || 'pending';
    if (typeof editDialog.showModal === 'function') editDialog.showModal();
    else editDialog.setAttribute('open', '');
    editForm.elements.name.focus();
  }

  function closeEdit() {
    if (typeof editDialog.close === 'function') editDialog.close();
    else editDialog.removeAttribute('open');
  }

  document.querySelector('[data-owner-logout]').addEventListener('click', function () {
    try { sessionStorage.removeItem(admin.AUTH_KEY); } catch (e) { /* لا شيء */ }
    location.replace('login.html');
  });

  renderBreadcrumb();

  if (!owner) {
    notFound.hidden = false;
    return;
  }

  content.hidden = false;
  renderPage();

  tabsHost.addEventListener('click', function (event) {
    var button = event.target.closest('[data-entity-tab]');
    if (button) {
      currentTab = button.dataset.entityTab;
      history.replaceState(null, '', location.pathname + location.search + '#' + currentTab);
      renderTab();
      panel.focus();
    }
  });

  pageHeaderHost.addEventListener('click', function (event) {
    var action = event.target.closest('[data-quick-action]');
    if (!action || action.getAttribute('aria-disabled') === 'true') return;
    if (action.dataset.quickAction === 'edit') openEdit();
    if (action.dataset.quickAction === 'verify') {
      owner.verification = 'verified';
      addActivity('owner_verified', 'توثيق المالك');
      admin.saveState(state);
      renderPage();
      showToast('تم توثيق المالك.');
    }
    if (action.dataset.quickAction === 'toggle-account') {
      var suspending = owner.accountStatus !== 'suspended';
      var confirmation = suspending ? 'هل تريد إيقاف حساب هذا المالك؟' : 'هل تريد تفعيل حساب هذا المالك؟';
      if (!window.confirm(confirmation)) return;
      owner.accountStatus = suspending ? 'suspended' : 'active';
      addActivity(suspending ? 'account_suspended' : 'account_activated', suspending ? 'إيقاف الحساب' : 'تفعيل الحساب');
      admin.saveState(state);
      renderPage();
      showToast(suspending ? 'تم إيقاف حساب المالك.' : 'تم تفعيل حساب المالك.');
    }
  });

  document.querySelectorAll('[data-close-owner-page-edit]').forEach(function (button) { button.addEventListener('click', closeEdit); });
  editDialog.addEventListener('click', function (event) { if (event.target === editDialog) closeEdit(); });
  editForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!editForm.reportValidity()) return;
    owner.name = editForm.elements.name.value.trim();
    owner.contact = editForm.elements.contact.value.trim();
    owner.city = editForm.elements.city.value.trim();
    owner.verification = editForm.elements.verification.value;
    addActivity('owner_updated', 'تعديل بيانات المالك');
    admin.saveState(state);
    closeEdit();
    renderPage();
    showToast('تم حفظ بيانات المالك.');
  });

})();
