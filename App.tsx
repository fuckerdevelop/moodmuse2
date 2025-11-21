import React, { useState, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import Player from './components/Player';
import { analyzeImageAndGetSongs, getRefinedSongs, getPivotSongs } from './services/geminiService';
import { fetchTrackDetails } from './services/musicService';
import { Track } from './types';
import { Music, RotateCcw, Sparkles, Instagram } from 'lucide-react';

// Declare html2canvas types since it's loaded via script tag
declare global {
    interface Window {
        html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
    }
}

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [moodSummary, setMoodSummary] = useState<string>("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [consecutiveSkips, setConsecutiveSkips] = useState(0);
  
  const shareRef = useRef<HTMLDivElement>(null);
  // Lock to prevent multiple AI calls firing at once (Infinite loop fix)
  const isGeneratingRef = useRef(false);

  // Handle image upload and initiate AI analysis
  const handleImageUpload = async (base64: string) => {
    if (isGeneratingRef.current) return;
    
    setIsLoading(true);
    setHasUploaded(true);
    setUploadedImage(base64);
    setPlaylist([]);
    setMoodSummary("");
    setConsecutiveSkips(0);
    isGeneratingRef.current = true;

    try {
      // 1. Get suggestions from Gemini
      const aiResponse = await analyzeImageAndGetSongs(base64);
      setMoodSummary(aiResponse.overallMood);

      // 2. Fetch iTunes details for the first song immediately to start playing faster
      const firstTrack = await fetchTrackDetails(aiResponse.songs[0], 0);
      
      // Set playlist with first track ready and others as placeholders initially
      const initialPlaylist: Track[] = aiResponse.songs.map((song, idx) => {
        if (idx === 0) return firstTrack;
        // Placeholder structure until fetched
        return {
            ...song,
            id: idx,
            previewUrl: null,
            coverUrl: 'https://picsum.photos/600/600?blur=5',
            externalUrl: '',
            isPlayable: false
        };
      });

      setPlaylist(initialPlaylist);
      setCurrentIndex(0);
      setIsLoading(false);
      isGeneratingRef.current = false;

      // 3. Fetch the rest in background
      fetchRemainingTracks(aiResponse.songs, 1, initialPlaylist.length);

    } catch (error) {
      console.error(error);
      setIsLoading(false);
      isGeneratingRef.current = false;
      alert("Ups! No pudimos conectar con la musa. Intenta con otra foto.");
      setHasUploaded(false);
    }
  };

  // Background fetcher for track details
  const fetchRemainingTracks = async (suggestions: any[], startIndex: number, currentLength: number) => {
    for (let i = startIndex; i < suggestions.length; i++) {
        // Calculate actual index in the playlist state (to account for previous items)
        const actualIndex = startIndex === 1 ? i : (currentLength + i); 
        
        // Add a LARGE delay (1.2s) to avoid overwhelming the iTunes API and triggering "403 Forbidden"
        await new Promise(resolve => setTimeout(resolve, 1200));

        const track = await fetchTrackDetails(suggestions[i], actualIndex);
        setPlaylist(prev => {
            const newPlaylist = [...prev];
            // Update placeholder with real data if it still exists at that index
            if (newPlaylist[actualIndex]) {
                 newPlaylist[actualIndex] = track;
            }
            return newPlaylist;
        });
    }
  };

  const handleNext = async (duration: number) => {
    const currentTrack = playlist[currentIndex];
    
    // Logic to prevent infinite loop:
    // Only count as a "skip" if the track was actually playable.
    // If it was an error track, the user is just skipping the error, not the vibe.
    if (currentTrack.isPlayable) {
        // If user listened for less than 8 seconds, it's a fast skip
        if (duration < 8) {
            const newSkips = consecutiveSkips + 1;
            setConsecutiveSkips(newSkips);
            
            // If 3 consecutive skips, trigger pivot
            // ONLY if we aren't already generating something
            if (newSkips >= 3 && !isGeneratingRef.current) {
                setConsecutiveSkips(0); // Reset immediately to prevent double trigger
                await handlePivot(currentTrack.title);
            }
        } else {
            // Reset skips if they listened to a song for a while
            setConsecutiveSkips(0);
        }
    }

    setCurrentIndex((prev) => (prev + 1) % playlist.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  // Feature: Pivot Logic (When user skips too much)
  const handlePivot = async (lastSkippedTitle: string) => {
      if (isGeneratingRef.current) return;
      isGeneratingRef.current = true;

      showNotification("Probando otra vibra...");
      try {
          const existingTitles = playlist.map(t => t.title);
          // Get 3 previously skipped titles approx (just the last few)
          const skippedContext = playlist.slice(Math.max(0, currentIndex - 2), currentIndex + 1).map(t => t.title);
          
          const pivotSongs = await getPivotSongs(moodSummary, skippedContext, existingTitles);
          
          await addSongsToPlaylist(pivotSongs);
      } catch (e) {
          console.error("Pivot error", e);
      } finally {
          isGeneratingRef.current = false;
      }
  };

  // Feature: Refine playlist based on user likes
  const handleLike = async (track: Track) => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;

    showNotification("Sintonizando algoritmo con tu vibra...");
    setConsecutiveSkips(0); // Reset skips if they liked something

    try {
        const existingTitles = playlist.map(t => t.title);
        const newSuggestions = await getRefinedSongs(moodSummary, track, existingTitles);
        await addSongsToPlaylist(newSuggestions);
    } catch (e) {
        console.error("Error extending playlist", e);
    } finally {
        isGeneratingRef.current = false;
    }
  };

  // Helper to safely add new songs
  const addSongsToPlaylist = async (newSongs: any[]) => {
    // Filter duplicates
    const uniqueSuggestions = newSongs.filter(suggestion => {
        const isDuplicate = playlist.some(existingTrack => 
            existingTrack.title.toLowerCase().trim() === suggestion.title.toLowerCase().trim() || 
            (existingTrack.title.toLowerCase().includes(suggestion.title.toLowerCase()) && 
             existingTrack.artist.toLowerCase().includes(suggestion.artist.toLowerCase()))
        );
        return !isDuplicate;
    });

    if (uniqueSuggestions.length > 0) {
        const currentLength = playlist.length;
        
        // Create placeholders
        const newPlaceholders: Track[] = uniqueSuggestions.map((song, idx) => ({
            ...song,
            id: currentLength + idx + Date.now(),
            previewUrl: null,
            coverUrl: 'https://picsum.photos/600/600?blur=5',
            externalUrl: '',
            isPlayable: false
        }));

        setPlaylist(prev => [...prev, ...newPlaceholders]);
        showNotification(`Agregadas ${uniqueSuggestions.length} nuevas sugerencias.`);

        // Fetch details
        // Note: This runs in background, we don't await it here to free up the lock
        fetchRemainingTracks(uniqueSuggestions, 0, currentLength);
    }
  };

  // Share Functionality
  const handleShare = async () => {
    if (!shareRef.current || !window.html2canvas) return;
    
    showNotification("Generando sticker...");

    try {
        const canvas = await window.html2canvas(shareRef.current, {
            backgroundColor: null, 
            scale: 2, 
            useCORS: true,
            logging: false,
        });

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            
            const file = new File([blob], "moodmuse-sticker.png", { type: "image/png" });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'MoodMuse', 
                    });
                    showNotification("¡Listo para compartir!");
                } catch (err) {
                    console.log("Share cancelled", err);
                }
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = "moodmuse-sticker.png";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showNotification("Imagen guardada.");
            }
        }, 'image/png');

    } catch (err) {
        console.error("Error generating share image", err);
        showNotification("Error al crear la imagen.");
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const resetApp = () => {
    setHasUploaded(false);
    setPlaylist([]);
    setMoodSummary("");
    setUploadedImage(null);
    setNotification(null);
    setConsecutiveSkips(0);
    isGeneratingRef.current = false;
  };

  const currentTrack = playlist[currentIndex];

  return (
    <div className="min-h-screen bg-warm-50 text-warm-900 selection:bg-warm-200 selection:text-warm-900 font-sans">
      {/* Aesthetic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-warm-200/50 rounded-full blur-[120px] animate-float opacity-60"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-warm-300/40 rounded-full blur-[100px] animate-float opacity-60" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Hidden Share Card (High Res, Transparent) */}
      {currentTrack && uploadedImage && (
          <div 
            ref={shareRef}
            style={{ 
                position: 'fixed', 
                left: '-9999px', 
                top: 0, 
                width: '1080px', // High resolution width
                height: '1920px', // High resolution height
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent', // TRANSPARENT BACKGROUND
            }}
          >
             {/* 
                Collage Layout: 
                We create a tight grouping of elements that looks like a sticker 
             */}
             <div className="relative w-[900px] h-[1200px] flex flex-col items-center justify-center">
                
                {/* Layer 1: User Photo (Tilted Left, Bigger, Higher) */}
                <div className="absolute top-0 left-0 w-[650px] h-[850px] bg-white p-6 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] transform -rotate-3 rounded-sm z-10 relative">
                    <img src={uploadedImage} alt="My Mood" className="w-full h-full object-cover grayscale-[10%]" />
                    
                    {/* Instagram Logo Sticker - PROFESSIONAL LOOK */}
                    <div className="absolute -top-8 -right-8 z-50 filter drop-shadow-2xl transform rotate-12">
                        <div className="w-28 h-28 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] rounded-[2.5rem] flex items-center justify-center border-4 border-white shadow-lg">
                             <Instagram className="w-16 h-16 text-white" strokeWidth={2.5} />
                        </div>
                    </div>
                </div>

                {/* Layer 2: Album Art (Tilted Right, LARGER, Lower) */}
                <div className="absolute bottom-20 -right-12 w-[550px] h-[550px] bg-black shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] transform rotate-6 rounded-md z-20 border-[10px] border-white">
                    <img 
                        src={currentTrack.coverUrl} 
                        crossOrigin="anonymous" 
                        alt="Album" 
                        className="w-full h-full object-cover" 
                    />
                </div>

                {/* Layer 3: Aesthetic Pill Badge (Centered, Floating) */}
                <div className="absolute bottom-0 z-30 bg-white/90 backdrop-blur-xl px-10 py-4 rounded-full shadow-2xl border border-white/50 flex items-center gap-4 transform hover:scale-105 transition-transform">
                     <div className="bg-warm-900 p-2 rounded-full">
                        <Music className="w-8 h-8 text-white" />
                     </div>
                     <div>
                        <h2 className="font-serif text-4xl font-bold text-warm-900">MoodMuse</h2>
                        <p className="font-sans text-xl text-warm-500 font-medium uppercase tracking-wider max-w-[400px] truncate">{currentTrack.title}</p>
                     </div>
                </div>
             </div>
          </div>
      )}

      <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 py-8 relative">
        
        {/* Toast Notification */}
        {notification && (
            <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-sm animate-fade-in">
                <div className="bg-warm-900 text-white px-4 py-3 rounded-full shadow-xl flex items-center justify-center gap-2 text-sm font-medium backdrop-blur-md bg-opacity-90">
                    <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                    {notification}
                </div>
            </div>
        )}

        {/* Header */}
        <header className="flex justify-between items-center mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-warm-800 text-white rounded-full shadow-lg">
                <Music className="w-5 h-5" />
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-warm-900">MoodMuse</h1>
          </div>
          {hasUploaded && !isLoading && (
            <button 
              onClick={resetApp}
              className="p-2 rounded-full hover:bg-warm-200 text-warm-600 transition-colors"
              title="Empezar de nuevo"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
        </header>

        <main className="flex-1 flex flex-col">
            {/* Mode 1: Upload Screen */}
            {!hasUploaded || (hasUploaded && isLoading && playlist.length === 0) ? (
                <div className="flex-1 flex flex-col justify-center animate-fade-in">
                    <ImageUploader 
                        onImageSelected={handleImageUpload} 
                        isLoading={isLoading} 
                    />
                    
                    {/* Decorators */}
                    {!isLoading && (
                        <div className="mt-12 text-center">
                            <p className="font-serif italic text-warm-500 text-lg">
                                "La música es el arte de pensar con sonidos."
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                /* Mode 2: Player Screen */
                <div className="flex-1 flex flex-col animate-fade-in">
                    
                    {/* Top Section: Uploaded Image + Mood */}
                    <div className="flex items-center gap-6 px-4 mb-2 mt-2">
                        {/* Image - Polaroid style */}
                        {uploadedImage && (
                          <div className="relative flex-shrink-0 w-28 h-28 sm:w-32 sm:h-32 rotate-[-3deg] shadow-xl bg-white p-1.5 rounded-lg transform hover:rotate-0 hover:scale-105 transition-all duration-500 z-10 cursor-pointer group">
                              <img src={uploadedImage} alt="Tu mood" className="w-full h-full object-cover rounded-md grayscale-[20%] group-hover:grayscale-0 transition-all" />
                              <div className="absolute -bottom-6 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] bg-black/50 text-white px-2 py-1 rounded-full backdrop-blur-md">Tu foto</span>
                              </div>
                          </div>
                        )}
                        
                        {/* Mood Text */}
                        <div className="flex-1">
                             <span className="uppercase tracking-widest text-[10px] text-warm-500 font-bold">Vibra Detectada</span>
                             <p className="font-serif text-lg sm:text-xl text-warm-900 mt-1 leading-tight italic">
                                "{moodSummary}"
                             </p>
                        </div>
                    </div>

                    {/* The Player */}
                    {playlist[currentIndex] && (
                        <div className="mt-[-1rem]">
                            <Player 
                                track={playlist[currentIndex]} 
                                onNext={handleNext}
                                onPrev={handlePrev}
                                onLike={handleLike}
                                onShare={handleShare}
                            />
                        </div>
                    )}

                    {/* Playlist Indicator */}
                    <div className="mt-auto py-6 px-8">
                        <div className="flex justify-center gap-1.5 flex-wrap">
                            {playlist.map((_, idx) => (
                                <div 
                                    key={idx} 
                                    className={`
                                        h-1.5 rounded-full transition-all duration-300 
                                        ${idx === currentIndex ? 'w-6 bg-warm-800' : 'w-1.5 bg-warm-300'}
                                    `}
                                />
                            ))}
                        </div>
                        <p className="text-center text-[10px] text-warm-400 mt-3 uppercase tracking-widest">
                            {currentIndex + 1} de {playlist.length}
                        </p>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default App;