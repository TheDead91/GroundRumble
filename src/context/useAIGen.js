import { useContext } from 'react';
import { AIGenContext } from './AIGenContext';

export function useAIGen() {
  const context = useContext(AIGenContext);
  if (!context) throw new Error('useAIGen must be used within an AIGenProvider');
  return context;
}