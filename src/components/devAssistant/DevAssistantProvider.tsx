import React, { createContext, useContext, useState, ReactNode } from 'react';
import { DevAssistantPanel } from './DevAssistantPanel';

interface DevAssistantContextValue {
  isEnabled: boolean;
  enable: () => void;
  disable: () => void;
}

const DevAssistantContext = createContext<DevAssistantContextValue | null>(null);

const ENABLED_STORAGE_KEY = 'dev-assistant-enabled';

export const useDevAssistantContext = () => {
  const context = useContext(DevAssistantContext);
  // Return safe defaults if context is not available (prevents crash during hot reload)
  if (!context) {
    return {
      isEnabled: false,
      enable: () => {},
      disable: () => {}
    };
  }
  return context;
};

interface DevAssistantProviderProps {
  children: ReactNode;
}

export const DevAssistantProvider: React.FC<DevAssistantProviderProps> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    return localStorage.getItem(ENABLED_STORAGE_KEY) === 'true';
  });

  const enable = () => {
    localStorage.setItem(ENABLED_STORAGE_KEY, 'true');
    setIsEnabled(true);
  };

  const disable = () => {
    localStorage.removeItem(ENABLED_STORAGE_KEY);
    setIsEnabled(false);
  };

  return (
    <DevAssistantContext.Provider value={{ isEnabled, enable, disable }}>
      {children}
      {isEnabled && <DevAssistantPanel />}
    </DevAssistantContext.Provider>
  );
};
