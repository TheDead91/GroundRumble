import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

const AuditContext = createContext(null);

/**
 * AuditProvider - Manages running audit state, progress, results, and console logs
 */
export function AuditProvider({ children }) {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [currentTestName, setCurrentTestName] = useState('');

  const auditAbortRef = useRef(null);
  const auditRunTokenRef = useRef(0);

  const addConsoleLog = useCallback((entry) => {
    setConsoleLogs(prev => [...prev, entry]);
  }, []);

  const clearConsoleLogs = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  const value = {
    running,
    setRunning,
    stopping,
    setStopping,
    progress,
    setProgress,
    consoleLogs,
    addConsoleLog,
    clearConsoleLogs,
    results,
    setResults,
    currentTestName,
    setCurrentTestName,
    auditAbortRef,
    auditRunTokenRef,
  };

  return (
    <AuditContext.Provider value={value}>
      {children}
    </AuditContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useAudit() {
  const context = useContext(AuditContext);
  if (!context) throw new Error('useAudit must be used within an AuditProvider');
  return context;
}

export { AuditContext };