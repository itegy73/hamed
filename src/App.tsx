import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Compass, 
  MapPin, 
  Camera, 
  ArrowLeft, 
  AlertTriangle,
  MoveUp,
  CheckCircle,
  Award,
  Navigation,
  Globe,
  Sliders,
  RotateCcw,
  Search,
  X
} from 'lucide-react';
import { Building } from './data/buildings';
import { getHaversineDistance, getBearing, getCoordinatesFromOffsets, formatDistance } from './utils/geo';
import ResortMap from './components/ResortMap';
import { useFirebase } from './context/FirebaseContext';
import AdminPanel from './components/AdminPanel';

// Default center coordinates bounds directly to Charmillion Resorts (Nabq Bay, Sharm El Sheikh, Egypt)
const DEFAULT_CENTER = {
  lat: 27.9987554,
  lon: 34.4319008,
  nameAr: "منتجعات تشارميليون (شرم الشيخ)",
  nameEn: "Charmillion Resorts (Sharm El Sheikh)"
};

export default function App() {
  const { 
    buildings: firebaseBuildings, 
    isAdmin, 
    addOrEditPlace, 
    deletePlace,
    user,
    loginWithGoogle,
    logoutUser
  } = useFirebase();

  // Admin draft previews state for local interactive verification before saving to Firestore
  const [adminDraftPlaces, setAdminDraftPlaces] = useState<Building[] | null>(null);
  const [isAdminModeActive, setIsAdminModeActive] = useState(false);

  // Active places list
  const activeBuildings = useMemo(() => {
    return adminDraftPlaces || firebaseBuildings;
  }, [adminDraftPlaces, firebaseBuildings]);

  // Handle live pin dragging coordination update on the ResortMap
  const updateBuildingCoords = (id: number, offsetX: number, offsetY: number) => {
    const list = adminDraftPlaces || firebaseBuildings;
    const freshDraft = list.map(b => 
      b.id === id ? { ...b, offsetX, offsetY } : b
    );
    // Persist as local draft coordinates preview
    setAdminDraftPlaces(freshDraft);
    
    // Smoothly synchronize the map-selected building details state
    if (selectedBuilding && selectedBuilding.id === id) {
      setSelectedBuilding({ ...selectedBuilding, offsetX, offsetY });
    }
  };

  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [reachedTarget, setReachedTarget] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Search & Categorization states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'club' | 'life' | 'gardens' | 'general'>('all');

  // GPS Coordinates and bearing tracker states
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [sessionAnchorCoords, setSessionAnchorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null); // 0 = North, 90 = East
  const [pitch, setPitch] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Interactive mock simulation variables (specifically for testing at home/Cairo far from Sharm resort)
  const [simulatedOffset, setSimulatedOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSandboxTesting, setIsSandboxTesting] = useState(false);

  // Camera settings
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watchPositionId = useRef<number | null>(null);

  // iOS orientation permissions trigger state
  const [iOSPermissionPrompt, setIOSPermissionPrompt] = useState(false);

  // --- Geolocation Live Tracker Initialization ---
  useEffect(() => {
    setIsGpsLoading(true);
    if (!navigator.geolocation) {
      setGpsError(lang === 'ar' ? 'البوابة الرياضية أو المتصفح محجوب لدقة GPS الكاميرا.' : 'Device does not support GPS or is blocked by browser restrictions.');
      setIsGpsLoading(false);
      return;
    }

    // Get exact current position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        const center = { lat: latitude, lon: longitude };
        setCurrentCoords(center);
        setSessionAnchorCoords(center);
        setIsGpsLoading(false);
      },
      (err) => {
        console.warn("Initial retrieve failed, using static default: ", err);
        const fallback = { lat: DEFAULT_CENTER.lat, lon: DEFAULT_CENTER.lon };
        setCurrentCoords(fallback);
        setSessionAnchorCoords(fallback);
        setIsGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(lang === 'ar' ? 'إذن الوصول للموقع مطلوب لتفعيل بوصلة GPS الملاحية.' : 'GPS location permission required for dynamic wayfinding.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Watch position continuously for true real-time walking accuracy
    watchPositionId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        
        let targetCoords = { lat: latitude, lon: longitude };

        // Save anchor coordinate session if not already defined (Cairo/Home simulation)
        setSessionAnchorCoords(prev => prev || targetCoords);

        // Apply sandbox displacement in meters directly if simulation is used
        if (isSandboxTesting && (simulatedOffset.x !== 0 || simulatedOffset.y !== 0)) {
          const latOffset = simulatedOffset.y / 111111.0;
          const lonOffset = simulatedOffset.x / (111111.0 * Math.cos((latitude * Math.PI) / 180));
          targetCoords = {
            lat: latitude + latOffset,
            lon: longitude + lonOffset
          };
        }

        setCurrentCoords(targetCoords);
      },
      (err) => {
        console.warn("GPS watch failed continuous logging:", err);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    return () => {
      if (watchPositionId.current !== null) {
        navigator.geolocation.clearWatch(watchPositionId.current);
      }
    };
  }, [isSandboxTesting, simulatedOffset]);

  // --- Orientation Listeners (Magnetometer / Gyroscope Compass) ---
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;
      if ('webkitCompassHeading' in e) {
        heading = (e as any).webkitCompassHeading as number;
      } else if (e.alpha !== null) {
        heading = (360 - e.alpha) % 360;
      }
      
      if (heading !== null) {
        setUserHeading(Math.round(heading));
      }

      if (e.beta !== null) setPitch(Math.round(e.beta));
      if (e.gamma !== null) setRoll(Math.round(e.gamma));
    };

    if (typeof window !== 'undefined') {
      const win = window as any;
      if ('ondeviceorientationabsolute' in win) {
        win.addEventListener('deviceorientationabsolute', handleOrientation);
      } else if ('ondeviceorientation' in win) {
        win.addEventListener('deviceorientation', handleOrientation);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        const win = window as any;
        win.removeEventListener('deviceorientationabsolute', handleOrientation);
        win.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, []);

  // Check if user is physical inside or close to the resort (within 10 km)
  const isPhysicallyAtResort = useMemo(() => {
    if (!currentCoords) return false;
    const distanceToResort = getHaversineDistance(
      currentCoords.lat,
      currentCoords.lon,
      DEFAULT_CENTER.lat,
      DEFAULT_CENTER.lon
    );
    return distanceToResort < 12000; // 12 kilometers threshold
  }, [currentCoords]);

  // Filter buildings list based on search and category tab
  const filteredBuildings = useMemo(() => {
    return activeBuildings.filter(b => {
      // Category filter
      if (selectedCategory !== 'all' && b.resort !== selectedCategory) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchesAr = b.nameAr.toLowerCase().includes(q) || (b.descriptionAr && b.descriptionAr.toLowerCase().includes(q));
        const matchesEn = b.nameEn.toLowerCase().includes(q) || (b.descriptionEn && b.descriptionEn.toLowerCase().includes(q));
        const matchesId = b.id.toString().includes(q);
        return matchesAr || matchesEn || matchesId;
      }
      return true;
    });
  }, [selectedCategory, searchQuery, activeBuildings]);

  // --- Dynamic calculations of targets coordinates based on User GPS ---
  const activeSelectedBuildingCoords = useMemo(() => {
    if (!selectedBuilding) return null;

    // Determine the anchor center to project offsets from
    const anchor = isPhysicallyAtResort 
      ? DEFAULT_CENTER 
      : (sessionAnchorCoords || DEFAULT_CENTER);

    return getCoordinatesFromOffsets(
      anchor.lat,
      anchor.lon,
      selectedBuilding.offsetX,
      selectedBuilding.offsetY
    );
  }, [selectedBuilding, isPhysicallyAtResort, sessionAnchorCoords]);

  // --- Calculate Distance and Bearing to selected destination ---
  const navigationMetrics = useMemo(() => {
    if (!currentCoords || !activeSelectedBuildingCoords) {
      return { distance: 1000, bearing: 0 };
    }
    const dist = getHaversineDistance(
      currentCoords.lat,
      currentCoords.lon,
      activeSelectedBuildingCoords.lat,
      activeSelectedBuildingCoords.lon
    );
    const brng = getBearing(
      currentCoords.lat,
      currentCoords.lon,
      activeSelectedBuildingCoords.lat,
      activeSelectedBuildingCoords.lon
    );
    return { distance: dist, bearing: brng };
  }, [currentCoords, activeSelectedBuildingCoords]);

  // Trigger Destination Reached overlay if user walks within 5 meters
  useEffect(() => {
    if (isNavigating && selectedBuilding && navigationMetrics.distance <= 5) {
      setReachedTarget(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }, [navigationMetrics.distance, isNavigating, selectedBuilding]);

  // --- Camera Management ---
  const startCamera = async () => {
    try {
      const constraints = {
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Camera hardware locked or unsupported.", err);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  // Switch navigation ON
  const startWayfinding = async () => {
    if (!selectedBuilding) return;

    // Check deviceorientation permission requirement for modern iPhones (iOS 13+)
    if (
      typeof window !== 'undefined' &&
      typeof (window as any).DeviceOrientationEvent !== 'undefined' &&
      typeof (window as any).DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const response = await (window as any).DeviceOrientationEvent.requestPermission();
        if (response !== 'granted') {
          console.warn("Sensor access denied by iOS");
        }
      } catch (err) {
        console.error("iOS sensor permission error on click:", err);
      }
    }

    setReachedTarget(false);
    setIsNavigating(true);

    // Automatically enable sanbox simulation mode if user is testing far from the beachfront resort
    if (!isPhysicallyAtResort) {
      setIsSandboxTesting(true);
    }

    await startCamera();
  };

  const stopWayfinding = () => {
    stopCamera();
    setIsNavigating(false);
    setSimulatedOffset({ x: 0, y: 0 });
    setIsSandboxTesting(false);
  };

  // --- Continuous Short-Path Rotation Unwrapper Hook ---
  const [smoothAngle, setSmoothAngle] = useState(0);
  useEffect(() => {
    const rawTarget = (navigationMetrics.bearing - (userHeading ?? 0) + 360) % 360;
    setSmoothAngle(prev => {
      // Direct arithmetic offset taking the absolute shortest path on the circular boundary (no wild 360-degree rewinds)
      const diff = (rawTarget - (prev % 360) + 540) % 360 - 180;
      return prev + diff;
    });
  }, [navigationMetrics.bearing, userHeading]);

  // --- Simulated Displacement walk generator ---
  const simulateWalk = (direction: 'forward' | 'backward' | 'left' | 'right' | 'reset', stepsMeters = 3) => {
    if (direction === 'reset') {
      setSimulatedOffset({ x: 0, y: 0 });
      return;
    }

    const angleRad = ((userHeading ?? 0) * Math.PI) / 180;
    let dx = 0;
    let dy = 0;

    switch (direction) {
      case 'forward':
        dx = stepsMeters * Math.sin(angleRad);
        dy = stepsMeters * Math.cos(angleRad);
        break;
      case 'backward':
        dx = -stepsMeters * Math.sin(angleRad);
        dy = -stepsMeters * Math.cos(angleRad);
        break;
      case 'left':
        dx = -stepsMeters * Math.cos(angleRad);
        dy = stepsMeters * Math.sin(angleRad);
        break;
      case 'right':
        dx = stepsMeters * Math.cos(angleRad);
        dy = -stepsMeters * Math.sin(angleRad);
        break;
    }

    setSimulatedOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  // Teleport helper for sandbox quick verification
  const teleportCloseToTarget = () => {
    if (!selectedBuilding) return;
    setSimulatedOffset({
      x: selectedBuilding.offsetX - 7,
      y: selectedBuilding.offsetY - 7
    });
  };

  // Decorative stars for backup desk simulator backdrop
  const starsArray = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 105}%`,
      opacity: Math.random() * 0.7 + 0.3
    }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden antialiased">
      
      {/* GLOBAL BANNER HEADER */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 space-x-reverse" style={{ direction: 'rtl' }}>
          <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-right">
            <h1 className="text-sm md:text-base font-bold font-display tracking-tight text-amber-500">
              {lang === 'ar' ? 'مستكشف الفندق الذكي (GPS)' : 'Smart Hotel Wayfinder (GPS)'}
            </h1>
            <p className="text-[9px] text-slate-400 font-mono">50 Buildings Resort Hub</p>
          </div>
        </div>

        {/* HEADER CONTROLS */}
        <div className="flex items-center gap-2">
          {/* Change language toggle */}
          <button 
            onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-[11px] font-bold border border-slate-700/50 text-slate-200"
          >
            <Globe className="w-3.5 h-3.5 text-amber-500" />
            <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          {/* User Sign In and Admin Switcher */}
          {!user ? (
            <button
              onClick={loginWithGoogle}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px] hover:bg-amber-400 transition shadow"
            >
              <span>🔑 {lang === 'ar' ? 'دخول المدير' : 'Admin Login'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setIsAdminModeActive(prev => !prev)}
                  className={`px-3 py-1.5 rounded-lg font-black text-[11px] transition flex items-center gap-1.5 shadow ${
                    isAdminModeActive 
                      ? 'bg-rose-600 text-white animate-pulse' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <span>{isAdminModeActive 
                    ? (lang === 'ar' ? 'الخروج للرئيسية 📱' : 'Exit Admin 📱') 
                    : (lang === 'ar' ? 'بوابة الإدارة 🛠️' : 'Admin Console 🛠️')}
                  </span>
                </button>
              )}
              
              <button
                onClick={logoutUser}
                title={lang === 'ar' ? 'خروج' : 'Logout'}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition text-[11px] font-bold border border-slate-700/60"
              >
                {lang === 'ar' ? 'خروج' : 'Logout'}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ERROR / WARNING MESSAGES */}
      {gpsError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5 text-right animate-fade-in" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
          <div className="max-w-7xl mx-auto flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
            <span className="text-xs text-red-250">
              {gpsError}
            </span>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col justify-center p-4 py-6">
        
        {/* ========================================================
            SCREEN 1: THE MINIMALIST CLEAN TARGET SELECTION 
            ======================================================== */}
        {!isNavigating && (
          <div className="space-y-6 animate-fade-in text-right w-full" style={{ direction: 'rtl' }}>
            
            {/* MINI HEADER CARD */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              
              <div className="relative text-center space-y-2">
                <h2 className="text-lg md:text-xl font-extrabold text-white">
                  {lang === 'ar' ? 'تحديد وجهتك في فندق تشارميليون' : 'Find Your Resort Spot'}
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed max-w-md mx-auto">
                  {lang === 'ar' 
                    ? 'اختر أي مبنى من الـ ٥٠ مبنى وموقعاً خدمياً، ثم انقر على الكاميرا والـ GPS لبدء تتبع وإظهار سهم الوجهة التفاعلية تلقائياً.' 
                    : 'Select from 50 building numbers or public guest spots to trace your path on physical map coordinates.'}
                </p>
              </div>

              {/* CHOSEN COMPASS STABILIZER STATE */}
              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-900 max-w-xs mx-auto">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {lang === 'ar' ? 'البوصلة والـ GPS نشط' : 'Sensors & GPS Active'}
                </span>
                {currentCoords && (
                  <span className="text-emerald-400 font-bold">
                    ({currentCoords.lat.toFixed(5)}, {currentCoords.lon.toFixed(5)})
                  </span>
                )}
              </div>
            </div>

            {/* INTERACTIVE RESORT DIRECTIONS MAP */}
            {adminDraftPlaces && (
              <div className="bg-amber-500/10 border border-dashed border-amber-500/40 rounded-2xl p-3 text-center text-xs text-amber-400 font-bold max-w-md mx-auto animate-pulse flex items-center justify-center gap-2">
                <span>👁️ {lang === 'ar' ? 'أنت تشاهد حالياً معاينة للمباني والمواقع المعدلة محلياً.' : 'Viewing unsaved local draft preview locations.'}</span>
              </div>
            )}

            <ResortMap 
              buildings={activeBuildings}
              selectedBuilding={selectedBuilding}
              onSelectBuilding={setSelectedBuilding}
              filteredBuildings={filteredBuildings}
              lang={lang}
              isAdmin={isAdmin}
              isAdminModeActive={isAdminModeActive}
              onUpdateBuildingCoords={updateBuildingCoords}
            />

            {/* THE PROFESSIONAL CATEGORIZED & SEARCHABLE SELECTOR PANEL */}
            {isAdmin && isAdminModeActive ? (
              <AdminPanel
                buildings={activeBuildings}
                onPreview={(drafts) => setAdminDraftPlaces(drafts)}
                onPublish={addOrEditPlace}
                onDelete={deletePlace}
                lang={lang}
                draftPlaces={adminDraftPlaces}
                onClearDrafts={() => setAdminDraftPlaces(null)}
                onPublishAllDrafts={async (drafts) => {
                  for (const p of drafts) {
                    await addOrEditPlace(p);
                  }
                  setAdminDraftPlaces(null);
                }}
                setSelectedBuilding={setSelectedBuilding}
                selectedBuilding={selectedBuilding}
              />
            ) : (
              <div className="bg-slate-900 border border-slate-800/85 rounded-3xl p-5 md:p-6 space-y-5 shadow-2xl relative">
              
              {/* SEARCH FIELD WITH A LENS / GLASSES ICON DESIGN */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {lang === 'ar' ? 'البحث السريع عن مكان أو رقم مبنى:' : 'Fast Search for Spot or Building:'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-amber-500/80">
                    <Search className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={lang === 'ar' ? 'اكتب اسم المكان، الرقم أو المرفق...' : 'Type building name, ID or services...'}
                    className="w-full bg-slate-950 border-2 border-slate-800 focus:border-amber-500 text-slate-100 rounded-2xl py-3.5 pr-11 pl-10 text-xs sm:text-sm font-bold text-right focus:outline-none transition-all duration-200 shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 left-3 flex items-center justify-center px-1 text-slate-400 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* CATEGORY TABS SELECTOR */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  {lang === 'ar' ? 'تصنيف الأماكن بالمجمع:' : 'Resort Categories:'}
                </label>
                
                {/* Horizontal scrolling or grid wrap for categories */}
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:flex sm:flex-wrap gap-2 text-right">
                  {[
                    { id: 'all', labelAr: 'الكل 🌐', labelEn: 'All' },
                    { id: 'club', labelAr: 'كلوب 🏨', labelEn: 'Club Resort' },
                    { id: 'life', labelAr: 'سي لايف 🌊', labelEn: 'Sea Life' },
                    { id: 'gardens', labelAr: 'جاردنز 🍃', labelEn: 'Gardens' },
                    { id: 'general', labelAr: 'مرافق عامة 🍽️', labelEn: 'Services' }
                  ].map((category) => {
                    const isActive = selectedCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(category.id as any);
                        }}
                        className={`px-3 py-2 text-[11px] font-bold rounded-xl border transition-all duration-200 capitalize ${
                          isActive
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-extrabold shadow-lg shadow-amber-500/20'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
                        }`}
                      >
                        {lang === 'ar' ? category.labelAr : category.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LISTING THE CATEGORIZED PLACES */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                  <span>
                    {lang === 'ar' 
                      ? `وجدنا (${filteredBuildings.length}) مكاناً` 
                      : `Found (${filteredBuildings.length}) spots`}
                  </span>
                  <span>
                    {lang === 'ar' ? 'اضغط لاختيار مكان تود الذهاب إليه:' : 'Click to select destination:'}
                  </span>
                </div>

                {/* SCROLLABLE GRID CONTAINER FOR PLACES */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl max-h-[260px] overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                  {filteredBuildings.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredBuildings.map((building) => {
                        const isChosen = selectedBuilding?.id === building.id;
                        return (
                          <button
                            key={building.id}
                            type="button"
                            onClick={() => setSelectedBuilding(building)}
                            className={`p-3 rounded-xl border text-right transition-all duration-200 flex items-center justify-between gap-2.5 cursor-pointer ${
                              isChosen
                                ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-md'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            {/* Left indicator or Check Circle */}
                            <div>
                              {isChosen ? (
                                <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />
                              ) : (
                                <span className="text-[9px] font-mono text-slate-505 capitalize">
                                  {building.resort}
                                </span>
                              )}
                            </div>

                            {/* Right Title Info */}
                            <div className="flex-1 min-w-0 pr-1 text-right">
                              <span className="text-[10px] bg-slate-950/80 px-1.5 py-0.5 rounded text-amber-400 font-bold font-mono ml-2">
                                #{building.id}
                              </span>
                              <span className="text-xs font-bold truncate">
                                {lang === 'ar' ? building.nameAr : building.nameEn}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      {lang === 'ar' ? 'لا يوجد نتائج تطابق بحثك الحالي.' : 'No spots matching your search.'}
                    </div>
                  )}
                </div>
              </div>

              {/* OPTIONAL SELECTED SPECIFICATIONS CARD */}
              {selectedBuilding && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2 animate-scale-up">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                    <h3 className="text-xs font-black text-amber-500">
                      {selectedBuilding.nameAr}
                    </h3>
                    <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">
                      ID: #{selectedBuilding.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-350 leading-relaxed font-sans mt-1">
                    {lang === 'ar' ? selectedBuilding.descriptionAr : selectedBuilding.descriptionEn}
                  </p>
                  
                  {/* Verified physical offsets */}
                  <div className="text-[9.5px] font-mono text-slate-500 bg-slate-900/55 p-1 px-2 rounded flex justify-between">
                    <span>
                      {lang === 'ar' ? 'الإزاحة الفندقية:' : 'Resort Meter Offset:'}
                    </span>
                    <span className="text-slate-300 font-bold">
                      X: {selectedBuilding.offsetX}m, Y: {selectedBuilding.offsetY}m
                    </span>
                  </div>
                </div>
              )}

              {/* CORE LAUNCH TRIGGERS ( زر البدء فقط ) */}
              <button
                disabled={!selectedBuilding}
                onClick={startWayfinding}
                className={`w-full py-4.5 rounded-2xl font-black font-display text-sm flex items-center justify-center gap-2.5 shadow-xl transition-all duration-300 ${
                  selectedBuilding 
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/10 cursor-pointer active:scale-[0.98]' 
                    : 'bg-slate-800 text-slate-600 border border-slate-850 cursor-not-allowed'
                }`}
              >
                <Camera className="w-5 h-5" />
                <span>
                  {lang === 'ar' ? 'ابدأ التوجيه بالـ GPS والكاميرا' : 'Start Camera & GPS Wayfinding'}
                </span>
              </button>
            </div>
            )}
            
          </div>
        )}

        {/* ========================================================
            SCREEN 2: THE COMPACT HUD ACTIVE NAVIGATION VIEWPORT
            ======================================================== */}
        {isNavigating && selectedBuilding && (
          <div className="relative flex-1 w-full flex flex-col justify-between overflow-hidden rounded-3xl bg-black border border-slate-850 min-h-[70vh] shadow-2xl" style={{ direction: 'ltr' }}>
            
            {/* BACKGROUND ACTIVE CAMERA FEED OR BACKUP DECORATIVE SPACE */}
            {isCameraActive ? (
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-90 saturate-[1.1]"
              />
            ) : (
              <div className="absolute inset-0 w-full h-full bg-slate-950 z-0 overflow-hidden flex flex-col justify-between">
                <div className="absolute inset-0 z-0">
                  {starsArray.map((st, idx) => (
                    <div 
                      key={idx}
                      className="absolute bg-slate-200 rounded-full animate-pulse"
                      style={{
                        left: st.left,
                        top: st.top,
                        width: '2px',
                        height: '2px',
                        opacity: st.opacity,
                      }}
                    />
                  ))}
                  <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fca5a5_1px,transparent_1px)] [background-size:20px_20px]" />
                  <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-slate-950 to-transparent" />
                </div>
                
                {/* Simulated message desk */}
                <div className="absolute inset-x-4 top-1/3 z-10 mx-auto max-w-xs bg-slate-900/90 border border-slate-800 p-4 rounded-xl text-center shadow-2xl backdrop-blur-md">
                  <Camera className="w-7 h-7 text-amber-500 mx-auto animate-pulse mb-2" />
                  <h4 className="text-xs font-bold text-white mb-1">
                    {lang === 'ar' ? 'المعاينة الملاحية نشطة' : 'Navigation Overlay Ready'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'ar' 
                      ? 'للحصول على دقة كاملة، شغل البرنامج على متصفح هاتف ذكي مباشر. تم احتساب اتجاه البوصلة الملاحية ومواقع الـ GPS بالكامل.'
                      : 'To experience live video backdrop feeds, open this application preview directly inside a physical smartphone browser.'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* A. NAV HUD HEADER (DESTINATION DETAILS & EXIT BUTTON) */}
            <div className="w-full p-4 z-10 bg-gradient-to-b from-slate-950 via-slate-950/45 to-transparent flex items-center justify-between">
              <button 
                onClick={stopWayfinding}
                className="p-2.5 bg-slate-900/95 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:bg-slate-850 transition shadow"
                title={lang === 'ar' ? 'رجوع لتعديل الوجهة' : 'Go back'}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="text-right leading-none" style={{ direction: 'rtl' }}>
                <span className="text-[9px] text-amber-500 uppercase tracking-widest font-black block mb-1">
                  {lang === 'ar' ? 'توجيه نشط الآن' : 'LIVE NAVIGATION'}
                </span>
                <h2 className="text-xs sm:text-sm font-extrabold text-white">
                  {lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn}
                </h2>
              </div>
            </div>

            {/* B. CENTRAL VIRTUAL COMPASS POINTER WITH SHORT-PATH rotation */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              
              <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Glow rings */}
                <div className="absolute inset-0 rounded-full border border-amber-500/10 pulsing-ring pointer-events-none" />
                <div className="absolute inset-6 rounded-full border border-slate-800/40 pointer-events-none" />

                {/* Rotating alignment disc */}
                <div 
                  className="w-40 h-40 rounded-full border border-slate-800 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center shadow-2xl relative transition-transform duration-100"
                  style={{
                    transform: `perspective(400px) rotateX(${Math.max(10, Math.min(50, pitch))}deg) rotateY(${Math.max(-15, Math.min(15, roll))}deg)`
                  }}
                >
                  <span className="absolute top-2.5 text-[9px] text-red-500 font-extrabold font-mono">N</span>
                  <span className="absolute bottom-2.5 text-[9px] text-slate-500 font-bold font-mono">S</span>

                  {/* ROTATING ARROW STYLED FOR CONTINUOUS SHORTEST LINE PROGRESSION */}
                  <div 
                    className="absolute w-28 h-28 flex items-center justify-center transition-transform duration-300 ease-out"
                    style={{ transform: `rotate(${smoothAngle}deg)` }}
                  >
                    <div className="relative w-6 h-16 -mt-8 flex flex-col items-center">
                      {/* Arrow Head */}
                      <div className="w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-b-[26px] border-b-amber-500 filter drop-shadow-[0_0_6px_rgba(244,63,94,0.4)]" />
                      {/* Arrow tail stem */}
                      <div className="w-2.5 h-8 bg-amber-500/90 -mt-0.5 rounded-b" />
                    </div>
                  </div>

                  {/* Central Hub center point */}
                  <div className="relative w-3.5 h-3.5 rounded-full bg-slate-950 border border-amber-400 z-10 flex items-center justify-center">
                    <div className="w-1 h-1 bg-amber-400 rounded-full" />
                  </div>
                </div>

                {/* Upright alignment warning reminder */}
                {(Math.abs(pitch - 70) > 30) && (
                  <div className="absolute bottom-[-15px] bg-slate-950/95 border border-amber-500/30 px-3 py-1 rounded-full text-[9px] text-slate-350 text-center animate-bounce">
                    {lang === 'ar' 
                      ? 'ارفع مستوى الموبايل بشكل رأسي للحصول على بوصلة صحيحة' 
                      : 'Position mobile vertically ahead for accurate directions'}
                  </div>
                )}
              </div>
            </div>

            {/* C. BOTTOM METRICS HUD */}
            <div className="w-full z-10 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent p-4 pb-6 flex flex-col gap-3.5">
              
              <div className="flex items-center justify-between border-t border-slate-900 pt-3">
                
                {/* Dynamic live meters remaining */}
                <div className="flex items-center gap-3" style={{ direction: 'rtl' }}>
                  <div className="p-2.5 bg-amber-500/20 text-amber-500 rounded-xl border border-amber-500/25">
                    <Navigation className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 font-mono uppercase">
                      {lang === 'ar' ? 'المسافة المتبقية للموقع' : 'METERS TO ARRIVAL'}
                    </div>
                    <div className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                      <span>{Math.round(navigationMetrics.distance)}</span>
                      <span className="text-xs text-amber-400 font-sans">{lang === 'ar' ? 'متر' : 'm'}</span>
                    </div>
                  </div>
                </div>

                {/* Micro diagnostic tags */}
                <div className="flex flex-col items-end text-[9px] font-mono text-slate-400 gap-1 select-text">
                  <span>GPS: {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : 'WATCHING'}</span>
                  <span>Bearing: {Math.round(navigationMetrics.bearing)}°</span>
                  <span>Heading: {userHeading !== null ? `${userHeading}°` : '---'}</span>
                </div>
              </div>

              {/* DEMO SANDBOX CONTROLS TO PERMIT PHYSICAL STEPS SIMULATION AT HOME */}
              {isSandboxTesting && (
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-bold text-amber-500 tracking-wider">
                    <span>
                      {lang === 'ar' ? 'لوحة المحاكاة للموقع البعيد' : 'SIMULATOR CONTROLS (TESTING AT HOME)'}
                    </span>
                    <button 
                      onClick={() => setSimulatedOffset({ x: 0, y: 0 })}
                      className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded hover:text-white"
                    >
                      {lang === 'ar' ? 'إعادة الإزاحة' : 'Reset Offset'}
                    </button>
                  </div>
                  
                  <div className="flex justify-between items-center gap-2">
                    {/* Simulated coordinates info */}
                    <div className="text-[9px] text-slate-400 font-mono">
                      X: {Math.round(simulatedOffset.x)}m, Y: {Math.round(simulatedOffset.y)}m
                    </div>

                    {/* Joystick keypad */}
                    <div className="flex gap-1">
                      <button 
                        onClick={() => simulateWalk('forward')} 
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 rounded font-bold text-[9px]"
                      >
                        {lang === 'ar' ? 'أمام' : 'Up'}
                      </button>
                      <button 
                        onClick={() => simulateWalk('backward')} 
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 rounded font-bold text-[9px]"
                      >
                        {lang === 'ar' ? 'خلف' : 'Back'}
                      </button>
                      <button 
                        onClick={teleportCloseToTarget}
                        className="px-2 py-1 bg-amber-500 text-slate-950 font-black rounded text-[9px]"
                      >
                        {lang === 'ar' ? 'اذهب للموقع المباشر (10م)' : 'Teleport Close (10m)'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 3: CONGRATULATIONS REACHED TARGET PANEL overlay
            ======================================================== */}
        {reachedTarget && selectedBuilding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md">
            
            <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl w-full max-w-sm p-6 text-center space-y-4 animate-scale-up" style={{ direction: 'rtl' }}>
              <div className="w-14 h-14 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center mx-auto shadow-xl">
                <Award className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-amber-500 tracking-wider">
                  {lang === 'ar' ? 'تهانينا الرائعة! 🎉' : 'Destination Unlocked! 🎉'}
                </span>
                <h3 className="text-lg font-black text-white">
                  {lang === 'ar' ? 'لقد وصلت إلى وجهتك بسلام!' : 'You Have Arrived Successfully'}
                </h3>
                <p className="text-xs font-bold text-amber-400">
                  {selectedBuilding.nameAr}
                </p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-right text-xs space-y-1 text-slate-350">
                <p className="text-[11px] leading-relaxed">
                  {lang === 'ar' ? selectedBuilding.descriptionAr : selectedBuilding.descriptionEn}
                </p>
                {selectedBuilding.hoursAr && (
                  <div className="text-[10px] text-slate-400 mt-2">
                    <strong>{lang === 'ar' ? 'مواعيد العمل:' : 'Hours:'}</strong> {lang === 'ar' ? selectedBuilding.hoursAr : selectedBuilding.hoursEn}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setReachedTarget(false);
                    setSimulatedOffset({ x: 0, y: 0 });
                  }}
                  className="py-2.5 bg-slate-800 text-slate-300 hover:bg-slate-750 font-bold rounded-xl text-xs"
                >
                  {lang === 'ar' ? 'إعادة الملاحة' : 'Re-Navigate'}
                </button>
                <button
                  onClick={() => {
                    setReachedTarget(false);
                    stopWayfinding();
                    setSelectedBuilding(null);
                  }}
                  className="py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold rounded-xl text-xs"
                >
                  {lang === 'ar' ? 'وجهة أخرى' : 'New Destination'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER DESCRIPTOR */}
      <footer className="bg-slate-900/35 p-3 border-t border-slate-900 text-center text-[10px] text-slate-500 leading-normal" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
        <p>
          {lang === 'ar'
            ? 'نظام توجيه ملاعب ومباني الفندق بالواقع المعزز © ٢٠٢٦. الملاحة والـ GPS مشفرة محلياً بالكامل لخصوصية وأمن النزلاء.'
            : 'Smart GPS Resort Guide © 2026. Fully secure; your camera stream and latitude/longitude live coordinates remain strictly private.'
          }
        </p>
      </footer>
    </div>
  );
}
