import React, { useState, useEffect } from 'react';
import { X, Key, Brain, Image, Search, Check, Eye, EyeOff, Shield, Zap } from 'lucide-react';

interface ApiKeys {
  llm: string;
  image_or_video: string;
  webSearch: string;
  embedding: string;
}

interface ServiceConfig {
  key: keyof ApiKeys;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  description: string;
  color: string;
}

const services: ServiceConfig[] = [
  {
    key: 'llm',
    label: 'LLM Provider',
    icon: <Brain className="w-5 h-5 text-black" />,
    placeholder: 'sk-xxxxxxxxxxxxxxxxx',
    description: 'openrouter : https://openrouter.ai/settings/keys',
    color: 'bg-gray-200'
  },
  // {
  //   key: 'image_or_video',
  //   label: 'Image Generation',
  //   icon: <Image className="w-5 h-5 text-black" />,
  //   placeholder: 'img-xxxxxxxxxxxxxxxxx',
  //   description: 'Fal ai : https://fal.ai/dashboard/keys',
  //   color: 'bg-gray-200'
  // },
  {
    key: 'webSearch',
    label: 'Web Search',
    icon: <Search className="w-5 h-5 text-black" />,
    placeholder: 'search-xxxxxxxxxxxxxxxxx',
    description: 'Tavily : https://app.tavily.com/home',
    color: 'bg-gray-200'
  },
];

