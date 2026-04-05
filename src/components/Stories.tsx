import React, { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, auth } from '../lib/firebase';
import { Plus } from 'lucide-react';
import StoryViewer from './StoryViewer';
import CreateStory from './CreateStory';
import { AnimatePresence, motion } from 'motion/react';

interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  imageUrl: string;
  type?: 'image' | 'video';
  expiresAt: any;
  createdAt: any;
}

export default function Stories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedUserStories, setSelectedUserStories] = useState<Story[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const q = query(
      collection(db, 'stories'),
      where('expiresAt', '>', now),
      orderBy('expiresAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Story[];
      setStories(storiesData);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Group stories by author
  const groupedStories = stories.reduce((acc, story) => {
    if (!acc[story.authorId]) {
      acc[story.authorId] = [];
    }
    acc[story.authorId].push(story);
    return acc;
  }, {} as Record<string, Story[]>);

  const authors = Object.keys(groupedStories);

  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl mb-6 overflow-x-auto no-scrollbar">
      {/* Create Story Button */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <button
          onClick={() => setIsCreateOpen(true)}
          className="relative w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 to-fuchsia-600"
        >
          <div className="w-full h-full rounded-full bg-white p-0.5">
            <img
              src={auth.currentUser?.photoURL || ''}
              alt="Me"
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </div>
          <div className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full p-1 border-2 border-white">
            <Plus className="w-3 h-3" />
          </div>
        </button>
        <span className="text-xs text-gray-500">Your Story</span>
      </div>

      {/* Other Users' Stories */}
      {authors.map((authorId) => {
        const userStories = groupedStories[authorId];
        const firstStory = userStories[0];
        return (
          <div key={authorId} className="flex flex-col items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setSelectedUserStories(userStories)}
              className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 to-fuchsia-600"
            >
              <div className="w-full h-full rounded-full bg-white p-0.5">
                <img
                  src={firstStory.authorPhoto || `https://ui-avatars.com/api/?name=${firstStory.authorName}`}
                  alt={firstStory.authorName}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              </div>
            </button>
            <span className="text-xs text-gray-500 truncate w-16 text-center">{firstStory.authorName}</span>
          </div>
        );
      })}

      <AnimatePresence>
        {selectedUserStories && (
          <StoryViewer
            stories={selectedUserStories}
            onClose={() => setSelectedUserStories(null)}
          />
        )}
        {isCreateOpen && (
          <CreateStory onClose={() => setIsCreateOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
