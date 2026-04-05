import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, MapPin, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { auth, db, doc, updateDoc, increment, setDoc, deleteDoc, getDoc, OperationType, handleFirestoreError, addDoc, collection } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface PostCardProps {
  key?: string | number;
  post: {
    id: string;
    authorId: string;
    authorName: string;
    authorPhoto: string;
    content: string;
    title?: string;
    hashtags?: string[];
    location?: string;
    imageUrl: string;
    likesCount: number;
    commentsCount: number;
    createdAt: any;
  };
}

export default function PostCard({ post }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likes, setLikes] = useState(post.likesCount);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const checkSaved = async () => {
      try {
        const savedRef = doc(db, 'users', auth.currentUser!.uid, 'saved_posts', post.id);
        const savedSnap = await getDoc(savedRef);
        setIsSaved(savedSnap.exists());
      } catch (error) {}
    };
    checkSaved();
  }, [post.id]);

  const handleLike = async () => {
    if (!auth.currentUser) return;
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikes(prev => newLikedState ? prev + 1 : prev - 1);

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likesCount: increment(newLikedState ? 1 : -1)
      });

      // Trigger notification if liked
      if (newLikedState && post.authorId !== auth.currentUser?.uid) {
        await addDoc(collection(db, 'users', post.authorId, 'notifications'), {
          type: 'like',
          fromId: auth.currentUser?.uid,
          fromName: auth.currentUser?.displayName,
          fromPhoto: auth.currentUser?.photoURL,
          postId: post.id,
          read: false,
          createdAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);

    try {
      const savedRef = doc(db, 'users', auth.currentUser.uid, 'saved_posts', post.id);
      if (newSavedState) {
        await setDoc(savedRef, {
          ...post,
          savedAt: new Date()
        });
      } else {
        await deleteDoc(savedRef);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/saved_posts/${post.id}`);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', post.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
    }
  };

  const isOwner = auth.currentUser?.uid === post.authorId;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={post.authorPhoto || `https://ui-avatars.com/api/?name=${post.authorName}`}
            alt={post.authorName}
            className="w-8 h-8 rounded-full object-cover border border-gray-100"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">{post.authorName}</span>
            {post.location && (
              <div className="flex items-center gap-0.5 text-[10px] text-gray-500">
                <MapPin className="w-2.5 h-2.5" />
                <span>{post.location}</span>
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-gray-500 hover:text-black p-1">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-10"
              >
                {isOwner && (
                  <button 
                    onClick={handleDelete}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm font-semibold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Post
                  </button>
                )}
                <button className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm font-semibold">
                  Report
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Image */}
      {post.imageUrl && (
        <div className="relative aspect-square bg-gray-100">
          <motion.img
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            src={post.imageUrl}
            alt="Post content"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onDoubleClick={handleLike}
          />
        </div>
      )}

      {/* Actions */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button onClick={handleLike} className={`${isLiked ? 'text-red-500' : 'text-gray-700'} hover:opacity-70 transition-opacity`}>
              <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            <button className="text-gray-700 hover:opacity-70 transition-opacity">
              <MessageCircle className="w-6 h-6" />
            </button>
            <button className="text-gray-700 hover:opacity-70 transition-opacity">
              <Send className="w-6 h-6" />
            </button>
          </div>
          <button 
            onClick={handleSave}
            className={`${isSaved ? 'text-black' : 'text-gray-700'} hover:opacity-70 transition-opacity`}
          >
            <Bookmark className={`w-6 h-6 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Likes & Caption */}
        <div className="space-y-1">
          <p className="font-bold text-sm">{likes.toLocaleString()} likes</p>
          
          {post.title && (
            <p className="font-bold text-sm text-gray-900 mt-1">{post.title}</p>
          )}

          <p className="text-sm">
            <span className="font-bold mr-2">{post.authorName}</span>
            {post.content}
          </p>

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {post.hashtags.map((tag, idx) => (
                <span key={idx} className="text-blue-600 text-sm hover:underline cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 uppercase mt-2">
            {post.createdAt?.toDate ? formatDistanceToNow(post.createdAt.toDate()) : 'Just now'} ago
          </p>
        </div>
      </div>
    </div>
  );
}
