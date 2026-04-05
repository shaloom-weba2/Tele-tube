import React, { createContext, useContext, useState, useRef } from 'react';
import { storage, ref, uploadBytesResumable, getDownloadURL, db, collection, addDoc, serverTimestamp, withTimeout } from '../lib/firebase';

interface UploadTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string;
  onComplete?: (url: string) => Promise<void>;
}

interface UploadContextType {
  tasks: UploadTask[];
  startUpload: (file: File, folder: string) => string; // returns task id
  attachCallback: (id: string, onComplete: (url: string) => Promise<void>) => void;
  removeTask: (id: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const startUpload = (file: File, folder: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const storageRef = ref(storage, `${folder}/${id}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const newTask: UploadTask = {
      id,
      fileName: file.name,
      progress: 0,
      status: 'uploading'
    };

    setTasks(prev => [...prev, newTask]);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setTasks(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
      },
      (error) => {
        console.error('Background upload error:', error);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error: error.message } : t));
      },
      async () => {
        try {
          const url = await withTimeout(getDownloadURL(uploadTask.snapshot.ref), 60000);
          
          setTasks(prev => {
            const task = prev.find(t => t.id === id);
            if (task?.onComplete) {
              task.onComplete(url).catch(err => console.error('Error in upload callback:', err));
            }
            return prev.map(t => t.id === id ? { ...t, status: 'completed', progress: 100, url } : t);
          });
          
          // Auto-remove completed tasks after 10 seconds if no error
          setTimeout(() => {
            removeTask(id);
          }, 10000);
        } catch (err) {
          console.error('Error finalizing background upload:', err);
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error: 'Finalization failed' } : t));
        }
      }
    );

    return id;
  };

  const attachCallback = (id: string, onComplete: (url: string) => Promise<void>) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === id);
      if (task && task.status === 'completed' && task.url) {
        // If already done, run immediately
        onComplete(task.url).catch(err => console.error('Error in immediate upload callback:', err));
        return prev;
      }
      return prev.map(t => t.id === id ? { ...t, onComplete } : t);
    });
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  return (
    <UploadContext.Provider value={{ tasks, startUpload, attachCallback, removeTask }}>
      {children}
      {/* Global Progress Indicator */}
      <div className="fixed top-0 left-0 right-0 z-[300] pointer-events-none">
        {tasks.map(task => (
          <div key={task.id} className="w-full h-1 bg-gray-100 overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${
                task.status === 'error' ? 'bg-red-500' : 
                task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        ))}
      </div>
      {/* Floating Status Toast */}
      <div className="fixed bottom-20 right-4 z-[300] flex flex-col gap-2 pointer-events-none">
        {tasks.filter(t => t.status !== 'completed' || t.progress < 100).map(task => (
          <div key={task.id} className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex items-center gap-3 pointer-events-auto min-w-[200px]">
            <div className="flex-1">
              <p className="text-[10px] font-bold text-gray-500 truncate max-w-[150px]">{task.fileName}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${task.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-400">{Math.round(task.progress)}%</span>
              </div>
            </div>
            {task.status === 'error' && (
              <button 
                onClick={() => removeTask(task.id)}
                className="p-1 hover:bg-gray-100 rounded-full text-red-500"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}
