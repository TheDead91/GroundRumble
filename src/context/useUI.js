import { useContext } from 'react';
import { UIContext, ToastContext } from './UIContext';

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a UIProvider');
  }
  return context;
}