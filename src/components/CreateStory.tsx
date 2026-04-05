import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Send, Upload, Loader2 } from 'lucide-react';
import { auth, db, collection, addDoc, serverTimestamp, storage, ref, uploadBytesResumable, getDownloadURL } from '../lib/firebase';
import { useUpload } from '../context/UploadContext';
import { motion, AnimatePresence } from 'motion/react';
import imageCompression from 'browser-image-compression';

export default function CreateStory({ onClose }: { onClose: () => void }) {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload, attachCallback, tasks } = useUpload();
  const currentTask = tasks.find(t => t.id === activeTaskId);
  const uploadProgress = currentTask?.progress ?? null;
  const uploadedUrl = currentTask?.url ?? null;

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setError(null);

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setError('Please select an image or video file.');
      return;
    }

    // Size limits
    if (isVideo && file.size > 50 * 1024 * 1024) {
      setError('Video size must be less than 50MB.');
      return;
    }
    if (isImage && file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB.');
      return;
    }

    setLoading(true);
    const user = auth.currentUser;
    if (!user) return;

    // Compress image if it's an image
    if (isImage) {
      setStatus('Optimizing image...');
      try {
        const options = {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1080,
          useWebWorker: true,
        };
        file = await imageCompression(file, options);
      } catch (error) {
        console.error('Compression error:', error);
      }
      setMediaType('image');
    } else {
      setMediaType('video');
    }

    setStatus('Uploading to cloud...');
    const taskId = startUpload(file, `stories/${user.uid}`);
    setActiveTaskId(taskId);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mediaUrl) {
      setError('Please select an image or video for your story.');
      return;
    }

    if (mediaUrl.startsWith('blob:') && uploadProgress !== null) {
      setError('Please wait for the upload to complete.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const storyData = {
        authorId: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        type: mediaType,
        expiresAt,
        createdAt: serverTimestamp(),
      };

      if (uploadedUrl || (mediaUrl && !mediaUrl.startsWith('blob:'))) {
        await addDoc(collection(db, 'stories'), {
          ...storyData,
          imageUrl: uploadedUrl || mediaUrl,
        });
        onClose();
      } else if (activeTaskId && currentTask?.status === 'uploading') {
        attachCallback(activeTaskId, async (url) => {
          await addDoc(collection(db, 'stories'), {
            ...storyData,
            imageUrl: url,
          });
        });
        onClose();
      } else {
        setError('Please wait for the upload to complete or try again.');
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error creating story:', error);
      setError(error instanceof Error ? error.message : 'Failed to share story. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-600" />
          </button>
          <h2 className="text-lg font-bold">Add to Story</h2>
          <div className="w-8" /> {/* Spacer */}
        </div>

        <div 
          className="p-6 relative"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-purple-500/10 backdrop-blur-[2px] border-2 border-dashed border-purple-500 rounded-b-2xl flex flex-col items-center justify-center pointer-events-none"
              >
                <Upload className="w-12 h-12 text-purple-500 mb-2 animate-bounce" />
                <p className="text-purple-600 font-bold">Drop to upload story</p>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2"
            >
              <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
              <span className="flex-1">{error}</span>
            </motion.div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Story Media</label>
            
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Image/Video
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>

            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Or paste media URL..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                value={mediaUrl}
                onChange={(e) => {
                  setMediaUrl(e.target.value);
                  setMediaType(e.target.value.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image');
                }}
              />
            </div>
          </div>

          {uploadProgress !== null && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{status || 'Uploading...'}</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {mediaUrl && (
            <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 aspect-[9/16] bg-gray-100 max-h-[400px] relative group">
              {mediaType === 'image' ? (
                <img
                  src={mediaUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video
                  src={mediaUrl}
                  className="w-full h-full object-cover"
                  controls
                />
              )}
              <button 
                onClick={() => setMediaUrl('')}
                className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !mediaUrl}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-bold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && !uploadProgress ? 'Sharing...' : (
              <>
                <Send className="w-5 h-5" />
                Share to Story
              </>
            )}
          </button>
          <p className="text-center text-xs text-gray-500 mt-4">
            Stories disappear after 24 hours.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
