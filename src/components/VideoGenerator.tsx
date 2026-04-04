import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Wand2, Loader2, Play, Check, AlertCircle, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface VideoGeneratorProps {
  onVideoGenerated: (url: string) => void;
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function VideoGenerator({ onVideoGenerated }: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    checkKey();
  }, []);

  const checkKey = async () => {
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    }
  };

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success as per guidelines
    }
  };

  const generateVideo = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setStatus('Initializing generation...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      setStatus('Sending request to Veo...');
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-lite-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });

      setStatus('Generating video (this may take a few minutes)...');
      
      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
        
        // Update status messages to keep user engaged
        const statuses = [
          'Still working on it...',
          'Adding final touches...',
          'Almost there...',
          'Rendering frames...',
          'Optimizing video...'
        ];
        setStatus(statuses[Math.floor(Math.random() * statuses.length)]);
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error('No video URI returned');

      setStatus('Fetching video data...');
      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setHasKey(false);
          throw new Error('API key session expired. Please re-select your key.');
        }
        throw new Error('Failed to download generated video');
      }

      const blob = await response.blob();
      const videoUrl = URL.createObjectURL(blob);
      
      onVideoGenerated(videoUrl);
      setStatus('Success!');
    } catch (err: any) {
      console.error('Video generation error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  if (hasKey === false) {
    return (
      <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-center">
        <Key className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-blue-900 mb-2">API Key Required</h3>
        <p className="text-sm text-blue-700 mb-6">
          To generate videos with Veo, you need to select a paid Gemini API key. 
          Visit <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline font-semibold">billing docs</a> for more info.
        </p>
        <button
          onClick={handleOpenKeySelector}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
        >
          Select API Key
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea
          placeholder="Describe the video you want to generate (e.g., 'A futuristic city at night with neon lights and flying cars')"
          className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all min-h-[100px] text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
        />
        <div className="absolute bottom-3 right-3 text-[10px] text-gray-400 font-mono">
          Powered by Veo
        </div>
      </div>

      <button
        onClick={generateVideo}
        disabled={isGenerating || !prompt.trim()}
        className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
          isGenerating 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : 'bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:opacity-90 active:scale-[0.98]'
        }`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5" />
            <span>Generate Video</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {status && !error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 p-3 bg-purple-50 text-purple-700 rounded-xl text-xs font-medium border border-purple-100"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            {status}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-100"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
