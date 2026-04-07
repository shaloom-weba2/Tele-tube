import React, { useState, useEffect } from 'react';
import { db, collection, query, getDocs, deleteDoc, doc, onSnapshot, auth, updateDoc, setDoc, writeBatch, serverTimestamp } from '../lib/firebase';
import { Users, FileText, Trash2, Shield, AlertCircle, CheckCircle, Bell, Send, Settings, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'notifications' | 'settings'>('users');

  // Notification form state
  const [notifTarget, setNotifTarget] = useState<'all' | 'admin' | 'user' | 'online' | 'specific'>('all');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Settings state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('AdminDashboard Users Listener Error:', error);
    });

    const unsubscribePosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error('AdminDashboard Posts Listener Error:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribePosts();
    };
  }, []);

  const handleDeletePost = async (postId: string) => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await deleteDoc(doc(db, 'posts', postId));
      } catch (error) {
        console.error('Error deleting post:', error);
      }
    }
  };

  const handleToggleAdmin = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;

    setIsSending(true);
    try {
      const batch = writeBatch(db);
      let targetUsers = [];

      if (notifTarget === 'specific' && targetUserId) {
        targetUsers = users.filter(u => u.id === targetUserId);
      } else {
        targetUsers = users.filter(u => {
          if (notifTarget === 'all') return true;
          if (notifTarget === 'online') return u.isOnline;
          return (u.role || 'user') === notifTarget;
        });
      }

      targetUsers.forEach(user => {
        const notifRef = doc(collection(db, 'users', user.id, 'notifications'));
        batch.set(notifRef, {
          title: notifTitle,
          message: notifMessage,
          type: 'admin_broadcast',
          read: false,
          createdAt: serverTimestamp(),
          senderId: auth.currentUser?.uid,
          senderName: 'System Admin'
        });
      });

      await batch.commit();
      setSendSuccess(true);
      setNotifTitle('');
      setNotifMessage('');
      setTargetUserId(null);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (error) {
      console.error('Error sending notifications:', error);
    } finally {
      setIsSending(false);
    }
  };

  const openSpecificNotification = (userId: string) => {
    setNotifTarget('specific');
    setTargetUserId(userId);
    setActiveTab('notifications');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordError('');
    try {
      await setDoc(doc(db, 'admin_config', 'auth'), {
        password: newPassword,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating admin password:', error);
      setPasswordError('Failed to update password. Check permissions.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading admin dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-purple-600" />
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'users' ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Users className="w-5 h-5" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'posts' ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FileText className="w-5 h-5" />
          Posts ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'notifications' ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Bell className="w-5 h-5" />
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            activeTab === 'settings' ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Settings className="w-5 h-5" />
          Settings
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {activeTab === 'users' ? (
          <table className="w-full text-left">
            {/* ... users table content ... */}
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">User</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">Email</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">Role</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700">Status</th>
                <th className="px-6 py-4 text-sm font-bold text-gray-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                      <span className="font-medium">{user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.role || 'user'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-500">{user.isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => openSpecificNotification(user.id)}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Notify
                      </button>
                      <button
                        onClick={() => handleToggleAdmin(user.id, user.role)}
                        className="text-xs font-bold text-purple-600 hover:underline"
                      >
                        Toggle Admin
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : activeTab === 'posts' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {posts.map(post => (
              <div key={post.id} className="group relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                <img src={post.imageUrl} alt="" className="w-full aspect-video object-cover" referrerPolicy="no-referrer" />
                <div className="p-4">
                  <p className="text-sm font-bold truncate mb-1">{post.title || 'Untitled'}</p>
                  <p className="text-xs text-gray-500 mb-3">By {post.authorName}</p>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Post
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'notifications' ? (
          <div className="p-8 max-w-2xl mx-auto">
            {/* ... notifications form content ... */}
            <h2 className="text-xl font-bold mb-6">Send Global Notification</h2>
            <form onSubmit={handleSendNotification} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience</label>
                <div className="flex flex-wrap gap-3">
                  {(['all', 'admin', 'user', 'online', 'specific'] as const).map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => {
                        setNotifTarget(target);
                        if (target !== 'specific') setTargetUserId(null);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        notifTarget === target
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {target === 'all' ? 'All Users' : 
                       target === 'admin' ? 'Admins' : 
                       target === 'user' ? 'Regular Users' :
                       target === 'online' ? 'Online Users' : 'Specific User'}
                    </button>
                  ))}
                </div>
              </div>

              {notifTarget === 'specific' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Select User</label>
                  <select
                    value={targetUserId || ''}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                    required
                  >
                    <option value="" disabled>Select a user...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="e.g., System Maintenance"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Message</label>
                <textarea
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  placeholder="Enter your message here..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSending || (notifTarget === 'specific' && !targetUserId)}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-4 rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-50"
              >
                {isSending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Notification
                  </>
                )}
              </button>

              <AnimatePresence>
                {sendSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-xl font-medium"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Notifications sent successfully!
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </div>
        ) : (
          <div className="p-8 max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Admin Password
            </h2>
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              {passwordError && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 p-3 rounded-lg text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdatingPassword}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-4 rounded-xl font-bold hover:bg-purple-700 transition-all disabled:opacity-50 shadow-lg shadow-purple-200"
              >
                {isUpdatingPassword ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Update Password
                  </>
                )}
              </button>

              <AnimatePresence>
                {passwordSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-xl font-medium"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Password updated successfully!
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
