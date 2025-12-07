'use strict';

(function () {
  const STORAGE_PREFIX = 'time-tracker-pomodoro-v1';
  const APP_DATA_KEY = STORAGE_PREFIX;
  const TIMER_STORAGE_KEY = `${STORAGE_PREFIX}-timer-state`;

  const LS_KEYS = {
    theme: `${STORAGE_PREFIX}-themeDark`,
    themeChoice: `${STORAGE_PREFIX}-themeChoice`,
    welcomeHidden: `${STORAGE_PREFIX}-welcomeDisabled`,
    mobileNavSticky: `${STORAGE_PREFIX}-mobileNavSticky`,
    view: `${STORAGE_PREFIX}-activeView`,
    collapsible: `${STORAGE_PREFIX}-collapsedCards`,
    timerSettings: `${STORAGE_PREFIX}-timerSettings`,
    alarmSound: `${STORAGE_PREFIX}-alarmSound`,
    customAlarm: `${STORAGE_PREFIX}-customAlarm`,
    debugNotifications: `${STORAGE_PREFIX}-debugNotifications`,
  };

  const PERSISTED_KEYS = [
    APP_DATA_KEY,
    TIMER_STORAGE_KEY,
    ...Object.values(LS_KEYS),
  ];

  const FALLBACK_DURATIONS = {
    focus: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
  };

  const DEFAULT_TIMER_CONFIG = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
  };

  const ALARM_SOUNDS = {
    chime: {
      id: 'chime',
      label: 'Soft chime',
      src: 'assets/audio/pomodoro-chime.wav',
    },
    bell: {
      id: 'bell',
      label: 'Long ringing bell',
      src: 'assets/audio/long-bell.wav',
    },
    beeps: {
      id: 'beeps',
      label: 'Series of beeps',
      src: 'assets/audio/beeps.wav',
    },
  };

  const CUSTOM_ALARM_MAX_BYTES = 2 * 1024 * 1024;
  const DEBUG_NOTIFICATION_INTERVAL_MS = 10_000;

  const TASK_DEFAULTS = {
    planned: 1,
    completed: 0,
    description: '',
    done: false,
    assignedRound: 1,
  };

  let timerIntervalId = null;
  let debugNotificationIntervalId = null;
  let editingTaskId = null;
  let appData = null;
  let timerState = null;
  let timerConfig = { ...DEFAULT_TIMER_CONFIG };
  let alarmUnlocked = false;

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

  const safeRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  };

  const normalizeTimerConfig = (raw) => {
    const clampInt = (value, min, max, fallback) => {
      const num = Number.parseInt(value, 10);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(Math.max(num, min), max);
    };
    return {
      focusMinutes: clampInt(raw?.focusMinutes, 1, 180, DEFAULT_TIMER_CONFIG.focusMinutes),
      shortBreakMinutes: clampInt(
        raw?.shortBreakMinutes,
        1,
        60,
        DEFAULT_TIMER_CONFIG.shortBreakMinutes
      ),
      longBreakMinutes: clampInt(
        raw?.longBreakMinutes,
        1,
        120,
        DEFAULT_TIMER_CONFIG.longBreakMinutes
      ),
      sessionsBeforeLongBreak: clampInt(
        raw?.sessionsBeforeLongBreak,
        1,
        12,
        DEFAULT_TIMER_CONFIG.sessionsBeforeLongBreak
      ),
    };
  };

  const loadTimerConfig = () => {
    const raw = safeGet(LS_KEYS.timerSettings);
    if (!raw) return { ...DEFAULT_TIMER_CONFIG };
    try {
      const parsed = JSON.parse(raw);
      return normalizeTimerConfig(parsed);
    } catch (_) {
      return { ...DEFAULT_TIMER_CONFIG };
    }
  };

  const persistTimerConfig = (config) => {
    try {
      safeSet(LS_KEYS.timerSettings, JSON.stringify(normalizeTimerConfig(config)));
    } catch (_) {
      /* ignore */
    }
  };

  const getDurationSeconds = (mode) => {
    const durations = {
      focus: (timerConfig?.focusMinutes || DEFAULT_TIMER_CONFIG.focusMinutes) * 60,
      shortBreak:
        (timerConfig?.shortBreakMinutes || DEFAULT_TIMER_CONFIG.shortBreakMinutes) * 60,
      longBreak:
        (timerConfig?.longBreakMinutes || DEFAULT_TIMER_CONFIG.longBreakMinutes) * 60,
    };
    return durations[mode] || FALLBACK_DURATIONS[mode] || FALLBACK_DURATIONS.focus;
  };

  const loadCustomAlarmSound = () => {
    const raw = safeGet(LS_KEYS.customAlarm);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.src && typeof parsed.src === 'string') {
        return {
          name: parsed.name || 'Custom tone',
          src: parsed.src,
        };
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  };

  const persistCustomAlarmSound = (payload) => {
    if (!payload) {
      safeRemove(LS_KEYS.customAlarm);
      return;
    }
    try {
      safeSet(
        LS_KEYS.customAlarm,
        JSON.stringify({ name: payload.name || 'Custom tone', src: payload.src })
      );
    } catch (_) {
      /* ignore */
    }
  };

  const loadAlarmSound = () => {
    const raw = safeGet(LS_KEYS.alarmSound);
    if (raw === 'custom' && loadCustomAlarmSound()) return 'custom';
    if (raw && ALARM_SOUNDS[raw]) return raw;
    return 'chime';
  };

  const persistAlarmSound = (id) => {
    try {
      safeSet(LS_KEYS.alarmSound, id);
    } catch (_) {
      /* ignore */
    }
  };

  const getAlarmSource = (id) => {
    if (id === 'custom') {
      const custom = loadCustomAlarmSound();
      if (custom?.src) {
        return { id: 'custom', label: custom.name || 'Custom tone', src: custom.src };
      }
    }
    const soundId = ALARM_SOUNDS[id] ? id : 'chime';
    return ALARM_SOUNDS[soundId];
  };

  const applyAlarmSound = (id) => {
    const source = getAlarmSource(id);
    const resolvedId = source?.id || 'chime';
    const audio = document.getElementById('timerAlarm');
    if (audio && source?.src && audio.getAttribute('src') !== source.src) {
      audio.setAttribute('src', source.src);
      audio.load();
    }
    const select = document.getElementById('alarmTone');
    if (select && select.value !== resolvedId) select.value = resolvedId;
    persistAlarmSound(resolvedId);
    return resolvedId;
  };

  const playAlarmPreview = async (id) => {
    const source = getAlarmSource(id);
    if (!source?.src) return;
    try {
      const preview = new Audio(source.src);
      preview.currentTime = 0;
      await preview.play();
      alarmUnlocked = true;
    } catch (error) {
      console.error('Failed to play preview', error);
      setTimerStatus('Unable to play the preview tone.', 'warning');
    }
  };

  const ensureAlarmReady = async () => {
    const audio = document.getElementById('timerAlarm');
    if (!audio) return false;
    if (alarmUnlocked) return true;
    try {
      audio.muted = true;
      audio.currentTime = 0;
      await audio.play();
      await audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      alarmUnlocked = true;
      return true;
    } catch (_) {
      audio.muted = false;
      return false;
    }
  };

  const playAlarmSound = async () => {
    const audio = document.getElementById('timerAlarm');
    if (!audio) return;
    const ready = alarmUnlocked || (document.visibilityState === 'visible' && (await ensureAlarmReady()));
    if (!ready) {
      setTimerStatus('Tap Start or Preview to enable alarm audio.', 'warning');
      return;
    }
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      console.error('Failed to play alarm', error);
      setTimerStatus('Unable to play the alarm sound.', 'warning');
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') {
      return 'denied';
    }
    if (Notification.permission !== 'default') return Notification.permission;
    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.error('Notification permission failed', error);
      return 'denied';
    }
  };

  const showTimerNotification = async ({ title, body }) => {
    if (!('Notification' in window)) return;
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return;
    const options = {
      body,
      tag: 'tasktrack-timer',
      renotify: true,
      requireInteraction: true,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      vibrate: [200, 100, 200],
    };
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
    } catch (error) {
      console.error('Service worker notification failed', error);
    }
    try {
      new Notification(title, options);
    } catch (error) {
      console.error('Notification display failed', error);
    }
  };

  const stopDebugNotifications = () => {
    if (debugNotificationIntervalId) {
      clearInterval(debugNotificationIntervalId);
      debugNotificationIntervalId = null;
    }
  };

  const applyDebugNotifications = (enabled) => {
    const toggle = document.getElementById('debugNotificationToggle');
    if (toggle) toggle.checked = enabled;

    if (!enabled) {
      stopDebugNotifications();
      safeSet(LS_KEYS.debugNotifications, '0');
      return;
    }

    safeSet(LS_KEYS.debugNotifications, '1');
    stopDebugNotifications();
    debugNotificationIntervalId = window.setInterval(() => {
      const payload = getCompletionNotificationContent({ mode: timerState?.mode });
      void showTimerNotification(payload);
    }, DEBUG_NOTIFICATION_INTERVAL_MS);
  };

  const renderCustomAlarmHelper = () => {
    const helper = document.getElementById('customToneHelper');
    if (!helper) return;
    const custom = loadCustomAlarmSound();
    if (custom?.name) {
      helper.textContent = `Using ${custom.name}. Upload another file to replace it or pick a built-in tone above.`;
      return;
    }
    helper.textContent = 'Upload a small audio file (2MB max) to use as your notification tone.';
  };

  const getTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const defaultData = () => ({
    tasksByDate: {},
    activeTaskByDate: {},
    roundByDate: {},
  });

  const loadAppData = () => {
    const raw = safeGet(APP_DATA_KEY);
    if (!raw) return defaultData();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultData();
      return {
        tasksByDate: parsed.tasksByDate && typeof parsed.tasksByDate === 'object' ? parsed.tasksByDate : {},
        activeTaskByDate:
          parsed.activeTaskByDate && typeof parsed.activeTaskByDate === 'object'
            ? parsed.activeTaskByDate
            : {},
        roundByDate: parsed.roundByDate && typeof parsed.roundByDate === 'object' ? parsed.roundByDate : {},
      };
    } catch (_) {
      return defaultData();
    }
  };

  const persistAppData = () => {
    try {
      safeSet(APP_DATA_KEY, JSON.stringify(appData));
    } catch (_) {
      /* ignore */
    }
  };

  const getTasksForDate = (dateKey) => {
    if (!appData.tasksByDate[dateKey]) {
      appData.tasksByDate[dateKey] = [];
    }
    appData.tasksByDate[dateKey].forEach((task) => {
      if (!Number.isFinite(task.assignedRound) || task.assignedRound < 1) {
        task.assignedRound = TASK_DEFAULTS.assignedRound;
      }
    });
    return appData.tasksByDate[dateKey];
  };

  const getActiveTaskId = (dateKey) => appData.activeTaskByDate?.[dateKey] || null;

  const setActiveTaskId = (dateKey, taskId) => {
    if (taskId) {
      appData.activeTaskByDate[dateKey] = taskId;
    } else {
      delete appData.activeTaskByDate[dateKey];
    }
    persistAppData();
  };

  const getCurrentRound = (dateKey) => {
    const rawRound = appData.roundByDate?.[dateKey];
    const normalized = Number.isFinite(Number(rawRound)) ? Math.max(1, Math.floor(Number(rawRound))) : 1;
    if (!appData.roundByDate) appData.roundByDate = {};
    if (!appData.roundByDate[dateKey]) appData.roundByDate[dateKey] = normalized;
    return normalized;
  };

  const setCurrentRound = (dateKey, round) => {
    if (!appData.roundByDate) appData.roundByDate = {};
    appData.roundByDate[dateKey] = Math.max(1, Math.floor(round || 1));
    persistAppData();
  };

  const advanceRound = (dateKey) => {
    const next = getCurrentRound(dateKey) + 1;
    setCurrentRound(dateKey, next);
    renderRoundInfo();
  };

  const upsertTask = (dateKey, task) => {
    const tasks = getTasksForDate(dateKey);
    const existingIndex = tasks.findIndex((item) => item.id === task.id);
    if (existingIndex >= 0) {
      tasks[existingIndex] = { ...tasks[existingIndex], ...task };
    } else {
      tasks.push({ ...TASK_DEFAULTS, ...task });
    }
    persistAppData();
  };

  const deleteTask = (dateKey, taskId) => {
    const tasks = getTasksForDate(dateKey);
    const filtered = tasks.filter((task) => task.id !== taskId);
    appData.tasksByDate[dateKey] = filtered;
    if (getActiveTaskId(dateKey) === taskId) {
      setActiveTaskId(dateKey, null);
    }
    persistAppData();
  };

  const toggleTaskDone = (dateKey, taskId) => {
    const tasks = getTasksForDate(dateKey);
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    target.done = !target.done;
    persistAppData();
  };

  const updateTaskCompletion = (dateKey, taskId, completedDelta = 1) => {
    const tasks = getTasksForDate(dateKey);
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    target.completed = Math.max(0, (Number(target.completed) || 0) + completedDelta);
    persistAppData();
  };

  const updateTaskRound = (dateKey, taskId, round) => {
    const tasks = getTasksForDate(dateKey);
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    target.assignedRound = Math.max(1, Math.floor(round || 1));
    target.done = false;
    persistAppData();
  };

  const buildTaskId = () => `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  let welcomeHiddenState = false;

  const defaultTimerState = () => ({
    mode: 'focus',
    remaining: getDurationSeconds('focus'),
    isRunning: false,
    lastUpdated: null,
    focusStreak: 0,
  });

  const loadTimerState = () => {
    const raw = safeGet(TIMER_STORAGE_KEY);
    if (!raw) return defaultTimerState();
    try {
      const parsed = JSON.parse(raw);
      const base = defaultTimerState();
      base.mode = ['focus', 'shortBreak', 'longBreak'].includes(parsed?.mode)
        ? parsed.mode
        : 'focus';
      const fallbackRemaining = getDurationSeconds(base.mode);
      base.remaining = Number.isFinite(parsed?.remaining)
        ? Math.max(0, Math.floor(parsed.remaining))
        : fallbackRemaining;
      base.isRunning = !!parsed?.isRunning;
      base.lastUpdated = Number.isFinite(parsed?.lastUpdated) ? parsed.lastUpdated : null;
      base.focusStreak = Number.isFinite(parsed?.focusStreak)
        ? Math.max(0, parsed.focusStreak)
        : 0;

      if (base.isRunning && base.lastUpdated) {
        const elapsed = Math.floor((Date.now() - base.lastUpdated) / 1000);
        base.remaining = Math.max(0, base.remaining - elapsed);
        if (base.remaining === 0) {
          base.isRunning = false;
        }
      }

      if (!Number.isFinite(base.remaining) || base.remaining <= 0) {
        base.remaining = fallbackRemaining;
      }
      return base;
    } catch (_) {
      return defaultTimerState();
    }
  };

  const persistTimerState = () => {
    try {
      safeSet(
        TIMER_STORAGE_KEY,
        JSON.stringify({
          ...timerState,
          lastUpdated: timerState.lastUpdated || Date.now(),
          focusStreak: timerState.focusStreak ?? 0,
        })
      );
    } catch (_) {
      /* ignore */
    }
  };

  const formatSeconds = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const setTimerStatus = (message = '', tone = 'muted') => {
    const statusEl = document.getElementById('timerStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('text-red-600', 'dark:text-red-400', 'text-yellow-600', 'dark:text-yellow-400');
    if (tone === 'error') {
      statusEl.classList.add('text-red-600', 'dark:text-red-400');
    } else if (tone === 'warning') {
      statusEl.classList.add('text-yellow-600', 'dark:text-yellow-400');
    }
  };

  const renderTimer = () => {
    const display = document.getElementById('timerDisplay');
    const modeLabel = document.getElementById('timerMode');
    if (display) display.textContent = formatSeconds(timerState.remaining);
    if (modeLabel) {
      const labels = {
        focus: 'Focus',
        shortBreak: 'Short Break',
        longBreak: 'Long Break',
      };
      modeLabel.textContent = labels[timerState.mode] || 'Focus';
    }

    const modeButtons = document.querySelectorAll('[data-timer-mode]');
    modeButtons.forEach((btn) => {
      const isActive = btn.dataset.timerMode === timerState.mode;
      btn.classList.toggle('btn-blue', isActive);
      btn.classList.toggle('btn-gray', !isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    const startButton = document.querySelector('[data-timer-control="start"]');
    const pauseButton = document.querySelector('[data-timer-control="pause"]');
    if (startButton) startButton.disabled = timerState.isRunning;
    if (pauseButton) pauseButton.disabled = !timerState.isRunning;
  };

  const stopTimerTick = () => {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  };

  const resetTimer = ({ mode = timerState.mode, persist = true, resetStreak = false } = {}) => {
    timerState.mode = mode;
    timerState.remaining = getDurationSeconds(mode);
    if (resetStreak) timerState.focusStreak = 0;
    timerState.isRunning = false;
    timerState.lastUpdated = null;
    stopTimerTick();
    renderTimer();
    if (persist) persistTimerState();
  };

  const getNextBreakMode = () => {
    const nextStreak = (timerState?.focusStreak || 0) + 1;
    return nextStreak >= timerConfig.sessionsBeforeLongBreak ? 'longBreak' : 'shortBreak';
  };

  const getCompletionNotificationContent = ({ mode, nextMode } = {}) => {
    const effectiveMode = mode || timerState?.mode || 'focus';
    if (effectiveMode === 'focus') {
      const breakMode = nextMode || getNextBreakMode();
      return {
        title: 'Focus complete',
        body: `Starting your ${breakMode === 'longBreak' ? 'long' : 'short'} break.`,
      };
    }
    return {
      title: 'Break finished',
      body: 'Time to start your next focus session.',
    };
  };

  const handleTimerComplete = async () => {
    stopTimerTick();
    timerState.isRunning = false;
    timerState.remaining = 0;
    renderTimer();
    persistTimerState();

    await playAlarmSound();

    if (timerState.mode === 'focus') {
      const todayKey = getTodayKey();
      const currentRound = getCurrentRound(todayKey);
      const activeTaskId = getActiveTaskId(todayKey);
      const activeTask = getTasksForDate(todayKey).find((task) => task.id === activeTaskId);

      if (activeTask) {
        const finished = await showConfirm({
          message: `Round ${currentRound} finished. Did you complete "${activeTask.title}"?`,
          confirmLabel: 'Yes, finished',
          cancelLabel: 'Not yet',
        });
        if (finished) {
          updateTaskCompletion(todayKey, activeTaskId, 1);
          upsertTask(todayKey, { id: activeTaskId, done: true });
        } else {
          updateTaskRound(todayKey, activeTaskId, currentRound + 1);
          setTimerStatus('Carrying this task over to the next round.', 'warning');
        }
      } else {
        setTimerStatus('Focus complete, but no active task was selected.', 'warning');
      }

      const newStreak = (timerState.focusStreak || 0) + 1;
      const reachedLongBreak = newStreak >= timerConfig.sessionsBeforeLongBreak;
      timerState.focusStreak = reachedLongBreak ? 0 : newStreak;
      advanceRound(todayKey);
      renderTasks();
      const nextMode = reachedLongBreak ? 'longBreak' : 'shortBreak';
      resetTimer({ mode: nextMode, persist: false });
      startTimer({ clearStatus: false });
      void showTimerNotification(getCompletionNotificationContent({ mode: timerState.mode, nextMode }));
      setTimerStatus(
        activeTask
          ? `Focus complete! Starting a ${nextMode === 'longBreak' ? 'long' : 'short'} break.`
          : `Focus complete, but no active task was selected. Starting a ${
              nextMode === 'longBreak' ? 'long' : 'short'
            } break.`,
        activeTask ? 'muted' : 'warning'
      );
      return;
    }

    // Break finished -> go back to focus
    resetTimer({ mode: 'focus', persist: false });
    startTimer({ clearStatus: false });
    void showTimerNotification(getCompletionNotificationContent({ mode: timerState.mode }));
    setTimerStatus('Break finished. Starting the next focus session.');
  };

  const handleTimerTick = () => {
    if (!timerState.isRunning) return;
    const now = Date.now();
    const last = timerState.lastUpdated || now;
    const elapsed = Math.max(0, Math.floor((now - last) / 1000));
    if (elapsed <= 0) return;
    timerState.remaining = Math.max(0, timerState.remaining - elapsed);
    timerState.lastUpdated = now;
    renderTimer();
    persistTimerState();
    if (timerState.remaining === 0) {
      void handleTimerComplete();
    }
  };

  const startTimer = ({ clearStatus = true } = {}) => {
    if (timerState.isRunning) return;
    if (timerState.mode === 'focus') {
      ensureActiveTaskForRound(getTodayKey());
    }
    if (!Number.isFinite(timerState.remaining) || timerState.remaining <= 0) {
      timerState.remaining = getDurationSeconds(timerState.mode);
    }
    timerState.isRunning = true;
    timerState.lastUpdated = Date.now();
    if (clearStatus) setTimerStatus('');
    stopTimerTick();
    timerIntervalId = window.setInterval(handleTimerTick, 1000);
    renderTimer();
    persistTimerState();
  };

  const pauseTimer = () => {
    if (!timerState.isRunning) return;
    stopTimerTick();
    timerState.isRunning = false;
    timerState.lastUpdated = null;
    renderTimer();
    persistTimerState();
  };

  const switchTimerMode = (mode) => {
    if (!['focus', 'shortBreak', 'longBreak'].includes(mode)) return;
    resetTimer({ mode });
    setTimerStatus('');
  };

  const findBestTaskForRound = (dateKey) => {
    const tasks = getTasksForDate(dateKey)
      .filter((task) => !task.done)
      .slice()
      .sort((a, b) => (a.assignedRound || 1) - (b.assignedRound || 1));
    const currentRound = getCurrentRound(dateKey);
    return tasks.find((task) => (task.assignedRound || 1) <= currentRound) || tasks[0] || null;
  };

  const ensureActiveTaskForRound = (dateKey) => {
    const activeId = getActiveTaskId(dateKey);
    const tasks = getTasksForDate(dateKey);
    const activeTask = tasks.find((task) => task.id === activeId && !task.done);
    const currentRound = getCurrentRound(dateKey);
    if (activeTask && (activeTask.assignedRound || 1) <= currentRound) return activeTask;
    const candidate = findBestTaskForRound(dateKey);
    if (candidate) {
      setActiveTaskId(dateKey, candidate.id);
      return candidate;
    }
    setActiveTaskId(dateKey, null);
    return null;
  };

  const renderRoundInfo = () => {
    const todayKey = getTodayKey();
    const round = getCurrentRound(todayKey);
    const currentRoundLabel = document.getElementById('currentRoundLabel');
    if (currentRoundLabel) {
      currentRoundLabel.textContent = `Current pomodoro round: ${round}`;
    }
    const timerRoundLabel = document.getElementById('timerRoundLabel');
    if (timerRoundLabel) {
      timerRoundLabel.textContent = `Round ${round}`;
    }
  };

  const renderActiveTaskBadge = () => {
    const activeLabel = document.getElementById('activeTaskLabel');
    const todayKey = getTodayKey();
    renderRoundInfo();
    const activeId = getActiveTaskId(todayKey);
    const activeTask = getTasksForDate(todayKey).find((task) => task.id === activeId);
    if (activeLabel) {
      activeLabel.textContent = activeTask
        ? `Active task: ${activeTask.title}`
        : 'No active task selected';
    }
    const activeTimerLabel = document.getElementById('timerActiveTask');
    if (activeTimerLabel) {
      activeTimerLabel.textContent = activeTask ? activeTask.title : 'None';
    }
  };

  const renderTodaySummary = () => {
    const summary = document.getElementById('todaySummary');
    const todayKey = getTodayKey();
    const tasks = getTasksForDate(todayKey);
    if (!summary) return;
    summary.innerHTML = '';
    if (!tasks.length) {
      const p = document.createElement('p');
      p.className = 'text-sm text-gray-600 dark:text-gray-300';
      p.textContent = 'Add tasks for today to see your summary.';
      summary.appendChild(p);
      return;
    }

    const list = document.createElement('div');
    list.className = 'space-y-3';
    tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between border border-gray-200 dark:border-gray-700 rounded-lg p-3';

      const text = document.createElement('div');
      text.className = 'space-y-1';
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-900 dark:text-gray-100';
      title.textContent = task.title;
      text.appendChild(title);
      const meta = document.createElement('p');
      meta.className = 'text-sm text-gray-600 dark:text-gray-300';
      meta.textContent = `Planned: ${task.planned || 0} • Completed: ${task.completed || 0} • ${
        task.done ? 'Done' : 'In progress'
      }`;
      text.appendChild(meta);
      item.appendChild(text);
      list.appendChild(item);
    });
    summary.appendChild(list);
  };

  const renderWeekSummary = () => {
    const list = document.getElementById('weekSummary');
    if (!list) return;
    list.innerHTML = '';
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`;
      const tasks = appData.tasksByDate[key] || [];
      const planned = tasks.reduce((acc, task) => acc + (Number(task.planned) || 0), 0);
      const completed = tasks.reduce((acc, task) => acc + (Number(task.completed) || 0), 0);

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3';
      const dateLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const title = document.createElement('p');
      title.className = 'font-semibold text-gray-900 dark:text-gray-100';
      title.textContent = dateLabel;
      item.appendChild(title);
      const metrics = document.createElement('p');
      metrics.className = 'text-sm text-gray-600 dark:text-gray-300';
      metrics.textContent = `Planned: ${planned} • Completed: ${completed}`;
      item.appendChild(metrics);
      list.appendChild(item);
    }
  };

  const renderTasks = () => {
    const list = document.getElementById('taskList');
    const todayKey = getTodayKey();
    const tasks = getTasksForDate(todayKey);
    if (!list) return;
    list.innerHTML = '';

    if (!tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-gray-600 dark:text-gray-300';
      empty.textContent = "No tasks for today yet. Let's plan your focus sessions.";
      list.appendChild(empty);
    } else {
      tasks
        .slice()
        .sort((a, b) => {
          const roundDiff = (a.assignedRound || 1) - (b.assignedRound || 1);
          if (roundDiff !== 0) return roundDiff;
          return Number(a.done) - Number(b.done);
        })
        .forEach((task) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3';

          const header = document.createElement('div');
          header.className = 'flex items-start justify-between gap-3';
          const title = document.createElement('div');
          title.className = 'space-y-1';
          const heading = document.createElement('p');
          heading.className = `font-semibold text-lg ${task.done ? 'line-through text-gray-500 dark:text-gray-400' : ''}`;
          heading.textContent = task.title;
          title.appendChild(heading);
          if (task.description) {
            const desc = document.createElement('p');
            desc.className = 'text-sm text-gray-600 dark:text-gray-300';
            desc.textContent = task.description;
            title.appendChild(desc);
          }
          header.appendChild(title);

          const status = document.createElement('span');
          status.className = `px-2 py-1 text-xs font-semibold rounded-full ${
            task.done ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
          }`;
          status.textContent = task.done ? 'Done' : 'In progress';
          header.appendChild(status);
          wrapper.appendChild(header);

          const meta = document.createElement('div');
          meta.className = 'flex flex-wrap gap-3 text-sm text-gray-700 dark:text-gray-300';
          meta.innerHTML = `<span class="font-semibold">Planned:</span> ${task.planned || 0} <span class="font-semibold">Completed:</span> ${
            task.completed || 0
          } <span class="font-semibold">Round:</span> ${task.assignedRound || 1}`;
          wrapper.appendChild(meta);

          const actions = document.createElement('div');
          actions.className = 'flex flex-wrap gap-2';

          const activate = document.createElement('button');
          activate.type = 'button';
          activate.className = 'btn btn-gray';
          activate.dataset.taskAction = 'activate';
          activate.dataset.taskId = task.id;
          activate.textContent = getActiveTaskId(todayKey) === task.id ? 'Active task' : 'Set active';
          actions.appendChild(activate);

          const toggleDoneBtn = document.createElement('button');
          toggleDoneBtn.type = 'button';
          toggleDoneBtn.className = 'btn btn-gray';
          toggleDoneBtn.dataset.taskAction = 'toggle';
          toggleDoneBtn.dataset.taskId = task.id;
          toggleDoneBtn.textContent = task.done ? 'Mark as in progress' : 'Mark done';
          actions.appendChild(toggleDoneBtn);

          const moveRoundBtn = document.createElement('button');
          moveRoundBtn.type = 'button';
          moveRoundBtn.className = 'btn btn-gray';
          moveRoundBtn.dataset.taskAction = 'nextRound';
          moveRoundBtn.dataset.taskId = task.id;
          moveRoundBtn.textContent = 'Move to next round';
          actions.appendChild(moveRoundBtn);

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'btn btn-blue';
          editBtn.dataset.taskAction = 'edit';
          editBtn.dataset.taskId = task.id;
          editBtn.textContent = 'Edit';
          actions.appendChild(editBtn);

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'btn btn-red';
          deleteBtn.dataset.taskAction = 'delete';
          deleteBtn.dataset.taskId = task.id;
          deleteBtn.textContent = 'Delete';
          actions.appendChild(deleteBtn);

          wrapper.appendChild(actions);
          list.appendChild(wrapper);
        });
    }
    ensureActiveTaskForRound(todayKey);
    renderTodaySummary();
    renderWeekSummary();
    renderActiveTaskBadge();
  };

  const resetTaskForm = () => {
    const form = document.getElementById('taskForm');
    const title = document.getElementById('taskTitle');
    const description = document.getElementById('taskDescription');
    const planned = document.getElementById('taskPlanned');
    const round = document.getElementById('taskRound');
    const submit = document.getElementById('taskSubmit');
    const cancel = document.getElementById('taskCancel');
    editingTaskId = null;
    if (form) form.reset();
    if (title) title.value = '';
    if (description) description.value = '';
    if (planned) planned.value = TASK_DEFAULTS.planned;
    if (round) round.value = getCurrentRound(getTodayKey());
    if (submit) submit.textContent = 'Add task';
    if (cancel) cancel.classList.add('hidden');
  };

  const populateTaskForm = (task) => {
    const title = document.getElementById('taskTitle');
    const description = document.getElementById('taskDescription');
    const planned = document.getElementById('taskPlanned');
    const round = document.getElementById('taskRound');
    const submit = document.getElementById('taskSubmit');
    const cancel = document.getElementById('taskCancel');
    editingTaskId = task.id;
    if (title) title.value = task.title || '';
    if (description) description.value = task.description || '';
    if (planned) planned.value = task.planned ?? TASK_DEFAULTS.planned;
    if (round) round.value = task.assignedRound ?? TASK_DEFAULTS.assignedRound;
    if (submit) submit.textContent = 'Update task';
    if (cancel) cancel.classList.remove('hidden');
  };


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
      if (safeGet(LS_KEYS.view) === 'welcome') safeSet(LS_KEYS.view, 'today');
      const welcomeSection = document.getElementById('welcome');
      if (welcomeSection && welcomeSection.classList.contains('active')) {
        navigateTo('today');
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

      finishWithMessage('TaskTrack has been updated to the latest version.', {
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

      finishWithMessage("You're already using the latest version of TaskTrack.");
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
    appData = loadAppData();
    timerConfig = loadTimerConfig();
    timerState = loadTimerState();

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

    const timerSettingsForm = document.getElementById('timerSettingsForm');
    const timerSettingsReset = document.getElementById('timerSettingsReset');
    const applyTimerSettingsToForm = () => {
      const focusField = document.getElementById('focusMinutes');
      const shortField = document.getElementById('shortBreakMinutes');
      const longField = document.getElementById('longBreakMinutes');
      const streakField = document.getElementById('sessionsBeforeLongBreak');
      if (focusField) focusField.value = timerConfig.focusMinutes;
      if (shortField) shortField.value = timerConfig.shortBreakMinutes;
      if (longField) longField.value = timerConfig.longBreakMinutes;
      if (streakField) streakField.value = timerConfig.sessionsBeforeLongBreak;
    };

    applyTimerSettingsToForm();

    const currentAlarm = applyAlarmSound(loadAlarmSound());
    renderCustomAlarmHelper();

    const updateTimerConfig = (nextConfig, { resetSession = true } = {}) => {
      timerConfig = normalizeTimerConfig(nextConfig);
      persistTimerConfig(timerConfig);
      applyTimerSettingsToForm();
      if (resetSession) {
        resetTimer({ mode: timerState.mode, persist: true });
        setTimerStatus('Timer settings updated. New durations apply to the next session.');
      }
    };

    if (timerSettingsForm) {
      timerSettingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const focusMinutes = Number.parseInt(document.getElementById('focusMinutes')?.value, 10);
        const shortBreakMinutes = Number.parseInt(
          document.getElementById('shortBreakMinutes')?.value,
          10
        );
        const longBreakMinutes = Number.parseInt(
          document.getElementById('longBreakMinutes')?.value,
          10
        );
        const sessionsBeforeLongBreak = Number.parseInt(
          document.getElementById('sessionsBeforeLongBreak')?.value,
          10
        );
        updateTimerConfig({
          focusMinutes,
          shortBreakMinutes,
          longBreakMinutes,
          sessionsBeforeLongBreak,
        });
      });
    }

    if (timerSettingsReset) {
      timerSettingsReset.addEventListener('click', () => {
        updateTimerConfig(DEFAULT_TIMER_CONFIG, { resetSession: true });
      });
    }

    const alarmSelect = document.getElementById('alarmTone');
    if (alarmSelect) {
      alarmSelect.value = currentAlarm;
      alarmSelect.addEventListener('change', (event) => {
        const next = event.target.value;
        applyAlarmSound(next);
        setTimerStatus('Notification tone updated.');
        if (next !== 'custom') alarmUnlocked = false;
        renderCustomAlarmHelper();
      });
    }

    const alarmPreview = document.getElementById('alarmTonePreview');
    if (alarmPreview) {
      alarmPreview.addEventListener('click', () => {
        const select = document.getElementById('alarmTone');
        const selected = select ? select.value : currentAlarm;
        playAlarmPreview(selected);
      });
    }

    const customAlarmInput = document.getElementById('customAlarmFile');
    if (customAlarmInput) {
      customAlarmInput.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        if (!file) return;
        if (file.size > CUSTOM_ALARM_MAX_BYTES) {
          setTimerStatus('Custom tone must be 2MB or smaller.', 'warning');
          event.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result.startsWith('data:audio')) {
            setTimerStatus('Please choose an audio file.', 'warning');
            return;
          }
          persistCustomAlarmSound({ name: file.name, src: result });
          applyAlarmSound('custom');
          alarmUnlocked = false;
          renderCustomAlarmHelper();
          setTimerStatus('Custom notification tone saved.');
        };
        reader.onerror = () => {
          setTimerStatus('Failed to read the selected file.', 'error');
        };
        reader.readAsDataURL(file);
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

    const storedDebugNotifications = safeGet(LS_KEYS.debugNotifications) === '1';
    applyDebugNotifications(storedDebugNotifications);
    const debugNotificationToggle = $('#debugNotificationToggle');
    if (debugNotificationToggle) {
      debugNotificationToggle.addEventListener('change', (event) => {
        applyDebugNotifications(event.target.checked);
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
    const fallbackView = 'today';
    if (
      storedView &&
      document.getElementById(storedView) &&
      !(storedView === 'welcome' && welcomeHiddenState)
    ) {
      navigateTo(storedView);
    } else if (document.getElementById(fallbackView)) {
      navigateTo(fallbackView);
    }

    const todayLabel = document.getElementById('todayDateLabel');
    if (todayLabel) {
      const now = new Date();
      todayLabel.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }

    resetTaskForm();
    renderTasks();
    renderTimer();
    if (timerState.isRunning) {
      timerState.lastUpdated = Date.now();
      timerIntervalId = window.setInterval(handleTimerTick, 1000);
    }

    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
      taskForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const todayKey = getTodayKey();
        const title = (document.getElementById('taskTitle')?.value || '').trim();
        const description = document.getElementById('taskDescription')?.value || '';
        const plannedRaw = Number.parseInt(document.getElementById('taskPlanned')?.value, 10);
        const roundRaw = Number.parseInt(document.getElementById('taskRound')?.value, 10);
        if (!title) {
          setTimerStatus('Please add a title for your task.', 'warning');
          return;
        }
        const planned = Number.isFinite(plannedRaw) ? Math.max(0, plannedRaw) : TASK_DEFAULTS.planned;
        const assignedRound = Number.isFinite(roundRaw)
          ? Math.max(1, roundRaw)
          : getCurrentRound(todayKey);
        const existingTask = editingTaskId
          ? getTasksForDate(todayKey).find((task) => task.id === editingTaskId)
          : null;
        const completed = Number.isFinite(existingTask?.completed)
          ? Math.max(0, existingTask.completed)
          : TASK_DEFAULTS.completed;

        const payload = {
          id: editingTaskId || buildTaskId(),
          title,
          description,
          planned,
          completed,
          done: existingTask ? existingTask.done : false,
          assignedRound,
        };
        upsertTask(todayKey, payload);
        if (!getActiveTaskId(todayKey)) {
          setActiveTaskId(todayKey, payload.id);
        }
        renderTasks();
        resetTaskForm();
      });
    }

    const cancelEdit = document.getElementById('taskCancel');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', () => {
        resetTaskForm();
      });
    }

    const taskList = document.getElementById('taskList');
    if (taskList) {
      taskList.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-task-action]');
        if (!actionTarget) return;
        const todayKey = getTodayKey();
        const { taskId, taskAction } = actionTarget.dataset;
        if (!taskId) return;
        switch (taskAction) {
          case 'toggle':
            toggleTaskDone(todayKey, taskId);
            renderTasks();
            break;
          case 'delete':
            void showConfirm({
              message: 'Delete this task?',
              confirmLabel: 'Delete',
              cancelLabel: 'Cancel',
            }).then((confirmed) => {
              if (!confirmed) return;
              deleteTask(todayKey, taskId);
              renderTasks();
            });
            break;
          case 'edit': {
            const task = getTasksForDate(todayKey).find((item) => item.id === taskId);
            if (task) populateTaskForm(task);
            break;
          }
          case 'nextRound':
            updateTaskRound(todayKey, taskId, (getTasksForDate(todayKey).find((t) => t.id === taskId)?.assignedRound || 1) + 1);
            renderTasks();
            break;
          case 'activate':
            setActiveTaskId(todayKey, taskId);
            renderTasks();
            break;
          default:
            break;
        }
      });
    }

    $$('[data-timer-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        switchTimerMode(button.dataset.timerMode);
      });
    });

    $$('[data-timer-control]').forEach((button) => {
      button.addEventListener('click', () => {
        const { timerControl } = button.dataset;
        if (timerControl === 'start') {
          void ensureAlarmReady();
          startTimer();
        }
        if (timerControl === 'pause') pauseTimer();
        if (timerControl === 'reset') resetTimer({ resetStreak: true });
      });
    });

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
            PERSISTED_KEYS.forEach((key) => safeRemove(key));
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
