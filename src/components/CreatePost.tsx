import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Film, MapPin, Smile, Wand2, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { auth, db, collection, addDoc, serverTimestamp, storage, ref, uploadBytesResumable, getDownloadURL, handleFirestoreError, OperationType } from '../lib/firebase';
import { useUpload } from '../context/UploadContext';
import { motion, AnimatePresence } from 'motion/react';
import VideoGenerator from './VideoGenerator';
import imageCompression from 'browser-image-compression';

export default function CreatePost({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [location, setLocation] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [type, setType] = useState<'post' | 'reel'>('post');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { startUpload, attachCallback, tasks } = useUpload();
  const currentTask = tasks.find(t => t.id === activeTaskId);
  const uploadProgress = currentTask?.progress ?? null;

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setError(null);

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
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

    const localUrl = URL.createObjectURL(file);
    setMediaUrl(localUrl);
    setUploadedUrl('');
    setType(isVideo ? 'reel' : 'post');
    setStatus(isImage ? 'Optimizing image...' : 'Preparing video...');

    const user = auth.currentUser;
    if (!user) return;

    let uploadFile = file;
    if (isImage && file.size > 1024 * 1024) {
      try {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          initialQuality: 0.6,
        };
        uploadFile = await imageCompression(file, options);
      } catch (error) {
        console.error('Compression error:', error);
      }
    }

    setStatus('Uploading...');
    const taskId = startUpload(uploadFile, `uploads/${user.uid}`);
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
    
    // Validation
    if (!content.trim() && !mediaUrl && !title.trim()) {
      setError('Please add some content, a title, or an image/video.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('You must be logged in to share content.');
      return;
    }

    setLoading(true);
    setError(null);

    const hashtagList = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.replace(/^#/, '').trim())
      .filter(tag => tag.length > 0);

    const postData = {
      authorId: user.uid,
      authorName: user.displayName,
      authorPhoto: user.photoURL,
      content: content.trim(),
      title: title.trim(),
      location: location.trim(),
      hashtags: hashtagList,
      type,
      likesCount: 0,
      commentsCount: 0,
    };

    try {
      // Case 1: Upload is already done or it's a manual URL
      if (uploadedUrl || (mediaUrl && !mediaUrl.startsWith('blob:'))) {
        await addDoc(collection(db, 'posts'), {
          ...postData,
          imageUrl: uploadedUrl || mediaUrl,
          createdAt: serverTimestamp(),
        });
        onClose();
      } 
      // Case 2: Still uploading - attach callback and close modal immediately
      else if (activeTaskId && currentTask?.status === 'uploading') {
        attachCallback(activeTaskId, async (url) => {
          await addDoc(collection(db, 'posts'), {
            ...postData,
            imageUrl: url,
            createdAt: serverTimestamp(),
          });
        });
        onClose();
      } 
      // Case 3: Text-only post
      else if (!mediaUrl && (content.trim() || title.trim())) {
        await addDoc(collection(db, 'posts'), {
          ...postData,
          imageUrl: '',
          createdAt: serverTimestamp(),
        });
        onClose();
      }
      // Case 4: Image selected but upload hasn't started or failed
      else if (mediaUrl && mediaUrl.startsWith('blob:') && !activeTaskId) {
        setLoading(false);
        setError('Media upload failed to start. Please try re-uploading.');
      }
      else {
        setLoading(false);
        setError('Unable to share post. Please check your inputs.');
      }
    } catch (error) {
      setLoading(false);
      console.error('Error creating post:', error);
      setError(error instanceof Error ? error.message : 'Failed to share post. Please try again.');
    }
  };

  const handleVideoGenerated = (url: string) => {
    setMediaUrl(url);
    setUploadedUrl(url); // AI generated video is already a remote URL
    setType('reel');
    setShowGenerator(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b">
          {showGenerator ? (
            <button onClick={() => setShowGenerator(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
          ) : (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-6 h-6 text-gray-600" />
            </button>
          )}
          <h2 className="text-lg font-bold">
            {showGenerator ? 'AI Video Generator' : `Create New ${type === 'post' ? 'Post' : 'Reel'}`}
          </h2>
          {!showGenerator ? (
            <button
              onClick={handleSubmit}
              disabled={loading || (!content && !mediaUrl)}
              className="text-blue-500 font-bold hover:text-blue-600 disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadProgress !== null ? `Uploading ${Math.round(uploadProgress)}%` : 'Sharing...'}</span>
                </div>
              ) : 'Share'}
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>

        <div 
          className="p-4 relative"
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
                className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-[2px] border-2 border-dashed border-blue-500 rounded-b-2xl flex flex-col items-center justify-center pointer-events-none"
              >
                <Upload className="w-12 h-12 text-blue-500 mb-2 animate-bounce" />
                <p className="text-blue-600 font-bold">Drop to upload media</p>
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

          <AnimatePresence mode="wait">
            {showGenerator ? (
              <motion.div
                key="generator"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <VideoGenerator onVideoGenerated={handleVideoGenerated} />
              </motion.div>
            ) : (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="flex gap-4 mb-6">
                  <button
                    onClick={() => setType('post')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      type === 'post' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    Post
                  </button>
                  <button
                    onClick={() => setType('reel')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                      type === 'reel' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    Reel
                  </button>
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <img
                    src={auth.currentUser?.photoURL || ''}
                    alt="Me"
                    className="w-10 h-10 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                  <textarea
                    placeholder="What's on your mind?"
                    className="flex-1 resize-none border-none focus:ring-0 text-lg min-h-[100px]"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>

                <div className="space-y-3 mb-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Add a title..."
                      className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm font-semibold"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Add location..."
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">#</span>
                      <input
                        type="text"
                        placeholder="Hashtags (e.g. travel, food)"
                        className="w-full pl-7 pr-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                        value={hashtags}
                        onChange={(e) => setHashtags(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Media</label>
                    <button
                      onClick={() => setShowGenerator(true)}
                      className="text-xs font-bold text-purple-600 flex items-center gap-1 hover:text-purple-700 transition-colors"
                    >
                      <Wand2 className="w-3 h-3" />
                      Generate with AI
                    </button>
                  </div>
                  
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Upload from Device
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
                    <input
                      type="text"
                      placeholder="Or paste media URL..."
                      className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                      value={mediaUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMediaUrl(val);
                        setUploadedUrl(''); // Reset uploaded URL if manual input
                        if (val.match(/\.(mp4|webm|ogg)$/i)) {
                          setType('reel');
                        } else if (val.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                          setType('post');
                        }
                      }}
                    />
                  </div>

                  {uploadProgress !== null && (
                    <div className="mt-4">
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
                    <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 aspect-video bg-gray-100 relative group">
                      {type === 'post' ? (
                        <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <video src={mediaUrl} className="w-full h-full object-cover" muted controls />
                      )}
                      <button 
                        onClick={() => {
                          setMediaUrl('');
                          setUploadedUrl('');
                        }}
                        className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex gap-4">
                    <button onClick={() => fileInputRef.current?.click()} className="text-gray-500 hover:text-blue-500 transition-colors">
                      <ImageIcon className="w-6 h-6" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="text-gray-500 hover:text-blue-500 transition-colors">
                      <Film className="w-6 h-6" />
                    </button>
                    <button className="text-gray-500 hover:text-blue-500 transition-colors">
                      <MapPin className="w-6 h-6" />
                    </button>
                    <button className="text-gray-500 hover:text-blue-500 transition-colors">
                      <Smile className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
