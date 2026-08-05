/* مِحور — ملف الطلب التشغيلي */

(function () {
  'use strict';

  var admin = window.MihwarAdmin;
  var components = window.MihwarComponents;
  if (!admin || !components || !admin.readAuth()) {
    location.replace('login.html');
    return;
  }

  var state = admin.loadState();
  var orderId = new URLSearchParams(location.search).get('id');
  var order = state.orders.find(function (item) { return item.id === orderId; });
  var content = document.querySelector('[data-order-content]');
  var notFound = document.querySelector('[data-order-not-found]');
  var breadcrumbHost = document.querySelector('[data-order-breadcrumb]');
  var pageHeaderHost = document.querySelector('[data-order-page-header]');
  var tabsHost = document.querySelector('[data-order-page-tabs]');
  var panel = document.querySelector('[data-order-page-panel]');
  var statusDialog = document.querySelector('[data-order-status-dialog]');
  var statusForm = document.querySelector('[data-order-status-form]');
  var noteDialog = document.querySelector('[data-order-note-dialog]');
  var noteForm = document.querySelector('[data-order-note-form]');
  var detailsDialog = document.querySelector('[data-order-details-dialog]');
  var detailsForm = document.querySelector('[data-order-details-form]');
  var toast = document.querySelector('[data-order-toast]');
  var toastTimer;

  var ORDER_TABS = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'timeline', label: 'الخط الزمني' },
    { id: 'payment', label: 'الدفع' },
    { id: 'documents', label: 'العقد والمستندات' },
    { id: 'conversations', label: 'المحادثات' },
    { id: 'notes', label: 'الملاحظات' },
    { id: 'activity', label: 'سجل النشاط' }
  ];
  var validTabs = ORDER_TABS.map(function (tab) { return tab.id; });
  var currentTab = validTabs.indexOf(location.hash.slice(1)) !== -1 ? location.hash.slice(1) : 'overview';

  // المسميات من طبقة البيانات المشتركة — لا نسخة ثانية تتفرّع عنها
  var STATUS_LABELS = admin.STATUS_LABELS;

  var STATUS_TIMELINE_LABELS = {
    new: 'تم إنشاء الطلب',
    contacting: 'تمت مراجعة الطلب',
    reviewed: 'تمت مراجعة الطلب',
    awaiting_owner: 'بانتظار موافقة المالك',
    approved: 'تمت الموافقة',
    confirmed: 'تم التأكيد',
    in_progress: 'قيد التنفيذ',
    delivered: 'تم التسليم',
    returned: 'تم الإرجاع',
    completed: 'تم إغلاق الطلب',
    closed: 'تم إغلاق الطلب',
    rejected: 'تم رفض الطلب',
    cancelled: 'تم إلغاء الطلب'
  };

  var PAYMENT_LABELS = admin.PAYMENT_STATUS_LABELS;

  var ALLOWED_NEXT = {
    new: ['reviewed', 'awaiting_owner'],
    contacting: ['reviewed', 'awaiting_owner'],
    reviewed: ['awaiting_owner', 'approved'],
    awaiting_owner: ['approved'],
    approved: ['confirmed'],
    confirmed: ['in_progress'],
    in_progress: ['delivered'],
    delivered: ['returned'],
    returned: [],
    completed: [],
    closed: [],
    rejected: [],
    cancelled: []
  };

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function getCustomer() {
    return state.customers.find(function (item) { return item.id === order.customerId; }) || null;
  }

  function getEquipment() {
    return state.equipment.find(function (item) {
      return item.id === order.equipmentId || (!order.equipmentId && item.name === order.equipment);
    }) || null;
  }

  function getOwner() {
    var equipment = getEquipment();
    return state.owners.find(function (item) { return item.id === order.ownerId || (equipment && item.id === equipment.ownerId); }) || null;
  }

  function relatedConversations() {
    return state.conversations.filter(function (conversation) {
      if (conversation.orderId) return conversation.orderId === order.id;
      return Boolean(order.customerId && order.equipment && conversation.customerId === order.customerId && conversation.equipment === order.equipment);
    });
  }

  var normalizePhone = admin.normalizePhone;

  function emptyState(title, description, action) {
    return components.EmptyState({ title: title, description: description, className: 'owner-page-empty', action: action || null });
  }

  function badge(label, tone) {
    return components.StatusBadge({ label: label, tone: tone });
  }

  function statusTone(status) {
    if (status === 'completed' || status === 'closed' || status === 'returned') return 'verified';
    if (status === 'rejected' || status === 'cancelled') return 'rejected';
    return 'pending';
  }

  function statusBadge(status) {
    return badge(STATUS_LABELS[status] || status || 'غير محددة', statusTone(status));
  }

  function paymentStatus() {
    if (order.paymentConfirmed === true) return 'confirmed';
    return order.paymentStatus || (order.payment && order.payment.status) || '';
  }

  function paymentConfirmed() {
    return order.paymentConfirmed === true || ['paid', 'confirmed'].indexOf(paymentStatus()) !== -1;
  }

  function paymentBadge() {
    var status = paymentStatus();
    if (!status) return badge('حالة الدفع غير مسجلة', 'pending');
    var tone = status === 'paid' || status === 'confirmed' ? 'verified' : (status === 'failed' ? 'rejected' : 'pending');
    return badge(PAYMENT_LABELS[status] || status, tone);
  }

  function isTerminal() {
    return ['completed', 'closed', 'rejected', 'cancelled'].indexOf(order.status) !== -1;
  }

  function activityDate() {
    var dates = [];
    (order.activity || []).forEach(function (item) { if (item.at) dates.push(item.at); });
    (order.timeline || []).forEach(function (item) { if (item.at) dates.push(item.at); });
    relatedConversations().forEach(function (item) { if (item.updatedAt) dates.push(item.updatedAt); });
    if (order.updatedAt) dates.push(order.updatedAt);
    if (order.createdAt) dates.push(order.createdAt);
    dates.sort(function (a, b) { return new Date(b) - new Date(a); });
    return dates[0] || null;
  }

  function recordEvent(type, title, meta, timelineStage) {
    var at = new Date().toISOString();
    if (!Array.isArray(order.activity)) order.activity = [];
    if (!Array.isArray(order.timeline)) order.timeline = [];
    order.activity.unshift({ id: 'AC-' + String(Date.now()), type: type, title: title, meta: meta || '', at: at });
    order.timeline.push({ id: 'TL-' + String(Date.now()), stage: timelineStage || type, title: title, meta: meta || '', at: at });
    order.updatedAt = at;
  }

  function changeStatus(nextStatus, actionTitle) {
    var previous = order.status;
    order.status = nextStatus;
    recordEvent('order_status', actionTitle || STATUS_TIMELINE_LABELS[nextStatus], 'من «' + (STATUS_LABELS[previous] || previous || 'غير محددة') + '» إلى «' + (STATUS_LABELS[nextStatus] || nextStatus) + '»', nextStatus);
    admin.saveState(state);
    renderPage();
    showToast('تم تحديث حالة الطلب إلى «' + (STATUS_LABELS[nextStatus] || nextStatus) + '».');
  }

  function dateTime(value) {
    return value ? admin.formatDateTime(value) : '—';
  }

  function dateOnly(value) {
    if (!value) return '—';
    if (String(value).indexOf('T') === -1) return admin.formatDate(value);
    try {
      return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
    } catch (e) {
      return value;
    }
  }

  function customerHref(customer) {
    return customer ? 'index.html?recordType=customer&recordId=' + encodeURIComponent(customer.id) + '#customers' : '';
  }

  function rentalDuration() {
    var start = order.startDate || order.date;
    var end = order.endDate;
    if (!start || !end) return '';
    var difference = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isNaN(difference) || difference < 0) return '';
    return window.MihwarData.countLabel(Math.max(1, Math.ceil(difference / 86400000)), { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' });
  }

  function renderBreadcrumb() {
    breadcrumbHost.innerHTML = components.Breadcrumb({
      items: [
        { label: 'الرئيسية', href: 'index.html#summary' },
        { label: 'الطلبات', href: 'index.html#orders' },
        { label: order ? order.id : 'ملف الطلب', current: true }
      ]
    });
  }

  function headerActions() {
    var customer = getCustomer();
    var owner = getOwner();
    var equipment = getEquipment();
    var phone = normalizePhone(customer ? customer.contact : order.customerContact);
    var preApproval = ['new', 'contacting', 'reviewed', 'awaiting_owner'].indexOf(order.status) !== -1;
    var cancellable = ['approved', 'confirmed', 'in_progress'].indexOf(order.status) !== -1;
    var next = ALLOWED_NEXT[order.status] || [];
    return [
      { id: 'accept', label: 'قبول الطلب', hidden: !preApproval },
      { id: 'reject', label: 'رفض الطلب', hidden: !preApproval, className: 'owner-account-action' },
      { id: 'change-status', label: 'تغيير الحالة', hidden: !next.length },
      { id: 'confirm-order', label: 'تأكيد الطلب', hidden: order.status !== 'approved' },
      { id: 'start', label: 'بدء التنفيذ', hidden: order.status !== 'confirmed' },
      { id: 'deliver', label: 'تسجيل التسليم', hidden: order.status !== 'in_progress' },
      { id: 'return', label: 'تسجيل الإرجاع', hidden: order.status !== 'delivered' },
      { id: 'close', label: 'إغلاق الطلب', hidden: order.status !== 'returned', className: 'owner-account-action' },
      { id: 'confirm-payment', label: 'تأكيد الدفع', hidden: paymentConfirmed() || order.status === 'rejected' || order.status === 'cancelled' },
      { id: 'edit-details', label: 'تعديل بيانات الطلب' },
      { id: 'add-note', label: 'إضافة ملاحظة' },
      { id: 'call', label: 'اتصال', href: phone.length >= 9 ? 'tel:+' + phone : null, hidden: phone.length < 9 },
      { id: 'whatsapp', label: 'واتساب', href: phone.length >= 9 ? 'https://wa.me/' + phone : null, target: '_blank', rel: 'noopener', hidden: phone.length < 9 },
      { id: 'cancel', label: 'إلغاء الطلب', hidden: !cancellable, className: 'owner-account-action' },
      { id: 'owner', label: 'فتح ملف المالك', href: owner ? 'owner.html?id=' + encodeURIComponent(owner.id) : null, hidden: !owner },
      { id: 'equipment', label: 'فتح ملف المعدة', href: equipment ? 'equipment.html?id=' + encodeURIComponent(equipment.id) : null, hidden: !equipment }
    ];
  }

  function refreshHeader() {
    var customer = getCustomer();
    var owner = getOwner();
    var equipment = getEquipment();
    var start = order.startDate || order.date;
    var period = start ? dateOnly(start) + (order.endDate ? ' — ' + dateOnly(order.endDate) : '') : 'فترة الإيجار غير مسجلة';
    document.title = 'الطلب ' + order.id + ' — مِحور';
    renderBreadcrumb();
    pageHeaderHost.innerHTML = components.PageHeader({
      avatar: '📦',
      avatarClassName: 'order-page-media',
      title: 'الطلب ' + order.id,
      badges: [statusBadge(order.status), paymentBadge()],
      meta: [
        customer ? { label: order.renter || customer.name, href: customerHref(customer) } : (order.renter || 'العميل غير مرتبط'),
        owner ? { label: owner.name, href: 'owner.html?id=' + encodeURIComponent(owner.id) } : 'المالك غير مرتبط',
        equipment ? { label: equipment.name, href: 'equipment.html?id=' + encodeURIComponent(equipment.id) } : (order.equipment || 'المعدة غير مرتبطة'),
        period,
        typeof order.value === 'number' ? admin.formatRiyal(order.value) : 'القيمة غير مسجلة'
      ],
      supportingLabel: 'آخر نشاط',
      supportingValue: dateTime(activityDate()),
      actionsAriaLabel: 'إجراءات الطلب',
      actions: headerActions()
    });
  }

  function operationalIssues() {
    var issues = [];
    if (Array.isArray(order.issues)) {
      order.issues.forEach(function (issue) { issues.push(typeof issue === 'string' ? { title: issue } : issue); });
    }
    if (order.issue) issues.push({ title: order.issue });
    if (order.needsFollowUp) issues.push({ title: typeof order.needsFollowUp === 'string' ? order.needsFollowUp : 'الطلب يحتاج متابعة' });
    if (order.status === 'awaiting_owner') issues.push({ title: 'موافقة المالك مطلوبة' });
    if (paymentStatus() === 'failed') issues.push({ title: 'فشل الدفع ويتطلب مراجعة' });
    if (!getOwner()) issues.push({ title: 'لا يوجد مالك مرتبط بالطلب' });
    if (!getEquipment()) issues.push({ title: 'لا توجد معدة مرتبطة بالطلب' });
    return issues.filter(function (issue, index, list) {
      return list.findIndex(function (item) { return item.title === issue.title; }) === index;
    });
  }

  function overviewTab() {
    var customer = getCustomer();
    var owner = getOwner();
    var equipment = getEquipment();
    var duration = rentalDuration();
    var locationValue = order.deliveryLocation || order.location || order.deliveryAddress || '';
    var operationalNote = order.operationalNote || '';
    var issues = operationalIssues();
    return '<div class="owner-info-grid order-overview-grid">' +
      '<div><span>العميل</span><strong>' + (customer ? '<a class="record-link" href="' + customerHref(customer) + '">' + admin.escapeHTML(order.renter || customer.name) + '</a>' : admin.escapeHTML(order.renter || 'غير مرتبط')) + '</strong></div>' +
      '<div><span>المالك</span><strong>' + (owner ? '<a class="record-link" href="owner.html?id=' + encodeURIComponent(owner.id) + '">' + admin.escapeHTML(owner.name) + '</a>' : 'غير مرتبط') + '</strong></div>' +
      '<div><span>المعدة</span><strong>' + (equipment ? '<a class="record-link" href="equipment.html?id=' + encodeURIComponent(equipment.id) + '">' + admin.escapeHTML(equipment.name) + '</a>' : admin.escapeHTML(order.equipment || 'غير مرتبطة')) + '</strong></div>' +
      '<div><span>مدة الإيجار</span><strong>' + admin.escapeHTML(duration || 'غير مسجلة') + '</strong></div>' +
      '<div><span>موقع التسليم</span><strong>' + admin.escapeHTML(locationValue || 'غير مسجل') + '</strong></div>' +
      '<div><span>حالة الطلب</span><strong>' + statusBadge(order.status) + '</strong></div>' +
      '<div><span>حالة الدفع</span><strong>' + paymentBadge() + '</strong></div>' +
      '</div>' +
      '<div class="equipment-overview-sections order-overview-sections">' +
        '<section><div class="owner-section-heading"><div><h2>ملاحظات التشغيل</h2><p>الملاحظة التشغيلية المسجلة على الطلب.</p></div><button class="table-action" type="button" data-open-tab="notes">فتح الملاحظات</button></div>' +
          (operationalNote ? '<div class="equipment-operational-note"><p>' + admin.escapeHTML(operationalNote) + '</p></div>' : emptyState('لا توجد ملاحظات تشغيلية', 'لم تُسجل ملاحظة تشغيلية على هذا الطلب.')) + '</section>' +
        '<section><div class="owner-section-heading"><div><h2>المشكلات والإجراءات المطلوبة</h2><p>العناصر الفعلية التي تحتاج متابعة.</p></div></div>' +
          (issues.length ? '<div class="document-list">' + issues.map(function (issue) { return '<article class="document-row"><div><strong>' + admin.escapeHTML(issue.title || 'إجراء مطلوب') + '</strong>' + (issue.note ? '<span>' + admin.escapeHTML(issue.note) + '</span>' : '') + '</div>' + badge('يتطلب متابعة', 'pending') + '</article>'; }).join('') + '</div>' : emptyState('لا توجد مشكلات مسجلة', 'لا توجد مشكلة أو متابعة مطلوبة بحسب بيانات الطلب الحالية.')) + '</section>' +
      '</div>';
  }

  function timelineEntries() {
    var items = [];
    var createdAt = order.createdAt || order.date;
    if (createdAt) items.push({ title: 'تم إنشاء الطلب', meta: order.id, at: createdAt, stage: 'new' });
    (order.timeline || []).forEach(function (item) {
      if (item.at) items.push({ title: item.title || STATUS_TIMELINE_LABELS[item.stage] || 'تحديث الطلب', meta: item.meta || '', at: item.at, stage: item.stage });
    });
    (order.activity || []).forEach(function (item) {
      if (!item.at) return;
      var title = item.type === 'order_created' ? 'تم إنشاء الطلب' : (item.type === 'order_status' && item.status ? STATUS_TIMELINE_LABELS[item.status] : item.title);
      items.push({ title: title || 'تحديث الطلب', meta: item.meta || '', at: item.at, stage: item.status || item.type });
    });
    if (order.updatedAt && STATUS_TIMELINE_LABELS[order.status] && !items.some(function (item) { return item.stage === order.status || item.title === STATUS_TIMELINE_LABELS[order.status]; })) {
      items.push({ title: STATUS_TIMELINE_LABELS[order.status], meta: STATUS_LABELS[order.status], at: order.updatedAt, stage: order.status });
    }
    var seen = {};
    return items.filter(function (item) {
      var key = item.title + '|' + item.at;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function timelineTab() {
    return components.Timeline({
      items: timelineEntries().map(function (item) { return { title: item.title, meta: item.meta, timeLabel: dateTime(item.at) }; }),
      className: 'owner-activity-timeline order-status-timeline',
      emptyTitle: 'لا يوجد خط زمني',
      emptyDescription: 'ستظهر مراحل الطلب عند تسجيلها فعليًا.'
    });
  }

  function paymentTab() {
    var payment = order.payment || {};
    var transactions = Array.isArray(payment.transactions) ? payment.transactions : (Array.isArray(order.paymentTransactions) ? order.paymentTransactions : []);
    var total = typeof order.value === 'number' ? order.value : (typeof payment.total === 'number' ? payment.total : null);
    var paid = typeof payment.paid === 'number' ? payment.paid : (typeof order.paidAmount === 'number' ? order.paidAmount : null);
    var due = typeof payment.due === 'number' ? payment.due : (typeof order.dueAmount === 'number' ? order.dueAmount : null);
    var values = [
      total === null ? '' : '<article><span>القيمة الإجمالية</span><strong>' + admin.escapeHTML(admin.formatRiyal(total)) + '</strong></article>',
      paid === null ? '' : '<article><span>المدفوع</span><strong>' + admin.escapeHTML(admin.formatRiyal(paid)) + '</strong></article>',
      due === null ? '' : '<article><span>المتبقي</span><strong>' + admin.escapeHTML(admin.formatRiyal(due)) + '</strong></article>'
    ].filter(Boolean);
    var summary = '<div class="order-payment-heading"><span>حالة الدفع</span>' + paymentBadge() + '</div>' + (values.length ? '<div class="owner-metric-grid owner-finance-grid">' + values.join('') + '</div>' : '');
    if (!transactions.length) return summary + emptyState('لا توجد عمليات دفع', 'لم تُسجل عمليات دفع على هذا الطلب.');
    return summary + '<div class="admin-table-wrap"><table class="admin-table profile-table"><thead><tr><th>العملية</th><th>التاريخ</th><th>الوسيلة</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>' + transactions.map(function (item) {
      return '<tr><td data-label="العملية"><bdi>' + admin.escapeHTML(item.id || '—') + '</bdi></td><td data-label="التاريخ"><bdi>' + admin.escapeHTML(dateOnly(item.date || item.at)) + '</bdi></td><td data-label="الوسيلة">' + admin.escapeHTML(item.method || item.type || '—') + '</td><td data-label="الحالة">' + admin.escapeHTML(PAYMENT_LABELS[item.status] || item.status || '—') + '</td><td data-label="القيمة"><bdi>' + (typeof item.amount === 'number' ? admin.escapeHTML(admin.formatRiyal(item.amount)) : '—') + '</bdi></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function documentsTab() {
    var documents = Array.isArray(order.documents) ? order.documents.slice() : [];
    if (order.contract && typeof order.contract === 'object') documents.unshift(order.contract);
    if (!documents.length) return emptyState('لا يوجد عقد أو مستندات', 'لم تُرفع مستندات مرتبطة بهذا الطلب.');
    return '<div class="document-list">' + documents.map(function (document) {
      var status = document.status || 'pending';
      var documentLabels = { signed: 'موقّع', expired: 'منتهي' };
      var statusLabel = admin.DOCUMENT_STATUS_LABELS[status] || documentLabels[status] || status;
      var tone = status === 'verified' || status === 'signed' ? 'verified' : (status === 'rejected' || status === 'expired' ? 'rejected' : 'pending');
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(document.name || document.title || document.type || 'مستند') + '</strong><span>' + admin.escapeHTML(document.note || document.number || '') + '</span>' + (document.date || document.createdAt ? '<small><bdi>' + admin.escapeHTML(dateOnly(document.date || document.createdAt)) + '</bdi></small>' : '') + '</div>' + badge(statusLabel || 'غير محددة', tone) + '</article>';
    }).join('') + '</div>';
  }

  function conversationsTab() {
    var conversations = relatedConversations();
    if (!conversations.length) return emptyState('لا توجد محادثات', 'لا توجد محادثات مرتبطة بهذا الطلب.', { href: 'index.html#conversations', label: 'فتح سجل المحادثات', variant: 'btn-ghost' });
    return '<div class="document-list">' + conversations.map(function (conversation) {
      var latestMessage = conversation.messages && conversation.messages.length ? conversation.messages[conversation.messages.length - 1] : null;
      return '<article class="document-row"><div><strong>' + admin.escapeHTML(conversation.subject || conversation.id || 'محادثة الطلب') + '</strong><span>' + admin.escapeHTML(latestMessage ? latestMessage.text : 'لا توجد رسائل') + '</span><small><bdi>' + admin.escapeHTML(dateTime(conversation.updatedAt)) + '</bdi></small></div><a class="table-action" href="index.html#conversations">فتح السجل</a></article>';
    }).join('') + '</div>';
  }

  function orderNotes() {
    var notes = Array.isArray(order.notes) ? order.notes.slice() : [];
    if (order.operationalNote) notes.unshift({ title: 'ملاحظة تشغيلية', text: order.operationalNote, at: order.updatedAt });
    return notes;
  }

  function notesTab() {
    var notes = orderNotes();
    if (!notes.length) return emptyState('لا توجد ملاحظات', 'لم تُسجل ملاحظات على هذا الطلب.');
    return '<div class="document-list">' + notes.map(function (note) {
      return '<article class="document-row equipment-note-row"><div><strong>' + admin.escapeHTML(note.title || note.type || 'ملاحظة') + '</strong><span>' + admin.escapeHTML(note.text || note.note || '') + '</span>' + (note.at || note.date ? '<small><bdi>' + admin.escapeHTML(dateTime(note.at || note.date)) + '</bdi></small>' : '') + '</div></article>';
    }).join('') + '</div>';
  }

  function activityTab() {
    var activity = (order.activity || []).slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return components.Timeline({
      items: activity.map(function (item) { return { title: item.title || 'تحديث الطلب', meta: item.meta || '', timeLabel: dateTime(item.at) }; }),
      className: 'owner-activity-timeline',
      emptyTitle: 'لا يوجد نشاط مسجل',
      emptyDescription: 'ستظهر هنا التغييرات والإجراءات الحقيقية على الطلب.'
    });
  }

  var tabRenderers = {
    overview: overviewTab,
    timeline: timelineTab,
    payment: paymentTab,
    documents: documentsTab,
    conversations: conversationsTab,
    notes: notesTab,
    activity: activityTab
  };

  function renderTabs() {
    tabsHost.innerHTML = components.EntityTabs({ tabs: ORDER_TABS, active: currentTab, panelId: 'order-tab-panel', ariaLabel: 'أقسام ملف الطلب' });
    panel.innerHTML = tabRenderers[currentTab]();
  }

  function renderPage() {
    refreshHeader();
    renderTabs();
  }

  function openStatusDialog() {
    var options = ALLOWED_NEXT[order.status] || [];
    if (!options.length) return;
    statusForm.elements.status.innerHTML = options.map(function (status) {
      return '<option value="' + admin.escapeHTML(status) + '">' + admin.escapeHTML(STATUS_LABELS[status]) + '</option>';
    }).join('');
    statusDialog.showModal();
  }

  function closeStatusDialog() { statusDialog.close(); }
  function openNoteDialog() { noteForm.reset(); noteDialog.showModal(); noteForm.elements.note.focus(); }
  function closeNoteDialog() { noteDialog.close(); }

  /* بيانات الإيجار التجارية (المدة والقيمة والموقع) كانت للقراءة فقط بعد
     إنشاء الطلب، فأي طلب يدوي يبقى بلا مدة ولا قيمة إلى الأبد. */
  function openDetailsDialog() {
    detailsForm.elements.startDate.value = order.startDate || order.date || '';
    detailsForm.elements.endDate.value = order.endDate || '';
    detailsForm.elements.value.value = typeof order.value === 'number' ? String(order.value) : '';
    detailsForm.elements.location.value = order.deliveryLocation || order.location || '';
    detailsForm.elements.operationalNote.value = order.operationalNote || '';
    detailsDialog.showModal();
    detailsForm.elements.startDate.focus();
  }

  function closeDetailsDialog() { detailsDialog.close(); }

  if (!order) {
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
    if (!action) return;
    var actionId = action.dataset.quickAction;
    if (actionId === 'accept') changeStatus('approved', 'تمت الموافقة');
    if (actionId === 'reject') {
      if (!window.confirm('هل تريد رفض هذا الطلب؟ سيُسجل الإجراء في سجل النشاط.')) return;
      changeStatus('rejected', 'تم رفض الطلب');
    }
    if (actionId === 'change-status') openStatusDialog();
    if (actionId === 'confirm-order') changeStatus('confirmed', 'تم التأكيد');
    if (actionId === 'start') changeStatus('in_progress', 'قيد التنفيذ');
    if (actionId === 'deliver') changeStatus('delivered', 'تم التسليم');
    if (actionId === 'return') changeStatus('returned', 'تم الإرجاع');
    if (actionId === 'close') {
      if (!window.confirm('هل تريد إغلاق هذا الطلب بعد تسجيل الإرجاع؟')) return;
      changeStatus('completed', 'تم إغلاق الطلب');
    }
    if (actionId === 'cancel') {
      if (!window.confirm('هل تريد إلغاء هذا الطلب؟ سيُسجل الإجراء في سجل النشاط.')) return;
      changeStatus('cancelled', 'تم إلغاء الطلب');
    }
    if (actionId === 'confirm-payment') {
      order.paymentConfirmed = true;
      order.paymentStatus = 'confirmed';
      order.paymentConfirmedAt = new Date().toISOString();
      recordEvent('payment_confirmed', 'تم تأكيد الدفع', '', 'payment_confirmed');
      admin.saveState(state);
      renderPage();
      showToast('تم تأكيد الدفع وتسجيل الإجراء.');
    }
    if (actionId === 'edit-details') openDetailsDialog();
    if (actionId === 'add-note') openNoteDialog();
  });

  document.querySelectorAll('[data-close-order-status]').forEach(function (button) { button.addEventListener('click', closeStatusDialog); });
  document.querySelectorAll('[data-close-order-note]').forEach(function (button) { button.addEventListener('click', closeNoteDialog); });
  document.querySelectorAll('[data-close-order-details]').forEach(function (button) { button.addEventListener('click', closeDetailsDialog); });
  detailsDialog.addEventListener('click', function (event) { if (event.target === detailsDialog) closeDetailsDialog(); });

  detailsForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!detailsForm.reportValidity()) return;
    var startDate = detailsForm.elements.startDate.value;
    var endDate = detailsForm.elements.endDate.value;
    if (startDate && endDate && endDate < startDate) {
      showToast('تاريخ النهاية يسبق تاريخ البداية.');
      return;
    }
    var typedValue = parseInt(detailsForm.elements.value.value, 10);

    order.startDate = startDate;
    order.endDate = endDate;
    order.date = startDate || order.date;
    order.deliveryLocation = detailsForm.elements.location.value.trim();
    order.operationalNote = detailsForm.elements.operationalNote.value.trim();
    if (isNaN(typedValue)) delete order.value;
    else {
      order.value = typedValue;
      if (order.payment && typeof order.payment === 'object') {
        order.payment.total = typedValue;
        if (typeof order.payment.paid === 'number') order.payment.due = Math.max(0, typedValue - order.payment.paid);
      }
    }

    recordEvent('order_updated', 'تعديل بيانات الطلب', '', 'order_updated');
    admin.saveState(state);
    closeDetailsDialog();
    renderPage();
    showToast('تم حفظ بيانات الطلب.');
  });
  statusDialog.addEventListener('click', function (event) { if (event.target === statusDialog) closeStatusDialog(); });
  noteDialog.addEventListener('click', function (event) { if (event.target === noteDialog) closeNoteDialog(); });

  statusForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var nextStatus = statusForm.elements.status.value;
    if ((ALLOWED_NEXT[order.status] || []).indexOf(nextStatus) === -1) return;
    closeStatusDialog();
    changeStatus(nextStatus, STATUS_TIMELINE_LABELS[nextStatus]);
  });

  noteForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!noteForm.reportValidity()) return;
    var note = { id: 'NT-' + String(Date.now()), title: 'ملاحظة إدارية', text: noteForm.elements.note.value.trim(), at: new Date().toISOString() };
    if (!Array.isArray(order.notes)) order.notes = [];
    order.notes.unshift(note);
    recordEvent('note_added', 'إضافة ملاحظة على الطلب', note.text, 'note_added');
    admin.saveState(state);
    closeNoteDialog();
    renderPage();
    showToast('تم حفظ الملاحظة وتسجيل الإجراء.');
  });

  document.querySelector('[data-order-logout]').addEventListener('click', function () {
    admin.clearAuth();
    location.replace('login.html');
  });
})();
