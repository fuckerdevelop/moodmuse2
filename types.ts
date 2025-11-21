export interface SongSuggestion {
  title: string;
  artist: string;
  moodDescription: string;
}

export interface Track extends SongSuggestion {
  id: number;
  previewUrl: string | null;
  coverUrl: string;
  externalUrl: string;
  isPlayable: boolean;
}

export interface GeminiResponse {
  songs: SongSuggestion[];
  overallMood: string;
}