import { Loader, AlertCircle, XCircle, CheckCircle, Save } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  darkMode: boolean;
  saveStatus: 'synced' | 'pending' | 'saving' | 'error';
  onManualSave?: () => Promise<void> | void;
  isGroupProject?: boolean;
  connectionStatus?: 'connected' | 'disconnected' | 'connecting';
}

const Header: React.FC<HeaderProps> = ({
  darkMode,
  saveStatus,
  onManualSave,
  isGroupProject = false,
  connectionStatus = 'connected',
}) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveClick = async () => {
    if (isSaving || saveStatus === 'saving') return;
    
    setIsSaving(true);
    try {
      if (onManualSave) {
        await onManualSave();
      }
    } catch (error) {
      console.error('Manual save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderSaveStatus = () => {
    const baseClasses = 'text-xs flex items-center gap-1 transition-colors duration-300';
    
    switch (saveStatus) {
      case 'saving':
        return (
          <span className={`${baseClasses} ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            <Loader size={12} className="animate-spin" />
            Saving...
          </span>
        );
      case 'pending':
        return (
          <span className={`${baseClasses} ${darkMode ? 'text-yellow-400' : 'text-yellow-500'}`}>
            <AlertCircle size={12} />
            Unsaved
          </span>
        );
      case 'error':
        return (
          <span className={`${baseClasses} ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
            <XCircle size={12} />
            Error
          </span>
        );
      case 'synced':
      default:
        return (
          <span className={`${baseClasses} ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
            <CheckCircle size={12} />
            Saved
          </span>
        );
    }
  };

  const renderConnectionStatus = () => {
    const baseClasses = 'text-xs flex items-center gap-1 px-2 py-1 rounded font-medium';
    
    switch (connectionStatus) {
      case 'connecting':
        return (
          <div className={`${baseClasses} ${darkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-700'}`}>
            <Loader size={10} className="animate-spin" />
            Connecting
          </div>
        );
      case 'disconnected':
        return (
          <div className={`${baseClasses} ${darkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-700'}`}>
            <XCircle size={10} />
            Offline
          </div>
        );
      case 'connected':
      default:
        return (
          <div className={`${baseClasses} ${darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'}`}>
            <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
            Connected
          </div>
        );
    }
  };

  return (
    <div className={`border-b px-4 py-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        {/* Left Section - Status and Save */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Save Status */}
          <div className="hidden sm:block">
            {renderSaveStatus()}
          </div>

          {/* Manual Save Button */}
          <button
            onClick={handleSaveClick}
            disabled={isSaving || saveStatus === 'saving' || connectionStatus === 'disconnected'}
            title={
              connectionStatus === 'disconnected'
                ? 'Cannot save - offline'
                : isGroupProject
                ? 'Save to collaboration server'
                : 'Save changes to your notepad'
            }
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
              darkMode
                ? 'bg-blue-900 hover:bg-blue-800 disabled:bg-gray-700 disabled:opacity-50'
                : 'bg-blue-100 hover:bg-blue-200 disabled:bg-gray-200 disabled:opacity-50'
            } ${
              darkMode ? 'text-blue-200' : 'text-blue-700'
            } ${
              isSaving || saveStatus === 'saving' || connectionStatus === 'disconnected'
                ? 'cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            {isSaving || saveStatus === 'saving' ? (
              <>
                <Loader size={14} className="animate-spin" />
                <span className="hidden xs:inline">Saving...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span className="hidden xs:inline">Save</span>
              </>
            )}
          </button>

          {/* Group Project Badge */}
          {isGroupProject && (
            <div
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                darkMode
                  ? 'bg-purple-900 text-purple-200'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
              Collaborative
            </div>
          )}
        </div>

        {/* Right Section - Connection Status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            {renderConnectionStatus()}
          </div>

          {/* Mobile Save Status */}
          <div className="sm:hidden flex items-center gap-2">
            {renderSaveStatus()}
          </div>
        </div>
      </div>

      {/* Show connection warning on mobile if needed */}
      {connectionStatus === 'disconnected' && (
        <div className={`mt-2 text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
          ⚠ Offline - changes will sync when connection is restored
        </div>
      )}
    </div>
  );
};

export default Header;