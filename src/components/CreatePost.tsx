import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Film, MapPin, Smile, Wand2, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { auth, db, collection, addDoc, serverTimestamp, storage, ref, uploadBytesResumable, getDownloadURL, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import VideoGenerator from './VideoGenerator';
import imageCompression from 'browser-image-compression';

export default function CreatePost({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [type, setType] = useState<'post' | 'reel'>('post');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<any>(null);

  const pendingPostRef = useRef<any>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      alert('Please select an image or video file.');
      return;
    }

    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
    }

    const localUrl = URL.createObjectURL(file);
    setImageUrl(localUrl);
    setRemoteUrl('');
    setType(isVideo ? 'reel' : 'post');
    setUploadProgress(0);
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
    const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${uploadFile.name}`);
    const uploadTask = uploadBytesResumable(storageRef, uploadFile);
    uploadTaskRef.current = uploadTask;

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        if (error.code === 'storage/canceled') return;
        console.error('Upload error:', error);
        setStatus('');
        setUploadProgress(null);
        alert('Upload failed. Please try again.');
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setRemoteUrl(downloadURL);
        setUploadProgress(null);
        setStatus('');
        uploadTaskRef.current = null;

        // If there's a pending post, create it now
        if (pendingPostRef.current) {
          try {
            await addDoc(collection(db, 'posts'), {
              ...pendingPostRef.current,
              imageUrl: downloadURL,
              createdAt: serverTimestamp(),
            });
            pendingPostRef.current = null;
          } catch (err) {
            console.error('Error creating pending post:', err);
          }
        }
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content && !imageUrl && !title) return;

    const user = auth.currentUser;
    if (!user) return;

    const hashtagList = hashtags
      .split(/[\s,]+/)
      .map(tag => tag.replace(/^#/, '').trim())
      .filter(tag => tag.length > 0);

    const postData = {
      authorId: user.uid,
      authorName: user.displayName,
      authorPhoto: user.photoURL,
      content,
      title,
      location,
      hashtags: hashtagList,
      type,
      likesCount: 0,
      commentsCount: 0,
    };

    // If upload is done or it's a manual URL, create immediately
    if (remoteUrl || (imageUrl && !imageUrl.startsWith('blob:'))) {
      setLoading(true);
      try {
        await addDoc(collection(db, 'posts'), {
          ...postData,
          imageUrl: remoteUrl || imageUrl,
          createdAt: serverTimestamp(),
        });
        onClose();
      } catch (error) {
        setLoading(false);
        console.error('Error creating post:', error);
        alert('Failed to share post. Please try again.');
      }
    } else if (imageUrl && uploadProgress !== null) {
      // Still uploading - save as pending and close modal immediately
      pendingPostRef.current = postData;
      onClose();
      // The uploadTask.on('complete') handler will take it from here
    } else if (!imageUrl && content) {
      // Text-only post
      setLoading(true);
      try {
        await addDoc(collection(db, 'posts'), {
          ...postData,
          imageUrl: '',
          createdAt: serverTimestamp(),
        });
        onClose();
      } catch (error) {
        setLoading(false);
        console.error('Error creating post:', error);
      }
    }
  };

  const handleVideoGenerated = (url: string) => {
    setImageUrl(url);
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
              disabled={loading || (!content && !imageUrl)}
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

        <div className="p-4">
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
                      onChange={handleFileUpload}
                    />
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Or paste media URL..."
                      className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
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

                  {imageUrl && (
                    <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 aspect-video bg-gray-100 relative group">
                      {type === 'post' ? (
                        <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <video src={imageUrl} className="w-full h-full object-cover" muted controls />
                      )}
                      <button 
                        onClick={() => setImageUrl('')}
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
