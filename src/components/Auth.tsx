import React, { useState, useEffect } from 'react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  db, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc
} from '../lib/firebase';
import { LogIn, LogOut, Mail, Lock, User as UserIcon, ShieldCheck, AlertCircle, ArrowRight, Github } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AuthMode = 'login' | 'signup' | 'verify';

export default function Auth() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user && user.emailVerified) {
        // Create user document if it doesn't exist
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email,
            photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=random`,
            bio: '',
            followersCount: 0,
            followingCount: 0,
            createdAt: serverTimestamp(),
          });
        }
      } else if (user && !user.emailVerified) {
        // If user is logged in but not verified, show verify screen
        setMode('verify');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsProcessing(true);
      setError('');
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      
      // Generate a verification code (6 digits)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store code in Firestore
      await addDoc(collection(db, 'verification_codes'), {
        email,
        code,
        createdAt: serverTimestamp()
      });

      // In a real app, you'd send this via email.
      // For this demo, we'll show it as a debug message.
      setDebugCode(code);
      setMode('verify');
    } catch (error: any) {
      console.error('Signup error:', error);
      setError(error.message || 'Failed to sign up');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        // Check if we have a code for this user
        const q = query(collection(db, 'verification_codes'), where('email', '==', email));
        const snap = await getDocs(q);
        if (snap.empty) {
          // Generate new code if none exists
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          await addDoc(collection(db, 'verification_codes'), {
            email,
            code,
            createdAt: serverTimestamp()
          });
          setDebugCode(code);
        } else {
          setDebugCode(snap.docs[0].data().code);
        }
        setMode('verify');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to sign in');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) return;

    try {
      setIsProcessing(true);
      setError('');
      
      const q = query(
        collection(db, 'verification_codes'), 
        where('email', '==', auth.currentUser?.email),
        where('code', '==', verificationCode)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Code is correct!
        // In a real app, you'd use Firebase's built-in email verification.
        // Since we're simulating it, we'll just proceed.
        // Note: We can't manually set emailVerified to true on the client side.
        // So for this demo, we'll just "trust" the code and proceed to create the user doc.
        
        const user = auth.currentUser;
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email,
            photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=random`,
            bio: '',
            followersCount: 0,
            followingCount: 0,
            createdAt: serverTimestamp(),
            emailVerified: true // Custom flag since we can't set auth.emailVerified
          });

          // Delete the code
          const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
          
          // Force a reload or just let the useEffect handle it
          window.location.reload();
        }
      } else {
        setError('Invalid verification code');
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      setError(error.message || 'Failed to verify code');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMode('login');
      setDebugCode(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
          <p className="text-gray-500 font-medium animate-pulse">Initializing SocialStream...</p>
        </div>
      </div>
    );
  }

  // If user is logged in and verified (or has our custom flag), don't show auth
  // Note: In a real app, you'd check user.emailVerified. 
  // For this demo, we'll assume if they have a user doc, they are "verified".
  if (user && (user.emailVerified || mode === 'login')) {
    // We need to check if the user doc exists to be sure
    // But for now, we'll let App.tsx handle the authenticated state
    // This component only renders when App.tsx says !user
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-purple-100 overflow-hidden border border-gray-100"
      >
        <div className="p-10">
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-200"
            >
              <LogIn className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-4xl font-black tracking-tight mb-3 bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              SocialStream
            </h1>
            <p className="text-gray-500 font-medium">
              {mode === 'login' ? 'Welcome back! Please enter your details.' : 
               mode === 'signup' ? 'Create an account to get started.' : 
               'Verify your email address.'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'verify' ? (
              <motion.form
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyCode}
                className="space-y-6"
              >
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5" />
                  <p className="text-sm text-blue-700 leading-relaxed">
                    We've sent a 6-digit verification code to <span className="font-bold">{auth.currentUser?.email}</span>.
                  </p>
                </div>

                {debugCode && (
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Debug Mode (Code Sent):</p>
                    <p className="text-2xl font-mono font-black text-amber-800 tracking-[0.5em]">{debugCode}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 ml-1">Verification Code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all text-center text-2xl font-mono tracking-widest"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-2xl text-sm font-bold">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessing || verificationCode.length < 6}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition-all disabled:opacity-50 shadow-lg shadow-purple-200"
                >
                  {isProcessing ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Verify Account
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-sm font-bold text-gray-500 hover:text-purple-600 transition-colors"
                >
                  Use a different account
                </button>
              </motion.form>
            ) : (
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <form onSubmit={mode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-5">
                  {mode === 'signup' && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 ml-1">Full Name</label>
                      <div className="relative">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all font-medium"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="hello@example.com"
                        className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-purple-100 focus:border-purple-500 outline-none transition-all font-medium"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-2xl text-sm font-bold">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-4 rounded-2xl font-bold hover:bg-purple-700 transition-all disabled:opacity-50 shadow-lg shadow-purple-200"
                  >
                    {isProcessing ? (
                      <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        {mode === 'login' ? 'Sign In' : 'Create Account'}
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-400 font-bold tracking-widest">Or continue with</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-white border-2 border-gray-100 hover:border-purple-200 hover:bg-purple-50 rounded-2xl font-bold transition-all duration-200 text-gray-700"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                    Google
                  </button>
                </div>

                <div className="text-center">
                  <button
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="text-sm font-bold text-gray-500 hover:text-purple-600 transition-colors"
                  >
                    {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
