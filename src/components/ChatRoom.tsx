import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  db, doc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  auth, updateDoc, handleFirestoreError, OperationType, getDoc, increment, 
  writeBatch, storage, ref, uploadBytesResumable, getDownloadURL, where, limit, withTimeout,
  setDoc, deleteDoc
} from '../lib/firebase';
import { 
  ChevronLeft, Info, Send, Smile, Image as ImageIcon, Check, CheckCheck, 
  Phone, Video, Mic, Paperclip, X, Play, Pause, Square, MoreVertical, 
  Download, Maximize2, Volume2, VolumeX, MicOff, VideoOff, PhoneOff
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  senderId: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  duration?: number;
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

interface CallSession {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'missed';
  createdAt: any;
}

export default function ChatRoom() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connecting' | 'connected' | 'ended'>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const signalingUnsubscribesRef = useRef<(() => void)[]>([]);

  const peerConnectionConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (!chatId || !auth.currentUser) return;

    // Fetch other user profile
    const fetchOtherUser = async () => {
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (chatSnap.exists()) {
          const participants = chatSnap.data().participants;
          const otherId = participants.find((p: string) => p !== auth.currentUser?.uid);
          if (otherId) {
            onSnapshot(doc(db, 'users', otherId), (docSnap) => {
              if (docSnap.exists()) {
                setOtherUser({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
              }
            }, (error) => {
              console.error('ChatRoom: Other user listener error:', error);
            });
          }
        }
      } catch (error) {
        console.error('ChatRoom: Error fetching chat or other user:', error);
        // If we don't have access, we should probably redirect or show an error
        // navigate('/messages');
      }
    };
    fetchOtherUser();

    // Reset unread count
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

    // Listen for messages
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      setMessages(newMessages);

      // Mark incoming as read
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

    // Listen for calls
    const callsQuery = query(
      collection(db, 'chats', chatId, 'calls'),
      where('status', 'in', ['ringing', 'connected']),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribeCalls = onSnapshot(callsQuery, async (snapshot) => {
      if (!snapshot.empty) {
        const callData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CallSession;
        const isCaller = callData.callerId === auth.currentUser?.uid;
        
        if (!isCaller) {
          setIsIncomingCall(true);
        }
        
        setActiveCall(callData);
        setCallStatus(callData.status as any);

        // If call is connected and we haven't set up the peer connection yet
        if (callData.status === 'connected' && !peerConnectionRef.current) {
          setupPeerConnection(callData.id, isCaller, callData.type);
        }
      } else {
        if (activeCall) {
          endCall();
        }
        setActiveCall(null);
        setIsIncomingCall(false);
        setCallStatus('idle');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}/calls`);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeCalls();
      endCall();
    };
  }, [chatId]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    let callTimeout: NodeJS.Timeout;
    if (callStatus === 'ringing' && !isIncomingCall) {
      callTimeout = setTimeout(() => {
        console.log('Call timed out (no answer)');
        handleCallAction('end');
      }, 30000); // 30 seconds timeout
    }
    return () => clearTimeout(callTimeout);
  }, [callStatus, isIncomingCall]);

  const setupPeerConnection = async (callId: string, isCaller: boolean, type: 'voice' | 'video') => {
    console.log(`Setting up peer connection. isCaller: ${isCaller}, type: ${type}`);
    
    try {
      const pc = new RTCPeerConnection(peerConnectionConfig);
      peerConnectionRef.current = pc;

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });
      setLocalStream(stream);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('Received remote track');
        setRemoteStream(event.streams[0]);
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateCollection = isCaller ? 'callerCandidates' : 'receiverCandidates';
          addDoc(collection(db, 'chats', chatId!, 'calls', callId, candidateCollection), event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          // Don't end call immediately on disconnected, it might reconnect
        }
      };

      const callRef = doc(db, 'chats', chatId!, 'calls', callId);

      if (isCaller) {
        // Create offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        await updateDoc(callRef, { offer: { type: offerDescription.type, sdp: offerDescription.sdp } });

        // Listen for answer
        const unsubAnswer = onSnapshot(callRef, (docSnap) => {
          const data = docSnap.data();
          if (data?.answer && !pc.currentRemoteDescription) {
            console.log('Received answer');
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription).catch(e => console.error('Error setting remote description (answer):', e));
          }
        });
        signalingUnsubscribesRef.current.push(unsubAnswer);
      } else {
        // Listen for offer
        const callSnap = await getDoc(callRef);
        const data = callSnap.data();
        if (data?.offer) {
          console.log('Received offer');
          const offerDescription = new RTCSessionDescription(data.offer);
          await pc.setRemoteDescription(offerDescription);

          // Create answer
          const answerDescription = await pc.createAnswer();
          await pc.setLocalDescription(answerDescription);
          await updateDoc(callRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });
        }
      }

      // Listen for remote ICE candidates
      const remoteCandidateCollection = isCaller ? 'receiverCandidates' : 'callerCandidates';
      const unsubCandidates = onSnapshot(collection(db, 'chats', chatId!, 'calls', callId, remoteCandidateCollection), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch(e => console.error('Error adding ICE candidate:', e));
          }
        });
      });
      signalingUnsubscribesRef.current.push(unsubCandidates);

    } catch (error) {
      console.error('Error setting up peer connection:', error);
      alert('Failed to initialize call. Please check your permissions.');
      handleCallAction('end');
    }
  };

  const endCall = () => {
    console.log('Ending call and cleaning up resources');
    
    // Unsubscribe from signaling
    signalingUnsubscribesRef.current.forEach(unsub => unsub());
    signalingUnsubscribesRef.current = [];

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    setRemoteStream(null);
    setCallStatus('idle');
    setIsMuted(false);
    setIsVideoOff(false);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent, mediaData?: { type: 'image' | 'video' | 'audio', url: string, duration?: number }) => {
    if (e) e.preventDefault();
    if (!chatId || (!newMessage.trim() && !mediaData)) return;

    const text = newMessage;
    setNewMessage('');

    try {
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await withTimeout(getDoc(chatRef));
      const chatData = chatSnap.data();
      const participants = chatData?.participants || [];

      const messageData: any = {
        senderId: auth.currentUser?.uid,
        read: false,
        createdAt: serverTimestamp(),
        type: mediaData ? mediaData.type : 'text',
      };

      if (mediaData) {
        messageData.mediaUrl = mediaData.url;
        if (mediaData.duration) messageData.duration = mediaData.duration;
        if (text) messageData.text = text;
      } else {
        messageData.text = text;
      }

      await withTimeout(addDoc(collection(db, 'chats', chatId, 'messages'), messageData));

      const lastMsgText = mediaData 
        ? (mediaData.type === 'image' ? '📷 Image' : mediaData.type === 'video' ? '🎥 Video' : '🎵 Voice Note')
        : text;

      const unreadUpdates: any = {
        lastMessage: lastMsgText,
        lastMessageAt: serverTimestamp(),
      };

      participants.forEach((uid: string) => {
        if (uid !== auth.currentUser?.uid) {
          unreadUpdates[`unreadCount.${uid}`] = increment(1);
        }
      });

      await withTimeout(updateDoc(chatRef, unreadUpdates));
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
    if (!type) return;

    setIsUploading(true);
    const storageRef = ref(storage, `chats/${chatId}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      }, 
      (error) => {
        console.error('Upload error:', error);
        setIsUploading(false);
      }, 
      async () => {
        try {
          const downloadURL = await withTimeout(getDownloadURL(uploadTask.snapshot.ref));
          await handleSend(undefined, { type, url: downloadURL });
        } catch (error) {
          console.error('Error sending media message:', error);
          alert('Failed to send media message. Please try again.');
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    );
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const duration = recordingDuration;
        
        setIsUploading(true);
        const storageRef = ref(storage, `chats/${chatId}/voice_${Date.now()}.webm`);
        const uploadTask = uploadBytesResumable(storageRef, audioBlob);

        uploadTask.on('state_changed', null, (err) => {
          console.error('Voice upload error:', err);
          setIsUploading(false);
          alert('Failed to upload voice note. Please try again.');
        }, async () => {
          try {
            const url = await withTimeout(getDownloadURL(uploadTask.snapshot.ref));
            await handleSend(undefined, { type: 'audio', url, duration });
          } catch (error) {
            console.error('Error sending audio message:', error);
            alert('Failed to send voice note. Please try again.');
          } finally {
            setIsUploading(false);
          }
        });

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const initiateCall = async (type: 'voice' | 'video') => {
    if (!chatId || !otherUser) return;
    try {
      setCallStatus('ringing');
      const callRef = await addDoc(collection(db, 'chats', chatId, 'calls'), {
        callerId: auth.currentUser?.uid,
        receiverId: otherUser.uid,
        type,
        status: 'ringing',
        createdAt: serverTimestamp(),
      });
      
      // We'll wait for the receiver to accept before setting up the peer connection
      // This is handled in the onSnapshot listener for calls
    } catch (err) {
      console.error('Error initiating call:', err);
      setCallStatus('idle');
      alert('Failed to initiate call. Please try again.');
    }
  };

  const handleCallAction = async (action: 'accept' | 'decline' | 'end') => {
    if (!activeCall || !chatId) return;
    try {
      const callRef = doc(db, 'chats', chatId, 'calls', activeCall.id);
      if (action === 'accept') {
        await updateDoc(callRef, { status: 'connected' });
        // Peer connection setup will be triggered by the onSnapshot listener
      } else if (action === 'decline' || action === 'end') {
        await updateDoc(callRef, { status: action === 'decline' ? 'missed' : 'ended' });
        endCall();
      }
    } catch (err) {
      console.error('Error handling call action:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-screen flex flex-col bg-gray-50 md:border-x md:border-gray-200 overflow-hidden">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/messages')} className="p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              {otherUser?.photoURL ? (
                <img
                  src={otherUser.photoURL}
                  alt={otherUser.displayName}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-100"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                  {otherUser?.displayName?.charAt(0)}
                </div>
              )}
              {otherUser?.isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">{otherUser?.displayName || 'Chat'}</h2>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                {otherUser?.isOnline ? (
                  <span className="text-green-500 font-medium animate-pulse">Online</span>
                ) : otherUser?.lastSeen ? (
                  `Last seen ${formatDistanceToNow(otherUser.lastSeen.toDate(), { addSuffix: true })}`
                ) : (
                  'Offline'
                )}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => initiateCall('voice')}
            className="p-2.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            onClick={() => initiateCall('video')}
            className="p-2.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
          >
            <Video className="w-5 h-5" />
          </button>
          <button className="p-2.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
            
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}
              >
                {!isMe && (
                  <div className="w-8 h-8 flex-shrink-0">
                    {showAvatar && (
                      <img
                        src={otherUser?.photoURL}
                        className="w-8 h-8 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                )}
                
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%] md:max-w-[70%]`}>
                  <div
                    className={`relative p-3 rounded-2xl shadow-sm ${
                      isMe 
                        ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-br-none' 
                        : 'bg-white text-gray-800 rounded-bl-none'
                    }`}
                  >
                    {msg.type === 'text' && <p className="text-sm leading-relaxed">{msg.text}</p>}
                    
                    {msg.type === 'image' && (
                      <div className="space-y-2">
                        <img 
                          src={msg.mediaUrl} 
                          className="rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                          onClick={() => window.open(msg.mediaUrl, '_blank')}
                        />
                        {msg.text && <p className="text-sm">{msg.text}</p>}
                      </div>
                    )}

                    {msg.type === 'video' && (
                      <video 
                        src={msg.mediaUrl} 
                        controls 
                        className="rounded-lg max-h-64 bg-black"
                      />
                    )}

                    {msg.type === 'audio' && (
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className={`p-2 rounded-full ${isMe ? 'bg-white/20' : 'bg-purple-100'}`}>
                          <Play className={`w-4 h-4 ${isMe ? 'text-white' : 'text-purple-600'}`} />
                        </div>
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full ${isMe ? 'bg-white' : 'bg-purple-600'}`} style={{ width: '40%' }} />
                        </div>
                        <span className="text-[10px] opacity-70">
                          {Math.floor(msg.duration || 0)}s
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5 mt-1 px-1">
                    <span className="text-[9px] text-gray-400">
                      {msg.createdAt ? formatDistanceToNow(msg.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                    </span>
                    {isMe && (
                      <div className="flex items-center">
                        {msg.read ? (
                          <CheckCheck className="w-3 h-3 text-blue-500" />
                        ) : (
                          <Check className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={scrollRef} />
      </div>

      {/* Uploading Progress */}
      {isUploading && (
        <div className="px-4 py-2 bg-white border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-purple-600"
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-purple-600">{Math.round(uploadProgress)}%</span>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="image/*,video/*"
            />
          </div>

          <div className="flex-1 relative flex items-center">
            {isRecording ? (
              <div className="flex-1 bg-red-50 text-red-600 rounded-2xl px-4 py-2.5 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-600 rounded-full" />
                  <span className="text-sm font-medium">Recording {recordingDuration}s</span>
                </div>
                <button type="button" onClick={stopRecording} className="p-1 hover:bg-red-100 rounded-full">
                  <Square className="w-4 h-4 fill-current" />
                </button>
              </div>
            ) : (
              <input
                type="text"
                placeholder="Type a message..."
                className="w-full bg-gray-100 border-none rounded-2xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500/20 transition-all"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
            )}
          </div>

          <div className="flex items-center gap-1">
            {!newMessage.trim() && !isRecording ? (
              <button 
                type="button" 
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className="p-2.5 bg-purple-100 text-purple-600 rounded-full hover:bg-purple-200 transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!newMessage.trim() && !isRecording}
                className="p-2.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 transition-all shadow-md shadow-purple-200"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Call Overlay */}
      <AnimatePresence>
        {activeCall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gray-900 flex flex-col items-center justify-center p-8 text-white"
          >
            {/* Video Streams */}
            {activeCall.type === 'video' && (
              <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full bg-gray-800 animate-pulse flex items-center justify-center">
                      <Video className="w-10 h-10 text-gray-600" />
                    </div>
                    <p className="text-gray-500 text-sm">Waiting for video...</p>
                  </div>
                )}
                
                {/* Local Video Thumbnail */}
                <div className="absolute top-4 right-4 w-32 md:w-48 aspect-[9/16] bg-gray-800 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl z-10">
                  {localStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoOff className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-md">
              {activeCall.type === 'voice' && (
                <div className="relative">
                  <img 
                    src={otherUser?.photoURL} 
                    className="w-32 h-32 rounded-full object-cover ring-4 ring-purple-500/30"
                  />
                  {activeCall.status === 'ringing' && (
                    <div className="absolute inset-0 rounded-full border-4 border-purple-500 animate-ping" />
                  )}
                </div>
              )}
              
              <div className="text-center">
                <h2 className="text-2xl font-bold drop-shadow-md">{otherUser?.displayName}</h2>
                <p className="text-purple-300 mt-2 font-medium uppercase tracking-widest text-xs drop-shadow-sm">
                  {callStatus === 'ringing' ? (isIncomingCall ? 'Incoming Call' : 'Calling...') : 
                   callStatus === 'connecting' ? 'Connecting...' : 
                   callStatus === 'connected' ? 'Connected' : 'Call Ended'}
                </p>
              </div>

              <div className="flex items-center gap-6 mt-12">
                {isIncomingCall && activeCall.status === 'ringing' ? (
                  <>
                    <button 
                      onClick={() => handleCallAction('decline')}
                      className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>
                    <button 
                      onClick={() => handleCallAction('accept')}
                      className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg animate-bounce"
                    >
                      <Phone className="w-8 h-8" />
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={toggleMute}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                      {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>
                    
                    <button 
                      onClick={() => handleCallAction('end')}
                      className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                    >
                      <PhoneOff className="w-8 h-8" />
                    </button>

                    {activeCall.type === 'video' && (
                      <button 
                        onClick={toggleVideo}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}
                      >
                        {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
