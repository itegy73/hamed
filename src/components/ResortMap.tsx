import React, { useMemo, useState, useRef } from 'react';
import { MapPin, Compass, Search, Navigation, Info, HelpCircle } from 'lucide-react';
import { Building } from '../data/buildings';
import { useFirebase } from '../context/FirebaseContext';

interface ResortMapProps {
  buildings: Building[];
  selectedBuilding: Building | null;
  onSelectBuilding: (building: Building | null) => void;
  filteredBuildings: Building[];
  lang: 'ar' | 'en';
  isAdmin?: boolean;
  isAdminModeActive?: boolean;
  onUpdateBuildingCoords?: (id: number, offsetX: number, offsetY: number) => void;
  hoveredBuilding?: Building | null;
  onHoverBuilding?: (building: Building | null) => void;
}

// Bounding box for exact resort meters coordinates
const X_MIN = -210;
const X_MAX = 240;
const Y_MIN = -190;
const Y_MAX = 175;

export default function ResortMap({
  buildings,
  selectedBuilding,
  onSelectBuilding,
  filteredBuildings,
  lang,
  isAdmin = false,
  isAdminModeActive = false,
  onUpdateBuildingCoords,
  hoveredBuilding: propsHovered,
  onHoverBuilding,
}: ResortMapProps) {
  // Keeps track of hovered building for dynamic tooltip display
  const [localHovered, setLocalHovered] = useState<Building | null>(null);
  const hoveredBuilding = propsHovered !== undefined ? propsHovered : localHovered;

  const setHoveredBuilding = (val: Building | null | ((prev: Building | null) => Building | null)) => {
    if (typeof val === 'function') {
      const computedVal = val(hoveredBuilding);
      setLocalHovered(computedVal);
      onHoverBuilding?.(computedVal);
    } else {
      setLocalHovered(val);
      onHoverBuilding?.(val);
    }
  };

  // Active dragging building state for admin coordinate modification
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { mapBgImage, mapBgOpacity, saveMapBgSettings } = useFirebase();

  // Set of ID numbers that match current filter/search to keep lookup fast
  const filteredIdsSet = useMemo(() => new Set(filteredBuildings.map(b => b.id)), [filteredBuildings]);

  // Color mapping by category/resort
  const getCategoryColor = (resort: Building['resort'], isActive: boolean) => {
    if (!isActive) return 'bg-slate-700/60 border-slate-800 text-slate-500';
    switch (resort) {
      case 'club':
        return 'bg-emerald-500 border-white text-emerald-950 shadow-emerald-500/40';
      case 'life':
        return 'bg-cyan-500 border-white text-cyan-950 shadow-cyan-500/40';
      case 'gardens':
        return 'bg-violet-500 border-white text-violet-950 shadow-violet-500/40';
      case 'general':
        return 'bg-amber-500 border-white text-amber-950 shadow-amber-500/40';
      default:
        return 'bg-slate-500 border-white text-slate-950';
    }
  };

  const getCategoryBorder = (resort: Building['resort']) => {
    switch (resort) {
      case 'club': return 'border-emerald-500/30 bg-emerald-950/20';
      case 'life': return 'border-cyan-500/30 bg-cyan-950/20';
      case 'gardens': return 'border-violet-500/30 bg-violet-950/20';
      case 'general': return 'border-amber-500/30 bg-amber-950/20';
    }
  };

  // --- Drag and Drop Pointer Coordinators ---
  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent, id: number) => {
    if (!isAdmin || !isAdminModeActive) return;
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    setDraggingId(id);
    const draggingObj = buildings.find(item => item.id === id);
    if (draggingObj) {
      onSelectBuilding(draggingObj);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (draggingId === null || !containerRef.current || !onUpdateBuildingCoords) return;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = containerRef.current.getBoundingClientRect();
    let pctX = (clientX - rect.left) / rect.width;
    let pctY = (clientY - rect.top) / rect.height;

    // Confiene bounds
    pctX = Math.max(0, Math.min(1, pctX));
    pctY = Math.max(0, Math.min(1, pctY));

    // Reverse projection
    const offsetX = Math.round(pctX * (X_MAX - X_MIN) + X_MIN);
    const offsetY = Math.round(Y_MAX - (pctY * (Y_MAX - Y_MIN)));

    onUpdateBuildingCoords(draggingId, offsetX, offsetY);
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  // --- Background Upload Managers ---
  const handleBgImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();

      // If it is an SVG file, load it directly as raw Data URL (retains perfect vector quality)
      if (file.type === 'image/svg+xml') {
        reader.onloadend = async () => {
          const svgDataUrl = reader.result as string;
          try {
            await saveMapBgSettings(svgDataUrl, mapBgOpacity);
          } catch (err: any) {
            alert(lang === 'ar' 
              ? `خطأ أثناء حفظ صورة الخلفية: ${err?.message || err}`
              : `Error saving background map: ${err?.message || err}`);
          }
        };
        reader.readAsDataURL(file);
        return;
      }

      // Otherwise, process standard raster image formats using canvas downscaling
      reader.onloadend = () => {
        const img = new Image();
        img.onload = async () => {
          // Downscale to max dimension of 1200px to guarantee safe Firestore storage limit
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Save as JPEG with high compression (0.55) to stay well under 1MB
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.55);
            try {
              await saveMapBgSettings(compressedDataUrl, mapBgOpacity);
            } catch (err: any) {
              alert(lang === 'ar' 
                ? `خطأ أثناء حفظ صورة الخلفية: ${err?.message || err}`
                : `Error saving background map: ${err?.message || err}`);
            }
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpacityChange = async (value: number) => {
    try {
      await saveMapBgSettings(mapBgImage, value);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearBgImage = async () => {
    try {
      await saveMapBgSettings(null, mapBgOpacity);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-3xl p-4 sm:p-5 shadow-2xl relative space-y-4 overflow-hidden w-full">
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* HEADER WITH MAP LEGEND */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800" style={{ direction: 'rtl' }}>
        <div className="text-right">
          {/* Title and subtitle removed by user request to keep the layout extremely clean */}
        </div>

        {/* Dynamic color key legends */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 text-[9px] font-bold text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20" />
            <span>{lang === 'ar' ? 'فندق كلوب 🏨' : 'Club'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-md shadow-cyan-500/20" />
            <span>{lang === 'ar' ? 'سي لايف 🌊' : 'Sea Life'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500 shadow-md shadow-violet-500/20" />
            <span>{lang === 'ar' ? 'أكوابارك جاردنز 🍃' : 'Gardens'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 shadow-md shadow-amber-500/20" />
            <span>{lang === 'ar' ? 'الخدمات العامة 🍽️' : 'Facilities'}</span>
          </div>
        </div>
      </div>

      {/* MAIN SCHEMATIC MAP VIEWPORT CANVAS */}
      <div 
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchEnd={handlePointerUp}
        className={`relative w-full aspect-[1.8/1] min-h-[300px] sm:min-h-[360px] bg-slate-950 border-2 border-slate-900 rounded-2xl overflow-hidden select-none shadow-inner group ${
          draggingId !== null ? 'cursor-grabbing' : isAdmin && isAdminModeActive ? 'cursor-grab' : 'cursor-default'
        }`}
      >
        
        {/* BACKGROUND GEO DECORATIONS */}
        {/* Grid lines */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(245,158,11,0.06)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        
        {/* Custom JPG/SVG Background layer image */}
        {mapBgImage && (
          <img 
            src={mapBgImage} 
            alt="Resort Background Map" 
            referrerPolicy="no-referrer"
            className="absolute inset-x-0 inset-y-0 w-full h-full object-fill pointer-events-none transition-opacity duration-200"
            style={{ opacity: mapBgOpacity }}
          />
        )}

        {/* Red Sea beaches boundary (Eastern Coastline is East/Right-hand side of coordinates) */}
        {!mapBgImage && (
          <div className="absolute top-0 right-0 h-full w-[15%] bg-blue-500/5 border-l border-blue-500/10 flex items-center justify-center p-2 text-center select-none pointer-events-none">
            <div className="origin-center rotate-90 whitespace-nowrap text-[9px] uppercase tracking-widest font-black text-blue-500/40 font-mono">
              {lang === 'ar' ? 'البحر الأحمر - خليج نبق' : 'Red Sea - Nabq Bay'}
            </div>
          </div>
        )}

        {/* Resort boundary zones subtle outline frames to give architectural perspective */}
        {!mapBgImage && (
          <>
            {/* 1. Club Resort boundary (Top-Right / North-East) */}
            <div className="absolute top-3 right-[18%] w-[33%] h-[40%] rounded-xl border border-dashed border-emerald-500/10 pointer-events-none flex items-center justify-center">
              <span className="text-[8px] font-black uppercase text-emerald-500/20 font-mono">Club Resort Ground</span>
            </div>

            {/* 2. Sea Life Resort boundary (Bottom-Right / South-East) */}
            <div className="absolute bottom-3 right-[18%] w-[45%] h-[48%] rounded-xl border border-dashed border-cyan-500/10 pointer-events-none flex items-center justify-center">
              <span className="text-[8px] font-black uppercase text-cyan-500/10 font-mono">Sea Life Ground</span>
            </div>

            {/* 3. Gardens Aqua Park (Inland / Left-side) */}
            <div className="absolute top-3 left-3 w-[30%] h-[75%] rounded-xl border border-dashed border-violet-500/10 pointer-events-none flex items-center justify-center">
              <span className="text-[8px] font-black uppercase text-violet-500/15 font-mono">Gardens Aqua Park</span>
            </div>

            {/* 4. Main Foyer Central Intersection */}
            <div className="absolute top-[40%] left-[34%] w-[12%] h-[20%] rounded-xl border border-dashed border-amber-500/10 pointer-events-none flex items-center justify-center">
              <span className="text-[8px] font-black uppercase text-amber-500/10 font-mono">Hub</span>
            </div>
          </>
        )}

        {/* Decorative Compass Rose inside the sea */}
        <div className="absolute top-4 right-4 text-blue-500/25 pointer-events-none">
          <Compass className="w-10 h-10 animate-spin-slow" />
          <span className="block text-[8px] text-center font-bold font-mono">N ▲</span>
        </div>

        {/* THE PLOTTED BUILDINGS NODES */}
        {buildings.map((b) => {
          // Dynamic scaling projection percentages
          const left = ((b.offsetX - X_MIN) / (X_MAX - X_MIN)) * 100;
          const top = ((Y_MAX - b.offsetY) / (Y_MAX - Y_MIN)) * 100;

          const isSelected = selectedBuilding?.id === b.id;
          const matchesFilter = filteredIdsSet.has(b.id);
          const isHovered = hoveredBuilding?.id === b.id;
          const isCurrentDragged = draggingId === b.id;

          return (
            <div
              key={b.id}
              className={`absolute group/pin transform -translate-x-1/2 -translate-y-1/2 ${
                isCurrentDragged ? 'z-50' : 'z-10'
              }`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
              }}
            >
              {/* Pulse ripple for selected node */}
              {(isSelected || (matchesFilter && b.id === 404)) && (
                <div className={`absolute -inset-3.5 rounded-full animate-ping opacity-60 pointer-events-none ${
                  isSelected ? 'bg-amber-500/30' : 'bg-rose-500/15'
                }`} />
              )}

              {/* Coordinates tooltip */}
              {(isHovered || isSelected || isCurrentDragged) && matchesFilter && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-slate-900 border border-slate-750 px-2 py-1 rounded text-[8px] font-mono font-bold text-white whitespace-nowrap z-30 pointer-events-none shadow-xl border-dashed">
                  {lang === 'ar' ? b.nameAr : b.nameEn}
                  <span className="block text-amber-400 font-mono text-[8px] font-black">X: {b.offsetX}م | Y: {b.offsetY}م</span>
                </div>
              )}

              {/* Pulsating dot / clickable node */}
              <button
                type="button"
                onMouseDown={(e) => handleStartDrag(e, b.id)}
                onTouchStart={(e) => handleStartDrag(e, b.id)}
                onClick={() => {
                  if (draggingId === null) {
                    onSelectBuilding(b);
                    setHoveredBuilding(b);
                  }
                }}
                onMouseEnter={() => setHoveredBuilding(b)}
                onMouseLeave={() => setHoveredBuilding(previous => previous?.id === b.id ? null : previous)}
                title={lang === 'ar' ? b.nameAr : b.nameEn}
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center font-mono font-bold text-[8.5px] transition-all duration-300 ${
                  getCategoryColor(b.resort, matchesFilter)
                } ${
                  isAdmin && isAdminModeActive 
                    ? isCurrentDragged
                      ? 'scale-135 ring-4 ring-amber-400/75 border-amber-300 bg-amber-400 text-slate-950 font-black cursor-grabbing z-55 shadow-2xl'
                      : 'cursor-grab hover:scale-120'
                    : ''
                } ${
                  isSelected && !isCurrentDragged
                    ? 'scale-12 w-6 h-6 sm:w-7 sm:h-7 border-slate-200 ring-4 ring-amber-500/50 z-25 bg-amber-400 font-black text-slate-950' 
                    : !matchesFilter
                    ? 'opacity-20 pointer-events-none scale-85 z-0'
                    : 'opacity-100 hover:z-20 shadow-md'
                }`}
              >
                {/* Visual marker abbreviation (like building ID tail or short single letter) */}
                {b.type === 'rooms' ? b.id.toString().slice(-2) : b.nameEn[0]}
              </button>
            </div>
          );
        })}

      </div>

      {/* ADMIN MAP SETTINGS OVERLAY */}
      {isAdmin && isAdminModeActive && (
        <div className="p-3.5 bg-slate-950 border-2 border-dashed border-amber-500/40 rounded-2xl space-y-3 mt-4 animate-scale-up" style={{ direction: 'rtl' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right">
            <div>
              <strong className="text-xs text-amber-400 block font-black">⚙️ إعدادات خلفية الخريطة وسحب التفاصيل:</strong>
              <p className="text-[10.5px] text-slate-400 mt-0.5 leading-normal font-sans">
                {lang === 'ar'
                  ? 'اسحب أي دبوس (مبنى) على الخريطة مباشرة لوضعه في مكانه الجديد بدقة، وسيتم تحديث إحداثياته تلقائياً! كما يمكنك تحميل صورتك المفضلة كخلفية والتحكم بشفافيتها.'
                  : 'Drag any map pin directly to displace it to correct spots. Upload map image below.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-900">
            {/* JPG/SVG Background controller */}
            <div className="space-y-2 text-right">
              <label className="text-[10px] font-black text-slate-300 block mb-1">خريطة الخلفية مخصصة (JPG/PNG/SVG):</label>
              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  accept="image/jpeg,image/png,image/svg+xml"
                  onChange={handleBgImageChange}
                  className="hidden" 
                  id="map-bg-file"
                />
                <label 
                  htmlFor="map-bg-file" 
                  className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-[10.5px] cursor-pointer hover:bg-amber-500/20 transition font-black flex items-center gap-1.5 shrink-0"
                >
                  📁 {lang === 'ar' ? 'تحميل صورة الخريطة' : 'Upload Map JPG'}
                </label>

                {mapBgImage && (
                  <button
                    type="button"
                    onClick={handleClearBgImage}
                    className="px-2.5 py-1.5 bg-red-950 text-red-500 border border-red-900/30 rounded-xl text-[10.5px] hover:bg-red-900/40 transition font-bold"
                  >
                    🗑️ {lang === 'ar' ? 'إزالة الخلفية' : 'Remove BG'}
                  </button>
                )}
              </div>
            </div>

            {/* Opacity slider */}
            <div className="space-y-1.5 text-right flex flex-col justify-end">
              <div className="flex items-center justify-between text-[10px] text-slate-300 font-sans">
                <span className="font-mono text-amber-400 font-bold">{Math.round(mapBgOpacity * 100)}%</span>
                <span className="font-black">نسبة شفافية الصورة الخلفية:</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={mapBgOpacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-900 accent-amber-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
