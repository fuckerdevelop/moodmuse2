import { Track, SongSuggestion } from "../types";

// Helper to clean strings for better search results
// Removes things like "(feat. X)", "- Remastered", "[Live]", etc.
const cleanString = (str: string): string => {
  let clean = str
    .replace(/\(feat\..*?\)/gi, "") // Remove (feat. ...)
    .replace(/\(with.*?\)/gi, "")   // Remove (with ...)
    .replace(/\[.*?\]/g, "")        // Remove [...]
    .replace(/-.*remaster.*/gi, "") // Remove - Remastered
    .replace(/remastered/gi, "")    // Remove remastered
    .replace(/-.*single/gi, "")     // Remove - Single
    .replace(/\(.*?version\)/gi, "")// Remove (X Version)
    .trim();

  // Split by common separators to get just the main artist/title
  if (clean.includes("&")) clean = clean.split("&")[0].trim();
  if (clean.includes(",")) clean = clean.split(",")[0].trim();

  return clean;
};

// Helper to safely fetch JSON with retries
const fetchWithRetry = async (url: string, retries = 2, delay = 500): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      
      // If 403 (Forbidden) or 429 (Too Many Requests), do NOT retry. 
      // It means we are rate limited, and retrying makes it worse.
      if (response.status === 403 || response.status === 429) {
          console.warn(`API Limit hit (${response.status}). Using fallback.`);
          return null; // Return null to trigger fallback logic immediately
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      
      // Handle empty response body which causes "Unexpected end of JSON input"
      if (!text || text.trim() === '') {
        return { resultCount: 0, results: [] };
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        // If response is not JSON, treat as failed request
        throw new Error("Invalid JSON response");
      }

    } catch (error) {
      // If it's the last retry, throw
      if (i === retries) throw error; 
      // Backoff delay
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); 
    }
  }
};

// Helper to fetch track details from iTunes Search API
export const fetchTrackDetails = async (suggestion: SongSuggestion, index: number): Promise<Track> => {
  // 1. Try with cleaned specific query first
  const cleanTitle = cleanString(suggestion.title);
  const cleanArtist = cleanString(suggestion.artist);
  
  // Fallback values
  const fallbackTrack: Track = {
    ...suggestion,
    id: index,
    previewUrl: null,
    coverUrl: 'https://picsum.photos/600/600?blur=2',
    externalUrl: '',
    isPlayable: false
  };

  // Added country=US and entity=song to standardize results
  let query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`);
  let url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1&country=US`;

  try {
    let data = await fetchWithRetry(url);

    // If null returned (due to 403/429), return fallback
    if (data === null) return fallbackTrack;

    // 2. If no results, try looser search (just title)
    if (!data || data.resultCount === 0) {
       query = encodeURIComponent(cleanTitle);
       // Also try specific artist search if title search fails? No, too vague.
       // Let's try just searching the title but still expect a song.
       url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=5&country=US`;
       
       try {
         data = await fetchWithRetry(url);
         if (data === null) return fallbackTrack; // Handle 403 in secondary search
         
         // Filter manually if we found results
         if (data && data.resultCount > 0) {
             const match = data.results.find((r: any) => 
                 r.artistName && cleanArtist && r.artistName.toLowerCase().includes(cleanArtist.toLowerCase())
             );
             if (match) {
                 data.results = [match];
                 data.resultCount = 1;
             }
         }
       } catch (innerError) {
         console.warn("Secondary search failed", innerError);
       }
    }

    if (data && data.resultCount > 0) {
      const track = data.results[0];
      // Get a higher resolution image
      const highResCover = track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : null;
      
      return {
        ...suggestion,
        id: track.trackId || index,
        previewUrl: track.previewUrl,
        coverUrl: highResCover || 'https://picsum.photos/600/600?blur=2',
        externalUrl: track.trackViewUrl,
        isPlayable: !!track.previewUrl,
        // Use metadata from iTunes if available for better formatting
        title: track.trackName || suggestion.title,
        artist: track.artistName || suggestion.artist,
      };
    }

    // Fallback if not found in iTunes
    console.warn(`Could not find track: ${suggestion.title}`);
    return fallbackTrack;

  } catch (error) {
    // Log but don't crash the app, return fallback
    console.warn(`Error fetching details for ${suggestion.title}:`, error);
    return fallbackTrack;
  }
};