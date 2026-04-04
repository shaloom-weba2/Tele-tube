import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Send, Upload, Loader2 } from 'lucide-react';
import { auth, db, collection, addDoc, serverTimestamp, storage, ref, uploadBytesResumable, getDownloadURL } from '../lib/firebase';
import { motion } from 'motion/react';
import imageCompression from 'browser-image-compression';

export default function CreateStory({ onClose }: { onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    setLoading(true);
    setStatus('Optimizing image...');
    const user = auth.currentUser;
    if (!user) return;

    // Compress image
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

    setStatus('Uploading to cloud...');
    const storageRef = ref(storage, `stories/${user.uid}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
        if (progress === 100) setStatus('Finalizing...');
      },
      (error) => {
        console.error('Upload error:', error);
        setLoading(false);
        setStatus('');
        setUploadProgress(null);
        alert('Upload failed. Please try again.');
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setImageUrl(downloadURL);
        setLoading(false);
        setStatus('');
        setUploadProgress(null);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) return;

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await addDoc(collection(db, 'stories'), {
        authorId: user.uid,
        authorName: user.displayName,
        authorPhoto: user.photoURL,
        imageUrl,
        expiresAt,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      console.error('Error creating story:', error);
    } finally {
      setLoading(false);
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

        <div className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Story Image</label>
            
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
                accept="image/*"
                onChange={handleFileUpload}
              />
            </div>

            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Or paste image URL..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
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

          {imageUrl && (
            <div className="mb-6 rounded-xl overflow-hidden border border-gray-200 aspect-[9/16] bg-gray-100 max-h-[400px] relative group">
              <img
                src={imageUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setImageUrl('')}
                className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !imageUrl}
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
