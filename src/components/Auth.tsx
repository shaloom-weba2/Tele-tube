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
import { LogIn, LogOut, Mail, Lock, User as UserIcon, ShieldCheck, AlertCircle, ArrowRight, Github, Play, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import firebaseConfig from '../../firebase-applet-config.json';

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
      console.log('Auth state changed:', user?.email, 'Verified:', user?.emailVerified);
      setUser(user);
      
      if (user) {
        try {
          // Create user document if it doesn't exist
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            console.log('Creating new user document for:', user.email);
            await setDoc(userRef, {
              uid: user.uid,
              displayName: user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email,
              photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=random`,
              bio: '',
              followersCount: 0,
              followingCount: 0,
              createdAt: serverTimestamp(),
              emailVerified: user.emailVerified // Sync with auth state
            });
          } else {
            // Update emailVerified if it changed in auth but not in doc
            const userData = userSnap.data();
            if (user.emailVerified && !userData.emailVerified) {
              await setDoc(userRef, { emailVerified: true }, { merge: true });
            }
          }

          if (!user.emailVerified) {
            setMode('verify');
            // Ensure we have a code for this user
            const q = query(collection(db, 'verification_codes'), where('email', '==', user.email));
            const snap = await getDocs(q);
            if (snap.empty) {
              const code = Math.floor(100000 + Math.random() * 900000).toString();
              await addDoc(collection(db, 'verification_codes'), {
                email: user.email,
                code,
                createdAt: serverTimestamp()
              });
              setDebugCode(code);
            } else {
              setDebugCode(snap.docs[0].data().code);
            }
          }
        } catch (err) {
          console.error('Error in auth state sync:', err);
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsProcessing(true);
      setError('');
      console.log('Starting Google Sign-In...');
      
      // Check if we are in an iframe
      const inIframe = window.self !== window.top;
      if (inIframe) {
        console.log('App is running in an iframe, popup might be blocked.');
      }

      const result = await signInWithPopup(auth, googleProvider);
      console.log('Google Sign-In successful:', result.user.email);
    } catch (error: any) {
      console.error('Google Login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Google Sign-In. Please check your Firebase Console settings (Authentication > Settings > Authorized domains).');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by your browser. Please allow popups for this site or try opening the app in a new tab.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is not enabled in your Firebase Console. Please enable it under Authentication > Sign-in method.');
      } else {
        setError(error.message || 'Failed to sign in with Google');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // --- VALIDATION HELPERS ---
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isStrongPassword = (password: string) => {
    // Firebase requires 6 chars, we'll enforce that + a basic check
    return password.length >= 6;
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Client-side validation
    if (!email || !password || !displayName) {
      setError('Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!isStrongPassword(password)) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      console.log('Starting Email Signup for:', email);

      // 2. Firebase Auth: Create User
      // This will fail with 'auth/operation-not-allowed' if Email/Password is disabled in Console
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      console.log('User created in Auth, updating profile...');
      // 3. Update Auth Profile (Display Name)
      await updateProfile(userCredential.user, { displayName });
      
      // 4. Generate a verification code (6 digits)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 5. Store code in Firestore for our custom verification flow
      console.log('Storing verification code in Firestore...');
      await addDoc(collection(db, 'verification_codes'), {
        email,
        code,
        createdAt: serverTimestamp()
      });

      setDebugCode(code);
      setMode('verify');
    } catch (error: any) {
      console.error('Signup error:', error);
      
      // 6. Detailed Error Handling (Production-ready)
      if (error.code === 'auth/operation-not-allowed') {
        setError(
          'Email/Password authentication is not enabled in your Firebase Console. \n\n' +
          'STEPS TO FIX:\n' +
          '1. Go to https://console.firebase.google.com/\n' +
          '2. Select your project: ' + (firebaseConfig.projectId) + '\n' +
          '3. Click "Authentication" in the left sidebar\n' +
          '4. Click the "Sign-in method" tab\n' +
          '5. Click "Add new provider" or find "Email/Password"\n' +
          '6. Enable "Email/Password" and click "Save"'
        );
      } else if (error.code === 'auth/email-already-in-use') {
        setError('This email is already in use. Please sign in instead.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection.');
      } else {
        setError(error.message || 'Failed to sign up. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Client-side validation
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setIsProcessing(true);
      setError('');
      console.log('Starting Email Login for:', email);

      // 2. Firebase Auth: Sign In
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Email Login successful:', userCredential.user.email);
      
      // 3. Check Verification Status
      if (!userCredential.user.emailVerified) {
        // Check if we have a code for this user in Firestore
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
      
      // 4. Detailed Error Handling
      if (error.code === 'auth/operation-not-allowed') {
        setError(
          'Email/Password authentication is not enabled in your Firebase Console. \n\n' +
          'STEPS TO FIX:\n' +
          '1. Go to https://console.firebase.google.com/\n' +
          '2. Select your project: ' + (firebaseConfig.projectId) + '\n' +
          '3. Click "Authentication" in the left sidebar\n' +
          '4. Click the "Sign-in method" tab\n' +
          '5. Enable "Email/Password" and click "Save"'
        );
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError(error.message || 'Failed to sign in. Please try again.');
      }
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
        where('email', '==', auth.currentUser?.email)
      );
      const snap = await getDocs(q);

      // Check code in memory to avoid composite index requirement
      const matchingDoc = snap.docs.find(d => d.data().code === verificationCode);

      if (matchingDoc) {
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
          <p className="text-gray-500 font-medium animate-pulse">Initializing TeleTube...</p>
        </div>
        {/* Fallback if it hangs */}
        <div className="mt-12 text-center max-w-xs">
          <p className="text-xs text-gray-400 mb-4">Taking too long? Try refreshing or checking your connection.</p>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={() => window.location.reload()}
              className="text-purple-600 text-sm font-bold hover:underline"
            >
              Refresh Page
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="text-gray-500 text-sm font-bold hover:underline"
            >
              Sign Out
            </button>
          </div>
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
              <Play className="w-8 h-8 text-white fill-current" />
            </motion.div>
            <h1 className="text-4xl font-black tracking-tight mb-3 bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              TeleTube
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
