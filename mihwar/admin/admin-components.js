/* مِحور — مكونات واجهة الإدارة المشتركة */

(function () {
  'use strict';

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function classNames() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  /* الروابط تأتي من بيانات يحرّرها المشغّل، فلا نسمح بمخطط قابل للتنفيذ
     مثل javascript: أن يصل إلى href أو src. */
  function safeUrl(value) {
    return (window.MihwarData ? window.MihwarData.safeUrl(value) : String(value || ''));
  }

  function StatusBadge(options) {
    var settings = options || {};
    return '<span class="' + escapeHTML(classNames('status-badge', 'owner-status', 'owner-status-' + (settings.tone || 'pending'), settings.className)) + '">' + escapeHTML(settings.label || 'غير محددة') + '</span>';
  }

  function EmptyState(options) {
    var settings = options || {};
    var action = settings.action;
    return '<div class="' + escapeHTML(classNames('entity-empty-state', 'crm-empty-state', settings.className)) + '">' +
      (settings.icon ? '<span class="empty-state-icon" aria-hidden="true">' + escapeHTML(settings.icon) + '</span>' : '') +
      '<strong>' + escapeHTML(settings.title || 'لا توجد بيانات') + '</strong>' +
      (settings.description ? '<p>' + escapeHTML(settings.description) + '</p>' : '') +
      (action && safeUrl(action.href) ? '<a class="' + escapeHTML(classNames('btn', action.variant || 'btn-ghost')) + '" href="' + escapeHTML(safeUrl(action.href)) + '">' + escapeHTML(action.label) + '</a>' : '') +
      '</div>';
  }

  function Timeline(options) {
    var settings = options || {};
    var items = Array.isArray(settings.items) ? settings.items : [];
    if (!items.length) {
      return EmptyState({
        title: settings.emptyTitle || 'لا يوجد نشاط مسجل',
        description: settings.emptyDescription || 'ستظهر هنا الأنشطة عند توفرها.',
        className: settings.emptyClassName
      });
    }
    return '<ol class="' + escapeHTML(classNames('entity-timeline', 'activity-timeline', settings.className)) + '">' + items.map(function (item) {
      return '<li><span class="activity-dot" aria-hidden="true"></span><div><strong>' + escapeHTML(item.title || 'نشاط') + '</strong>' +
        (item.meta ? '<span>' + escapeHTML(item.meta) + '</span>' : '') +
        (item.timeLabel ? '<small><bdi>' + escapeHTML(item.timeLabel) + '</bdi></small>' : '') +
        '</div></li>';
    }).join('') + '</ol>';
  }

  function Breadcrumb(options) {
    var settings = options || {};
    var items = Array.isArray(settings.items) ? settings.items : [];
    return '<nav class="' + escapeHTML(classNames('admin-breadcrumb', settings.className)) + '" aria-label="' + escapeHTML(settings.ariaLabel || 'مسار التنقل') + '">' + items.map(function (item, index) {
      var entry = item.href && !item.current
        ? '<a href="' + escapeHTML(item.href) + '">' + escapeHTML(item.label) + '</a>'
        : '<span' + (item.current ? ' aria-current="page"' : '') + '>' + escapeHTML(item.label) + '</span>';
      return (index ? '<span aria-hidden="true">/</span>' : '') + entry;
    }).join('') + '</nav>';
  }

  function EntityTabs(options) {
    var settings = options || {};
    var tabs = Array.isArray(settings.tabs) ? settings.tabs : [];
    return '<div class="' + escapeHTML(classNames('entity-tabs', 'owner-tabs', settings.className)) + '" role="tablist" aria-label="' + escapeHTML(settings.ariaLabel || 'أقسام الملف') + '">' + tabs.map(function (tab) {
      var selected = tab.id === settings.active;
      // tabindex متدحرج: التبويب المحدد وحده في مسار Tab، والبقية تُبلغ بالأسهم
      return '<button type="button" role="tab" aria-selected="' + String(selected) + '"' +
        ' tabindex="' + (selected ? '0' : '-1') + '"' +
        (settings.panelId ? ' aria-controls="' + escapeHTML(settings.panelId) + '"' : '') +
        ' data-entity-tab="' + escapeHTML(tab.id) + '">' + escapeHTML(tab.label) + '</button>';
    }).join('') + '</div>';
  }

  function QuickActions(options) {
    var settings = options || {};
    var actions = (Array.isArray(settings.actions) ? settings.actions : []).filter(function (action) { return !action.hidden; });
    return '<div class="' + escapeHTML(classNames(settings.className || 'owner-page-actions')) + '" aria-label="' + escapeHTML(settings.ariaLabel || 'الإجراءات السريعة') + '">' + actions.map(function (action) {
      var classes = classNames('btn', action.variant || 'btn-ghost', action.className, action.disabled && 'is-disabled');
      var common = ' class="' + escapeHTML(classes) + '" data-quick-action="' + escapeHTML(action.id) + '"' +
        (action.disabled ? ' aria-disabled="true"' : '') +
        (action.title ? ' title="' + escapeHTML(action.title) + '"' : '');
      if (safeUrl(action.href) && !action.disabled) {
        return '<a' + common + ' href="' + escapeHTML(safeUrl(action.href)) + '"' +
          (action.target ? ' target="' + escapeHTML(action.target) + '"' : '') +
          (action.rel ? ' rel="' + escapeHTML(action.rel) + '"' : '') + '>' + escapeHTML(action.label) + '</a>';
      }
      return '<button type="button"' + common + (action.disabled ? ' disabled' : '') + '>' + escapeHTML(action.label) + '</button>';
    }).join('') + '</div>';
  }

  function PageHeader(options) {
    var settings = options || {};
    var badges = Array.isArray(settings.badges) ? settings.badges.join('') : '';
    var meta = Array.isArray(settings.meta) ? settings.meta.filter(Boolean) : [];
    var titleTag = settings.titleTag === 'h2' ? 'h2' : 'h1';
    var mediaClasses = escapeHTML(classNames('entity-avatar', 'owner-avatar', 'owner-page-avatar', settings.avatarClassName));
    var media = safeUrl(settings.imageUrl)
      ? '<img class="' + mediaClasses + '" src="' + escapeHTML(safeUrl(settings.imageUrl)) + '" alt="' + escapeHTML(settings.imageAlt || settings.title || '') + '" loading="eager">'
      : '<span class="' + mediaClasses + '" aria-hidden="true">' + escapeHTML(settings.avatar || 'م') + '</span>';
    return '<header class="' + escapeHTML(classNames('entity-page-header', 'owner-page-header', settings.className)) + '">' +
      '<div class="entity-page-identity owner-page-identity">' +
        media +
        '<div><div class="owner-profile-title-line"><' + titleTag + '>' + escapeHTML(settings.title || 'ملف') + '</' + titleTag + '>' + badges + '</div>' +
        (meta.length ? '<p>' + meta.map(function (item) {
          if (item && typeof item === 'object') {
            return safeUrl(item.href)
              ? '<a class="entity-meta-link" href="' + escapeHTML(safeUrl(item.href)) + '">' + escapeHTML(item.label || '') + '</a>'
              : '<span>' + escapeHTML(item.label || '') + '</span>';
          }
          return '<span>' + escapeHTML(item) + '</span>';
        }).join('<span aria-hidden="true"> · </span>') + '</p>' : '') +
        (settings.supportingLabel || settings.supportingValue ? '<small>' + escapeHTML(settings.supportingLabel || '') + (settings.supportingLabel ? ': ' : '') + '<bdi>' + escapeHTML(settings.supportingValue || '—') + '</bdi></small>' : '') +
        '</div></div>' +
      QuickActions({ actions: settings.actions, className: settings.actionsClassName || 'owner-page-actions', ariaLabel: settings.actionsAriaLabel }) +
      '</header>';
  }

  /* تنقّل التبويبات بالنقر وبلوحة المفاتيح — الأسهم معكوسة لأن الواجهة RTL.
     يُربط مرة واحدة على الحاوية، فيبقى صالحاً بعد إعادة رسم التبويبات. */
  function bindEntityTabs(host, onSelect) {
    if (!host) return;

    function tabsIn() {
      return Array.prototype.slice.call(host.querySelectorAll('[data-entity-tab]'));
    }

    host.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-entity-tab]');
      if (tab) onSelect(tab.dataset.entityTab);
    });

    host.addEventListener('keydown', function (event) {
      var tab = event.target.closest('[data-entity-tab]');
      if (!tab) return;
      var tabs = tabsIn();
      var index = tabs.indexOf(tab);
      var next = null;
      if (event.key === 'ArrowLeft') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowRight') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      var id = next.dataset.entityTab;
      onSelect(id);
      var focusTarget = host.querySelector('[data-entity-tab="' + id.replace(/"/g, '\\"') + '"]');
      if (focusTarget) focusTarget.focus();
    });
  }

  window.MihwarComponents = {
    PageHeader: PageHeader,
    bindEntityTabs: bindEntityTabs,
    Breadcrumb: Breadcrumb,
    EntityTabs: EntityTabs,
    Timeline: Timeline,
    StatusBadge: StatusBadge,
    QuickActions: QuickActions,
    EmptyState: EmptyState
  };
})();
