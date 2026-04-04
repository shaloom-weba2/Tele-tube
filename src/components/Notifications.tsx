import React, { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, auth, doc, updateDoc, writeBatch, getDocs, deleteDoc } from '../lib/firebase';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageCircle, UserPlus, Bell, Trash2, CheckCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'admin_broadcast';
  fromId: string;
  fromName: string;
  fromPhoto: string;
  title?: string;
  message?: string;
  postId?: string;
  read: boolean;
  createdAt: any;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'notifications'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const markAllAsRead = async () => {
    if (!auth.currentUser) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
      const ref = doc(db, 'users', auth.currentUser!.uid, 'notifications', n.id);
      batch.update(ref, { read: true });
    });
    await batch.commit();
  };

  const deleteNotification = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!auth.currentUser) return;
    
    if (!n.read) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'notifications', n.id), {
        read: true
      });
    }

    if (n.type === 'follow') {
      navigate(`/profile/${n.fromId}`);
    } else if (n.postId) {
      // In a real app, you'd navigate to the post detail page
      // For now, we'll just go to the feed or profile
      navigate(`/profile/${auth.currentUser.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {notifications.some(n => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="text-sm font-semibold text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            <CheckCircle className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => handleNotificationClick(n)}
                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border ${
                  n.read ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-100 shadow-sm'
                }`}
              >
                <div className="relative">
                  <img
                    src={n.fromPhoto || `https://ui-avatars.com/api/?name=${n.fromName}`}
                    alt={n.fromName}
                    className="w-12 h-12 rounded-full object-cover border border-gray-200"
                    referrerPolicy="no-referrer"
                  />
                  <div className={`absolute -bottom-1 -right-1 p-1 rounded-full text-white ${
                    n.type === 'like' ? 'bg-red-500' : n.type === 'comment' ? 'bg-blue-500' : 'bg-green-500'
                  }`}>
                    {n.type === 'like' && <Heart className="w-3 h-3 fill-current" />}
                    {n.type === 'comment' && <MessageCircle className="w-3 h-3 fill-current" />}
                    {n.type === 'follow' && <UserPlus className="w-3 h-3" />}
                    {n.type === 'admin_broadcast' && <Shield className="w-3 h-3" />}
                  </div>
                </div>

                <div className="flex-1">
                  {n.type === 'admin_broadcast' ? (
                    <>
                      <p className="text-sm font-bold text-purple-600">{n.title || 'System Notification'}</p>
                      <p className="text-sm text-gray-700 mt-1">{n.message}</p>
                    </>
                  ) : (
                    <p className="text-sm">
                      <span className="font-bold">{n.fromName}</span>{' '}
                      {n.type === 'like' && 'liked your post'}
                      {n.type === 'comment' && 'commented on your post'}
                      {n.type === 'follow' && 'started following you'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {n.createdAt?.toDate ? formatDistanceToNow(n.createdAt.toDate()) : 'Just now'} ago
                  </p>
                </div>

                {!n.read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
