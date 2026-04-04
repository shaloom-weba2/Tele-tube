import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, onAuthStateChanged, db, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from './lib/firebase';
import Auth from './components/Auth';
import Feed from './components/Feed';
import Profile from './components/Profile';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import CreatePost from './components/CreatePost';
import Notifications from './components/Notifications';
import UserSearch from './components/Search';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import { Home, Search, PlusSquare, Play, MessageCircle, User, LogOut, Bell, Shield, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-gray-50">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            We've encountered an unexpected error. Please try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all"
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-gray-100 rounded-lg text-left text-xs overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function SidebarSearchInput() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  return (
    <div className="hidden md:block mb-8 px-2">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Search users..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && term.trim()) {
              navigate(`/explore?q=${encodeURIComponent(term)}`);
              setTerm('');
            }
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log('App: Auth state changed:', user?.email, 'Verified:', user?.emailVerified);
      
      if (user) {
        // Listen to user document for role and verification status
        const userRef = doc(db, 'users', user.uid);
        unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            console.log('App: User doc loaded:', userData.email, 'Verified:', userData.emailVerified);
            setIsAdmin(userData?.role === 'admin' || user.email === 'shaloomoficial250@gmail.com');
            setIsEmailVerified(user.emailVerified || userData?.emailVerified === true);
          } else {
            console.log('App: User doc does not exist yet');
            setIsEmailVerified(user.emailVerified);
          }
          setIsAuthReady(true);
        }, (error) => {
          console.error("App: Error listening to user doc:", error);
          setIsEmailVerified(user.emailVerified);
          setIsAuthReady(true);
        });
      } else {
        if (unsubscribeUserDoc) unsubscribeUserDoc();
        setUser(null);
        setIsAdmin(false);
        setAdminAuthenticated(false);
        setIsEmailVerified(false);
        setIsAuthReady(true);
      }
      setUser(user);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
          <p className="text-gray-500 font-medium animate-pulse">Loading TeleTube...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!user || !isEmailVerified ? (
        <Auth />
      ) : (
        <Router>
      <div className="flex min-h-screen bg-white">
        {/* Sidebar (Desktop) / Bottom Nav (Mobile) */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around px-4 z-50 md:relative md:h-screen md:w-64 md:flex-col md:items-start md:justify-start md:border-t-0 md:border-r md:px-6 md:py-8">
          <Link to="/" className="hidden md:block mb-10">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              TeleTube
            </h1>
          </Link>

          <SidebarSearchInput />

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
            <Route path="/explore" element={<UserSearch />} />
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
    )}
  </ErrorBoundary>
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
