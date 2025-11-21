import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, Sparkles } from 'lucide-react';

interface ImageUploaderProps {
  onImageSelected: (base64: string) => void;
  isLoading: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelected, isLoading }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        onImageSelected(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto transition-all duration-500">
      <div 
        onClick={() => !isLoading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          relative aspect-[4/5] rounded-[2rem] overflow-hidden cursor-pointer
          transition-all duration-500 group
          ${preview ? 'border-0 shadow-2xl' : 'border-2 border-dashed border-warm-300 hover:border-warm-500 bg-white/30 hover:bg-white/50'}
          ${isDragging ? 'scale-105 border-warm-500 bg-warm-100' : ''}
          ${isLoading ? 'pointer-events-none' : ''}
        `}
      >
        <input 
          type="file" 
          ref={inputRef} 
          onChange={handleChange} 
          accept="image/*" 
          className="hidden" 
        />

        {preview ? (
          <>
            <img 
              src={preview} 
              alt="Upload preview" 
              className={`w-full h-full object-cover transition-all duration-700 ${isLoading ? 'scale-105 blur-sm brightness-75' : 'group-hover:scale-105'}`}
            />
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-white p-6 text-center">
                    <div className="relative w-16 h-16 mb-6">
                        <div className="absolute inset-0 border-4 border-white/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        <Sparkles className="absolute inset-0 m-auto w-6 h-6 animate-pulse" />
                    </div>
                    <p className="font-serif text-xl font-medium animate-pulse">Analizando vibra...</p>
                    <p className="text-sm opacity-80 mt-2">Buscando la banda sonora perfecta</p>
                </div>
            )}
            {!isLoading && (
               <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-white font-medium bg-black/20 backdrop-blur-md px-4 py-2 rounded-full">Cambiar foto</p>
               </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-warm-500 p-8 text-center">
            <div className="w-20 h-20 bg-warm-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
               <ImageIcon className="w-8 h-8 text-warm-400" />
            </div>
            <h3 className="font-serif text-2xl text-warm-800 mb-2">Sube tu momento</h3>
            <p className="text-sm text-warm-600 leading-relaxed">
              Arrastra una foto aquí o haz clic para explorar.
              <br />
              <span className="opacity-70">Deja que la IA sienta tu mood.</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;