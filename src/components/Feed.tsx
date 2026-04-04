import React, { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import PostCard from './PostCard';
import ReelCard from './ReelCard';
import Stories from './Stories';

interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  title?: string;
  hashtags?: string[];
  location?: string;
  imageUrl: string;
  type: 'post' | 'reel';
  likesCount: number;
  commentsCount: number;
  createdAt: any;
}

export default function Feed({ type }: { type: 'post' | 'reel' }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'posts'),
      where('type', '==', type),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts');
      setLoading(false);
    });

    return unsubscribe;
  }, [type]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-xl mx-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-100 h-96 rounded-xl w-full"></div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6 p-4 max-w-xl mx-auto ${type === 'reel' ? 'h-screen overflow-y-scroll snap-y snap-mandatory' : ''}`}>
      {type === 'post' && <Stories />}
      
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="bg-gray-100 p-6 rounded-full mb-4">
            <Play className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">No {type}s yet</h2>
          <p className="text-gray-500">Be the first to share something with the world!</p>
        </div>
      ) : (
        posts.map((post) => (
          type === 'post' ? (
            <PostCard key={post.id} post={post} />
          ) : (
            <ReelCard key={post.id} reel={post} />
          )
        ))
      )}
    </div>
  );
}

import { Play } from 'lucide-react';
