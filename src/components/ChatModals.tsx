import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, UserPlus, Users, MessageCircle, Check } from 'lucide-react';
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, auth, doc, getDoc, limit } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  isOnline?: boolean;
}

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const [groupName, setGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const searchUsers = async () => {
      if (searchTerm.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      
      setLoading(true);
      try {
        const searchTerms = new Set([
          searchTerm.trim(),
          searchTerm.trim().toLowerCase(),
          searchTerm.trim().charAt(0).toUpperCase() + searchTerm.trim().slice(1).toLowerCase(),
          searchTerm.trim().toUpperCase()
        ]);

        const queries = Array.from(searchTerms).map(term => 
          query(
            collection(db, 'users'),
            where('displayName', '>=', term),
            where('displayName', '<=', term + '\uf8ff'),
            limit(10)
          )
        );

        const snapshots = await Promise.all(queries.map(q => getDocs(q)));
        const resultsMap = new Map();
        
        snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
            if (doc.id !== auth.currentUser?.uid) {
              resultsMap.set(doc.id, { uid: doc.id, ...doc.data() });
            }
          });
        });

        setSearchResults(Array.from(resultsMap.values()).slice(0, 20) as UserProfile[]);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setLoading(false);
      }
    };
    const timeout = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const toggleUser = (user: UserProfile) => {
    if (selectedUsers.find(u => u.uid === user.uid)) {
      setSelectedUsers(selectedUsers.filter(u => u.uid !== user.uid));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const createGroup = async () => {
    if (!groupName || selectedUsers.length === 0) return;
    setLoading(true);
    try {
      const participants = [auth.currentUser?.uid, ...selectedUsers.map(u => u.uid)];
      const chatRef = await addDoc(collection(db, 'chats'), {
        participants,
        isGroup: true,
        groupName,
        groupAdmin: auth.currentUser?.uid,
        lastMessage: 'Group created',
        lastMessageAt: serverTimestamp(),
        unreadCount: participants.reduce((acc: any, uid: string) => {
          acc[uid] = 0;
          return acc;
        }, {})
      });
      navigate(`/messages/${chatRef.id}`);
      onClose();
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
          <h2 className="text-lg font-bold">Create Group</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Group Name</label>
            <input
              type="text"
              placeholder="Enter group name..."
              className="w-full px-4 py-2 bg-gray-100 rounded-xl border-none focus:ring-2 focus:ring-purple-500 transition-all"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Add Members</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search users..."
                className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl border-none focus:ring-2 focus:ring-purple-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(user => (
                <div key={user.uid} className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium">
                  <span>{user.displayName}</span>
                  <button onClick={() => toggleUser(user)} className="p-0.5 hover:bg-purple-200 rounded-full">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {searchResults.map(user => (
              <button
                key={user.uid}
                onClick={() => toggleUser(user)}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <img src={user.photoURL} className="w-10 h-10 rounded-full object-cover" />
                <span className="flex-1 text-left font-medium">{user.displayName}</span>
                {selectedUsers.find(u => u.uid === user.uid) && (
                  <div className="bg-purple-600 text-white p-1 rounded-full">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={createGroup}
            disabled={loading || !groupName || selectedUsers.length === 0}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-purple-200"
          >
            {loading ? 'Creating...' : `Create Group (${selectedUsers.length + 1} members)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function UserInfoModal({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const startPrivateChat = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', auth.currentUser.uid),
        where('isGroup', '==', false)
      );
      const snap = await getDocs(q);
      const existingChat = snap.docs.find(doc => doc.data().participants.includes(user.uid));

      if (existingChat) {
        navigate(`/messages/${existingChat.id}`);
      } else {
        const chatRef = await addDoc(collection(db, 'chats'), {
          participants: [auth.currentUser.uid, user.uid],
          isGroup: false,
          lastMessage: 'Conversation started',
          lastMessageAt: serverTimestamp(),
          unreadCount: {
            [auth.currentUser.uid]: 0,
            [user.uid]: 0
          }
        });
        navigate(`/messages/${chatRef.id}`);
      }
      onClose();
    } catch (error) {
      console.error('Error starting private chat:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
      >
        <div className="relative h-32 bg-gradient-to-br from-purple-600 to-pink-500">
          <button onClick={onClose} className="absolute top-4 right-4 p-1 bg-black/20 hover:bg-black/30 text-white rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 pb-6 text-center -mt-12">
          <img 
            src={user.photoURL} 
            className="w-24 h-24 rounded-full object-cover border-4 border-white mx-auto shadow-lg"
            referrerPolicy="no-referrer"
          />
          <h2 className="mt-4 text-xl font-bold text-gray-900">{user.displayName}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {user.isOnline ? 'Online' : 'Offline'}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={startPrivateChat}
              disabled={loading || user.uid === auth.currentUser?.uid}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 disabled:opacity-50"
            >
              <MessageCircle className="w-5 h-5" />
              {loading ? 'Starting...' : 'Send Message'}
            </button>
            <button
              onClick={() => {
                navigate(`/profile/${user.uid}`);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
            >
              <Users className="w-5 h-5" />
              View Full Profile
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function GroupInfoModal({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const fetchParticipants = async () => {
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (chatSnap.exists()) {
          const uids = chatSnap.data().participants || [];
          const userPromises = uids.map((uid: string) => getDoc(doc(db, 'users', uid)));
          const userSnaps = await Promise.all(userPromises);
          setParticipants(userSnaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() })) as UserProfile[]);
        }
      } catch (error) {
        console.error('Error fetching participants:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchParticipants();
  }, [chatId]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
          <h2 className="text-lg font-bold">Group Info</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-4">Participants ({participants.length})</h3>
          <div className="space-y-3">
            {loading ? (
              <div className="p-4 text-center text-gray-400">Loading members...</div>
            ) : (
              participants.map(user => (
                <button
                  key={user.uid}
                  onClick={() => setSelectedUser(user)}
                  className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <div className="relative">
                    <img src={user.photoURL} className="w-12 h-12 rounded-full object-cover" />
                    {user.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900">{user.displayName}</p>
                    <p className="text-xs text-gray-500">{user.uid === auth.currentUser?.uid ? 'You' : (user.isOnline ? 'Online' : 'Offline')}</p>
                  </div>
                  {user.uid !== auth.currentUser?.uid && (
                    <MessageCircle className="w-5 h-5 text-purple-600" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedUser && (
          <UserInfoModal 
            user={selectedUser} 
            onClose={() => setSelectedUser(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
