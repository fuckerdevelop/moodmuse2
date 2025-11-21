import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, ExternalLink, Heart, Share2 } from 'lucide-react';
import { Track } from '../types';

interface PlayerProps {
  track: Track;
  onNext: (listenDuration: number) => void;
  onPrev: () => void;
  onLike: (track: Track) => void;
  onShare: () => void;
  autoPlay?: boolean;
}

const Player: React.FC<PlayerProps> = ({ track, onNext, onPrev, onLike, onShare, autoPlay = true }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  useEffect(() => {
    // Reset state when track changes
    setIsPlaying(false);
    setProgress(0);
    setIsLiked(false);
    startTimeRef.current = Date.now(); // Reset timer

    if (audioRef.current) {
      audioRef.current.volume = 0.4; // Default volume
      
      // Attempt autoplay if requested
      if (autoPlay && track.isPlayable) {
         const playPromise = audioRef.current.play();
         if (playPromise !== undefined) {
            playPromise.then(() => {
                setIsPlaying(true);
            }).catch(error => {
                console.log("Autoplay prevented by browser policy", error);
                setIsPlaying(false);
            });
         }
      }
    }
  }, [track, autoPlay]);

  const togglePlay = () => {
    if (!audioRef.current || !track.isPlayable) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleLike = () => {
    if (!isLiked) {
        setIsLiked(true);
        onLike(track); // Notify parent only on "Like" (not unlike) for algorithm
    } else {
        setIsLiked(false);
    }
  };

  const handleNextClick = () => {
      const duration = (Date.now() - startTimeRef.current) / 1000; // duration in seconds
      onNext(duration);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration || 30; // iTunes previews are usually 30s
      setProgress((current / duration) * 100);
    }
  };

  const handleEnded = () => {
    // Requirement: "reproduce en bucle en preview" (Loop the preview)
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-8 font-sans text-warm-900 animate-fade-in">
      {/* Cover Art Area */}
      <div className="relative group aspect-square mb-8 mx-6">
        <div className={`absolute inset-0 bg-warm-400 rounded-full blur-xl opacity-40 transition-opacity duration-700 ${isPlaying ? 'opacity-60 scale-105' : ''}`}></div>
        <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl border-4 border-white/40">
          <img 
            src={track.coverUrl} 
            alt={track.title} 
            className={`w-full h-full object-cover transition-transform duration-[10000ms] ease-linear ${isPlaying ? 'scale-110 rotate-1' : 'scale-100'}`}
          />
          {/* Playback Overlay - shows when loading or error */}
          {!track.isPlayable && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-center p-4 backdrop-blur-sm">
              <p className="font-medium">Vista previa no disponible<br/>para esta canción</p>
            </div>
          )}
        </div>
      </div>

      {/* Track Info */}
      <div className="flex justify-between items-end px-6 mb-4">
        <div className="flex-1 min-w-0 mr-4">
          <h2 className="text-2xl font-serif font-bold truncate text-warm-900 leading-tight">
            {track.title}
          </h2>
          <p className="text-warm-600 font-medium truncate text-lg">
            {track.artist}
          </p>
        </div>
        
        <div className="flex gap-3">
            <button 
              onClick={onShare}
              className="transition-all duration-300 text-warm-400 hover:text-warm-800 hover:scale-110"
              title="Compartir en Instagram"
            >
              <Share2 className="w-7 h-7" />
            </button>
            
            <button 
              onClick={handleLike}
              className={`transition-all duration-300 active:scale-90 ${isLiked ? 'text-red-500 scale-110' : 'text-warm-400 hover:text-warm-600 hover:scale-110'}`}
              title="Me gusta (Mejora las recomendaciones)"
            >
              <Heart className={`w-8 h-8 ${isLiked ? 'fill-current' : ''}`} />
            </button>
        </div>
      </div>

      {/* Mood Description Bubble */}
      <div className="px-6 mb-6">
        <div className="bg-white/50 backdrop-blur-sm p-3 rounded-xl border border-white/60 text-sm text-warm-800 leading-relaxed italic">
          " {track.moodDescription} "
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 mb-6 group">
        <div className="h-1.5 bg-warm-200 rounded-full overflow-hidden cursor-pointer">
          <div 
            className="h-full bg-warm-800 rounded-full transition-all duration-100 ease-linear group-hover:bg-warm-600"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-warm-500 mt-2 font-medium">
          <span>Preview Loop</span>
          <span>30s</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-6 mb-4">
        <button 
            onClick={onPrev}
            className="text-warm-400 hover:text-warm-800 transition-colors p-2 hover:bg-warm-100 rounded-full"
        >
          <SkipBack className="w-8 h-8" fill="currentColor" />
        </button>

        <button 
          onClick={togglePlay}
          disabled={!track.isPlayable}
          className={`
            w-20 h-20 flex items-center justify-center rounded-full 
            bg-warm-800 text-warm-50 shadow-xl hover:scale-105 active:scale-95 transition-all duration-300
            ${!track.isPlayable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-warm-900 hover:shadow-warm-800/40'}
          `}
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 fill-current" />
          ) : (
            <Play className="w-8 h-8 fill-current ml-1" />
          )}
        </button>

        <button 
            onClick={handleNextClick}
            className="text-warm-400 hover:text-warm-800 transition-colors p-2 hover:bg-warm-100 rounded-full"
        >
          <SkipForward className="w-8 h-8" fill="currentColor" />
        </button>
      </div>

      {/* External Link */}
      {track.externalUrl && (
        <div className="flex justify-center mt-4">
            <a 
                href={track.externalUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-warm-400 hover:text-warm-600 transition-colors"
            >
                Escuchar completa <ExternalLink className="w-3 h-3" />
            </a>
        </div>
      )}

      <audio 
        ref={audioRef} 
        src={track.previewUrl || ''} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    </div>
  );
};

export default Player;