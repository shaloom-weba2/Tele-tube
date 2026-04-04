import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, onAuthStateChanged, db, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from './lib/firebase';
import Auth from './components/Auth';
import Feed from './components/Feed';
import Profile from './components/Profile';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import CreatePost from './components/CreatePost';
import Notifications from './components/Notifications';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import { Home, Search, PlusSquare, Play, MessageCircle, User, LogOut, Bell, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Check if user is admin
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        setIsAdmin(userData?.role === 'admin' || user.email === 'shaloomoficial250@gmail.com');
      } else {
        setIsAdmin(false);
        setAdminAuthenticated(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    // Presence logic
    const userRef = doc(db, 'users', user.uid);
    
    const setOnline = async () => {
      try {
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        console.error('Error setting online status:', error);
      }
    };

    const setOffline = async () => {
      try {
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        console.error('Error setting offline status:', error);
      }
    };

    setOnline();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setOnline();
      } else {
        setOffline();
      }
    };

    const handleBeforeUnload = () => {
      setOffline();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Heartbeat to keep lastSeen updated
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline();
      }
    }, 60000); // Every minute

    return () => {
      setOffline();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeat);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen for unread notifications
    const notificationsQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false)
    );
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    });

    // Listen for unread messages
    // This is a bit complex because messages are in subcollections.
    // For now, we'll listen to chats where the user is a participant and has unread messages.
    // A better way would be a global 'unread_messages' count or checking each chat.
    // Let's simplify: check all chats the user is in.
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    
    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      let totalUnread = 0;
      snapshot.docs.forEach(chatDoc => {
        const chatData = chatDoc.data();
        const unreadCount = chatData.unreadCount?.[user.uid] || 0;
        totalUnread += unreadCount;
      });
      setUnreadMessages(totalUnread);
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeChats();
    };
  }, [user]);

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <Router>
      <div className="flex min-h-screen bg-white">
        {/* Sidebar (Desktop) / Bottom Nav (Mobile) */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around px-4 z-50 md:relative md:h-screen md:w-64 md:flex-col md:items-start md:justify-start md:border-t-0 md:border-r md:px-6 md:py-8">
          <Link to="/" className="hidden md:block mb-10">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              SocialStream
            </h1>
          </Link>

          <div className="flex w-full justify-around md:flex-col md:gap-4">
            <NavLink to="/" icon={<Home />} label="Home" />
            <NavLink to="/explore" icon={<Search />} label="Explore" />
            <NavLink to="/reels" icon={<Play />} label="Reels" />
            <NavLink to="/messages" icon={<MessageCircle />} label="Messages" badge={unreadMessages} />
            <NavLink to="/notifications" icon={<Bell />} label="Notifications" badge={unreadNotifications} />
            <NavLink to={`/profile/${user.uid}`} icon={<User />} label="Profile" />
            <CreatePostTrigger />
          </div>

          <button
            onClick={() => auth.signOut()}
            className="hidden md:flex items-center gap-4 mt-auto p-3 w-full hover:bg-gray-100 rounded-lg transition-colors text-red-500"
          >
            <LogOut className="w-6 h-6" />
            <span className="font-medium">Logout</span>
          </button>
        </nav>

        {/* Main Content */}
        <main className="flex-1 pb-16 md:pb-0 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Feed type="post" />} />
            <Route path="/reels" element={<Feed type="reel" />} />
            <Route path="/profile/:userId" element={<Profile />} />
            <Route path="/messages" element={<ChatList />} />
            <Route path="/messages/:chatId" element={<ChatRoom />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route 
              path="/admin" 
              element={
                isAdmin ? (
                  adminAuthenticated ? (
                    <AdminDashboard />
                  ) : (
                    <AdminLogin onLogin={() => setAdminAuthenticated(true)} />
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
                    <Shield className="w-16 h-16 text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800">Access Denied</h1>
                    <p className="text-gray-500 mt-2">You do not have permission to access this area.</p>
                    <Link to="/" className="mt-6 text-blue-500 font-bold hover:underline">Return Home</Link>
                  </div>
                )
              } 
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function NavLink({ to, icon, label, badge }: { to: string; icon: React.ReactElement; label: string; badge?: number }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-200 relative ${
        isActive ? 'bg-gray-100 text-black font-bold' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <div className="relative">
        {React.cloneElement(icon, {
          className: `w-6 h-6 ${isActive ? 'fill-current' : ''}`,
        } as React.HTMLAttributes<HTMLElement>)}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white min-w-[18px] text-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="hidden md:block text-lg">{label}</span>
    </Link>
  );
}

function CreatePostTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-4 p-3 rounded-lg text-gray-600 hover:bg-gray-50 transition-all duration-200"
      >
        <PlusSquare className="w-6 h-6" />
        <span className="hidden md:block text-lg">Create</span>
      </button>
      <AnimatePresence>
        {isOpen && <CreatePost onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
