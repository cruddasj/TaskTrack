'use strict';

(function () {
  const LS_KEYS = {
    theme: 'themeDark',
    themeChoice: 'themeChoice',
    welcomeHidden: 'welcomeDisabled',
    mobileNavSticky: 'mobileNavSticky',
    view: 'activeView',
    collapsible: 'collapsedCards',
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

    if (shouldHide) {
      if (safeGet(LS_KEYS.view) === 'welcome') safeSet(LS_KEYS.view, 'settings');
      const welcomeSection = document.getElementById('welcome');
      if (welcomeSection && welcomeSection.classList.contains('active')) {
        navigateTo('settings');
      }
    }
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

      finishWithMessage('PWA Template has been updated to the latest version.', {
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

      finishWithMessage("You're already using the latest version of PWA Template.");
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

  document.addEventListener('DOMContentLoaded', () => {
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
        const target = welcomeHiddenState ? 'settings' : 'welcome';
        navigateTo(target);
        if (window.innerWidth < 768) setSidebarOpen(false);
      });
    }

    $$('#sidebar .nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.target);
      });
    });

    const storedView = safeGet(LS_KEYS.view);
    const welcomeHidden = welcomeHiddenState;
    if (
      storedView &&
      document.getElementById(storedView) &&
      !(welcomeHidden && storedView === 'welcome')
    ) {
      navigateTo(storedView);
    } else {
      navigateTo(welcomeHidden ? 'settings' : 'welcome');
    }

    document.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-action]');
      if (!actionTarget) return;
      switch (actionTarget.dataset.action) {
        case 'go-settings':
          navigateTo('settings');
          break;
        case 'clear-data':
          void showConfirm({
            message: 'This will erase all locally stored data. Continue?',
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
          }).then((confirmed) => {
            if (!confirmed) return;
            try {
              localStorage.clear();
            } catch (_) {
              /* ignore */
            }
            try {
              sessionStorage.clear();
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
