import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db, collection, query, where, onSnapshot, auth, orderBy, doc, getDoc, handleFirestoreError, OperationType } from '../lib/firebase';
import { Search, Edit, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: any;
  unreadCount?: { [uid: string]: number };
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  isOnline?: boolean;
  lastSeen?: any;
}

export default function ChatList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Chat[]);
      setLoading(false);
    }, (error) => {
      console.error('ChatList Error:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="max-w-2xl mx-auto h-screen flex flex-col bg-white border-x border-gray-200">
      <div className="p-6 border-b flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <Edit className="w-6 h-6" />
        </button>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search messages"
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-xl border-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading chats...</div>
        ) : chats.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No messages yet. Start a conversation!</div>
        ) : (
          chats.map(chat => (
            <ChatItem key={chat.id} chat={chat} />
          ))
        )}
      </div>
    </div>
  );
}

function ChatItem({ chat }: { chat: Chat }) {
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const currentUserId = auth.currentUser?.uid;
  const otherUserId = chat.participants.find(p => p !== currentUserId);
  const unread = chat.unreadCount?.[currentUserId || ''] || 0;

  useEffect(() => {
    if (!otherUserId) return;

    const unsubscribe = onSnapshot(doc(db, 'users', otherUserId), (docSnap) => {
      if (docSnap.exists()) {
        setOtherUser({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      }
    }, (error) => {
      console.error('ChatItem User Listener Error:', error);
      if (error.message.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.GET, `users/${otherUserId}`);
      }
    });

    return unsubscribe;
  }, [otherUserId]);

  if (!otherUser) return null;

  return (
    <Link
      to={`/messages/${chat.id}`}
      className={`flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors ${unread > 0 ? 'bg-blue-50/30' : ''}`}
    >
      <div className="relative">
        {otherUser.photoURL ? (
          <img
            src={otherUser.photoURL}
            alt={otherUser.displayName}
            className="w-14 h-14 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-200" />
        )}
        {otherUser.isOnline && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold truncate ${unread > 0 ? 'text-black' : 'text-gray-900'}`}>
              {otherUser.displayName}
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            {chat.lastMessageAt?.toDate ? formatDistanceToNow(chat.lastMessageAt.toDate(), { addSuffix: true }) : ''}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <p className={`text-sm truncate flex-1 ${unread > 0 ? 'text-black font-semibold' : 'text-gray-500'}`}>
            {chat.lastMessage || 'No messages yet'}
          </p>
          <div className="flex items-center gap-2">
            {!otherUser.isOnline && otherUser.lastSeen && (
              <span className="text-[10px] text-gray-400">
                {formatDistanceToNow(otherUser.lastSeen.toDate(), { addSuffix: true })}
              </span>
            )}
            {unread > 0 && (
              <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
