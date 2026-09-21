import React, { createContext, useState, useEffect, useCallback } from 'react';
import { redactSensitiveText, redactNotificationText, redactErrorText } from '../utils/redact';

/**
 * UIContext - Manages global UI state (tabs, sidebar, dialogs, toasts)
 * This replaces the scattered UI state in the monolithic App.jsx
 */
const UIContext = createContext(null);

const ToastContext = createContext(null);

/**
 * UIProvider - Provides UI state and actions to the component tree
 * Wraps the entire app and manages global UI state
 */
export function UIProvider({ children }) {
  const [activeTab, setActiveTab] = useState(() => {
    // Hydrate from localStorage on initial render
    return localStorage.getItem('atlas_active_tab') || 'dashboard';
  });
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('atlas_sidebar_collapsed') === 'true';
  });
  
  const [expandedNav, setExpandedNav] = useState(null);
  
  const [terminalOpen, setTerminalOpen] = useState(false);
  
  const [onboardingOpen, setOnboardingOpen] = useState(() => localStorage.getItem('atlas_onboarding_done') === null);
  
  const [tourRunning, setTourRunning] = useState(false);
  
  const [toasts, setToasts] = useState([]);
  
  const [notificationHistory, setNotificationHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('atlas_notifications') || '[]'); } catch { return []; }
  });
  
  const [confirmState, setConfirmState] = useState(null);
  const [dialogInput, setDialogInput] = useState('');

  // Persist activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('atlas_active_tab', activeTab);
  }, [activeTab]);

  // Persist sidebarCollapsed to localStorage
  useEffect(() => {
    localStorage.setItem('atlas_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist notification history
  const persistNotifications = useCallback((next) => {
    setNotificationHistory(next);
    localStorage.setItem('atlas_notifications', JSON.stringify(next));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    // Choke point for error-echo redaction: every toast is redacted here so a
    // provider-echoed secret can never reach the transient toast OR the
    // persistent atlas_notifications log, regardless of which callsite forgot.
    // The transient toast keeps the broader redactor (users debugging auth need
    // real error text); the persistent log gets the stricter notification
    // redactor so no unredacted string is ever written to localStorage.
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = { 
      id, 
      message: type === 'error' ? redactErrorText(message) : redactSensitiveText(message), 
      type, 
      time: Date.now() 
    };
    setToasts(prev => [...prev, entry]);
    persistNotifications(prev => {
      const next = [{ ...entry, message: redactNotificationText(message) }, ...prev].slice(0, 30);
      return next;
    });
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, [persistNotifications]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    persistNotifications([]);
  }, [persistNotifications]);

  const askConfirm = useCallback((message, options = {}) => {
    setDialogInput('');
    return new Promise((resolve) => {
      setConfirmState({
        type: 'confirm',
        message,
        cancelText: options.cancelText,
        primaryText: options.primaryText,
        resolve,
      });
    });
  }, []);

  const askInput = useCallback((message, defaultValue = '', inputType = 'text') => {
    setDialogInput(defaultValue);
    return new Promise((resolve) => {
      setConfirmState({ type: 'prompt', message, defaultValue, inputType, resolve });
    });
  }, []);

  const askChoice = useCallback((message, options = {}) => {
    const {
      cancelText = 'Cancel',
      secondaryText = 'Save anyway',
      primaryText = 'Set up encryption',
      primaryColor = 'btn-primary'
    } = options;
    return new Promise((resolve) => {
      setConfirmState({
        type: 'choice',
        message,
        cancelText,
        secondaryText,
        primaryText,
        primaryColor,
        resolve
      });
    });
  }, []);

  const resolveDialog = useCallback((val) => {
    setConfirmState(prev => {
      if (prev) prev.resolve(val);
      return null;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('atlas_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  const clearSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    localStorage.setItem('atlas_sidebar_collapsed', 'false');
  }, []);

  const openSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    localStorage.setItem('atlas_sidebar_collapsed', 'false');
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarCollapsed(true);
    localStorage.setItem('atlas_sidebar_collapsed', 'true');
  }, []);

  const jumpTo = useCallback((tab, tour) => {
    setActiveTab(tab);
    setTimeout(() => {
      if (tour) {
        const el = document.querySelector(`[data-tour="${tour}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 180);
  }, []);

  const finishOnboarding = useCallback(() => {
    localStorage.setItem('atlas_onboarding_done', 'true');
    setOnboardingOpen(false);
  }, []);

  // ToastContext value
  const toastValue = {
    toasts,
    addToast,
    removeToast,
    notificationHistory,
    clearNotifications,
  };

  // UIContext value
  const uiValue = {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    clearSidebar,
    openSidebar,
    closeSidebar,
    expandedNav,
    setExpandedNav,
    terminalOpen,
    setTerminalOpen,
    onboardingOpen,
    setOnboardingOpen,
    tourRunning,
    setTourRunning,
    confirmState,
    setConfirmState,
    dialogInput,
    setDialogInput,
    addToast,
    removeToast,
    clearNotifications,
    askConfirm,
    askInput,
    askChoice,
    resolveDialog,
    jumpTo,
    finishOnboarding,
    toasts,
    notificationHistory,
  };

  return (
    <ToastContext.Provider value={toastValue}>
      <UIContext.Provider value={uiValue}>
        {children}
      </UIContext.Provider>
    </ToastContext.Provider>
  );
}

export { UIContext, ToastContext };