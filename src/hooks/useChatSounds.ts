import { useState, useEffect, useCallback, useRef } from 'react';

const TYPING_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';

export function useChatSounds() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('chat_sounds_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const typingAudio = useRef<HTMLAudioElement | null>(null);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const lastTypingTime = useRef<number>(0);

  useEffect(() => {
    // Preload sounds
    typingAudio.current = new Audio(TYPING_SOUND_URL);
    typingAudio.current.volume = 0.15;
    typingAudio.current.preload = 'auto';

    notificationAudio.current = new Audio(NOTIFICATION_SOUND_URL);
    notificationAudio.current.volume = 0.3;
    notificationAudio.current.preload = 'auto';

    localStorage.setItem('chat_sounds_enabled', JSON.stringify(soundEnabled));

    return () => {
      typingAudio.current = null;
      notificationAudio.current = null;
    };
  }, [soundEnabled]);

  const playTypingSound = useCallback(() => {
    if (!soundEnabled || !typingAudio.current) return;

    const now = Date.now();
    if (now - lastTypingTime.current > 300) { // Throttle typing sound
      console.log('ChatSounds: Triggering typing sound');
      typingAudio.current.currentTime = 0;
      typingAudio.current.play().catch(err => console.warn('Audio playback blocked:', err));
      lastTypingTime.current = now;
    }
  }, [soundEnabled]);

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled || !notificationAudio.current) return;

    console.log('ChatSounds: Triggering notification sound');
    notificationAudio.current.currentTime = 0;
    notificationAudio.current.play().catch(err => console.warn('Audio playback blocked:', err));
  }, [soundEnabled]);

  const toggleSound = () => setSoundEnabled((prev: boolean) => !prev);

  return { soundEnabled, toggleSound, playTypingSound, playNotificationSound };
}
