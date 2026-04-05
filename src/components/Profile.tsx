import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, doc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot, auth, handleFirestoreError, OperationType, updateDoc, increment, setDoc, deleteDoc, signOut, addDoc, storage, ref, uploadBytesResumable, getDownloadURL, serverTimestamp, updateProfile } from '../lib/firebase';
import PostCard from './PostCard';
import { Grid, Play, Bookmark, Settings, UserPlus, UserMinus, X, Camera, LogOut, Heart, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [isEditing, setIsEditing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });

    const q = query(
      collection(db, 'posts'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts');
      setLoading(false);
    });

    // Check if following
    let unsubscribeFollow: any;
    if (auth.currentUser && auth.currentUser.uid !== userId) {
      const followQuery = query(
        collection(db, 'follows'),
        where('followerId', '==', auth.currentUser.uid),
        where('followingId', '==', userId)
      );
      unsubscribeFollow = onSnapshot(followQuery, (snapshot) => {
        setIsFollowing(!snapshot.empty);
      });
    }

    // Fetch saved posts if it's own profile
    let unsubscribeSaved: any;
    if (auth.currentUser && auth.currentUser.uid === userId) {
      const savedQ = query(
        collection(db, 'users', userId, 'saved_posts'),
        orderBy('savedAt', 'desc')
      );
      unsubscribeSaved = onSnapshot(savedQ, (snapshot) => {
        setSavedPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }

    // Fetch followers
    const followersQ = query(collection(db, 'follows'), where('followingId', '==', userId));
    const unsubscribeFollowers = onSnapshot(followersQ, async (snapshot) => {
      const followerIds = snapshot.docs.map(d => d.data().followerId);
      const followerData = await Promise.all(followerIds.map(async (id) => {
        const d = await getDoc(doc(db, 'users', id));
        return { id, ...d.data() };
      }));
      setFollowers(followerData);
    });

    // Fetch following
    const followingQ = query(collection(db, 'follows'), where('followerId', '==', userId));
    const unsubscribeFollowing = onSnapshot(followingQ, async (snapshot) => {
      const followingIds = snapshot.docs.map(d => d.data().followingId);
      const followingData = await Promise.all(followingIds.map(async (id) => {
        const d = await getDoc(doc(db, 'users', id));
        return { id, ...d.data() };
      }));
      setFollowing(followingData);
    });

    return () => {
      unsubscribeProfile();
      unsubscribe();
      if (unsubscribeFollow) unsubscribeFollow();
      if (unsubscribeSaved) unsubscribeSaved();
      unsubscribeFollowers();
      unsubscribeFollowing();
    };
  }, [userId]);

  const handleFollow = async () => {
    if (!auth.currentUser || !userId) return;
    const followId = `${auth.currentUser.uid}_${userId}`;
    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId));
        await updateDoc(doc(db, 'users', userId), { followersCount: increment(-1) });
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { followingCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: auth.currentUser.uid,
          followingId: userId,
          createdAt: new Date()
        });
        await updateDoc(doc(db, 'users', userId), { followersCount: increment(1) });
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { followingCount: increment(1) });

        // Trigger notification
        await addDoc(collection(db, 'users', userId, 'notifications'), {
          type: 'follow',
          fromId: auth.currentUser.uid,
          fromName: auth.currentUser.displayName,
          fromPhoto: auth.currentUser.photoURL,
          read: false,
          createdAt: new Date()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'follows');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleMessage = async () => {
    if (!auth.currentUser || !userId) return;
    
    try {
      // Check if chat already exists
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef,
        where('participants', 'array-contains', auth.currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      let existingChatId = null;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.participants.includes(userId)) {
          existingChatId = doc.id;
        }
      });
      
      if (existingChatId) {
        navigate(`/messages/${existingChatId}`);
      } else {
        // Create new chat
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [auth.currentUser.uid, userId],
          lastMessage: '',
          lastMessageAt: serverTimestamp(),
          unreadCount: {
            [auth.currentUser.uid]: 0,
            [userId]: 0
          }
        });
        navigate(`/messages/${newChatRef.id}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chats');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!profile) return <div className="p-8 text-center">User not found</div>;

  const isOwnProfile = auth.currentUser?.uid === userId;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
        <div className="relative group">
          <img
            src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}`}
            alt={profile.displayName}
            className="w-24 h-24 md:w-40 md:h-40 rounded-full object-cover border-4 border-white shadow-lg"
            referrerPolicy="no-referrer"
          />
          {isOwnProfile && (
            <button 
              onClick={() => setIsEditing(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="w-8 h-8 text-white" />
            </button>
          )}
        </div>
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <h1 className="text-2xl font-light">{profile.displayName}</h1>
            <div className="flex gap-2 justify-center">
              {isOwnProfile ? (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Edit Profile
                  </button>
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors relative"
                  >
                    <Settings className="w-5 h-5" />
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50"
                        >
                          <button 
                            onClick={handleLogout}
                            className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm font-semibold"
                          >
                            <LogOut className="w-4 h-4" />
                            Log Out
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </>
              ) : (
                <div className="flex gap-2 justify-center">
                  <button 
                    onClick={handleFollow}
                    className={`px-6 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                      isFollowing 
                        ? 'bg-gray-100 hover:bg-gray-200 text-black' 
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="w-4 h-4" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Follow
                      </>
                    )}
                  </button>
                  <button 
                    onClick={handleMessage}
                    className="px-6 py-1.5 bg-gray-100 hover:bg-gray-200 text-black rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Message
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center md:justify-start gap-8 mb-6">
            <div className="text-center md:text-left">
              <span className="font-bold">{posts.length}</span> posts
            </div>
            <button onClick={() => setShowFollowers(true)} className="text-center md:text-left hover:opacity-70 transition-opacity">
              <span className="font-bold">{profile.followersCount || 0}</span> followers
            </button>
            <button onClick={() => setShowFollowing(true)} className="text-center md:text-left hover:opacity-70 transition-opacity">
              <span className="font-bold">{profile.followingCount || 0}</span> following
            </button>
          </div>

          <div>
            <p className="font-bold">{profile.displayName}</p>
            <p className="text-gray-600 whitespace-pre-wrap">{profile.bio || 'No bio yet.'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-t border-gray-200">
        <div className="flex justify-center gap-12 -mt-px">
          <TabButton
            active={activeTab === 'posts'}
            onClick={() => setActiveTab('posts')}
            icon={<Grid className="w-4 h-4" />}
            label="POSTS"
          />
          <TabButton
            active={activeTab === 'reels'}
            onClick={() => setActiveTab('reels')}
            icon={<Play className="w-4 h-4" />}
            label="REELS"
          />
          {isOwnProfile && (
            <TabButton
              active={activeTab === 'saved'}
              onClick={() => setActiveTab('saved')}
              icon={<Bookmark className="w-4 h-4" />}
              label="SAVED"
            />
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-1 md:gap-4 mt-8">
        {(activeTab === 'saved' ? savedPosts : posts)
          .filter(p => (activeTab === 'reels' ? p.type === 'reel' : p.type === 'post'))
          .map(post => (
            <div key={post.id} className="relative aspect-square group cursor-pointer overflow-hidden rounded-lg">
              <img
                src={post.imageUrl}
                alt="Post"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-6 font-bold">
                <div className="flex items-center gap-1">
                  <Heart className="w-5 h-5 fill-current" />
                  {post.likesCount}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <EditProfileModal 
            profile={profile} 
            onClose={() => setIsEditing(false)} 
            onUpdate={(updated) => setProfile({ ...profile, ...updated })}
          />
        )}
        {showFollowers && (
          <UserListModal 
            title="Followers" 
            users={followers} 
            onClose={() => setShowFollowers(false)} 
          />
        )}
        {showFollowing && (
          <UserListModal 
            title="Following" 
            users={following} 
            onClose={() => setShowFollowing(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UserListModal({ title, users, onClose }: any) {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="w-8" />
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No users found</div>
          ) : (
            users.map((user: any) => (
              <div 
                key={user.id} 
                onClick={() => { navigate(`/profile/${user.id}`); onClose(); }}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors"
              >
                <img
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`}
                  alt={user.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="font-semibold">{user.displayName}</span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

function EditProfileModal({ profile, onClose, onUpdate }: any) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large (max 5MB)");
      return;
    }
    
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    const storageRef = ref(storage, `profiles/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload error:", error);
        setError("Upload failed. Please try again.");
        setUploading(false);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setPhotoURL(downloadURL);
        setUploading(false);
        setUploadProgress(0);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName,
        bio,
        photoURL
      });
      
      // Sync with Firebase Auth
      await updateProfile(auth.currentUser, {
        displayName,
        photoURL
      });

      onUpdate({ displayName, bio, photoURL });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
          <h2 className="text-lg font-bold">Edit Profile</h2>
          <button
            onClick={handleSubmit}
            disabled={saving || uploading}
            className="text-blue-500 font-bold hover:text-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <img
                src={photoURL || `https://ui-avatars.com/api/?name=${displayName}`}
                alt="Preview"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-100 shadow-sm"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
              {uploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-full">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
                  <span className="text-[10px] text-white font-bold">{Math.round(uploadProgress)}%</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-500 text-sm font-bold hover:text-blue-600 transition-colors"
            >
              Change Profile Photo
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <div className="w-full space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase">Photo URL (Optional)</label>
              <input
                type="text"
                placeholder="Or paste an image URL"
                className="w-full p-2 bg-gray-50 rounded-lg border border-gray-200 text-sm focus:ring-1 focus:ring-blue-500 transition-all"
                value={photoURL}
                onChange={(e) => {
                  setPhotoURL(e.target.value);
                  setError(null);
                }}
              />
              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Display Name</label>
            <input
              type="text"
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Bio</label>
            <textarea
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all min-h-[100px] resize-none"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
            />
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 py-4 border-t-2 transition-colors text-xs font-bold tracking-widest ${
        active ? 'border-black text-black' : 'border-transparent text-gray-400'
      }`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
