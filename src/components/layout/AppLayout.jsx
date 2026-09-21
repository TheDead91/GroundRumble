import React from 'react';
import { Sidebar } from '../Sidebar';
import { ToastContainer } from '../ToastContainer';
import { ConfirmDialog } from '../ConfirmDialog';
import { useUI } from '../../context/useUI';

/**
 * AppLayout - Main application layout with sidebar and main content area
 * Wraps the entire application layout
 */
export function AppLayout({ children }) {
  const ui = useUI();
  
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar 
        activeTab={ui.activeTab}
        setActiveTab={ui.setActiveTab}
        sidebarCollapsed={ui.sidebarCollapsed}
        toggleSidebar={ui.toggleSidebar}
      />
      
      <main style={{ flexGrow: 1, minWidth: 0, padding: '40px', overflowY: 'auto', maxHeight: '100vh' }}>
        {children}
      </main>
      
      <ToastContainer 
        toasts={ui.toasts}
        removeToast={ui.removeToast}
      />
      <ConfirmDialog 
        confirmState={ui.confirmState}
        setConfirmState={ui.setConfirmState}
        resolveDialog={ui.resolveDialog}
      />
    </div>
  );
}

export default AppLayout;