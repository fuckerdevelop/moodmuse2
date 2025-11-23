import { GoogleGenAI, Type } from "@google/genai";
import { GeminiResponse, SongSuggestion } from "../types";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key not found in environment variables");
    }
    return new GoogleGenAI({ apiKey });
}

export const analyzeImageAndGetSongs = async (base64Image: string): Promise<GeminiResponse> => {
  const ai = getClient();

  const prompt = `
    Analyze the visual mood, colors, lighting, and emotion of this image.
    Based on this analysis, recommend a curated playlist of 20 songs that match this mood.
    
    Selection Strategy:
    1. **Core Vibe:** 70% of songs should be high-quality, recognized tracks that fit the mood perfectly.
    2. **Trending/Viral:** 30% of songs should be CURRENT TRENDING or VIRAL hits (from TikTok, Charts, or Instagram Reels) that fit this specific mood.
    3. **Diversity:** Do not stick to just one artist.
    
    Constraints:
    - STRICTLY AVOID obscure, low-quality, or unknown tracks.
    - The vibe must match the photo exactly (e.g., a sunset -> golden hour pop/r&b; a party -> upbeat dance/reggaeton; a rainy window -> lo-fi/sad indie).
    
    Return the response in JSON format with a list of songs and a short description of the overall mood.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1],
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallMood: {
              type: Type.STRING,
              description: "A poetic, 1-sentence description of the image's vibe in Spanish.",
            },
            songs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  artist: { type: Type.STRING },
                  moodDescription: { type: Type.STRING, description: "Why this song fits the image (in Spanish)" },
                },
                required: ["title", "artist", "moodDescription"],
              },
            },
          },
          required: ["overallMood", "songs"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as GeminiResponse;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error calling Gemini:", error);
    throw error;
  }
};

export const getRefinedSongs = async (currentMood: string, likedSong: SongSuggestion, existingTitles: string[] = []): Promise<SongSuggestion[]> => {
    const ai = getClient();
    const excludeList = existingTitles.slice(-50).join(", ");

    const prompt = `
      The user is listening to a playlist based on this mood: "${currentMood}".
      They explicitly LIKED the song: "${likedSong.title}" by "${likedSong.artist}".
      
      Task:
      Recommend 4 NEW, distinct songs that bridge the gap between the original mood and this specific liked song.
      
      CRITICAL:
      - Include at least 1 trending/viral song if it fits.
      - Must be popular/recognizable.
      - DO NOT REPEAT any of these songs: [${excludeList}]
      
      Return JSON.
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { text: prompt },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                artist: { type: Type.STRING },
                moodDescription: { type: Type.STRING, description: "Connection to the liked song (in Spanish)" },
              },
              required: ["title", "artist", "moodDescription"],
            },
          },
        },
      });
  
      if (response.text) {
        return JSON.parse(response.text) as SongSuggestion[];
      }
      return [];
    } catch (error) {
      console.error("Error refining playlist:", error);
      return [];
    }
  };

// New function to handle "Pivot" when user skips many songs
export const getPivotSongs = async (currentMood: string, skippedSongs: string[], existingTitles: string[] = []): Promise<SongSuggestion[]> => {
    const ai = getClient();
    const excludeList = existingTitles.slice(-50).join(", ");
    const skippedList = skippedSongs.join(", ");

    const prompt = `
      The user provided a photo with mood: "${currentMood}".
      However, they are SKIPPING (rejecting) these songs quickly: [${skippedList}].
      
      Analysis:
      The user agrees with the general mood but DISLIKES the specific sub-genre or style we served.
      
      Task:
      Recommend 5 NEW songs that fit the photo's mood but take a DIFFERENT musical direction.
      (e.g. If they skipped Pop, try R&B. If they skipped slow songs, try upbeat ones. If they skipped classics, try modern Trending hits).
      
      CRITICAL:
      - Must be different from the skipped songs.
      - DO NOT REPEAT: [${excludeList}]
      - Include highly popular or trending tracks to re-engage the user.
      
      Return JSON.
    `;

    try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: { text: prompt },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  artist: { type: Type.STRING },
                  moodDescription: { type: Type.STRING, description: "Why we are trying this new style (in Spanish)" },
                },
                required: ["title", "artist", "moodDescription"],
              },
            },
          },
        });
    
        if (response.text) {
          return JSON.parse(response.text) as SongSuggestion[];
        }
        return [];
      } catch (error) {
        console.error("Error pivoting playlist:", error);
        return [];
      }
}