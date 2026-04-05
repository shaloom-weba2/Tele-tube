import React, { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, Send, Music, UserPlus, MapPin, Bookmark, MoreVertical, Trash2, Volume2, VolumeX } from 'lucide-react';
import { auth, db, doc, updateDoc, increment, setDoc, deleteDoc, getDoc, OperationType, handleFirestoreError, addDoc, collection } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ReelCardProps {
  key?: string | number;
  reel: {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string;
    content: string;
    title?: string;
    hashtags?: string[];
    location?: string;
    imageUrl: string; // Using imageUrl as video URL for simplicity in this demo
    likesCount: number;
    commentsCount: number;
  };
}

export default function ReelCard({ reel }: ReelCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [likes, setLikes] = useState(reel.likesCount);
  const [showMenu, setShowMenu] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const checkSaved = async () => {
      try {
        const savedRef = doc(db, 'users', auth.currentUser!.uid, 'saved_posts', reel.id);
        const savedSnap = await getDoc(savedRef);
        setIsSaved(savedSnap.exists());
      } catch (error) {}
    };
    checkSaved();
  }, [reel.id]);

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.6, // Play when 60% of the video is visible
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (videoRef.current) {
          if (entry.isIntersecting) {
            videoRef.current.play().catch((error) => {
              // Autoplay might be blocked by browser policies
              console.warn("Autoplay failed:", error);
            });
          } else {
            videoRef.current.pause();
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, options);

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => {
      if (videoRef.current) {
        observer.unobserve(videoRef.current);
      }
      observer.disconnect();
    };
  }, []);

  const handleLike = async () => {
    if (!auth.currentUser) return;
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikes(prev => newLikedState ? prev + 1 : prev - 1);
    try {
      await updateDoc(doc(db, 'posts', reel.id), {
        likesCount: increment(newLikedState ? 1 : -1)
      });

      // Trigger notification if liked
      if (newLikedState && reel.authorId !== auth.currentUser?.uid) {
        await addDoc(collection(db, 'users', reel.authorId, 'notifications'), {
          type: 'like',
          fromId: auth.currentUser?.uid,
          fromName: auth.currentUser?.displayName,
          fromPhoto: auth.currentUser?.photoURL,
          postId: reel.id,
          read: false,
          createdAt: new Date()
        });
      }
    } catch (error) {}
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);

    try {
      const savedRef = doc(db, 'users', auth.currentUser.uid, 'saved_posts', reel.id);
      if (newSavedState) {
        await setDoc(savedRef, {
          ...reel,
          savedAt: new Date()
        });
      } else {
        await deleteDoc(savedRef);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/saved_posts/${reel.id}`);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this reel?')) return;
    try {
      await deleteDoc(doc(db, 'posts', reel.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${reel.id}`);
    }
  };

  const isOwner = auth.currentUser?.uid === reel.authorId;

  return (
    <div className="relative h-[calc(100vh-64px)] md:h-[calc(100vh-40px)] w-full bg-black snap-start flex items-center justify-center overflow-hidden rounded-xl">
      <video
        ref={videoRef}
        src={reel.imageUrl}
        className="h-full w-full object-cover"
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
      />

      {/* Mute/Unmute Toggle */}
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setIsMuted(!isMuted);
        }}
        className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition-all z-20"
      >
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </button>

      {/* Overlay Info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
        <div className="flex items-center gap-3 mb-3">
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={reel.authorPhoto || `https://ui-avatars.com/api/?name=${reel.authorName}`}
            alt={reel.authorName}
            className="w-10 h-10 rounded-full border-2 border-white"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold">{reel.authorName}</span>
              {!isOwner && (
                <button className="px-3 py-0.5 border border-white rounded-md text-[10px] font-bold hover:bg-white/20 transition-colors">
                  Follow
                </button>
              )}
            </div>
            {reel.location && (
              <div className="flex items-center gap-1 text-[10px] text-gray-300">
                <MapPin className="w-2.5 h-2.5" />
                <span>{reel.location}</span>
              </div>
            )}
          </div>
        </div>

        {reel.title && (
          <p className="font-bold text-sm mb-1">{reel.title}</p>
        )}

        <p className="text-sm mb-2 line-clamp-2">{reel.content}</p>

        {reel.hashtags && reel.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {reel.hashtags.map((tag, idx) => (
              <span key={idx} className="text-blue-400 text-xs font-semibold hover:underline cursor-pointer">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <Music className="w-3 h-3" />
          <span>Original Audio - {reel.authorName}</span>
        </div>
      </div>

      {/* Side Actions */}
      <div className="absolute right-4 bottom-20 flex flex-col items-center gap-6 text-white">
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <MoreVertical className="w-8 h-8" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute right-full mr-2 bottom-0 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-10 overflow-hidden"
              >
                {isOwner && (
                  <button 
                    onClick={handleDelete}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Reel
                  </button>
                )}
                <button className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm font-semibold">
                  Report
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-col items-center">
          <button onClick={handleLike} className={`p-2 rounded-full transition-colors ${isLiked ? 'text-red-500' : 'text-white'}`}>
            <Heart className={`w-8 h-8 ${isLiked ? 'fill-current' : ''}`} />
          </button>
          <span className="text-xs font-bold">{likes.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <MessageCircle className="w-8 h-8" />
          </button>
          <span className="text-xs font-bold">{reel.commentsCount}</span>
        </div>
        <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
          <Send className="w-8 h-8" />
        </button>
        <button onClick={handleSave} className={`p-2 rounded-full transition-colors ${isSaved ? 'text-white' : 'text-white/60'}`}>
          <Bookmark className={`w-8 h-8 ${isSaved ? 'fill-current' : ''}`} />
        </button>
      </div>
    </div>
  );
}
