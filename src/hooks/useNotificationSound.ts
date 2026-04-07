import { useState, useEffect, useCallback, useRef } from 'react';

const MESSAGE_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3';
const CALL_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/1350/1350-preview.mp3';
const TYPING_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

export function useNotificationSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notifications_sound_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const messageAudio = useRef<HTMLAudioElement | null>(null);
  const callAudio = useRef<HTMLAudioElement | null>(null);
  const typingAudio = useRef<HTMLAudioElement | null>(null);
  const lastTypingTime = useRef<number>(0);

  useEffect(() => {
    messageAudio.current = new Audio(MESSAGE_SOUND_URL);
    messageAudio.current.volume = 0.4;
    messageAudio.current.preload = 'auto';

    callAudio.current = new Audio(CALL_SOUND_URL);
    callAudio.current.volume = 0.5;
    callAudio.current.preload = 'auto';
    callAudio.current.loop = true;

    typingAudio.current = new Audio(TYPING_SOUND_URL);
    typingAudio.current.volume = 0.15;
    typingAudio.current.preload = 'auto';

    localStorage.setItem('notifications_sound_enabled', JSON.stringify(soundEnabled));

    return () => {
      if (callAudio.current) {
        callAudio.current.pause();
        callAudio.current = null;
      }
      messageAudio.current = null;
      typingAudio.current = null;
    };
  }, [soundEnabled]);

  const playMessageSound = useCallback(() => {
    if (!soundEnabled || !messageAudio.current) return;
    
    const now = Date.now();
    const lastPlayed = Number(localStorage.getItem('last_message_sound_played_at') || 0);
    
    // Throttle and coordinate across tabs (1 second window)
    if (now - lastPlayed > 1000) {
      localStorage.setItem('last_message_sound_played_at', now.toString());
      
      messageAudio.current.currentTime = 0;
      messageAudio.current.play().catch(err => {
        console.warn('Message sound playback blocked by browser.', err);
      });
    }
  }, [soundEnabled]);

  const startCallRinging = useCallback(() => {
    if (!soundEnabled || !callAudio.current) return;
    callAudio.current.currentTime = 0;
    callAudio.current.play().catch(err => {
      console.warn('Call sound playback blocked by browser.', err);
    });
  }, [soundEnabled]);

  const stopCallRinging = useCallback(() => {
    if (callAudio.current) {
      callAudio.current.pause();
      callAudio.current.currentTime = 0;
    }
  }, []);

  const playTypingSound = useCallback(() => {
    if (!soundEnabled || !typingAudio.current) return;
    const now = Date.now();
    if (now - lastTypingTime.current > 300) {
      typingAudio.current.currentTime = 0;
      typingAudio.current.play().catch(err => console.warn('Typing sound blocked:', err));
      lastTypingTime.current = now;
    }
  }, [soundEnabled]);

  const toggleSound = () => setSoundEnabled((prev: boolean) => !prev);

  return { 
    soundEnabled, 
    toggleSound, 
    playMessageSound, 
    startCallRinging, 
    stopCallRinging,
    playTypingSound 
  };
}
