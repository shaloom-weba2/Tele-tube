import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, doc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, auth, updateDoc, handleFirestoreError, OperationType, getDoc, increment, writeBatch } from '../lib/firebase';
import { ChevronLeft, Info, Send, Smile, Image as ImageIcon, Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  senderId: string;
  text: string;
  read?: boolean;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  isOnline?: boolean;
  lastSeen?: any;
}

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId || !auth.currentUser) return;

    // Fetch other user profile
    const fetchOtherUser = async () => {
      const chatSnap = await getDoc(doc(db, 'chats', chatId));
      if (chatSnap.exists()) {
        const participants = chatSnap.data().participants;
        const otherId = participants.find((p: string) => p !== auth.currentUser?.uid);
        if (otherId) {
          onSnapshot(doc(db, 'users', otherId), (docSnap) => {
            if (docSnap.exists()) {
              setOtherUser({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
            }
          });
        }
      }
    };
    fetchOtherUser();

    // Reset unread count for this user when they enter the chat
    const resetUnread = async () => {
      try {
        await updateDoc(doc(db, 'chats', chatId), {
          [`unreadCount.${auth.currentUser?.uid}`]: 0
        });
      } catch (error) {
        console.error('Error resetting unread count:', error);
      }
    };
    resetUnread();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      setMessages(newMessages);

      // Mark incoming messages as read
      const unreadIncoming = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.senderId !== auth.currentUser?.uid && !data.read;
      });

      if (unreadIncoming.length > 0) {
        const batch = writeBatch(db);
        unreadIncoming.forEach(doc => {
          batch.update(doc.ref, { read: true });
        });
        batch.commit().catch(err => console.error('Error marking messages as read:', err));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}/messages`);
    });

    return unsubscribe;
  }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;

    const text = newMessage;
    setNewMessage('');

    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      const chatData = chatSnap.data();
      const participants = chatData?.participants || [];

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: auth.currentUser?.uid,
        text,
        read: false,
        createdAt: serverTimestamp(),
      });

      const unreadUpdates: any = {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
      };

      participants.forEach((uid: string) => {
        if (uid !== auth.currentUser?.uid) {
          unreadUpdates[`unreadCount.${uid}`] = increment(1);
        }
      });

      await updateDoc(chatRef, unreadUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-screen flex flex-col bg-white border-x border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/messages')} className="p-1 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              {otherUser?.photoURL ? (
                <img
                  src={otherUser.photoURL}
                  alt={otherUser.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200" />
              )}
              {otherUser?.isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">{otherUser?.displayName || 'Chat'}</h2>
              <p className="text-[10px] text-gray-500">
                {otherUser?.isOnline ? (
                  <span className="text-green-500 font-medium">Online</span>
                ) : otherUser?.lastSeen ? (
                  `Last seen ${formatDistanceToNow(otherUser.lastSeen.toDate(), { addSuffix: true })}`
                ) : (
                  'Offline'
                )}
              </p>
            </div>
          </div>
        </div>
        <button className="p-1 hover:bg-gray-100 rounded-full">
          <Info className="w-6 h-6" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === auth.currentUser?.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col items-end gap-1 max-w-[70%]">
                <div
                  className={`p-3 rounded-2xl text-sm ${
                    isMe ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-100 text-black rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
                {isMe && (
                  <div className="flex items-center gap-1 pr-1">
                    {msg.read ? (
                      <CheckCheck className="w-3 h-3 text-blue-500" />
                    ) : (
                      <Check className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-[10px] text-gray-400">
                      {msg.read ? 'Read' : 'Sent'}
                    </span >
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t">
        <div className="flex items-center gap-3 bg-gray-50 rounded-full px-4 py-2 border border-gray-200 focus-within:border-blue-500 transition-colors">
          <button type="button" className="text-gray-500 hover:text-gray-700">
            <Smile className="w-6 h-6" />
          </button>
          <input
            type="text"
            placeholder="Message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <div className="flex gap-3">
            <button type="button" className="text-gray-500 hover:text-gray-700">
              <ImageIcon className="w-6 h-6" />
            </button>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="text-blue-500 font-bold hover:text-blue-600 disabled:opacity-50"
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
