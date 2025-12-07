'use strict';

(function () {
  const STORAGE_PREFIX = 'time-tracker-pomodoro-v1';
  const makeKey = (name) => `${STORAGE_PREFIX}:${name}`;
  const LS_KEYS = {
    theme: makeKey('themeDark'),
    themeChoice: makeKey('themeChoice'),
    welcomeHidden: makeKey('welcomeDisabled'),
    mobileNavSticky: makeKey('mobileNavSticky'),
    view: makeKey('activeView'),
    collapsible: makeKey('collapsedCards'),
    tasks: makeKey('tasksByDate'),
    timer: makeKey('timerState'),
  };

  const DURATIONS = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60,
  };

  const root = document.documentElement;
  const body = document.body;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const safeSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* ignore */
    }
  };

  const safeGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  let welcomeHiddenState = false;

  function applyDarkMode(enabled, { persist = true, withTransition = false } = {}) {
    const shouldEnable = !!enabled;
    if (withTransition) root.classList.add('theme-transition');
    root.classList.toggle('dark', shouldEnable);
    if (withTransition) {
      setTimeout(() => root.classList.remove('theme-transition'), 400);
    } else {
      root.classList.remove('theme-transition');
    }
    const toggle = $('#themeToggle');
    if (toggle) toggle.checked = shouldEnable;
    if (persist) safeSet(LS_KEYS.theme, shouldEnable ? '1' : '0');
  }

  function applyThemeChoice(choice, { persist = true } = {}) {
    const normalized = ['default', 'inverted', 'glass'].includes(choice)
      ? choice
      : 'default';
    root.classList.remove('theme-inverted', 'theme-glass');
    if (normalized === 'inverted') root.classList.add('theme-inverted');
    if (normalized === 'glass') root.classList.add('theme-glass');
    const select = $('#themeSelect');
    if (select && select.value !== normalized) select.value = normalized;
    if (persist) safeSet(LS_KEYS.themeChoice, normalized);
  }

  function applyMobileNavSticky(enabled, { persist = true } = {}) {
    const shouldStick = enabled !== false;
    body.classList.toggle('mobile-header-static', !shouldStick);
    const toggle = $('#mobileNavStickyToggle');
    if (toggle) toggle.checked = shouldStick;
    if (persist) safeSet(LS_KEYS.mobileNavSticky, shouldStick ? '1' : '0');
  }

  function applyFirstTimeHidden(hidden, { persist = true } = {}) {
    const shouldHide = !!hidden;
    welcomeHiddenState = shouldHide;
    $$('[data-first-time]').forEach((el) => el.classList.toggle('hidden', shouldHide));
    const toggle = $('#welcomeToggle');
    if (toggle) toggle.checked = !shouldHide;
    if (persist) safeSet(LS_KEYS.welcomeHidden, shouldHide ? '1' : '0');
  }

  function loadCollapsedCardState() {
    const raw = safeGet(LS_KEYS.collapsible);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const normalized = {};
      Object.keys(parsed).forEach((key) => {
        normalized[key] = !!parsed[key];
      });
      return normalized;
    } catch (_) {
      return {};
    }
  }

  function persistCollapsedCardState(state) {
    try {
      safeSet(LS_KEYS.collapsible, JSON.stringify(state));
    } catch (_) {
      /* ignore */
    }
  }

  function initializeCollapsibles() {
    const cards = $$('[data-collapsible]');
    if (!cards.length) return;

    const storedState = loadCollapsedCardState();
    const knownIds = new Set();

    cards.forEach((card) => {
      const trigger = card.querySelector('[data-collapsible-trigger]');
      const content = card.querySelector('[data-collapsible-content]');
      if (!trigger || !content) return;

      const identifier =
        card.dataset.collapsibleId ||
        card.id ||
        trigger.getAttribute('aria-controls') ||
        '';
      const canPersist = identifier.length > 0;
      if (canPersist) knownIds.add(identifier);

      const setState = (collapsed, { animate = false, persistState = false } = {}) => {
        const expanded = !collapsed;
        trigger.setAttribute('aria-expanded', String(expanded));
        card.classList.toggle('collapsed', collapsed);

        if (!animate) {
          content.hidden = collapsed;
          content.style.height = '';
        } else if (collapsed) {
          const currentHeight = content.scrollHeight;
          content.style.height = `${currentHeight}px`;
          requestAnimationFrame(() => {
            content.style.height = '0px';
          });
          let fallbackId;
          const handle = () => {
            content.hidden = true;
            content.style.height = '';
            content.removeEventListener('transitionend', handle);
            if (fallbackId) clearTimeout(fallbackId);
          };
          fallbackId = window.setTimeout(handle, 350);
          content.addEventListener('transitionend', handle, { once: true });
        } else {
          content.hidden = false;
          const targetHeight = content.scrollHeight;
          content.style.height = '0px';
          requestAnimationFrame(() => {
            content.style.height = `${targetHeight}px`;
          });
          let fallbackId;
          const handle = () => {
            content.style.height = '';
            content.removeEventListener('transitionend', handle);
            if (fallbackId) clearTimeout(fallbackId);
          };
          fallbackId = window.setTimeout(handle, 350);
          content.addEventListener('transitionend', handle, { once: true });
        }

        if (persistState && canPersist) {
          const normalized = !!collapsed;
          if (storedState[identifier] !== normalized) {
            storedState[identifier] = normalized;
            persistCollapsedCardState(storedState);
          }
        }
      };

      const hasStoredValue =
        canPersist && Object.prototype.hasOwnProperty.call(storedState, identifier);
      let defaultCollapsed = false;
      if (hasStoredValue) {
        defaultCollapsed = !!storedState[identifier];
      } else if (
        card.dataset.collapsibleDefault === 'collapsed' ||
        card.dataset.collapsed === 'true'
      ) {
        defaultCollapsed = true;
      }

      setState(defaultCollapsed);

      trigger.addEventListener('click', () => {
        const nextCollapsed = !card.classList.contains('collapsed');
        setState(nextCollapsed, { animate: true, persistState: true });
      });
    });

    let pruned = false;
    Object.keys(storedState).forEach((key) => {
      if (!knownIds.has(key)) {
        delete storedState[key];
        pruned = true;
      }
    });
    if (pruned) persistCollapsedCardState(storedState);
  }

  function setSidebarOpen(open) {
    const sidebar = $('#sidebar');
    const overlay = $('#overlay');
    if (!sidebar) return;
    if (open) {
      sidebar.classList.remove('-translate-x-full');
      body.classList.add('mobile-nav-open');
      if (overlay) overlay.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      body.classList.remove('mobile-nav-open');
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function toggleSidebar() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    const isHidden = sidebar.classList.contains('-translate-x-full');
    setSidebarOpen(isHidden);
  }

  function waitForState(worker, desiredState) {
    return new Promise((resolve, reject) => {
      if (!worker) {
        resolve(false);
        return;
      }
      if (worker.state === desiredState) {
        resolve(true);
        return;
      }
      const handle = () => {
        if (worker.state === desiredState) {
          worker.removeEventListener('statechange', handle);
          resolve(true);
        } else if (worker.state === 'redundant') {
          worker.removeEventListener('statechange', handle);
          reject(new Error('Service worker became redundant before reaching state.'));
        }
      };
      worker.addEventListener('statechange', handle);
    });
  }

  let modalCloseHandler = null;
  let modalReturnFocus = null;

  function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal || modal.classList.contains('modal-hidden')) return;
    modal.classList.add('modal-hidden');
    modal.setAttribute('aria-hidden', 'true');
    const handler = modalCloseHandler;
    modalCloseHandler = null;
    const focusTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (_) {
        focusTarget.focus();
      }
    }
    if (typeof handler === 'function') handler();
  }

  function showAlert(content, onClose) {
    const modal = document.getElementById('modal');
    const modalBody = modal ? modal.querySelector('#modal-body') : null;
    if (!modal || !modalBody) {
      const fallback =
        typeof content === 'string'
          ? content
          : content && typeof content.textContent === 'string'
          ? content.textContent
          : '';
      window.alert(fallback);
      if (typeof onClose === 'function') onClose();
      return;
    }
    modalBody.innerHTML = '';
    if (content instanceof Node) {
      modalBody.appendChild(content);
    } else if (typeof content === 'string') {
      const paragraph = document.createElement('p');
      paragraph.className = 'text-base text-gray-700 dark:text-gray-200';
      paragraph.textContent = content;
      modalBody.appendChild(paragraph);
    }
    const footer = document.createElement('div');
    footer.className = 'mt-6 flex justify-center';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btn btn-blue';
    closeButton.dataset.action = 'close-modal';
    closeButton.textContent = 'Close';
    footer.appendChild(closeButton);
    modalBody.appendChild(footer);

    modal.classList.remove('modal-hidden');
    modal.setAttribute('aria-hidden', 'false');
    modalCloseHandler = typeof onClose === 'function' ? onClose : null;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = modal.querySelector('[data-action="close-modal"]');
    if (focusable instanceof HTMLElement) {
      focusable.focus();
    }
  }

  function showConfirm({
    message = 'Are you sure?',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal');
      const modalBody = modal ? modal.querySelector('#modal-body') : null;
      if (!modal || !modalBody) {
        const fallback = window.confirm(message);
        resolve(fallback);
        return;
      }

      modalBody.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'modal-confirm';

      const text = document.createElement('p');
      text.textContent = message;
      wrapper.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'btn btn-red';
      confirmButton.textContent = confirmLabel;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'btn btn-gray';
      cancelButton.textContent = cancelLabel;

      actions.appendChild(confirmButton);
      actions.appendChild(cancelButton);
      wrapper.appendChild(actions);
      modalBody.appendChild(wrapper);

      let settled = false;
      const finalize = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      modalCloseHandler = () => finalize(false);
      modalReturnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      modal.classList.remove('modal-hidden');
      modal.setAttribute('aria-hidden', 'false');

      confirmButton.addEventListener('click', () => {
        if (settled) return;
        modalCloseHandler = null;
        closeModal();
        finalize(true);
      });

      cancelButton.addEventListener('click', () => {
        if (settled) return;
        modalCloseHandler = null;
        closeModal();
        finalize(false);
      });

      const closeButton = modal.querySelector('[data-action="close-modal"]');
      if (closeButton instanceof HTMLElement) {
        closeButton.classList.remove('hidden');
      }

      confirmButton.focus();
    });
  }

  async function handleAppUpdateRequest(button) {
    if (!button) return;
    const defaultLabel =
      button.getAttribute('data-default-label') || button.textContent.trim();
    button.setAttribute('data-default-label', defaultLabel);
    const busyTemplate = (label) =>
      `<span class="flex items-center justify-center gap-2">
        <span
          class="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        ></span>
        <span>${label}</span>
      </span>`;
    const setBusy = (label) => {
      button.innerHTML = busyTemplate(label);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    };
    const reset = () => {
      button.textContent = defaultLabel;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    };

    setBusy('Checking…');

    let updateResolved = false;
    let timeoutId = null;

    const cancelTimeout = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const markResolved = () => {
      if (updateResolved) return false;
      updateResolved = true;
      cancelTimeout();
      return true;
    };

    const finishWithMessage = (message, { reload = false } = {}) => {
      if (!markResolved()) return;
      reset();
      try {
        button.focus({ preventScroll: true });
      } catch (_) {
        button.focus();
      }
      showAlert(message, reload ? () => window.location.reload() : null);
    };

    if (!('serviceWorker' in navigator)) {
      finishWithMessage(
        "Automatic updates aren't supported in this browser. Please refresh manually to get the latest version.",
      );
      return;
    }

    const waitForRegistration = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) return registration;
      } catch (_) {
        /* ignore */
      }
      try {
        return await navigator.serviceWorker.ready;
      } catch (_) {
        return null;
      }
    };

    const waitForNewWorker = (registration) =>
      new Promise((resolve) => {
        if (registration.installing) {
          resolve(registration.installing);
          return;
        }
        const handleUpdateFound = () => {
          const worker = registration.installing || registration.waiting || null;
          if (!worker) return;
          registration.removeEventListener('updatefound', handleUpdateFound);
          resolve(worker);
        };
        registration.addEventListener('updatefound', handleUpdateFound);
        setTimeout(() => {
          registration.removeEventListener('updatefound', handleUpdateFound);
          resolve(registration.installing || registration.waiting || null);
        }, 10000);
      });

    const waitForControllerChange = () =>
      new Promise((resolve) => {
        let resolvedChange = false;
        const finish = () => {
          if (resolvedChange) return;
          resolvedChange = true;
          navigator.serviceWorker.removeEventListener('controllerchange', finish);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', finish);
        setTimeout(finish, 5000);
      });

    const applyUpdate = async (worker) => {
      if (!worker || updateResolved) return updateResolved;
      try {
        setBusy('Downloading update…');
        await waitForState(worker, 'installed');
      } catch (err) {
        console.error('Update install failed', err);
        finishWithMessage("We couldn't finish installing the update. Please try again later.");
        return true;
      }

      try {
        setBusy('Installing update…');
        const controllerChanged = waitForControllerChange();
        try {
          worker.postMessage({ type: 'SKIP_WAITING' });
        } catch (err) {
          console.error('Failed to notify service worker', err);
        }
        await waitForState(worker, 'activated');
        setBusy('Finalizing update…');
        await controllerChanged;
      } catch (err) {
        console.error('Update activation failed', err);
        finishWithMessage("We couldn't activate the update. Please try again later.");
        return true;
      }

      finishWithMessage('TaskTrack Pomodoro has been updated to the latest version.', {
        reload: true,
      });
      return true;
    };

    timeoutId = setTimeout(() => {
      console.warn('Update request timed out after 30 seconds');
      finishWithMessage('Checking for updates failed. Please try again later.');
    }, 30000);

    try {
      const registration = await waitForRegistration();
      if (!registration) {
        finishWithMessage(
          "We couldn't reach the update service. Please refresh manually to check for updates.",
        );
        return;
      }

      if (await applyUpdate(registration.waiting)) return;

      if (registration.installing) {
        const handled = await applyUpdate(registration.installing);
        if (handled) return;
      }

      const newWorkerPromise = waitForNewWorker(registration);
      try {
        await registration.update();
      } catch (err) {
        console.error('Service worker update failed', err);
      }

      const newWorker = await newWorkerPromise;
      if (await applyUpdate(newWorker)) return;

      finishWithMessage("You're already using the latest version of TaskTrack Pomodoro.");
    } catch (error) {
      console.error('Update check failed', error);
      finishWithMessage("We couldn't complete the update check. Please try again later.");
    }
  }

  function navigateTo(targetId) {
    const section = document.getElementById(targetId);
    if (!section) return;
    $$('.content-section').forEach((el) => {
      el.classList.toggle('active', el === section);
    });
    $$('#sidebar .nav-btn').forEach((btn) => {
      const isActive = btn.dataset.target === targetId;
      btn.classList.toggle('active-nav-button', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    safeSet(LS_KEYS.view, targetId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  async function renderChangelog() {
    const card = document.getElementById('changelogCard');
    if (!card) return;
    const list = card.querySelector('[data-changelog-list]');
    if (!list) return;
    const emptyState = card.querySelector('[data-changelog-empty]');
    const errorState = card.querySelector('[data-changelog-error]');
    list.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');

    try {
      const response = await fetch('assets/changelog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch changelog');
      const entries = await response.json();
      if (!Array.isArray(entries) || !entries.length) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }
      entries
        .slice()
        .sort((a, b) => {
          const av = String(a?.version || '');
          const bv = String(b?.version || '');
          return bv.localeCompare(av, undefined, { numeric: true, sensitivity: 'base' });
        })
        .slice(0, 5)
        .forEach((entry) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'space-y-2';
          const heading = document.createElement('p');
          heading.className = 'font-semibold text-gray-900 dark:text-gray-100';
          const formattedDate = (() => {
            if (!entry?.date) return '';
            const date = new Date(entry.date);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          })();
          heading.textContent = formattedDate
            ? `Version ${entry.version}: ${formattedDate}`
            : `Version ${entry.version}`;
          wrapper.appendChild(heading);
          const changeList = document.createElement('ul');
          changeList.className = 'list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300';
          (entry?.changes || []).forEach((change) => {
            const item = document.createElement('li');
            item.textContent = change;
            changeList.appendChild(item);
          });
          wrapper.appendChild(changeList);
          list.appendChild(wrapper);
        });
    } catch (error) {
      console.error('Unable to load changelog', error);
      if (errorState) errorState.classList.remove('hidden');
    }
  }

  async function updateVersionDisplay() {
    const targets = document.querySelectorAll('[data-app-version]');
    if (!targets.length) return;
    const applyText = (value) => {
      const label = typeof value === 'string' && value.trim() ? value.trim() : '0.0.0';
      targets.forEach((el) => {
        el.textContent = label;
      });
    };

    applyText('0.0.0');

    try {
      const response = await fetch('assets/version.json', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data || typeof data.version !== 'string') return;
      applyText(data.version);
    } catch (error) {
      console.error('Unable to fetch version', error);
    }
  }

  const todayKey = () => new Date().toISOString().slice(0, 10);

  const fallbackId = () =>
    `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const alarmAudio = new Audio(
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='
  );

  let tasksByDate = {};
  let timerState = null;
  let timerInterval = null;

  function normalizeTasks(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const normalized = {};
    Object.entries(raw).forEach(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const tasks = Array.isArray(value.tasks) ? value.tasks : [];
      const normalizedTasks = tasks
        .map((task) => ({
          id: task.id || fallbackId(),
          title: String(task.title || '').trim(),
          description: String(task.description || '').trim(),
          planned: Number.isFinite(Number(task.planned)) ? Math.max(0, Number(task.planned)) : 0,
          completed: Number.isFinite(Number(task.completed))
            ? Math.max(0, Number(task.completed))
            : 0,
          done: !!task.done,
        }))
        .filter((task) => task.title.length > 0);
      normalized[key] = {
        tasks: normalizedTasks,
        activeTaskId: normalizedTasks.find((task) => task.id === value.activeTaskId)?.id || null,
      };
    });
    return normalized;
  }

  function loadTasks() {
    const raw = safeGet(LS_KEYS.tasks);
    if (!raw) return {};
    try {
      return normalizeTasks(JSON.parse(raw));
    } catch (_) {
      return {};
    }
  }

  function persistTasks() {
    try {
      safeSet(LS_KEYS.tasks, JSON.stringify(tasksByDate));
    } catch (_) {
      /* ignore */
    }
  }

  function ensureDay(dateKey) {
    if (!tasksByDate[dateKey]) {
      tasksByDate[dateKey] = { tasks: [], activeTaskId: null };
    }
    return tasksByDate[dateKey];
  }

  function getTodayState() {
    return ensureDay(todayKey());
  }

  function getActiveTask() {
    const state = getTodayState();
    return state.tasks.find((task) => task.id === state.activeTaskId) || null;
  }

  function setActiveTask(taskId) {
    const state = getTodayState();
    state.activeTaskId = taskId || null;
    persistTasks();
    renderActiveTaskBadge();
    renderTaskList();
    updateTimerTaskLabel();
  }

  function upsertTask(task) {
    const state = getTodayState();
    const existingIndex = state.tasks.findIndex((t) => t.id === task.id);
    if (existingIndex >= 0) {
      state.tasks[existingIndex] = task;
    } else {
      state.tasks.push(task);
    }
    persistTasks();
  }

  function deleteTask(taskId) {
    const state = getTodayState();
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    if (state.activeTaskId === taskId) state.activeTaskId = null;
    persistTasks();
    renderActiveTaskBadge();
  }

  function toggleTaskDone(taskId) {
    const state = getTodayState();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    persistTasks();
  }

  function incrementTaskPomodoro(taskId) {
    const state = getTodayState();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.completed = Math.max(0, Number(task.completed) || 0) + 1;
    task.done = task.done || task.completed >= task.planned;
    persistTasks();
  }

  function formatDateLabel(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  function renderActiveTaskBadge() {
    const badge = $('#activeTaskBadge');
    const active = getActiveTask();
    if (!badge) return;
    if (!getTodayState().tasks.length) {
      badge.textContent = 'Add a task to select an active focus item.';
      return;
    }
    if (!active) {
      badge.textContent = 'No task selected yet.';
      return;
    }
    badge.textContent = `Working on: ${active.title}`;
  }

  function renderTaskList() {
    const list = $('#taskList');
    const empty = $('#taskListEmpty');
    const state = getTodayState();
    if (!list) return;
    list.innerHTML = '';
    const hasTasks = state.tasks.length > 0;
    if (empty) empty.classList.toggle('hidden', hasTasks);
    if (!hasTasks) return;

    state.tasks.forEach((task) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-3';
      wrapper.dataset.taskId = task.id;

      const header = document.createElement('div');
      header.className = 'flex flex-wrap items-start justify-between gap-3';
      const titleBlock = document.createElement('div');
      titleBlock.className = 'space-y-1';
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-900 dark:text-gray-100';
      title.textContent = task.title;
      titleBlock.appendChild(title);
      if (task.description) {
        const desc = document.createElement('p');
        desc.className = 'text-sm text-gray-700 dark:text-gray-300';
        desc.textContent = task.description;
        titleBlock.appendChild(desc);
      }
      header.appendChild(titleBlock);

      const actionRow = document.createElement('div');
      actionRow.className = 'flex flex-wrap items-center gap-2';
      const activeLabel = document.createElement('button');
      activeLabel.type = 'button';
      activeLabel.className = 'btn btn-ghost text-sm';
      activeLabel.dataset.action = 'activate-task';
      activeLabel.textContent = state.activeTaskId === task.id ? 'Active task' : 'Set active';
      if (state.activeTaskId === task.id) {
        activeLabel.classList.add('btn-blue');
      }
      actionRow.appendChild(activeLabel);

      const doneButton = document.createElement('button');
      doneButton.type = 'button';
      doneButton.className = 'btn btn-ghost text-sm';
      doneButton.dataset.action = 'toggle-done';
      doneButton.textContent = task.done ? 'Mark undone' : 'Mark done';
      actionRow.appendChild(doneButton);

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn-ghost text-sm';
      editButton.dataset.action = 'edit-task';
      editButton.textContent = 'Edit';
      actionRow.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn-ghost text-sm text-red-600 dark:text-red-400';
      deleteButton.dataset.action = 'delete-task';
      deleteButton.textContent = 'Delete';
      actionRow.appendChild(deleteButton);

      header.appendChild(actionRow);
      wrapper.appendChild(header);

      const statsRow = document.createElement('div');
      statsRow.className = 'flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300';
      const planned = document.createElement('span');
      planned.textContent = `Planned: ${task.planned}`;
      const completed = document.createElement('span');
      completed.textContent = `Completed: ${task.completed}`;
      const status = document.createElement('span');
      status.className = task.done
        ? 'inline-flex items-center gap-1 text-green-700 dark:text-green-300'
        : 'inline-flex items-center gap-1 text-amber-700 dark:text-amber-300';
      status.innerHTML = task.done
        ? '<i class="fa-solid fa-check"></i><span>Done</span>'
        : '<i class="fa-solid fa-hourglass-half"></i><span>In progress</span>';
      statsRow.append(planned, completed, status);
      wrapper.appendChild(statsRow);

      list.appendChild(wrapper);
    });
  }

  function renderTodaySummary() {
    const summary = $('#todaySummary');
    const empty = $('#todaySummaryEmpty');
    const totals = $('#todayTotals');
    if (!summary) return;
    const state = getTodayState();
    summary.innerHTML = '';
    let plannedTotal = 0;
    let completedTotal = 0;
    if (empty) empty.classList.toggle('hidden', state.tasks.length > 0);
    if (!state.tasks.length) {
      if (totals) totals.textContent = '';
      return;
    }

    state.tasks.forEach((task) => {
      plannedTotal += task.planned || 0;
      completedTotal += task.completed || 0;
      const row = document.createElement('div');
      row.className = 'flex items-start justify-between gap-3 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2';
      const left = document.createElement('div');
      left.className = 'space-y-1';
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-900 dark:text-gray-100';
      title.textContent = task.title;
      left.appendChild(title);
      const meta = document.createElement('p');
      meta.className = 'text-sm text-gray-600 dark:text-gray-400';
      meta.textContent = task.done ? 'Done' : 'In progress';
      left.appendChild(meta);
      const right = document.createElement('div');
      right.className = 'text-sm text-gray-700 dark:text-gray-300 text-right';
      right.textContent = `${task.completed}/${task.planned || 0} pomodoros`;
      row.append(left, right);
      summary.appendChild(row);
    });

    if (totals) {
      totals.textContent = `${completedTotal} / ${plannedTotal || 0} pomodoros`;
    }
  }

  function renderWeekSummary() {
    const summary = $('#weekSummary');
    const empty = $('#weekSummaryEmpty');
    if (!summary) return;
    summary.innerHTML = '';
    const today = new Date();
    const rows = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      const state = ensureDay(key);
      const planned = state.tasks.reduce((acc, task) => acc + (Number(task.planned) || 0), 0);
      const completed = state.tasks.reduce((acc, task) => acc + (Number(task.completed) || 0), 0);
      rows.push({ key, date, planned, completed });
    }

    const hasData = rows.some((row) => row.planned > 0 || row.completed > 0);
    if (empty) empty.classList.toggle('hidden', hasData);
    if (!hasData) return;

    rows.forEach((row) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'py-3 flex flex-wrap items-center justify-between gap-3';
      const left = document.createElement('div');
      left.className = 'space-y-1';
      const label = document.createElement('p');
      label.className = 'font-semibold text-gray-900 dark:text-gray-100';
      label.textContent = formatDateLabel(row.date);
      const keyLabel = document.createElement('p');
      keyLabel.className = 'text-xs text-gray-600 dark:text-gray-400';
      keyLabel.textContent = row.key;
      left.append(label, keyLabel);

      const right = document.createElement('div');
      right.className = 'text-right text-sm text-gray-700 dark:text-gray-300 space-y-1';
      const planned = document.createElement('p');
      planned.textContent = `Planned: ${row.planned}`;
      const completed = document.createElement('p');
      completed.textContent = `Completed: ${row.completed}`;
      right.append(planned, completed);

      wrapper.append(left, right);
      summary.appendChild(wrapper);
    });
  }

  function resetTaskForm() {
    const form = $('#taskForm');
    const saveBtn = $('#saveTask');
    const cancelBtn = $('#cancelEdit');
    if (!form) return;
    form.reset();
    form.dataset.editingId = '';
    if (saveBtn) saveBtn.textContent = 'Add Task';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    const planned = $('#taskPlanned');
    const completed = $('#taskCompleted');
    if (planned) planned.value = '1';
    if (completed) completed.value = '0';
  }

  function populateForm(task) {
    const form = $('#taskForm');
    const title = $('#taskTitle');
    const desc = $('#taskDescription');
    const planned = $('#taskPlanned');
    const completed = $('#taskCompleted');
    const saveBtn = $('#saveTask');
    const cancelBtn = $('#cancelEdit');
    if (!form || !task) return;
    form.dataset.editingId = task.id;
    if (title) title.value = task.title || '';
    if (desc) desc.value = task.description || '';
    if (planned) planned.value = task.planned ?? 0;
    if (completed) completed.value = task.completed ?? 0;
    if (saveBtn) saveBtn.textContent = 'Save changes';
    if (cancelBtn) cancelBtn.classList.remove('hidden');
  }

  function handleTaskSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const title = $('#taskTitle')?.value.trim();
    if (!title) return;
    const description = $('#taskDescription')?.value.trim() || '';
    const planned = Math.max(0, Number($('#taskPlanned')?.value || 0));
    const completed = Math.max(0, Number($('#taskCompleted')?.value || 0));
    const editingId = form.dataset.editingId || null;
    const task = {
      id: editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : fallbackId()),
      title,
      description,
      planned,
      completed,
      done: completed >= planned && planned > 0,
    };
    upsertTask(task);
    renderTaskList();
    renderTodaySummary();
    renderWeekSummary();
    renderActiveTaskBadge();
    updateTimerTaskLabel();
    resetTaskForm();
  }

  function handleTaskListClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const wrapper = actionTarget.closest('[data-task-id]');
    if (!wrapper) return;
    const taskId = wrapper.dataset.taskId;
    const state = getTodayState();
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    switch (actionTarget.dataset.action) {
      case 'activate-task':
        setActiveTask(taskId);
        break;
      case 'toggle-done':
        toggleTaskDone(taskId);
        renderTaskList();
        renderTodaySummary();
        renderWeekSummary();
        break;
      case 'edit-task':
        populateForm(task);
        break;
      case 'delete-task':
        void showConfirm({
          message: 'Delete this task? This only removes it for today.',
          confirmLabel: 'Delete',
        }).then((confirmed) => {
          if (!confirmed) return;
          deleteTask(taskId);
          renderTaskList();
          renderTodaySummary();
          renderWeekSummary();
          updateTimerTaskLabel();
        });
        break;
      default:
        break;
    }
  }

  function setTodayLabel() {
    const label = $('#todayDateLabel');
    if (!label) return;
    const date = new Date();
    label.textContent = formatDateLabel(date);
  }

  function formatTime(seconds) {
    const clamped = Math.max(0, Math.floor(seconds));
    const mins = String(Math.floor(clamped / 60)).padStart(2, '0');
    const secs = String(clamped % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function defaultTimerState() {
    return {
      mode: 'focus',
      remaining: DURATIONS.focus,
      isRunning: false,
      lastStartedAt: null,
    };
  }

  function normalizeTimerState(raw) {
    if (!raw || typeof raw !== 'object') return defaultTimerState();
    const mode = ['focus', 'short', 'long'].includes(raw.mode) ? raw.mode : 'focus';
    const remaining = Math.max(0, Number(raw.remaining) || DURATIONS[mode]);
    const isRunning = !!raw.isRunning;
    const lastStartedAt = typeof raw.lastStartedAt === 'number' ? raw.lastStartedAt : null;
    return { mode, remaining, isRunning, lastStartedAt };
  }

  function loadTimerState() {
    const raw = safeGet(LS_KEYS.timer);
    if (!raw) return defaultTimerState();
    try {
      return normalizeTimerState(JSON.parse(raw));
    } catch (_) {
      return defaultTimerState();
    }
  }

  function persistTimerState() {
    try {
      safeSet(LS_KEYS.timer, JSON.stringify(timerState));
    } catch (_) {
      /* ignore */
    }
  }

  function updateTimerTaskLabel() {
    const label = $('#timerActiveTask');
    const warning = $('#timerWarning');
    const active = getActiveTask();
    if (label) {
      label.textContent = active ? `Active task: ${active.title}` : 'No active task selected';
    }
    if (warning) {
      warning.classList.toggle('hidden', !!active || getTodayState().tasks.length === 0);
    }
  }

  function syncRunningTimer() {
    if (!timerState.isRunning || !timerState.lastStartedAt) return;
    const elapsed = (Date.now() - timerState.lastStartedAt) / 1000;
    const remaining = timerState.remaining - elapsed;
    if (remaining <= 0) {
      handleTimerComplete();
    } else {
      timerState.remaining = remaining;
      timerState.lastStartedAt = Date.now();
      persistTimerState();
    }
  }

  function updateTimerUI() {
    const display = $('#timerDisplay');
    const status = $('#timerStatus');
    const startPause = $('#startPauseTimer');
    const resetBtn = $('#resetTimer');
    const activeButtons = $$('[data-timer-mode]');
    const modeLabel = timerState.mode === 'focus'
      ? 'Focus'
      : timerState.mode === 'short'
      ? 'Short break'
      : 'Long break';
    if (display) display.textContent = formatTime(timerState.remaining);
    if (status) status.textContent = `${modeLabel} for ${formatTime(DURATIONS[timerState.mode])}`;
    if (startPause) {
      startPause.textContent = timerState.isRunning ? 'Pause' : `Start ${modeLabel}`;
      startPause.classList.toggle('btn-blue', !timerState.isRunning || timerState.mode === 'focus');
    }
    if (resetBtn) resetBtn.disabled = timerState.isRunning;
    activeButtons.forEach((btn) => {
      const isActive = btn.dataset.timerMode === timerState.mode;
      btn.classList.toggle('btn-blue', isActive);
    });
  }

  function startTimer() {
    if (timerState.isRunning) return;
    if (timerState.remaining <= 0) {
      timerState.remaining = DURATIONS[timerState.mode];
    }
    timerState.isRunning = true;
    timerState.lastStartedAt = Date.now();
    persistTimerState();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = window.setInterval(() => {
      const elapsed = (Date.now() - timerState.lastStartedAt) / 1000;
      const remaining = timerState.remaining - elapsed;
      if (remaining <= 0) {
        handleTimerComplete();
      } else {
        timerState.remaining = remaining;
        timerState.lastStartedAt = Date.now();
        updateTimerUI();
        persistTimerState();
      }
    }, 1000);
    updateTimerUI();
  }

  function pauseTimer() {
    if (!timerState.isRunning) return;
    const elapsed = (Date.now() - timerState.lastStartedAt) / 1000;
    timerState.remaining = Math.max(0, timerState.remaining - elapsed);
    timerState.isRunning = false;
    timerState.lastStartedAt = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    persistTimerState();
    updateTimerUI();
  }

  function resetTimer() {
    timerState.remaining = DURATIONS[timerState.mode];
    timerState.isRunning = false;
    timerState.lastStartedAt = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    persistTimerState();
    updateTimerUI();
  }

  function switchMode(mode) {
    const normalized = ['focus', 'short', 'long'].includes(mode) ? mode : 'focus';
    timerState.mode = normalized;
    timerState.remaining = DURATIONS[normalized];
    timerState.isRunning = false;
    timerState.lastStartedAt = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    persistTimerState();
    updateTimerUI();
  }

  function handleTimerComplete() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerState.remaining = 0;
    timerState.isRunning = false;
    timerState.lastStartedAt = null;
    persistTimerState();
    updateTimerUI();

    if (timerState.mode === 'focus') {
      try {
        alarmAudio.currentTime = 0;
        void alarmAudio.play();
      } catch (_) {
        /* ignore */
      }
      const active = getActiveTask();
      if (active) {
        incrementTaskPomodoro(active.id);
        renderTaskList();
        renderTodaySummary();
        renderWeekSummary();
        updateTimerTaskLabel();
      } else {
        const warning = $('#timerWarning');
        if (warning) warning.classList.remove('hidden');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    tasksByDate = loadTasks();
    timerState = loadTimerState();
    syncRunningTimer();

    const storedTheme = safeGet(LS_KEYS.theme);
    applyDarkMode(storedTheme === '1', { persist: false });

    const themeToggle = $('#themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', (event) => {
        applyDarkMode(event.target.checked, { withTransition: true });
      });
    }

    const storedThemeChoice = safeGet(LS_KEYS.themeChoice) || 'default';
    applyThemeChoice(storedThemeChoice, { persist: false });
    const themeSelect = $('#themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', (event) => {
        applyThemeChoice(event.target.value);
      });
    }

    const storedSticky = safeGet(LS_KEYS.mobileNavSticky);
    applyMobileNavSticky(storedSticky !== '0', { persist: false });
    const stickyToggle = $('#mobileNavStickyToggle');
    if (stickyToggle) {
      stickyToggle.addEventListener('change', (event) => {
        applyMobileNavSticky(event.target.checked);
      });
    }

    const storedWelcomeHidden = safeGet(LS_KEYS.welcomeHidden) === '1';
    applyFirstTimeHidden(storedWelcomeHidden, { persist: false });
    const welcomeToggle = $('#welcomeToggle');
    if (welcomeToggle) {
      welcomeToggle.addEventListener('change', (event) => {
        applyFirstTimeHidden(!event.target.checked);
      });
    }

    const menuToggle = $('#menu-toggle');
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    const overlay = $('#overlay');
    if (overlay) overlay.addEventListener('click', () => setSidebarOpen(false));

    const modalOverlay = document.getElementById('modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
          closeModal();
        }
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (body.classList.contains('mobile-nav-open')) {
        setSidebarOpen(false);
      }
      const modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('modal-hidden')) {
        closeModal();
      }
    });

    const brandHome = $('#brandHome');
    if (brandHome) {
      brandHome.addEventListener('click', () => {
        navigateTo('today');
        if (window.innerWidth < 768) setSidebarOpen(false);
      });
    }

    $$('#sidebar .nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.target);
      });
    });

    const storedView = safeGet(LS_KEYS.view);
    if (storedView && document.getElementById(storedView)) {
      navigateTo(storedView);
    } else {
      navigateTo('today');
    }

    document.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-action]');
      if (!actionTarget) return;
      switch (actionTarget.dataset.action) {
        case 'clear-data':
          void showConfirm({
            message: 'This will erase TaskTrack Pomodoro data stored locally. Continue?',
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
          }).then((confirmed) => {
            if (!confirmed) return;
            try {
              Object.keys(localStorage).forEach((key) => {
                if (key.startsWith(STORAGE_PREFIX)) {
                  localStorage.removeItem(key);
                }
              });
            } catch (_) {
              /* ignore */
            }
            try {
              Object.keys(sessionStorage).forEach((key) => {
                if (key.startsWith(STORAGE_PREFIX)) {
                  sessionStorage.removeItem(key);
                }
              });
            } catch (_) {
              /* ignore */
            }
            window.location.reload();
          });
          break;
        case 'update-app':
          handleAppUpdateRequest(actionTarget);
          break;
        case 'close-modal':
          closeModal();
          break;
        default:
          break;
      }
    });

    const taskForm = $('#taskForm');
    if (taskForm) {
      taskForm.addEventListener('submit', handleTaskSubmit);
    }
    const cancelEdit = $('#cancelEdit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', resetTaskForm);
    }
    const taskList = $('#taskList');
    if (taskList) taskList.addEventListener('click', handleTaskListClick);

    const timerModeButtons = $$('[data-timer-mode]');
    timerModeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        switchMode(btn.dataset.timerMode);
      });
    });

    const startPauseBtn = $('#startPauseTimer');
    if (startPauseBtn) {
      startPauseBtn.addEventListener('click', () => {
        if (timerState.isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      });
    }
    const resetBtn = $('#resetTimer');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetTimer);
    }

    setTodayLabel();
    renderTaskList();
    renderTodaySummary();
    renderWeekSummary();
    renderActiveTaskBadge();
    updateTimerTaskLabel();
    updateTimerUI();

    initializeCollapsibles();
    renderChangelog();
    updateVersionDisplay();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('service-worker.js')
        .catch((error) => console.error('Service worker registration failed:', error));
    });
  }
})();
