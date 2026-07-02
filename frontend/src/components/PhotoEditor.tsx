import React, { useState, useRef, useEffect } from 'react';
import { CapturedPhoto, PhotostripLayout, PhotoFrame, PhotoFilter, Sticker, TextItem, PlacedSticker, FILTERS, STICKERS, FRAMES } from '../types';
import { ChevronLeft, Download, Type, Image as ImageIcon, Smile, Palette, Trash2, Crown } from 'lucide-react';

interface Props {
  photos: CapturedPhoto[];
  layout: PhotostripLayout;
  initialFrame: PhotoFrame;
  sessionMode: 'trial' | 'premium';
  onBack: () => void;
  onSave: (compiledDataUrl: string) => void;
}

const PhotoEditor: React.FC<Props> = ({ photos, layout, initialFrame, sessionMode, onBack, onSave }) => {
  const [activeTab, setActiveTab] = useState<'filter' | 'sticker' | 'text' | 'frame' | 'custom'>('filter');
  const [customImage, setCustomImage] = useState<string | null>(null);
  
  // Editor State
  const [selectedFilter, setSelectedFilter] = useState<PhotoFilter>(FILTERS[0]);
  const [selectedFrame, setSelectedFrame] = useState<PhotoFrame>(initialFrame);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  
  // Text Input State
  const [inputText, setInputText] = useState('');
  
  // Compiler state
  const [isCompiling, setIsCompiling] = useState(false);
  
  // Drag state
  const [draggingItem, setDraggingItem] = useState<{ id: string, type: 'sticker' | 'text' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent, id: string, type: 'sticker' | 'text') => {
    e.preventDefault();
    setDraggingItem({ id, type });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingItem || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      if (draggingItem.type === 'sticker') {
        setPlacedStickers(prev => prev.map(s => s.id === draggingItem.id ? { ...s, x: clampedX, y: clampedY } : s));
      } else if (draggingItem.type === 'text') {
        setTexts(prev => prev.map(t => t.id === draggingItem.id ? { ...t, x: clampedX, y: clampedY } : t));
      }
    };

    const handlePointerUp = () => {
      setDraggingItem(null);
    };

    if (draggingItem) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingItem]);

  // Editor Live Preview (using DOM for live preview, Canvas only for final compile)
  
  const handleAddSticker = (sticker: Sticker) => {
    setPlacedStickers(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      emoji: sticker.emoji,
      x: 50,
      y: 20 + (prev.length * 5), // Cascade slightly
      scale: 1,
      rotation: 0
    }]);
  };

  const handleAddText = () => {
    if (!inputText.trim()) return;
    setTexts(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      text: inputText,
      color: '#FFFFFF',
      fontFamily: 'Outfit',
      fontSize: 24,
      x: 50,
      y: 90
    }]);
    setInputText('');
  };

  // Compiler Engine
  const compilePhotostrip = async () => {
    setIsCompiling(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get 2d context");

      // 1. Calculate dimensions
      const CANVAS_WIDTH = 600;
      let CANVAS_HEIGHT = 600;
      const PADDING = 32;
      let slotWidth = CANVAS_WIDTH - (PADDING * 2);
      let slotHeight = 400;

      switch(layout.id) {
        case 'single-1':
          CANVAS_HEIGHT = 680;
          slotHeight = 500;
          break;
        case 'classic-3':
          CANVAS_HEIGHT = 1600;
          slotHeight = 440;
          break;
        case 'strip-4':
          CANVAS_HEIGHT = 2100;
          slotHeight = 430;
          break;
        case 'grid-4':
          CANVAS_HEIGHT = 720;
          slotWidth = (CANVAS_WIDTH - (PADDING * 3)) / 2;
          slotHeight = 260;
          break;
      }

      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // 2. Draw Background Frame
      ctx.fillStyle = selectedFrame.bgColor;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (selectedFrame.pattern === 'radial-dot') {
        // Simple dot pattern simulation
        ctx.fillStyle = selectedFrame.textColor;
        ctx.globalAlpha = 0.1;
        for (let x = 0; x < CANVAS_WIDTH; x += 10) {
          for (let y = 0; y < CANVAS_HEIGHT; y += 10) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // Helper to load image
      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      };

      // 3. Draw Photos with aspect-fill and filter tint
      for (let i = 0; i < photos.length; i++) {
        const img = await loadImage(photos[i].dataUrl);
        
        let x = PADDING;
        let y = PADDING + (i * (slotHeight + PADDING));

        if (layout.id === 'grid-4') {
          const col = i % 2;
          const row = Math.floor(i / 2);
          x = PADDING + (col * (slotWidth + PADDING));
          y = PADDING + (row * (slotHeight + PADDING));
        }

        ctx.save();
        // Clip area
        ctx.beginPath();
        ctx.rect(x, y, slotWidth, slotHeight);
        ctx.clip();

        // Aspect Fill calculation
        const imgAspect = img.width / img.height;
        const slotAspect = slotWidth / slotHeight;
        let dWidth, dHeight, dx, dy;

        if (imgAspect > slotAspect) {
          dHeight = slotHeight;
          dWidth = slotHeight * imgAspect;
          dx = x - (dWidth - slotWidth) / 2;
          dy = y;
        } else {
          dWidth = slotWidth;
          dHeight = slotWidth / imgAspect;
          dx = x;
          dy = y - (dHeight - slotHeight) / 2;
        }

        // Apply mirror horizontally for natural feel
        ctx.translate(x + slotWidth / 2, y + slotHeight / 2);
        ctx.scale(-1, 1);
        ctx.translate(-(x + slotWidth / 2), -(y + slotHeight / 2));

        ctx.drawImage(img, dx, dy, dWidth, dHeight);
        
        // Remove mirror for overlay
        ctx.restore();

        // Apply Tint Overlay based on filter
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, slotWidth, slotHeight);
        
        if (selectedFilter.id === 'glamour') {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
        } else if (selectedFilter.id === 'kodak') {
          ctx.fillStyle = 'rgba(251,191,36,0.08)'; // Amber tint
        } else if (selectedFilter.id === 'cyberpunk') {
          ctx.fillStyle = 'rgba(236,72,153,0.08)'; // Pink tint
        } else if (selectedFilter.id === 'monochrome') {
          // Desaturate is hard with pure canvas without pixel manipulation, we just add dark overlay
          ctx.fillStyle = 'rgba(0,0,0,0.1)'; 
        } else if (selectedFilter.id === 'popart') {
          ctx.fillStyle = 'rgba(217,70,239,0.1)'; // Magenta tint
        } else {
          ctx.fillStyle = 'transparent';
        }
        
        ctx.fill();
        
        // Stroke
        ctx.lineWidth = 1;
        ctx.strokeStyle = `${selectedFrame.textColor}33`; // 20% opacity
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw Stickers
      placedStickers.forEach(sticker => {
        ctx.save();
        const px = (sticker.x / 100) * CANVAS_WIDTH;
        const py = (sticker.y / 100) * CANVAS_HEIGHT;
        
        ctx.translate(px, py);
        ctx.rotate((sticker.rotation * Math.PI) / 180);
        
        const fontSize = 48 * sticker.scale;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sticker.emoji, 0, 0);
        
        ctx.restore();
      });

      // 5. Draw Texts
      texts.forEach(t => {
        ctx.save();
        const px = (t.x / 100) * CANVAS_WIDTH;
        const py = (t.y / 100) * CANVAS_HEIGHT;
        
        ctx.font = `bold ${t.fontSize * 1.5}px ${t.fontFamily}, sans-serif`; // upscale for high-res
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = t.color;
        
        if (selectedFrame.bgColor.toUpperCase() === '#FFFFFF') {
          ctx.shadowColor = 'rgba(0,0,0,0.1)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
        }
        
        ctx.fillText(t.text, px, py);
        ctx.restore();
      });

      // 6. Custom Image (Mascot)
      if (customImage) {
        const customImgEl = await loadImage(customImage);
        ctx.save();
        const size = 120; // Size of the overlay image
        // Place bottom left
        ctx.drawImage(customImgEl, 24, CANVAS_HEIGHT - size - 24, size, size);
        ctx.restore();
      }

      // 7. Watermark Footer
      ctx.save();
      ctx.fillStyle = selectedFrame.textColor;
      ctx.font = 'bold 16px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '4px';
      ctx.fillText('PHOTOMATICS AI BOOTH', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 24);
      ctx.restore();

      // Final output
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      onSave(dataUrl);

    } catch (err) {
      console.error("Compile failed", err);
      alert("Gagal memproses gambar");
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 min-h-screen flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xs font-mono text-brand-via tracking-widest uppercase mb-1">LANGKAH 03 DARI 03</h2>
            <h1 className="text-2xl font-display font-bold">Hias & Kustomisasi Foto</h1>
          </div>
        </div>

        <button 
          onClick={compilePhotostrip}
          disabled={isCompiling}
          className="shimmer-btn px-6 py-2.5 rounded-full font-bold text-sm flex items-center gap-2"
        >
          {isCompiling ? 'Memproses...' : (
            <><Download className="w-4 h-4" /> Simpan & Export</>
          )}
        </button>
      </div>

      <div className="flex-1 grid lg:grid-cols-12 gap-8">
        {/* Kiri: Live DOM Preview (6 col) */}
        <div className="lg:col-span-6 flex justify-center bg-black/20 rounded-3xl p-8 border border-white/5 overflow-y-auto max-h-[70vh]">
          <div 
            ref={containerRef}
            className="w-full max-w-[300px] relative shadow-2xl transition-colors duration-500 overflow-hidden touch-none"
            style={{ 
              backgroundColor: selectedFrame.bgColor,
              aspectRatio: layout.id === 'single-1' ? '1/1.13' : layout.id === 'grid-4' ? '1/1.2' : '1/2.6',
              padding: '16px'
            }}
          >
            {selectedFrame.pattern === 'radial-dot' && (
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '10px 10px', color: selectedFrame.textColor }} />
            )}

            <div className={`relative z-10 w-full h-full flex ${layout.id === 'grid-4' ? 'flex-wrap gap-2' : 'flex-col gap-2'}`}>
              {photos.map((p, i) => (
                <div 
                  key={i} 
                  className={`relative overflow-hidden border border-white/10 ${layout.id === 'grid-4' ? 'w-[calc(50%-4px)] aspect-square' : 'w-full aspect-[4/3]'}`}
                >
                  <img src={p.dataUrl} className={`w-full h-full object-cover transform -scale-x-100 ${selectedFilter.className}`} alt={`p-${i}`} />
                </div>
              ))}
              
              {/* DOM Overlay Texts */}
              {texts.map(t => (
                <div 
                  key={t.id} 
                  className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 font-bold whitespace-nowrap cursor-move select-none"
                  style={{ left: `${t.x}%`, top: `${t.y}%`, color: t.color, fontFamily: t.fontFamily, fontSize: `${t.fontSize}px`, textShadow: selectedFrame.bgColor === '#FFFFFF' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none' }}
                  onPointerDown={(e) => handlePointerDown(e, t.id, 'text')}
                >
                  {t.text}
                </div>
              ))}

              {/* DOM Overlay Stickers */}
              {placedStickers.map(s => (
                <div
                  key={s.id}
                  className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 cursor-move leading-none select-none"
                  style={{ 
                    left: `${s.x}%`, 
                    top: `${s.y}%`, 
                    fontSize: `${32 * s.scale}px`,
                    transform: `translate(-50%, -50%) rotate(${s.rotation}deg)` 
                  }}
                  onPointerDown={(e) => handlePointerDown(e, s.id, 'sticker')}
                >
                  {s.emoji}
                </div>
              ))}
            </div>

            {customImage && (
              <img src={customImage} className="absolute bottom-4 left-3 w-12 h-12 object-contain z-40 pointer-events-none" alt="Custom overlay" />
            )}
            <div className="absolute bottom-3 left-0 w-full text-center text-[8px] font-display font-bold tracking-[0.2em]" style={{ color: selectedFrame.textColor }}>
              PHOTOMATICS AI BOOTH
            </div>
          </div>
        </div>

        {/* Kanan: Editor Tools (6 col) */}
        <div className="lg:col-span-6 glass-panel rounded-3xl overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {[
              { id: 'filter', icon: ImageIcon, label: 'Filter Warna' },
              { id: 'sticker', icon: Smile, label: 'Stiker Lucu' },
              { id: 'text', icon: Type, label: 'Tambah Teks' },
              { id: 'frame', icon: Palette, label: 'Frame Warna' },
              { id: 'custom', icon: Crown, label: 'Mascot (Pro)' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-4 flex flex-col items-center gap-1 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-white/10 text-brand-via border-b-2 border-brand-via' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6 flex-1 overflow-y-auto">
            {/* Filter Tab */}
            {activeTab === 'filter' && (
              <div className="grid grid-cols-3 gap-4">
                {FILTERS.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${selectedFilter.id === filter.id ? 'border-brand-via bg-brand-via/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <div className="w-full aspect-square bg-gray-800 rounded-lg overflow-hidden">
                       <img src={photos[0]?.dataUrl} className={`w-full h-full object-cover ${filter.className}`} alt="preview" />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold truncate w-full">{filter.name}</div>
                      <div className="text-[10px] text-gray-500 mt-1">{filter.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Sticker Tab */}
            {activeTab === 'sticker' && (
              <div>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-3 mb-8">
                  {STICKERS.map(sticker => (
                    <button
                      key={sticker.id}
                      onClick={() => handleAddSticker(sticker)}
                      className="aspect-square glass-panel rounded-xl text-3xl flex items-center justify-center hover:scale-110 hover:bg-white/10 transition-all"
                    >
                      {sticker.emoji}
                    </button>
                  ))}
                </div>
                
                {placedStickers.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Layer Stiker</h4>
                    {placedStickers.map((s, idx) => (
                      <div key={s.id} className="bg-white/5 p-4 rounded-xl flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-2xl">{s.emoji}</span>
                          <button onClick={() => setPlacedStickers(prev => prev.filter(item => item.id !== s.id))} className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">Scale</label>
                            <input type="range" min="0.5" max="3" step="0.1" value={s.scale} onChange={(e) => {
                              const newS = [...placedStickers]; newS[idx].scale = Number(e.target.value); setPlacedStickers(newS);
                            }} className="w-full accent-brand-via" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase">Rotation</label>
                            <input type="range" min="-180" max="180" value={s.rotation} onChange={(e) => {
                              const newS = [...placedStickers]; newS[idx].rotation = Number(e.target.value); setPlacedStickers(newS);
                            }} className="w-full accent-brand-via" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text Tab */}
            {activeTab === 'text' && (
              <div>
                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Tulis sesuatu..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-via font-sans"
                  />
                  <button onClick={handleAddText} disabled={!inputText.trim()} className="bg-brand-via px-6 rounded-xl font-bold hover:bg-brand-end disabled:opacity-50">
                    Tambah
                  </button>
                </div>
                
                {texts.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-2 uppercase">Layer Teks</h4>
                    {texts.map((t, idx) => (
                      <div key={t.id} className="bg-white/5 p-4 rounded-xl flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="font-display font-bold truncate" style={{ color: t.color }}>{t.text}</span>
                          <button onClick={() => setTexts(prev => prev.filter(item => item.id !== t.id))} className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="text-[10px] text-gray-500 uppercase">Size</label>
                            <input type="range" min="8" max="48" value={t.fontSize} onChange={(e) => {
                              const newT = [...texts]; newT[idx].fontSize = Number(e.target.value); setTexts(newT);
                            }} className="w-full accent-brand-via" />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <label className="text-[10px] text-gray-500 uppercase">Font</label>
                            <select 
                              value={t.fontFamily}
                              onChange={(e) => {
                                const newT = [...texts]; newT[idx].fontFamily = e.target.value; setTexts(newT);
                              }}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-via mt-1 appearance-none cursor-pointer"
                              style={{ fontFamily: t.fontFamily }}
                            >
                              <option className="bg-gray-900" value="Outfit" style={{ fontFamily: 'Outfit' }}>Outfit (Modern)</option>
                              <option className="bg-gray-900" value="sans-serif" style={{ fontFamily: 'sans-serif' }}>Sans Serif</option>
                              <option className="bg-gray-900" value="serif" style={{ fontFamily: 'serif' }}>Serif</option>
                              <option className="bg-gray-900" value="monospace" style={{ fontFamily: 'monospace' }}>Monospace</option>
                              <option className="bg-gray-900" value="cursive" style={{ fontFamily: 'cursive' }}>Cursive</option>
                              <option className="bg-gray-900" value="Impact" style={{ fontFamily: 'Impact' }}>Impact</option>
                              <option className="bg-gray-900" value="'Comic Sans MS', cursive" style={{ fontFamily: "'Comic Sans MS', cursive" }}>Comic Sans</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-gray-500 uppercase">Color</label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {['#FFFFFF', '#0F172A', '#8B5CF6', '#00E5FF', '#DB2777', '#F87171', '#FBBF24', '#34D399'].map(c => (
                                <button key={c} onClick={() => {
                                  const newT = [...texts]; newT[idx].color = c; setTexts(newT);
                                }} className={`w-6 h-6 rounded-full border-2 transition-all ${t.color === c ? 'border-brand-via scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
                              ))}
                              {/* Native color picker */}
                              <label className={`w-6 h-6 rounded-full overflow-hidden border-2 cursor-pointer relative transition-all ${!['#FFFFFF', '#0F172A', '#8B5CF6', '#00E5FF', '#DB2777', '#F87171', '#FBBF24', '#34D399'].includes(t.color) ? 'border-brand-via scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500 rounded-full" />
                                <input type="color" value={t.color} onChange={(e) => {
                                  const newT = [...texts]; newT[idx].color = e.target.value; setTexts(newT);
                                }} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Frame Tab */}
            {activeTab === 'frame' && (
              <div className="grid grid-cols-2 gap-4">
                {FRAMES.map(frame => (
                  <button
                    key={frame.id}
                    onClick={() => setSelectedFrame(frame)}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${selectedFrame.id === frame.id ? 'border-brand-via bg-brand-via/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <div className="w-10 h-10 rounded-full shadow-inner border border-white/20 flex-shrink-0" style={{ backgroundColor: frame.bgColor }} />
                    <div>
                      <div className="text-sm font-bold truncate">{frame.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Custom Mascot Tab */}
            {activeTab === 'custom' && (
              <div>
                <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase">Mascot / Custom Logo</h4>
                {sessionMode !== 'premium' ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-xl border border-white/10 text-center">
                    <Crown className="w-12 h-12 text-gray-500 mb-3" />
                    <p className="text-sm font-bold text-gray-300">Fitur Premium</p>
                    <p className="text-xs text-gray-500 mt-2 max-w-xs">Upgrade ke Premium Sesi untuk menambahkan logo custom, karakter anime, atau gambar Anda sendiri di pojok photostrip.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-brand-via/30 border-dashed">
                    {!customImage ? (
                      <>
                        <label className="cursor-pointer bg-brand-via px-6 py-2.5 rounded-full font-bold hover:bg-brand-end transition text-sm flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" /> Pilih Gambar
                          <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                               const reader = new FileReader();
                               reader.onload = (e) => setCustomImage(e.target?.result as string);
                               reader.readAsDataURL(file);
                            }
                          }} />
                        </label>
                        <p className="text-xs text-gray-400 mt-4 text-center max-w-[200px]">Gunakan file PNG transparan untuk hasil terbaik.</p>
                      </>
                    ) : (
                      <div className="w-full flex flex-col items-center">
                        <img src={customImage} className="w-24 h-24 object-contain bg-black/50 rounded-lg p-2 mb-4" alt="Custom Logo" />
                        <button onClick={() => setCustomImage(null)} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1 bg-red-400/10 px-4 py-2 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" /> Hapus Gambar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditor;