const ApiKeyOverlay = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    llm: '',
    image_or_video: '',
    webSearch: '',
    embedding: ''
  });
  const [visibleKeys, setVisibleKeys] = useState<Record<keyof ApiKeys, boolean>>({
    llm: false,
    image_or_video: false,
    webSearch: false,
    embedding: false
  });
  const [savedKeys, setSavedKeys] = useState<Record<keyof ApiKeys, boolean>>({
    llm: false,
    image_or_video: false,
    webSearch: false,
    embedding: false
  });
  const [isAnimating, setIsAnimating] = useState(false);

  const loadSavedKeys = () => {
    const savedApiKeys: Partial<ApiKeys> = {};
    const savedStates: Partial<Record<keyof ApiKeys, boolean>> = {};
    
    try {
      const allKeys = localStorage.getItem('allApiKeys');
      if (allKeys) {
        const parsedKeys = JSON.parse(allKeys);
        Object.keys(parsedKeys).forEach(key => {
          if (key in apiKeys) {
            savedApiKeys[key as keyof ApiKeys] = parsedKeys[key];
            savedStates[key as keyof ApiKeys] = true;
          }
        });
      }
    } catch {
      // fallback ignored here
    }
    
    Object.keys(apiKeys).forEach(key => {
      const serviceKey = key as keyof ApiKeys;
      if (!savedApiKeys[serviceKey]) {
        const savedKey = localStorage.getItem(`apiKey_${key}`);
        if (savedKey) {
          savedApiKeys[serviceKey] = savedKey;
          savedStates[serviceKey] = true;
        }
      }
    });
    
    // Update state with loaded keys
    setApiKeys(prev => ({
      ...prev,
      ...Object.keys(savedApiKeys).reduce((acc, key) => ({
        ...acc,
        [key]: savedApiKeys[key as keyof ApiKeys] || ''
      }), {})
    }));
    
    setSavedKeys(prev => ({
      ...prev,
      ...Object.keys(savedStates).reduce((acc, key) => ({
        ...acc,
        [key]: savedStates[key as keyof ApiKeys] || false
      }), {})
    }));
  };

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      // Reload keys from localStorage when modal opens
      loadSavedKeys();
      const timer = setTimeout(() => setIsAnimating(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Initial load on component mount
  useEffect(() => {
    loadSavedKeys();
  }, []);

  // Listen for localStorage changes (when keys are removed externally)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (e.key.startsWith('apiKey_') || e.key === 'allApiKeys')) {
        loadSavedKeys();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleKeyChange = (service: keyof ApiKeys, value: string) => {
    setApiKeys(prev => ({ ...prev, [service]: value }));
    if (savedKeys[service]) {
      setSavedKeys(prev => ({ ...prev, [service]: false }));
    }
  };

  const toggleKeyVisibility = (service: keyof ApiKeys) => {
    setVisibleKeys(prev => ({ ...prev, [service]: !prev[service] }));
  };

  const saveKey = (service: keyof ApiKeys) => {
    if (apiKeys[service].trim()) {
      localStorage.setItem(`apiKey_${service}`, apiKeys[service]);
      setSavedKeys(prev => ({ ...prev, [service]: true }));
      console.log(`${service} API key saved successfully`);
    }
  };

  const deleteKey = (service: keyof ApiKeys) => {
    // Remove from localStorage
    localStorage.removeItem(`apiKey_${service}`);
    
    // Update allApiKeys in localStorage
    try {
      const allKeys = localStorage.getItem('allApiKeys');
      if (allKeys) {
        const parsedKeys = JSON.parse(allKeys);
        delete parsedKeys[service];
        if (Object.keys(parsedKeys).length > 0) {
          localStorage.setItem('allApiKeys', JSON.stringify(parsedKeys));
        } else {
          localStorage.removeItem('allApiKeys');
        }
      }
    } catch {
      // ignore errors
    }
    
    // Update component state
    setApiKeys(prev => ({ ...prev, [service]: '' }));
    setSavedKeys(prev => ({ ...prev, [service]: false }));
    console.log(`${service} API key deleted successfully`);
  };

  const saveAllKeys = () => {
    let savedCount = 0;
    
    Object.keys(apiKeys).forEach(key => {
      const serviceKey = key as keyof ApiKeys;
      if (apiKeys[serviceKey].trim()) {
        localStorage.setItem(`apiKey_${key}`, apiKeys[serviceKey]);
        setSavedKeys(prev => ({ ...prev, [serviceKey]: true }));
        savedCount++;
      }
    });
    
    const keysToSave = Object.entries(apiKeys)
      .filter(([, value]) => value.trim())
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(keysToSave).length > 0) {
      localStorage.setItem('allApiKeys', JSON.stringify(keysToSave));
      localStorage.setItem('apiKeysLastUpdated', new Date().toISOString());
    }
    
    console.log(`Successfully saved ${savedCount} API keys to localStorage`);
    return savedCount;
  };

  const completedKeys = Object.values(savedKeys).filter(Boolean).length;
  const totalKeys = services.length;

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-white text-black p-4 rounded-full shadow-md hover:shadow-lg transform hover:scale-110 transition-all duration-300 z-50 group border border-gray-300"
        aria-label="Open API Key Settings"
      >
        <Key className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
        {completedKeys < totalKeys && (
          <div className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center animate-pulse font-semibold">
            {totalKeys - completedKeys}
          </div>
        )}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/10 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-3xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="relative overflow-hidden bg-gray-100 p-8 text-black rounded-t-3xl border-b border-gray-300">
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-gray-300 rounded-2xl">
                    <Shield className="w-8 h-8 text-black" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold">Configure API Keys</h2>
                    <p className="text-gray-700 mt-1">Secure your access to AI services</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-300 rounded-xl transition-colors duration-200"
                  aria-label="Close API Key Settings"
                >
                  <X className="w-6 h-6 text-black" />
                </button>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2 text-gray-700">
                  <span>Setup Progress</span>
                  <span>{completedKeys}/{totalKeys} completed</span>
                </div>
                <div className="w-full bg-gray-300 rounded-full h-2">
                  <div 
                    className="bg-black h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(completedKeys / totalKeys) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-6">
                {services.map((service, index) => (
                  <div
                    key={service.key}
                    className={`group relative ${service.color} p-1 rounded-2xl transform transition-all duration-300 hover:scale-[1.02] ${
                      isAnimating ? 'animate-in slide-in-from-left-5' : ''
                    }`}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="bg-white rounded-2xl p-6 border border-gray-300">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-3 rounded-xl bg-gray-300 text-black">
                            {service.icon}
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg text-black">
                              {service.label}
                            </h3>
                            <p className="text-gray-700 text-sm">
                              {service.description}
                            </p>
                          </div>
                        </div>
                        {savedKeys[service.key] && (
                          <div className="flex items-center space-x-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                            <Check className="w-4 h-4" />
                            <span>Saved</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="relative">
                        <input
                          type={visibleKeys[service.key] ? 'text' : 'password'}
                          value={apiKeys[service.key]}
                          onChange={(e) => handleKeyChange(service.key, e.target.value)}
                          placeholder={service.placeholder}
                          className="w-full px-4 py-3 pr-32 border border-gray-300 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent bg-white text-black placeholder-gray-400 transition-all duration-200"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                          <button
                            onClick={() => toggleKeyVisibility(service.key)}
                            className="p-2 text-gray-500 hover:text-black rounded-lg hover:bg-gray-200 transition-colors duration-200"
                            aria-label={visibleKeys[service.key] ? "Hide API key" : "Show API key"}
                          >
                            {visibleKeys[service.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          {apiKeys[service.key] && !savedKeys[service.key] && (
                            <button
                              onClick={() => saveKey(service.key)}
                              className="p-2 text-black hover:text-gray-800 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                              aria-label="Save API key"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {savedKeys[service.key] && (
                            <button
                              onClick={() => deleteKey(service.key)}
                              className="p-2 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors duration-200"
                              aria-label="Delete API key"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-300 p-6 bg-gray-50 rounded-b-3xl">
              <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-2 text-sm text-gray-700">
                  <Shield className="w-4 h-4" />
                  <span>Keys are stored securely in your browser</span>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-6 py-2 border border-gray-300 text-black rounded-xl hover:bg-gray-200 transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const savedCount = saveAllKeys();
                      if (savedCount > 0) {
                        console.log(`✅ All API keys saved! You can now use the service.`);
                      }
                      setIsOpen(false);
                    }}
                    className="px-6 py-2 bg-black text-white rounded-xl hover:bg-gray-900 transition-all duration-200 flex items-center space-x-2 shadow-lg"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Save & Start</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ApiKeyOverlay;