import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Compass, 
  MapPin, 
  Sparkles, 
  Camera, 
  RotateCcw, 
  Navigation, 
  Search, 
  Building as BuildingIcon, 
  Utensils, 
  Layers, 
  Activity, 
  Wifi, 
  CheckCircle, 
  ChevronsUp, 
  Info, 
  Phone, 
  Clock, 
  ArrowLeft, 
  HelpCircle, 
  X, 
  ChevronRight, 
  Globe, 
  Sliders, 
  Eye,
  Minimize2,
  Maximize2,
  AlertTriangle,
  MoveUp,
  Award,
  BookOpen,
  Star,
  LogOut,
  User as UserIcon,
  Save,
  MessageSquare,
  Plus,
  Trash2,
  History,
  QrCode,
  ExternalLink
} from 'lucide-react';
import { BUILDINGS, Building } from './data/buildings';
import { getHaversineDistance, getBearing, getCoordinatesFromOffsets, formatDistance } from './utils/geo';
import { useFirebase } from './context/FirebaseContext';

// Default center coordinates when GPS is not available or "Real Resort Mode" is selected
// Bound directly to Charmillion Resorts (Nabq Bay, Sharm El Sheikh, Egypt)
const DEFAULT_CENTER = {
  lat: 27.9987554,
  lon: 34.4319008,
  nameAr: "منتجعات تشارميليون (شرم الشيخ)",
  nameEn: "Charmillion Resorts (Sharm El Sheikh)"
};

export default function App() {
  // --- Firebase State Hooks ---
  const { 
    user, 
    guestProfile, 
    authLoading, 
    profileLoading, 
    loginWithGoogle, 
    logoutUser, 
    updateGuestProfile, 
    toggleFavorite, 
    logWayfindingSession, 
    submitBuildingTip, 
    deleteBuildingTip, 
    activeTips, 
    loadBuildingTips, 
    sessionsHistory 
  } = useFirebase();

  // --- Global App States ---
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showConfigGuide, setShowConfigGuide] = useState(false);
  const [showCalibrationPopup, setShowCalibrationPopup] = useState(false);
  const [reachedTarget, setReachedTarget] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [showQrDrawer, setShowQrDrawer] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // --- Search and Category Filter ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeResort, setActiveResort] = useState<'all' | 'club' | 'life' | 'gardens' | 'general'>('all');
  const [mapMode, setMapMode] = useState<'internal' | 'google'>('internal');

  // --- Profile Customization States ---
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // --- Building Tip Submission States ---
  const [newTipText, setNewTipText] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // --- Session Tracking to avoid repeats ---
  const [hasLoggedSession, setHasLoggedSession] = useState(false);

  // --- Configuration States ---
  // Mode options:
  // "dynamic" = centers hotel grid directly on user's live coordinates (Best for walking around own space)
  // "static" = Places hotel at Burj Al Arab Dubai coordinates (Strict virtual model)
  const [positioningMode, setPositioningMode] = useState<'dynamic' | 'static'>('dynamic');
  const [isMockingEnabled, setIsMockingEnabled] = useState(true);

  // --- Geolocation & Sensor Tracker ---
  const [resortCenter, setResortCenter] = useState(DEFAULT_CENTER);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null); // 0 = North, 90 = East, etc.
  const [pitch, setPitch] = useState<number>(0); // tilt forward/backward
  const [roll, setRoll] = useState<number>(0);  // tilt left/right
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // --- Simulated Location Offsets (for Testing/Mocking) ---
  const [simulatedOffset, setSimulatedOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // --- Camera States ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Is iOS orientation permission required?
  const [iOSPermissionState, setIOSPermissionState] = useState<'not-needed' | 'prompt' | 'granted' | 'denied'>('not-needed');

  // Refs for tracking elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watchPositionId = useRef<number | null>(null);

  // --- Initialize Web Orientation Permission Check on Mount ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
      if (
        typeof (window as any).DeviceOrientationEvent !== 'undefined' &&
        typeof (window as any).DeviceOrientationEvent.requestPermission === 'function'
      ) {
        setIOSPermissionState('prompt');
      } else {
        setIOSPermissionState('not-needed');
      }
    }
  }, []);

  // --- Start Tracking Geolocation ---
  useEffect(() => {
    setIsGpsLoading(true);
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError(lang === 'ar' ? 'جهازك لا يدعم نظام الجي بي إس GPS أو أن المتصفح يمنعه بسبب قيود الإطار' : 'Your device does not support GPS or it is blocked by browser frame restrictions.');
      setIsGpsLoading(false);
      return;
    }

    // Set initial position to get closer coordinates fallback
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        
        const center = { lat: latitude, lon: longitude };
        setCurrentCoords(center);

        if (positioningMode === 'dynamic') {
          setResortCenter({
            lat: latitude,
            lon: longitude,
            nameAr: "موقعك الحالي (محيط فندق المحاكاة)",
            nameEn: "Your Live Location (Resort Simulator Bounds)"
          });
        }
        setIsGpsLoading(false);
      },
      (err) => {
        console.warn("GPS Initial retrieve failed, using static default: ", err);
        // Fallback to static default
        setCurrentCoords({ lat: DEFAULT_CENTER.lat, lon: DEFAULT_CENTER.lon });
        setIsGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(lang === 'ar' ? 'إذن تحديد الموقع (GPS) مرفوض. يرجى السماح للمتصفح بالوصول لموقعك أو التجربة عبر رابط المعاينة السحابي الآمن.' : 'GPS location permission was denied. Please allow location access or test using the secure direct preview link.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Watch position continuously
    watchPositionId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(accuracy);
        
        let targetCoords = { lat: latitude, lon: longitude };
        
        // If simulated offset is applied, shift current coordinates accordingly in meters
        if (isMockingEnabled && (simulatedOffset.x !== 0 || simulatedOffset.y !== 0)) {
          const latOffset = simulatedOffset.y / 111111.0;
          const lonOffset = simulatedOffset.x / (111111.0 * Math.cos((latitude * Math.PI) / 180));
          targetCoords = {
            lat: latitude + latOffset,
            lon: longitude + lonOffset
          };
        }

        setCurrentCoords(targetCoords);

        // Update default center on search/init if dynamic modes
        if (positioningMode === 'dynamic' && simulatedOffset.x === 0 && simulatedOffset.y === 0) {
          setResortCenter(prev => ({
            ...prev,
            lat: latitude,
            lon: longitude
          }));
        }
      },
      (err) => {
        console.error("GPS Watch failed:", err);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    return () => {
      if (watchPositionId.current !== null) {
        navigator.geolocation.clearWatch(watchPositionId.current);
      }
    };
  }, [positioningMode, isMockingEnabled, simulatedOffset, lang]);

  // Handle Orientation Changes (Compass / Tilt)
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // 1. Get Compass Heading (alpha / webkitCompassHeading)
      let heading: number | null = null;
      if ('webkitCompassHeading' in e) {
        heading = (e as any).webkitCompassHeading as number;
      } else if (e.alpha !== null) {
        // e.alpha increases counter-clockwise, compass heading increases clockwise clockwise
        heading = (360 - e.alpha) % 360;
      }
      
      if (heading !== null) {
        setUserHeading(Math.round(heading));
      }

      // 2. Roll (gamma: -90 to 90) and Pitch (beta: -180 to 180)
      if (e.beta !== null) setPitch(Math.round(e.beta));
      if (e.gamma !== null) setRoll(Math.round(e.gamma));
    };

    // Register listeners
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

  // --- Dynamic Calculation of selected building GPS coordinates ---
  const activeSelectedBuildingCoords = useMemo(() => {
    if (!selectedBuilding) return null;
    return getCoordinatesFromOffsets(
      resortCenter.lat,
      resortCenter.lon,
      selectedBuilding.offsetX,
      selectedBuilding.offsetY
    );
  }, [selectedBuilding, resortCenter]);

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

  // Watch for distance changes to trigger "Reached" popup and persist session log
  useEffect(() => {
    if (isNavigating && selectedBuilding && navigationMetrics.distance <= 5) {
      setReachedTarget(true);
      
      // Persist navigation session to Firestore when user reaches the target
      if (!hasLoggedSession && user) {
        logWayfindingSession(
          selectedBuilding.id,
          lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn,
          navigationMetrics.distance,
          true
        );
        setHasLoggedSession(true);
      }
      
      // Trigger user vibration haptic effect
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([150, 100, 150]);
      }
    }
  }, [navigationMetrics.distance, isNavigating, selectedBuilding, hasLoggedSession, user, logWayfindingSession, lang]);

  // Load and listen to live building tips from Firestore when selectedBuilding changes
  useEffect(() => {
    if (selectedBuilding) {
      const unsubscribe = loadBuildingTips(selectedBuilding.id);
      return () => unsubscribe();
    }
  }, [selectedBuilding, loadBuildingTips]);

  // Set edit field placeholders when guestProfile changes or edit requested
  useEffect(() => {
    if (guestProfile) {
      setEditName(guestProfile.guestName);
      setEditRoom(guestProfile.roomNumber);
    }
  }, [guestProfile, isEditingProfile]);

  // --- Camera Management ---
  const startCamera = async () => {
    setCameraError(null);
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
      console.warn("Camera failed to launch, setting up simulation mode.", err);
      setCameraError(err.message || 'Camera blocked or unsupported');
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
    
    // Request iOS orientation authorization if prompted
    if (iOSPermissionState === 'prompt') {
      try {
        const response = await (window as any).DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          setIOSPermissionState('granted');
        } else {
          setIOSPermissionState('denied');
        }
      } catch (err) {
        console.error("iOS Sensor Permission error:", err);
        setIOSPermissionState('denied');
      }
    }

    setReachedTarget(false);
    setHasLoggedSession(false); // Reset session logger state
    setIsNavigating(true);
    
    // Also log started wayfinding session (pre-completed state = false)
    if (user) {
      await logWayfindingSession(
        selectedBuilding.id,
        lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn,
        navigationMetrics.distance,
        false
      );
    }
    
    await startCamera();
  };

  // Exit navigation
  const stopWayfinding = () => {
    stopCamera();
    setIsNavigating(false);
    setSimulatedOffset({ x: 0, y: 0 }); // reset mock position
  };

  // --- Mock Movement Simulator keyboard + controller functions ---
  const moveSimulated = (direction: 'forward' | 'backward' | 'left' | 'right' | 'reset', stepsMeters = 3) => {
    if (!selectedBuilding || !userHeading) {
      // Fallback heading if no compass exists (assume facing North = 0)
      const currentSimHeading = userHeading ?? 0;
      updateOffsetWithAngle(direction, currentSimHeading, stepsMeters);
      return;
    }
    updateOffsetWithAngle(direction, userHeading, stepsMeters);
  };

  const updateOffsetWithAngle = (direction: 'forward' | 'backward' | 'left' | 'right' | 'reset', angleDegrees: number, stepsMeters: number) => {
    if (direction === 'reset') {
      setSimulatedOffset({ x: 0, y: 0 });
      return;
    }

    const angleRad = (angleDegrees * Math.PI) / 180;
    let dx = 0;
    let dy = 0;

    switch (direction) {
      case 'forward':
        // Moving in direction of compass heading
        dx = stepsMeters * Math.sin(angleRad);
        dy = stepsMeters * Math.cos(angleRad);
        break;
      case 'backward':
        dx = -stepsMeters * Math.sin(angleRad);
        dy = -stepsMeters * Math.cos(angleRad);
        break;
      case 'left':
        // 90 degrees to the left
        dx = -stepsMeters * Math.cos(angleRad);
        dy = stepsMeters * Math.sin(angleRad);
        break;
      case 'right':
        // 90 degrees to the right
        dx = stepsMeters * Math.cos(angleRad);
        dy = -stepsMeters * Math.sin(angleRad);
        break;
    }

    setSimulatedOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  // Automatically adjust relative mock coordinates closer to targets (Cheating for quick demo testing)
  const teleportCloseToTarget = () => {
    if (!selectedBuilding) return;
    // Set simulated offset to placed right near building coordinates (approx 10 meters off target)
    // Offset targets are in meters
    setSimulatedOffset({
      x: selectedBuilding.offsetX - 7,
      y: selectedBuilding.offsetY - 7
    });
  };

  // --- Filtering & Categories ---
  const filteredBuildings = useMemo(() => {
    return BUILDINGS.filter(b => {
      const matchSearch = 
        b.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.id.toString() === searchQuery;
      
      // Category filter including custom 'favorites'
      let matchCategory = false;
      if (activeCategory === 'all') {
        matchCategory = true;
      } else if (activeCategory === 'favorites') {
        matchCategory = guestProfile?.favoriteBuildings?.includes(b.id) || false;
      } else {
        matchCategory = b.type === activeCategory;
      }

      // Resort Property filter
      let matchResort = false;
      if (activeResort === 'all') {
        matchResort = true;
      } else {
        matchResort = b.resort === activeResort;
      }
      
      return matchSearch && matchCategory && matchResort;
    });
  }, [searchQuery, activeCategory, activeResort, guestProfile]);

  // Compute direction indicator styles pointing towards bearing
  // bearing is absolute, userHeading is compass relative to North.
  // The arrow angle is (bearing - userHeading) degrees
  const compassAngle = useMemo(() => {
    const heading = userHeading ?? 0;
    return (navigationMetrics.bearing - heading + 360) % 360;
  }, [navigationMetrics.bearing, userHeading]);

  // Create mock star elements for desktop simulated backdrop
  const starsArray = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.7 + 0.3
    }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden antialiased">
      
      {/* HEADER / NAVIGATION BAR */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20">
            <Compass className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold font-display tracking-tight text-amber-500">
              {lang === 'ar' ? 'موجّه الفندق AR' : 'AR Hotel Wayfinder'}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">50 Buildings Resort Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* HTTPS Technical Info Guide */}
          <button 
            onClick={() => setShowConfigGuide(!showConfigGuide)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700 transition text-xs font-medium border border-slate-700/50"
            title={lang === 'ar' ? 'دليل الاتصال الآمن والموقع' : 'Secure HTTPS Connection Guide'}
          >
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'دليل التشغيل' : 'Setup Guide'}</span>
          </button>

          {/* Lang Toggle Switch */}
          <button 
            onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-xs font-bold border border-slate-700/50 text-slate-200"
          >
            <Globe className="w-4 h-4 text-amber-500" />
            <span>{lang === 'ar' ? 'English' : 'عربي (Arabic)'}</span>
          </button>
        </div>
      </header>

      {/* SECURE HTTPS DEEP LINK BANNER */}
      <div className="bg-slate-900 border-b border-amber-500/20 px-4 py-2.5 text-right animate-fade-in" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 justify-start">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
            <p className="text-xs text-slate-300 leading-normal">
              {lang === 'ar' ? (
                <>
                  <strong>بسبب شروط حماية الخصوصية للمتصفحات:</strong> يرجى فتح رابط المعاينة السحابي الآمن المشفر مباشرة من هاتفك لتمكين الكاميرا، والبوصلة الرقمية، والموقع بصورة فورية وموثوقة!
                </>
              ) : (
                <>
                  <strong>Modern Browser Security Rule:</strong> Please open the secure cloud preview link directly on your smartphone to instantly authorize user location, compass orientation, and camera!
                </>
              )}
            </p>
          </div>
          
          <div className="flex flex-row items-center gap-2 justify-stretch max-md:w-full shrink-0">
            <a 
              href={currentUrl || '#'} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 md:flex-initial px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold font-display rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>
                {lang === 'ar' 
                  ? 'رابط المعاينة الآمن والموثوق للأجهزة 👈' 
                  : '👉 Secure Direct Preview Link'
                }
              </span>
            </a>

            <button 
              onClick={() => setShowQrDrawer(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700/60 rounded-xl text-xs text-slate-300 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              title={lang === 'ar' ? 'مسح رمز الاستجابة السريعة بالهاتف' : 'Scan QR on phone'}
            >
              <QrCode className="w-4 h-4 text-amber-500" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'رمز الهاتف' : 'Smart QR'}</span>
            </button>
          </div>
        </div>
      </div>

      {gpsError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5 text-right animate-fade-in" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
          <div className="max-w-7xl mx-auto flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
            <span className="text-xs text-red-200">
              {gpsError}
            </span>
          </div>
        </div>
      )}

      {/* SECURE HTTPS SETUP GUIDE DRAWER/MODAL */}
      {showConfigGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in-up">
            <div className="p-4 bg-amber-500 text-slate-950 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <h3 className="font-bold text-sm md:text-base font-display">
                  {lang === 'ar' ? 'دليل تشغيل المستشعرات والكاميرا (HTTPS)' : 'Sensors & Camera Access (HTTPS) Guide'}
                </h3>
              </div>
              <button onClick={() => setShowConfigGuide(false)} className="hover:bg-amber-600 p-1.5 rounded-lg transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed text-right md:text-right" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              {lang === 'ar' ? (
                <>
                  <p className="text-amber-400 font-semibold text-sm">⚠️ تنبيه هام لعمل الواقع المعزز بكفاءة:</p>
                  <p className="bg-slate-950 p-3 rounded-lg text-slate-400 border-l-2 border-amber-500 font-mono">
                    بسبب سياسات الأمان الصارمة للمتصفحات الحديثة، فإن الوصول إلى الكاميرا (<code className="text-amber-500">Camera</code>) ونظام تحديد المواقع (<code className="text-amber-500">GPS</code>) ومستشعر البوصلة (<code className="text-amber-500">DeviceOrientation</code>) محظور تماماً إلا إذا كان الموقع يعمل تحت رابط مشفر بأمان <b className="text-slate-100 font-mono">HTTPS</b> أو عبر خادم محلي <b className="text-slate-100 font-mono">localhost</b>.
                  </p>
                  
                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4">1. التشغيل في بيئة التطوير المحلية (Localhost):</h4>
                  <p>عند تشغيل الكود في بيئة التطوير باستخدام الأمر <b className="text-amber-400 font-mono text-xs">npm run dev</b>، سيعمل محلياً بأمان على الرابط <code className="text-slate-200 font-mono text-xs">http://localhost:3000</code> وستمنحك المتصفحات حق استخدام الكاميرا والـ GPS تلقائياً لإمكانية الاختبار.</p>

                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4 font-display">2. التشغيل على الهواتف الذكية (iOS & Android):</h4>
                  <p>لاختبار التطبيق على هاتفك المحمول بصورة حية، يمكنك استخدام إحدى الطرق التالية:</p>
                  <ul className="list-disc list-inside space-y-1.5 pr-2">
                    <li>استخدام خدمة النفق الآمن المؤقت مثل <code className="text-amber-400 font-mono">ngrok</code> لتوجيه الرابط المحلي إلى رابط HTTPS خارجي:
                      <pre className="bg-slate-950 p-2 rounded text-slate-400 font-mono text-[10px] mt-1 text-center font-bold">ngrok http 3000</pre>
                    </li>
                    <li>تثبيت شهادة أمان مجانية محلية لمطورين في ملف تكوين فيت باستخدام حزمة <code className="text-amber-400 font-mono">@vitejs/plugin-basic-ssl</code>.</li>
                    <li>رفع المشروع النهائي على منصات الاستضافة السحابية ذات الـ HTTPS التلقائي مثل (Cloud Run, Netlify, Vercel, Firebase Hosting).</li>
                  </ul>

                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4">3. البوصلة ومعايرة الهاتف:</h4>
                  <p>تتأثر مستشعرات الهواتف بالحقول المغناطيسية القريبة. للحصول على اتجاه ممتاز للدقة، اطلب من المستخدم رسم حركات مائلة دائرية عشوائية أو على شكل <b className="text-amber-400">رقم (8)</b> في الهواء لتنشيط البوصلة وتصفيتها من التداخل الميكانيكي والمعدني.</p>
                </>
              ) : (
                <>
                  <p className="text-amber-400 font-semibold text-sm">⚠️ Critical Notice for Web AR Applications:</p>
                  <p className="bg-slate-950 p-3 rounded-lg text-slate-400 border-l-2 border-amber-500 font-mono">
                    Under modern browser security frameworks, permissions for the hardware live <code className="text-amber-500">Camera</code>, high-accuracy <code className="text-amber-500">GPS</code>, and <code className="text-amber-500">DeviceOrientation API</code> sensors are strictly blocked unless served on an encrypted <b className="text-slate-100 font-mono">HTTPS</b> tunnel or local testing <b className="text-slate-100 font-mono">localhost</b> context.
                  </p>

                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4">1. Local Host Developer Testing:</h4>
                  <p>Running the server via npm packages on your local workstation defaults to <code className="text-slate-200 font-mono text-xs">http://localhost:3000</code>. Major web browsers inherently whitelist localhost configurations to allow development camera and orientation feeds.</p>

                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4">2. Testing on Real iPhone/Android Devices:</h4>
                  <p>To inspect and demo directly on physical mobile smartphone screens, utilize one of these standard approaches:</p>
                  <ul className="list-disc list-inside space-y-1.5 pl-2">
                    <li>Generate a fast, secure TLS-encrypted public tunnel using utilities such as <code className="text-amber-400 font-mono">ngrok</code> directed to your active port:
                      <pre className="bg-slate-950 p-2 rounded text-slate-400 font-mono text-[10px] mt-1 text-center font-bold">ngrok http 3000</pre>
                    </li>
                    <li>Utilize standard dev certificates in config by provisioning the <code className="text-amber-400 font-mono">@vitejs/plugin-basic-ssl</code> module in your stack.</li>
                    <li>Deploy the code to a pre-configured HTTPS provider such as Cloud Run, Vercel, or Firebase.</li>
                  </ul>

                  <h4 className="font-bold text-slate-100 text-xs md:text-sm mt-4">3. Axis & Device Calibration:</h4>
                  <p>Magnetometers can gather ambient electronic interference. Swinging your smartphone in an active **Figure-8 shape** recalibrates geographic heading relative to Magnetic North.</p>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowConfigGuide(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 transition rounded-xl text-xs font-semibold"
              >
                {lang === 'ar' ? 'فهمت ذلك' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col p-4 space-y-4">
        
        {/* WIDGET METADATA PANEL - SIMULATIONS & CONTROLS */}
        {!isNavigating && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1.5 text-right md:text-right" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xs md:text-sm font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  {lang === 'ar' ? 'تكوين بيئة التجربة والمحاكاة لسهولة الاختبار' : 'Interactive Demo Simulator Settings'}
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                {lang === 'ar' 
                  ? 'بما أنك قد تكون في منزلك الآن بعيداً عن الفندق، يمكنك ترك خيار "المحاكاة حول موقعك الحالي" مفعلاً لتوفير بيئة اختبار افتراضية تحاكي الفندق في نطاق 200 متر حول موقعك الفعلي لتستطيع التحرك ورؤية الاتجاهات والمسافة وهي تتقلص!'
                  : 'Since you might be sitting in a distant office/home, leaving "Simulator dynamic mode" active instantly anchors the 50 resort buildings in a 200-meter field surrounding your exact GPS. Take a step or use simulation controls to watch metrics change!'
                }
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              {/* Placement mode select */}
              <div className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span>{lang === 'ar' ? 'تحديد مركز الفندق:' : 'Anchor Resort Center:'}</span>
                <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                  <button 
                    onClick={() => setPositioningMode('dynamic')}
                    className={`px-3 py-1.5 rounded-md transition font-bold text-[10px] ${positioningMode === 'dynamic' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {lang === 'ar' ? 'موقعي الحالي 📍' : 'Around Me 📍'}
                  </button>
                  <button 
                    onClick={() => {
                      setPositioningMode('static');
                      setResortCenter(DEFAULT_CENTER);
                    }}
                    className={`px-3 py-1.5 rounded-md transition font-bold text-[10px] ${positioningMode === 'static' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {lang === 'ar' ? 'دبي (افتراضي)' : 'Dubai Resort'}
                  </button>
                </div>
              </div>

              {/* Mocking Walking Switch */}
              <div className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span>{lang === 'ar' ? 'أزرار التحريك والتوجيه:' : 'Joystick & Mock Walks:'}</span>
                <button
                  onClick={() => setIsMockingEnabled(!isMockingEnabled)}
                  className={`px-4 py-2 rounded-lg font-bold text-xs transition border ${
                    isMockingEnabled 
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {isMockingEnabled 
                    ? (lang === 'ar' ? 'تفعيل لوحة الملاحة التجريبية (نشط)' : 'Demo Navigation Board (On)')
                    : (lang === 'ar' ? 'تعطيل لوحة الملاحة التجريبية (مغلق)' : 'Demo Navigation Board (Off)')
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 1: WELCOME & BUILDING SELECTION VIEW 
            ======================================================== */}
        {!isNavigating && (
          <div className="space-y-4 animate-fade-in">
            
            {/* BRAND ELITE HEADER PANEL */}
            <div className="bg-brand-blue border border-brand-gold/25 rounded-3xl p-5 shadow-2xl overflow-hidden relative">
              {/* Subtle background luxury glow */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-gold/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-right" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                <div className="space-y-1 w-full md:w-3/4">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 text-brand-gold text-[10px] font-semibold tracking-wider uppercase">
                    <Sparkles className="w-3 h-3 text-brand-gold" />
                    <span>{lang === 'ar' ? 'الرائد في توجيه الواقع المعزز لشرم الشيخ' : 'NABQ BAY, SHARM EL SHEIKH - ORIGINAL RESORTS GPS'}</span>
                  </div>
                  <h1 className="text-xl md:text-2xl font-extrabold text-white font-display">
                    {lang === 'ar' ? 'تشارميليون للفنادق والمنتجعات' : 'Charmillion Hotels & Resorts'}
                  </h1>
                  <p className="text-slate-350 text-xs max-w-xl leading-relaxed">
                    {lang === 'ar'
                      ? 'مرحباً بك في تشارميليون! استكشف مباني فنادق (كلوب، لايف، جاردن) عبر خريطة الواقع المعزز الحية والـ GPS الحقيقي.'
                      : 'Welcome to Charmillion! Access (Club, Life, Gardens) properties seamlessly via WebAR camera guidance and real coordinates mapping.'
                    }
                  </p>
                </div>
                
                {/* Micro compass alignment */}
                <div className="flex items-center gap-2 bg-brand-blue-light/50 border border-brand-gold/10 p-2 px-3 rounded-2xl shrink-0 font-mono text-[10px] text-brand-gold self-center">
                  <Compass className="w-4 h-4 text-brand-gold animate-spin-slow" />
                  <span>{userHeading !== null ? `${userHeading}° ${lang === 'ar' ? 'شمال' : 'N'}` : 'CALIBRATING'}</span>
                </div>
              </div>

              {/* TWO STUNNING REALISTIC RESORT PHOTOS SOURCED DIRECTLY */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                <div className="relative h-28 rounded-2xl overflow-hidden group shadow-md border border-slate-800/80">
                  <img 
                    src="https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=650&q=80" 
                    alt="Charmillion Sea Life & Club Beachfront" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-blue/90 via-black/20 to-transparent flex flex-col justify-end p-2.5 text-right">
                    <span className="text-[9px] text-brand-gold uppercase font-bold tracking-wider">
                      {lang === 'ar' ? 'فنادق الشاطئ الكلاسيكية' : 'Beachfront Privilege'}
                    </span>
                    <h4 className="text-xs font-bold text-white leading-none">
                      {lang === 'ar' ? 'تشارميليون كلوب وسي لايف' : 'Charmillion Club & Sea Life'}
                    </h4>
                  </div>
                </div>

                <div className="relative h-28 rounded-2xl overflow-hidden group shadow-md border border-slate-800/80">
                  <img 
                    src="https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=650&q=80" 
                    alt="Charmillion Gardens Aqua Park" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-blue/90 via-black/20 to-transparent flex flex-col justify-end p-2.5 text-right">
                    <span className="text-[9px] text-brand-gold uppercase font-bold tracking-wider">
                      {lang === 'ar' ? 'الألعاب والمدينة المائية' : 'Unilimited Slide Thrills'}
                    </span>
                    <h4 className="text-xs font-bold text-white leading-none">
                      {lang === 'ar' ? 'تشارميليون جاردنز أكوا بارك' : 'Charmillion Gardens Aqua Park'}
                    </h4>
                  </div>
                </div>
              </div>
            </div>

            {/* FIREBASE AUTHENTICATION & CLOUD GUEST PASS PANEL */}
            {authLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex items-center justify-center gap-3 shadow-xl">
                <Compass className="w-5 h-5 text-amber-500 animate-spin" />
                <span className="text-xs text-slate-400 font-mono">
                  {lang === 'ar' ? 'جاري التحقق من كارت النزيل السحابي...' : 'Authenticating cloud Guest Pass...'}
                </span>
              </div>
            ) : !user ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl animate-scale-up">
                <div className="space-y-1 text-right md:text-right w-full flex-1" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                  <h3 className="text-sm md:text-base font-extrabold text-white flex items-center gap-2 justify-start">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    {lang === 'ar' ? 'فعّل بطاقة النزيل السحابية (Firebase)' : 'Activate Your Cloud Guest Pass'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lang === 'ar'
                      ? 'قم بتسجيل الدخول السريع لحفظ مبانيك المفضلة سحابياً، ومشاركة الزوار النصائح والملاحظات الحية، والاحتفاظ بسجل جولاتك بالواقع المعزز!'
                      : 'Sign in to sync your favorite buildings, write active crowdsourced tips for facilities, and record your historical wayfinding logs!'
                    }
                  </p>
                </div>
                <button 
                  onClick={loginWithGoogle}
                  className="w-full md:w-auto px-6 py-3 bg-amber-500 text-slate-950 font-bold font-display rounded-xl hover:bg-amber-400 transition flex items-center justify-center gap-2 text-xs shadow-lg shadow-amber-500/15 cursor-pointer shrink-0 active:scale-95"
                >
                  <svg className="w-4 h-4 fill-current animate-pulse text-slate-950" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.71 0 3.28.618 4.5 1.636l2.454-2.455C17.51 1.76 15.01 1 12.24 1c-5.523 0-10 4.477-10 10s4.477 10 10 10c5.782 0 9.613-4.068 9.613-9.782 0-.668-.06-1.32-.178-1.933H12.24z"/>
                  </svg>
                  <span>{lang === 'ar' ? 'تسجيل الدخول السريع بجوجل' : 'Sign in with Google'}</span>
                </button>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl animate-scale-up text-right space-y-4" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-3.5">
                  <div className="flex items-center gap-3.5 justify-start">
                    {/* User Profile Avatar with Online Status */}
                    <div className="relative">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt="Avatar" 
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full border-2 border-amber-500/50 object-cover" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full border-2 border-amber-500/50 bg-slate-800 flex items-center justify-center text-amber-500 font-bold font-display text-base">
                          {guestProfile?.guestName ? guestProfile.guestName[0].toUpperCase() : 'G'}
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" />
                    </div>

                    <div className="space-y-0.5 text-right">
                      <div className="flex items-center gap-1.5 justify-start">
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                          {lang === 'ar' ? 'عضوية ضيف حية' : 'Live Guest Pass'}
                        </span>
                        {guestProfile?.roomNumber && (
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                            {lang === 'ar' ? `غرفة رقم: ${guestProfile.roomNumber}` : `Rm: ${guestProfile.roomNumber}`}
                          </span>
                        )}
                      </div>
                      
                      {isEditingProfile ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input 
                            type="text" 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-slate-950 border border-slate-800 p-1 px-2 rounded text-xs text-white"
                            placeholder={lang === 'ar' ? 'اسم الضيف' : "Guest's Name"}
                          />
                          <input 
                            type="text" 
                            value={editRoom}
                            onChange={(e) => setEditRoom(e.target.value)}
                            className="bg-slate-950 border border-slate-800 p-1 px-2 rounded text-xs text-white w-20 font-mono"
                            placeholder={lang === 'ar' ? 'الغرفة' : 'Room#'}
                          />
                          <button 
                            onClick={async () => {
                              await updateGuestProfile(editName, editRoom);
                              setIsEditingProfile(false);
                            }}
                            className="p-1 px-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>{lang === 'ar' ? 'حفظ' : 'Save'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-start">
                          <h3 className="text-sm md:text-base font-extrabold text-white">
                            {guestProfile?.guestName || 'Guest'}
                          </h3>
                          <button 
                            onClick={() => {
                              if (guestProfile) {
                                setEditName(guestProfile.guestName);
                                setEditRoom(guestProfile.roomNumber);
                              }
                              setIsEditingProfile(true);
                            }}
                            className="text-[10px] text-amber-400 hover:underline hover:text-amber-300 cursor-pointer"
                          >
                            {lang === 'ar' ? '[تعديل البيانات]' : '[Edit profile]'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operational widgets (History modal toggle & Signout) */}
                  <div className="flex items-center gap-2 shrink-0 max-md:w-full max-md:justify-between border-t border-slate-800/40 md:border-t-0 pt-2 md:pt-0">
                    <button 
                      onClick={() => setShowHistoryModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 transition text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-4 h-4 text-amber-500" />
                      <span>{lang === 'ar' ? 'سجل الملاحة' : 'Log History'}</span>
                    </button>
                    
                    <button 
                      onClick={logoutUser}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition text-xs font-bold cursor-pointer"
                      title={lang === 'ar' ? 'تسجيل الخروج' : 'Log Out'}
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SELECTION INTERACTIVE ENGINE (CARD SELECTOR) */}
            <div className="space-y-4" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              
              {/* TOP HUB: DUAL-MODE MAPS AND PROPERTY CLASSIFICATION TITLE */}
              <div className="bg-slate-900/60 p-4 border border-slate-850 rounded-2xl space-y-4">
                
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-2 border-b border-slate-800/60">
                  <div className="space-y-0.5 text-right">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 justify-start">
                      <Layers className="w-4 h-4 text-brand-gold" />
                      {lang === 'ar' ? 'تصنيف المنتجعات وخرائط الإرشاد' : 'Property Classifications & Maps'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {lang === 'ar' 
                        ? 'تشارميليون تضم ٣ فنادق في مجمع واحد. تصفح الخريطة التخطيطية وخريطة جوجل لمعاينة مواقع الأبنية ديلوكس ولاند سكيب بالـ GPS:'
                        : 'Charmillion encompasses 3 elite resorts. Filter by hotel property and preview actual GPS locations:'
                      }
                    </p>
                  </div>

                  {/* SEARCH FIELD */}
                  <div className="relative w-full md:w-64">
                    <Search className="absolute right-3 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder={lang === 'ar' ? 'ابحث عن مبنى أو ورقم غرفة...' : 'Search Room block, burger, pool...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-3 pr-8 py-1 bg-slate-950 border border-slate-800 focus:border-brand-gold focus:outline-none rounded-xl text-xs text-slate-100 placeholder-slate-500 transition"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1.5 text-slate-400 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 1. PROPERTY CLASSIFICATION SWITCH - CLUB, LIFE, GARDENS */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block text-right">
                    {lang === 'ar' ? 'اختر المنتجع لتصفية الأبنية (تسهيل التصنيف):' : 'Select Resort Property (Classification):'}
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => { setActiveResort('all'); setSelectedBuilding(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${activeResort === 'all' ? 'bg-brand-gold text-slate-950 font-extrabold shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                    >
                      <span>✨</span>
                      <span>{lang === 'ar' ? 'جميع المنتجعات' : 'All Charmillion'}</span>
                    </button>
                    
                    <button
                      onClick={() => { setActiveResort('club'); setSelectedBuilding(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeResort === 'club' ? 'bg-red-500/20 text-red-400 border border-red-500/45 font-extrabold shadow-lg shadow-red-500/5' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{lang === 'ar' ? 'كلوب ريزورت (٥ نجوم)' : 'Club Resort'}</span>
                    </button>

                    <button
                      onClick={() => { setActiveResort('life'); setSelectedBuilding(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeResort === 'life' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-extrabold shadow-lg shadow-cyan-500/5' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                      <span>{lang === 'ar' ? 'سي لايف (٤ نجوم)' : 'Sea Life Resort'}</span>
                    </button>

                    <button
                      onClick={() => { setActiveResort('gardens'); setSelectedBuilding(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeResort === 'gardens' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-extrabold shadow-lg shadow-emerald-500/10' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{lang === 'ar' ? 'جاردنز أكوا (٤ نجوم+ )' : 'Gardens Aqua Park'}</span>
                    </button>

                    <button
                      onClick={() => { setActiveResort('general'); setSelectedBuilding(null); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeResort === 'general' ? 'bg-amber-400/20 text-amber-300 border border-amber-500/30' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>{lang === 'ar' ? 'أماكن عامة مشتركة' : 'Shared Areas'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. DUAL-MAP TABS - SCHEMATIC vs GOOGLE MAPS */}
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button 
                    onClick={() => setMapMode('internal')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${mapMode === 'internal' ? 'bg-brand-gold text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'مخطط الفندق الداخلي التفاعلي' : 'Local Schematic Board'}</span>
                  </button>
                  <button 
                    onClick={() => setMapMode('google')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${mapMode === 'google' ? 'bg-brand-gold text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'خرائط جوجل العامة (GPS)' : 'Google Maps Location'}</span>
                  </button>
                </div>

                {/* 3. DYNAMIC CONTENT AREA BASED ON MAP MODE */}
                {mapMode === 'internal' ? (
                  <div className="relative h-60 bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden p-2 flex flex-col justify-between shadow-inner select-none font-sans" style={{ direction: 'rtl' }}>
                    {/* Sand Beach & Sea Gradient Landscape Background Layout representing Nabq Bay beachfront */}
                    <div className="absolute inset-0 flex">
                      {/* Left Side: Gardens Aqua park (Inland, grass & dunes) */}
                      <div className="w-1/3 h-full bg-gradient-to-r from-emerald-950/20 to-slate-950/10 border-r border-slate-900" />
                      
                      {/* Center: Sea Life & central pools (Sand Gold) */}
                      <div className="w-1/3 h-full bg-gradient-to-b from-brand-blue-light/5 via-slate-950 to-brand-blue-light/10" />
                      
                      {/* Right-Side Edge: Deep blue Sea Coast and Wooden jetty */}
                      <div className="w-1/3 h-full bg-gradient-to-l from-cyan-950/25 to-transparent relative">
                        {/* Styled Coral Reef label */}
                        <div className="absolute right-2 top-2 origin-top-right text-[8px] tracking-widest text-[#4faef2]/40 font-bold select-none rotate-90">
                          {lang === 'ar' ? 'البحر الأحمر - حدائق تيران المرجانية' : 'RED SEA CORAL SHORE'}
                        </div>
                      </div>
                    </div>

                    {/* Stylized visual map highlights */}
                    <div className="absolute bottom-2 left-2 text-[9px] text-slate-500 font-mono flex flex-col gap-0.5 text-left bg-slate-900/80 p-2 rounded-xl border border-slate-800 z-10">
                      <div>🗺️ {lang === 'ar' ? 'تخطيط تشارميليون' : 'Charmillion Plan'}</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />{lang === 'ar' ? 'كلوب' : 'Club'}</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" />{lang === 'ar' ? 'سي لايف' : 'Sea Life'}</div>
                      <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{lang === 'ar' ? 'جاردنز أكوا' : 'Gardens'}</div>
                    </div>

                    {/* MAP SCALE RENDER (PLOTTING DOTS INTERACTIVELY) */}
                    <div className="absolute inset-5">
                      {/* Display Shore jetty line sketch */}
                      <div className="absolute right-0 top-1/4 w-12 h-0.5 bg-brand-gold/40 border-t border-dashed border-brand-gold/25" title="Resort Jetty Line" />

                      {BUILDINGS.map((b) => {
                        // Plot coordinates
                        // offsetX range roughly -180 to 210 -> relative percentage
                        const leftPercent = ((b.offsetX - (-190)) / 410) * 100;
                        // offsetY range roughly -120 to 160 -> relative percentage
                        const topPercent = 100 - (((b.offsetY - (-120)) / 280) * 100);
                        
                        const isSelected = selectedBuilding?.id === b.id;
                        const matchSearch = searchQuery ? (
                          b.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.nameEn.toLowerCase().includes(searchQuery.toLowerCase())
                        ) : true;
                        
                        const matchResort = activeResort === 'all' ? true : b.resort === activeResort;
                        
                        // Resort Color codes
                        let dotColor = "bg-amber-400 border-amber-300";
                        if (b.resort === 'club') dotColor = "bg-red-500 border-red-300";
                        if (b.resort === 'life') dotColor = "bg-cyan-500 border-cyan-300";
                        if (b.resort === 'gardens') dotColor = "bg-emerald-500 border-emerald-300";

                        const isHighlighted = matchResort && matchSearch;

                        return (
                          <button
                            key={b.id}
                            style={{ 
                              left: `${leftPercent}%`, 
                              top: `${topPercent}%`,
                              transform: 'translate(-50%, -50%)'
                            }}
                            onClick={() => setSelectedBuilding(b)}
                            className={`absolute w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 cursor-pointer flex items-center justify-center ${dotColor} ${
                              isSelected 
                                ? 'scale-150 ring-4 ring-brand-gold animate-bounce z-30' 
                                : isHighlighted 
                                  ? 'scale-100 hover:scale-125 z-20 opacity-100' 
                                  : 'scale-75 opacity-20'
                            }`}
                            title={lang === 'ar' ? b.nameAr : b.nameEn}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 bg-slate-950 rounded-full" />}
                          </button>
                        );
                      })}

                      {/* PULSING LIVE USER GPS OVERLAY SIMULATOR */}
                      {currentCoords && (
                        <div 
                          style={{
                            // user current coords relative position
                            left: '50%',
                            top: '60%',
                            transform: 'translate(-50%, -50%)'
                          }}
                          className="absolute z-20 pointer-events-none"
                        >
                          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center shadow-lg animate-pulse" />
                          <div className="absolute -inset-2 rounded-full border border-blue-400 bg-blue-500/20 animate-ping" />
                          <span className="absolute -bottom-4 right-1/2 translate-x-1/2 whitespace-nowrap text-[8px] bg-slate-900 border border-blue-500/40 text-blue-400 font-bold px-1.5 py-0.5 rounded-full font-mono shadow-md uppercase">
                            {lang === 'ar' ? 'موقع الملاحة الحالية' : 'GPS POSITION'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Schematic footer caption */}
                    <div className="text-[10px] text-slate-400 font-mono text-center z-10 bg-slate-900/45 p-1 rounded-b-xl border-t border-slate-800/20">
                      {selectedBuilding ? (
                        <span className="text-brand-gold font-bold">
                          {lang === 'ar' ? `📍 تم التدبيس: ${selectedBuilding.nameAr}` : `📍 Pinned: ${selectedBuilding.nameEn}`} (X: {selectedBuilding.offsetX}m, Y: {selectedBuilding.offsetY}m)
                        </span>
                      ) : (
                        <span>🧭 {lang === 'ar' ? 'انقر على الدوائر الملونة لمشاهدة وتحديد أماكن الغرف والمطاعم' : 'Click the colored markers to locate room blocks & restaurants'}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  // GOOGLE MAPS CO-ALIGNMENT PORTAL (REAL LOCATION MAPPING)
                  <div className="relative bg-slate-950 border border-slate-850 p-4 rounded-2xl md:h-60 flex flex-col justify-between text-right space-y-4" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                    <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-grow">
                        <h4 className="text-xs font-extrabold text-brand-gold uppercase tracking-wider flex items-center gap-1 justify-start">
                          <MapPin className="w-3.5 h-3.5 text-brand-gold animate-bounce" />
                          {lang === 'ar' ? 'خرائط وجي بي إس فندق تشارميليون الأصلي' : 'REDUCE POSITION ON GOOGLE MAPS GPS'}
                        </h4>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {lang === 'ar'
                            ? 'يقع منتجع تشارميليون الفعلي في خليج نبق بمدينة شرم الشيخ المطلة على جزيرة تيران بمضيق تيران.'
                            : 'The physical Charmillion Resort spans along the Nabq Bay, Sharm El Sheikh coordinates for complete oceanic wayfinding.'
                          }
                        </p>
                        <div className="text-[11.5px] text-slate-400 font-mono bg-slate-900/60 p-2.5 rounded-xl border border-slate-850 space-y-1">
                          <div>
                            {lang === 'ar' ? '📍 إحداثيات الفندق (Center):' : '🏨 Center Latitude/Longitude:'}{' '}
                            <strong className="text-white">27.9987554, 34.4319008</strong>
                          </div>
                          {selectedBuilding && (
                            <div className="text-brand-gold border-t border-slate-800/40 pt-1 mt-1">
                              {lang === 'ar' ? '🎯 الإحداثي الدقيق للمبنى المحدد:' : '🎯 Precise Target Coordinates:'}{' '}
                              <strong className="text-white">
                                {getCoordinatesFromOffsets(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, selectedBuilding.offsetX, selectedBuilding.offsetY).lat.toFixed(7)},{' '}
                                {getCoordinatesFromOffsets(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, selectedBuilding.offsetX, selectedBuilding.offsetY).lon.toFixed(7)}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Small visual mock map widget representing the Google maps preview */}
                      <div className="w-full md:w-44 h-24 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center relative overflow-hidden shrink-0 shadow-inner">
                        {/* Static beach/sand vector or stylish minimal SVG map icon represent physical layout */}
                        <Compass className="w-12 h-12 text-slate-800 absolute opacity-30 animate-pulse" />
                        <span className="text-[10px] font-mono font-bold text-slate-500 z-10 text-center p-2 uppercase">
                          {lang === 'ar' ? 'احصل على الاتجاهات بالـ GPS' : 'Get Real-World GPS Directions'}
                        </span>
                      </div>
                    </div>

                    {/* REDIRECTION DIRECT TO USER ACTIONS */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <a 
                        href={selectedBuilding 
                          ? `https://www.google.com/maps/search/?api=1&query=${getCoordinatesFromOffsets(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, selectedBuilding.offsetX, selectedBuilding.offsetY).lat},${getCoordinatesFromOffsets(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon, selectedBuilding.offsetX, selectedBuilding.offsetY).lon}` 
                          : "https://www.google.com/maps/@27.9987554,34.4319008,480m"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-3 text-xs bg-slate-900 hover:bg-slate-850 text-brand-gold border border-brand-gold/30 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md text-center"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>
                          {selectedBuilding
                            ? (lang === 'ar' ? `فتح (${lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn}) في خرائط جوجل` : `Open ${selectedBuilding.nameEn} on Google Maps`)
                            : (lang === 'ar' ? 'افتح موقع فندق تشارميليون في خرائط جوجل' : 'Open Charmillion Resorts on Google Maps')
                          }
                        </span>
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* THREE: CATEGORY FILTER ROW UNDER THE MAP FOR MULTI-LEVEL QUERY */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button 
                  onClick={() => setActiveCategory('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${activeCategory === 'all' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  {lang === 'ar' ? 'الكل' : 'All Category'}
                </button>
                {user && (
                  <button 
                    onClick={() => setActiveCategory('favorites')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 shrink-0 ${activeCategory === 'favorites' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${activeCategory === 'favorites' ? 'fill-slate-950 text-slate-950' : 'fill-amber-500 text-amber-500'}`} />
                    <span>{lang === 'ar' ? `المفضلة (${guestProfile?.favoriteBuildings?.length || 0})` : `Favorites (${guestProfile?.favoriteBuildings?.length || 0})`}</span>
                  </button>
                )}
                <button 
                  onClick={() => setActiveCategory('rooms')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 shrink-0 ${activeCategory === 'rooms' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <BuildingIcon className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'أجنحة وغرف' : 'Rooms & Suites'}
                </button>
                <button 
                  onClick={() => setActiveCategory('dining')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 shrink-0 ${activeCategory === 'dining' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'مطاعم وأغذية' : 'Dining & Cafes'}
                </button>
                <button 
                  onClick={() => setActiveCategory('recreation')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 shrink-0 ${activeCategory === 'recreation' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'شواطئ ومسابح كبرى' : 'Beaches & Pools'}
                </button>
                <button 
                  onClick={() => setActiveCategory('sports')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 shrink-0 ${activeCategory === 'sports' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'ملاعب ورياضة' : 'Gyms & Courts'}
                </button>
                <button 
                  onClick={() => setActiveCategory('services')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1 shrink-0 ${activeCategory === 'services' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {lang === 'ar' ? 'مرافق وخدمات' : 'Facilities & Services'}
                </button>
              </div>

              {/* GRID OF THE 50 BUILDINGS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {filteredBuildings.length > 0 ? (
                  filteredBuildings.map((b) => {
                    const isSelected = selectedBuilding?.id === b.id;
                    
                    // Estimate localized relative distance
                    let estMeters = Math.hypot(b.offsetX, b.offsetY);
                    
                    // If currentCoords exists, compute exact geodesic distance from user's simulated center
                    if (currentCoords) {
                      const latLon = getCoordinatesFromOffsets(resortCenter.lat, resortCenter.lon, b.offsetX, b.offsetY);
                      estMeters = getHaversineDistance(currentCoords.lat, currentCoords.lon, latLon.lat, latLon.lon);
                    }

                    return (
                      <div 
                        key={b.id}
                        id={`b-${b.id}`}
                        onClick={() => setSelectedBuilding(b)}
                        className={`group relative p-4 rounded-2xl border text-right cursor-pointer select-none transition-all duration-300 ${
                          isSelected 
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/5' 
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 shadow'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          {/* Left-side Category Indicator Icon & Index badge */}
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <span className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded-full font-mono font-bold">
                              #{b.id}
                            </span>
                            <div className={`p-2 rounded-xl transition ${isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                              {b.type === 'rooms' && <BuildingIcon className="w-4 h-4" />}
                              {b.type === 'dining' && <Utensils className="w-4 h-4" />}
                              {b.type === 'recreation' && <Sparkles className="w-4 h-4" />}
                              {b.type === 'sports' && <Activity className="w-4 h-4" />}
                              {b.type === 'services' && <Layers className="w-4 h-4" />}
                            </div>
                          </div>

                          {/* Right-side Description Texts */}
                          <div className="flex-1 space-y-1 overflow-hidden" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                            <div className="flex items-center gap-1 flex-wrap justify-start">
                              {b.resort === 'club' && <span className="text-[8px] bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-md font-extrabold">{lang === 'ar' ? 'كلوب ٥⭐' : 'Club 5⭐'}</span>}
                              {b.resort === 'life' && <span className="text-[8px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded-md font-extrabold">{lang === 'ar' ? 'سي لايف ٤⭐' : 'Sea Life 4⭐'}</span>}
                              {b.resort === 'gardens' && <span className="text-[8px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-md font-extrabold">{lang === 'ar' ? 'جاردنز ٤⭐' : 'Gardens 4⭐'}</span>}
                              {b.resort === 'general' && <span className="text-[8px] bg-amber-400/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-md font-extrabold">{lang === 'ar' ? 'مشترك' : 'Shared'}</span>}
                            </div>
                            <h4 className={`text-xs md:text-sm font-bold truncate transition ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                              {lang === 'ar' ? b.nameAr : b.nameEn}
                            </h4>
                            <p className="text-[10px] text-slate-400 line-clamp-1">
                              {lang === 'ar' ? b.descriptionAr : b.descriptionEn}
                            </p>
                          </div>
                        </div>

                        {/* BOTTOM DETAILS - DISTANCE & LOCATION MOCK OFFSETS */}
                        <div className="mt-3 pt-2.5 border-t border-slate-850 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-md text-amber-500 font-bold">
                            <MapPin className="w-3 h-3" />
                            <span>{formatDistance(estMeters, lang === 'ar')}</span>
                          </div>
                          
                          <div className="text-[9px] text-slate-500">
                            X: {b.offsetX}m, Y: {b.offsetY}m
                          </div>
                        </div>

                        {/* Favorite Star (Friction-free Firestore synchronization) */}
                        {user && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(b.id);
                            }}
                            className="absolute top-2 left-8 p-1 rounded-full text-amber-400 hover:scale-110 active:scale-95 transition-all z-20"
                            title={lang === 'ar' ? 'أضف للمفضلة في فيربيس' : 'Add to favorites'}
                          >
                            <Star className={`w-3.5 h-3.5 ${guestProfile?.favoriteBuildings?.includes(b.id) ? 'fill-amber-400 text-amber-400' : 'text-slate-500 hover:text-amber-300'}`} />
                          </button>
                        )}

                        {/* Selected Radio Button Dot */}
                        <div className="absolute top-2 left-2">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'border-amber-400 bg-amber-500' : 'border-slate-800 bg-transparent'
                          }`}>
                            {isSelected && <div className="w-1.5 h-1.5 bg-slate-950 rounded-full" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-900/10 border border-slate-800 rounded-2xl">
                    <AlertTriangle className="w-8 h-8 text-amber-500 animate-bounce" />
                    <p className="text-sm font-bold">
                      {lang === 'ar' ? 'لا توجد نتائج مطابقة للبحث' : 'No buildings match your criteria'}
                    </p>
                    <button onClick={() => { setSearchQuery(''); setActiveCategory('all'); }} className="text-xs text-amber-400 underline">
                      {lang === 'ar' ? 'إعادة ضبط مرشحات البحث' : 'Reset search filters'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* LIVE COMMUNITY TIPS SECTION (COMMUNITY INSIGHTS FROM FIRESTORE) */}
            {selectedBuilding && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-amber-500" />
                    <h4 className="text-sm font-bold text-white font-display">
                      {lang === 'ar' ? `نصائح زوار المنتجع لـ (${lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn})` : `Resort Tips for ${selectedBuilding.nameEn}`}
                    </h4>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                    {lang === 'ar' ? `${activeTips.length} نصائح` : `${activeTips.length} tips`}
                  </span>
                </div>

                {/* Submitting tip form (Only if guest is signed in) */}
                {user ? (
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newTipText.trim()) return;
                      await submitBuildingTip(selectedBuilding.id, newTipText);
                      setNewTipText('');
                      setSubmitSuccess(true);
                      setTimeout(() => setSubmitSuccess(false), 2000);
                    }}
                    className="flex items-center gap-2.5"
                  >
                    <input 
                      type="text" 
                      value={newTipText}
                      onChange={(e) => setNewTipText(e.target.value)}
                      maxLength={200}
                      placeholder={lang === 'ar' ? 'اكتب نصيحة سريعة (مثال: الخدمة هنا ممتازة!)' : 'Write a quick guest tip... (e.g. delicious food here!)'}
                      className="flex-grow p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button 
                      type="submit"
                      disabled={!newTipText.trim()}
                      className={`px-4 py-2.5 rounded-xl font-bold font-display text-xs transition-all flex items-center gap-1.5 ${newTipText.trim() ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'أضف' : 'Add'}</span>
                    </button>
                  </form>
                ) : (
                  <p className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-xl text-center">
                    {lang === 'ar' 
                      ? '🔒 يرجى تسجيل الدخول بكارت النزيل في الأعلى للمشاركة بنصائح حية حول هذا المبنى.'
                      : '🔒 Please sign in with your Guest Pass above to submit custom tips for this building.'
                    }
                  </p>
                )}

                {/* Live tips presentation list */}
                <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
                  {activeTips.length > 0 ? (
                    activeTips.map((tip) => {
                      const isCreator = user && tip.userId === user.uid;
                      const formattedTime = tip.createdAt 
                        ? new Date(tip.createdAt.seconds * 1000).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div key={tip.tipId} className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-start justify-between gap-3 animate-fade-in text-right">
                          <div className="space-y-1 text-right flex-1">
                            <div className="flex items-center gap-2 justify-start">
                              <span className="text-[10.5px] font-bold text-slate-200">{tip.userName}</span>
                              <span className="text-[9px] text-slate-500 font-mono">{formattedTime}</span>
                            </div>
                            <p className="text-xs text-amber-500/90 leading-relaxed font-sans">{tip.caption}</p>
                          </div>
                          {isCreator && (
                            <button 
                              onClick={() => deleteBuildingTip(tip.tipId)}
                              className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition shrink-0 cursor-pointer"
                              title={lang === 'ar' ? 'حذف ملاحظتي' : 'Delete my tip'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-[11px] text-slate-500 font-mono">
                      {lang === 'ar' ? 'لا توجد ملاحظات من النزلاء بعد لهذا المرفق.' : 'No crowdsourced tips left yet. Share yours!'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SELECTION SUMMARY / FOOTER BUTTON TO NAVIGATE */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-right md:text-right" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                {selectedBuilding ? (
                  <div className="space-y-1">
                    <h5 className="text-xs text-slate-400">
                      {lang === 'ar' ? 'الوجهة المحددة حالياً:' : 'Your Active Destination Target:'}
                    </h5>
                    <div className="flex items-center gap-2 justify-start">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <strong className="text-sm text-white">
                        {lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn}
                      </strong>
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                        {lang === 'ar' ? 'المبنى #' + selectedBuilding.id : 'B-#' + selectedBuilding.id}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-start">
                    <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                    <p className="text-xs font-medium text-slate-400">
                      {lang === 'ar'
                        ? 'يرجى اختيار أحد المباني الـ 50 الموضحة أعلاه من أجل تفعيل الواقع المعزز وميزة التوجيه.'
                        : 'Choose one of the 50 resort buildings above to launch your dynamic camera wayfinder.'
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* ACTION BUTTON */}
              <button
                disabled={!selectedBuilding}
                onClick={startWayfinding}
                className={`w-full md:w-auto px-8 py-3.5 rounded-xl font-bold font-display text-sm flex items-center justify-center gap-2.5 transition shadow-lg transition-transform active:scale-95 cursor-pointer ${
                  selectedBuilding 
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-amber-500/20' 
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                <Camera className="w-5 h-5" />
                <span>{lang === 'ar' ? 'ابدأ التوجيه بالواقع المعزز (AR)' : 'Start AR Navigation'}</span>
                <ChevronRight className="w-4 h-4 text-slate-900" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 2: COCKPIT HUD (REALTIME NAVIGATION OVERLIVE FEED)
            ======================================================== */}
        {isNavigating && selectedBuilding && (
          <div className="relative flex-1 w-full flex flex-col justify-between overflow-hidden rounded-3xl bg-black border border-slate-800 min-h-[75vh]" style={{ direction: 'ltr' }}>
            
            {/* 1. CAMERA STREAM OR MOCK LANDMAP BACKDROP */}
            {isCameraActive ? (
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted 
                className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-90 saturate-105"
              />
            ) : (
              // Enhanced visual mockup for Desktop Developers or blocked camera streams
              <div className="absolute inset-0 w-full h-full bg-slate-950 z-0 overflow-hidden flex flex-col justify-between">
                {/* Simulated landscape grid stars */}
                <div className="absolute inset-0 z-0">
                  {starsArray.map((st, idx) => (
                    <div 
                      key={idx}
                      className="absolute bg-white rounded-full animate-pulse"
                      style={{
                        left: st.left,
                        top: st.top,
                        width: `${st.size}px`,
                        height: `${st.size}px`,
                        opacity: st.opacity,
                        animationDelay: `${idx * 0.15}s`
                      }}
                    />
                  ))}
                  
                  {/* Cyber grid lines for AR feeling */}
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fecaf5_1px,transparent_1px)] [background-size:24px_24px]" />
                  <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-slate-900 to-transparent opacity-90" />
                </div>
                
                {/* HUD Camera Access Alert details (Helpful Warning) */}
                <div className="absolute inset-x-4 top-1/4 z-10 mx-auto max-w-sm bg-slate-900/90 border border-amber-500/30 p-4 rounded-xl text-center shadow-2xl backdrop-blur-md">
                  <Camera className="w-8 h-8 text-amber-500 mx-auto animate-pulse mb-2" />
                  <h4 className="text-xs font-bold text-white mb-1">
                    {lang === 'ar' ? 'وضع الكاميرا الافتراضية نشط' : 'Simulated Camera Backdrop'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'ar' 
                      ? 'الوصول للكاميرا مُقيّد أو أنك تتصفح من جهاز مكتبي. تتوفر كافة أدوات البوصلة الرقمية ونظام الاتجاهات والـ GPS بشكل تفاعلي بالكامل لتجربتها ومحاكاتها.'
                      : 'Camera hardware is blocked or you are testing on a desktop workspace. GPS, bearing angles, orientation, and navigation sensors are still fully calculated dynamically for testing.'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* 2. REALTIME CALIBRATION OVERLAY INDICATOR */}
            {showCalibrationPopup && (
              <div className="absolute inset-0 z-40 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-amber-500 rounded-2xl max-w-sm p-6 text-center text-xs md:text-sm space-y-4" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                  <RotateCcw className="w-12 h-12 text-amber-500 mx-auto animate-spin-slow" />
                  <h4 className="font-bold text-white text-sm md:text-base">
                    {lang === 'ar' ? 'معايرة مستشعر البوصلة' : 'Recalibrate Compass Sensor'}
                  </h4>
                  <p className="text-slate-300 leading-relaxed">
                    {lang === 'ar'
                      ? 'إذا كان السهم لا يتجه بالشريحة المناسبة، يرجى التكرم بتحريك الهاتف في الهواء برفق برسم القوس لرقم (8) ثلاث مرات متتالية. يؤدي هذا لتقليل مستويات التشويش المغناطيسي بالهاتف.'
                      : 'If orientation values drift, wave your smartphone in an active horizontal figure-8 pattern several times to realign your inner magnetometer with Magnetic North.'
                    }
                  </p>
                  
                  {/* Decorative Figure 8 GIF/SVG Animation */}
                  <div className="relative w-24 h-12 mx-auto flex items-center justify-center">
                    <div className="absolute w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-500 -ml-6 animate-spin" />
                    <div className="absolute w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-500 ml-6 animate-spin" style={{ animationDirection: 'reverse' }} />
                  </div>

                  <button 
                    onClick={() => setShowCalibrationPopup(false)}
                    className="w-full py-2 bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold font-display rounded-xl"
                  >
                    {lang === 'ar' ? 'اكتملت المعايرة' : 'Calibration Finished'}
                  </button>
                </div>
              </div>
            )}

            {/* A. NAV HUD HEADER (DESTINATION DISPATCH & SPEED) */}
            <div className="w-full p-4 z-10 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent flex flex-col md:flex-row gap-3 items-stretch justify-between pointer-events-auto">
              <div className="flex items-center justify-between md:justify-start gap-3">
                {/* Exit Navigation */}
                <button 
                  onClick={stopWayfinding}
                  className="p-3 bg-slate-900/90 text-slate-300 hover:text-white rounded-xl border border-slate-700/50 hover:bg-slate-800 transition shadow"
                  title={lang === 'ar' ? 'رجوع وتبديل الوجهة' : 'Go back'}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Targeted Info Flag */}
                <div className="text-left leading-normal" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                  <div className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">
                    {lang === 'ar' ? 'ملاحة نشطة بالواقع المعزز 🟢' : 'Live AR Wayfinding 🟢'}
                  </div>
                  <h2 className="text-sm md:text-base font-extrabold text-white leading-normal">
                    {lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Target: X={selectedBuilding.offsetX}m, Y={selectedBuilding.offsetY}m
                  </p>
                </div>
              </div>

              {/* LIVE SATELLITE / COMPASS STATUS COUNTERS */}
              <div className="flex items-center gap-2 justify-end text-[10px] text-slate-300">
                <div className="px-2.5 py-1.5 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center gap-1.5 font-mono">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>GPS: {gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : 'SEARCHING'}</span>
                </div>
                
                <button 
                  onClick={() => setShowCalibrationPopup(true)}
                  className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 rounded-xl border border-slate-800 flex items-center gap-1.5 transition text-amber-400"
                >
                  <Compass className="w-3.5 h-3.5 animate-spin-slow" />
                  <span className="font-mono text-slate-300">{userHeading !== null ? `${userHeading}°` : 'CALIBRATING'}</span>
                </button>
              </div>
            </div>

            {/* B. CENTRAL AR AREA - rotating compass arrow */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              
              {/* COMPASS DIAL DECORATIVE CONTAINER */}
              <div className="relative w-72 h-72 flex items-center justify-center">
                {/* Ambient radar concentric glowing circles */}
                <div className="absolute inset-0 rounded-full border border-amber-500/10 scale-100 animate-pulse pointer-events-none" />
                <div className="absolute inset-6 rounded-full border border-amber-500/5 scale-90 pointer-events-none" />
                <div className="absolute inset-12 rounded-full border border-dashed border-slate-800 pointer-events-none" />

                {/* ROTATING 3D COMPASS DIAL */}
                <div 
                  className="w-48 h-48 rounded-full border-2 border-slate-800 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center shadow-2xl relative transition-transform duration-100"
                  style={{
                    transform: `perspective(500px) rotateX(${Math.max(10, Math.min(60, pitch))}deg) rotateY(${Math.max(-20, Math.min(20, roll))}deg)`
                  }}
                >
                  {/* Compass markings N, E, S, W */}
                  <div className="absolute top-2 text-[10px] text-red-500 font-bold font-mono">N</div>
                  <div className="absolute bottom-2 text-[10px] text-slate-500 font-bold font-mono">S</div>
                  <div className="absolute right-2 text-[10px] text-slate-500 font-bold font-mono">E</div>
                  <div className="absolute left-2 text-[10px] text-slate-500 font-bold font-mono">W</div>

                  {/* Inner Rotating Arrow */}
                  <div 
                    className="absolute w-32 h-32 flex items-center justify-center transition-transform duration-150"
                    style={{ transform: `rotate(${compassAngle}deg)` }}
                  >
                    {/* Visual glowing 3D arrow pointer */}
                    <div className="relative w-8 h-20 -mt-10 flex flex-col items-center">
                      {/* Arrow Head */}
                      <div className="w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-b-[38px] border-b-amber-500 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                      {/* Arrow Stem */}
                      <div className="w-4 h-12 bg-amber-500/80 -mt-0.5 rounded-b-md" />
                    </div>
                  </div>

                  {/* Center Hub circle */}
                  <div className="relative w-4 h-4 rounded-full bg-slate-950 border-2 border-amber-400 z-10 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  </div>
                </div>

                {/* Tilt Assist indicators to alert user the screen requires correction */}
                {(Math.abs(pitch - 75) > 25) && (
                  <div className="absolute bottom-[-10px] bg-slate-950/90 border border-amber-500/40 px-3 py-1.5 rounded-full text-[10px] text-slate-300 text-center animate-bounce flex items-center gap-1">
                    <MoveUp className="w-3 h-3 text-amber-500" />
                    <span>
                      {lang === 'ar' 
                        ? 'ارفع الهاتف أمام وجهك بشكل رأسي للحصول على توجيه دقيق' 
                        : 'Hold phone elevated & upright facing ahead for AR accuracy'
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* C. BOTTOM DATA HUD (METERS REMAINING & TESTING CONSOLES) */}
            <div className="w-full z-10 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent p-4 pb-6 flex flex-col gap-4 pointer-events-auto">
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-800 pt-4">
                {/* 1. Distance Panel */}
                <div className="flex items-center gap-3.5" style={{ direction: 'ltr' }}>
                  {/* Glowing target reached light */}
                  <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
                    <Navigation className="w-7 h-7 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                      {lang === 'ar' ? 'المسافة المتبقية للوصول' : 'DISTANCE TO TARGET'}
                    </div>
                    <div className="text-3xl font-extrabold text-white font-mono tracking-tight flex items-baseline gap-1.5">
                      <span>{Math.round(navigationMetrics.distance)}</span>
                      <span className="text-sm text-amber-400">{lang === 'ar' ? 'متر' : 'meters'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Bearing and Pitch Info */}
                <div className="grid grid-cols-3 gap-2.5 max-w-sm w-full md:w-auto text-center" style={{ direction: 'ltr' }}>
                  <div className="p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="text-[8px] text-slate-500 uppercase font-mono">{lang === 'ar' ? 'اتجاه الهدف' : 'Target Bearing'}</div>
                    <div className="text-xs font-bold text-slate-200 font-mono">{Math.round(navigationMetrics.bearing)}°</div>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="text-[8px] text-slate-500 uppercase font-mono">{lang === 'ar' ? 'ميل وجهك' : 'Phone Pitch'}</div>
                    <div className="text-xs font-bold text-slate-200 font-mono">{pitch}°</div>
                  </div>
                  <div className="p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div className="text-[8px] text-slate-500 uppercase font-mono">{lang === 'ar' ? 'انحراف الهاتف' : 'Phone Roll'}</div>
                    <div className="text-xs font-bold text-slate-200 font-mono">{roll}°</div>
                  </div>
                </div>
              </div>

              {/* INTERACTIVE MOCK WALK BOARD (ONLY DISPLAYED IF SIMULATOR SWITCHED ON) */}
              {isMockingEnabled && (
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      {lang === 'ar' ? 'لوحة تحكم الحركة التجريبية (المحاكي)' : 'Simulator Joystick & Walk Controls'}
                    </h5>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={teleportCloseToTarget}
                        className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold font-display rounded text-[9px] hover:bg-amber-400 transition"
                      >
                        {lang === 'ar' ? 'المثول بجوار المبنى (10م)' : 'Teleport Near Building (10m)'}
                      </button>
                      <button
                        onClick={() => setSimulatedOffset({ x: 0, y: 0 })}
                        className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded text-[9px] hover:bg-slate-700 transition"
                      >
                        {lang === 'ar' ? 'إرجاع لمكاني الحقيقي' : 'Reset Coordinates'}
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-normal" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                    {lang === 'ar' 
                      ? 'اضغط على أزرار التوجيه لمحاكاة المشي أو النزول في الاتجاه الحالي لإغلاق الفجوة وتجربة شاشة الوصول!'
                      : 'Use arrow pads below to simulate physical displacement walking in resort pathways.'
                    }
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                    {/* Simulated Distance Offset Meter */}
                    <div className="text-[10.5px] text-slate-300 font-mono flex flex-wrap gap-2 justify-center">
                      <span>{lang === 'ar' ? 'مجموع الإزاحة:' : 'Local Offset:'}</span>
                      <strong className="text-amber-400 flex gap-2">
                        <span>X: {Math.round(simulatedOffset.x)}m</span>
                        <span>Y: {Math.round(simulatedOffset.y)}m</span>
                      </strong>
                    </div>

                    {/* Joystick Directional Pads */}
                    <div className="grid grid-cols-3 gap-1.5 max-w-[200px] w-full shrink-0">
                      <div />
                      <button 
                        onClick={() => moveSimulated('forward')} 
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 transition rounded-lg text-slate-200 text-center text-[10px] font-bold flex flex-col items-center" 
                        title="Walk Forward"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'أمام' : 'Up'}</span>
                      </button>
                      <div />

                      <button 
                        onClick={() => moveSimulated('left')} 
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 transition rounded-lg text-slate-200 text-center text-[10px] font-bold shrink-0 flex flex-col items-center"
                        title="Walk Left"
                      >
                        <span>◀ {lang === 'ar' ? 'يسار' : 'Left'}</span>
                      </button>
                      <button 
                        onClick={() => moveSimulated('backward')} 
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 transition rounded-lg text-slate-200 text-center text-[10px] font-bold flex flex-col items-center"
                        title="Walk Backward"
                      >
                        <span>{lang === 'ar' ? 'خلف' : 'Back'}</span>
                        <MoveUp className="w-3.5 h-3.5 transform rotate-180" />
                      </button>
                      <button 
                        onClick={() => moveSimulated('right')} 
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 transition rounded-lg text-slate-200 text-center text-[10px] font-bold shrink-0 flex flex-col items-center"
                        title="Walk Right"
                      >
                        <span>{lang === 'ar' ? 'يمين' : 'Right'} ▶</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 3: CONGRATULATIONS DESTINATION REACHED MODAL 
            ======================================================== */}
        {reachedTarget && selectedBuilding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            
            {/* Pure CSS Confetti burst items */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
              {Array.from({ length: 40 }).map((_, i) => {
                const color = ['bg-amber-400', 'bg-blue-400', 'bg-emerald-400', 'bg-red-400', 'bg-pink-400'][i % 5];
                return (
                  <div 
                    key={i} 
                    className={`confetti w-2.5 h-2.5 rounded-full ${color}`} 
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 3}s`,
                      transform: `scale(${Math.random() * 0.8 + 0.4})`
                    }}
                  />
                );
              })}
            </div>

            <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative z-10 p-6 space-y-5 text-center animate-scale-up" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              <div className="w-16 h-16 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-amber-500/20">
                <Award className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">
                  {lang === 'ar' ? 'تهانينا الحارة! 🎉' : 'Destination Unlocked! 🎉'}
                </span>
                <h3 className="text-xl md:text-2xl font-extrabold font-display text-white">
                  {lang === 'ar' ? 'لقد وصلت إلى وجهتك بسلام!' : 'You Have Safely Arrived'}
                </h3>
                <p className="text-sm font-bold text-amber-400 font-display">
                  {lang === 'ar' ? selectedBuilding.nameAr : selectedBuilding.nameEn}
                </p>
              </div>

              {/* CARD DETAILED METRICS FOR THE REACHED BUILDING */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-right text-xs text-slate-300 space-y-3">
                <div className="flex items-center gap-2 text-white border-b border-slate-850 pb-2">
                  <Info className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-bold">{lang === 'ar' ? 'تفاصيل المرفق المعزز:' : 'Facility Information:'}</span>
                </div>

                <p className="text-slate-400 leading-relaxed text-[11px]">
                  {lang === 'ar' ? selectedBuilding.descriptionAr : selectedBuilding.descriptionEn}
                </p>

                {selectedBuilding.hoursAr && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      <strong>{lang === 'ar' ? 'ساعات العمل:' : 'Operating Hours:'}</strong>{' '}
                      {lang === 'ar' ? selectedBuilding.hoursAr : selectedBuilding.hoursEn}
                    </span>
                  </div>
                )}

                {/* Key features of building list */}
                {selectedBuilding.featuresAr && selectedBuilding.featuresAr.length > 0 && (
                  <div className="space-y-1.5 pt-1.5">
                    <span className="text-[10px] font-bold text-slate-400">
                      {lang === 'ar' ? 'الخدمات المتوفرة بالداخل:' : 'Amenities Available Inside:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(lang === 'ar' ? selectedBuilding.featuresAr : selectedBuilding.featuresEn)?.map((feat, ix) => (
                        <span key={ix} className="text-[9.5px] font-semibold bg-slate-900 border border-slate-800 text-amber-500 px-2 py-0.5 rounded-full">
                          ✓ {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION BACK BUTTONS */}
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  onClick={() => {
                    setReachedTarget(false);
                    setSimulatedOffset({ x: 0, y: 0 }); // reset distances
                  }}
                  className="py-2.5 bg-slate-850 text-slate-300 hover:bg-slate-800 transition text-xs font-bold font-display rounded-xl"
                >
                  {lang === 'ar' ? 'إعادة ملاحة' : 'Navigate Again'}
                </button>
                <button
                  onClick={() => {
                    setReachedTarget(false);
                    stopWayfinding();
                    setSelectedBuilding(null);
                  }}
                  className="py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 transition text-xs font-bold font-display rounded-xl"
                >
                  {lang === 'ar' ? 'اختيار وجهة أخرى' : 'Navigate New Location'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 4: FIRESTORE WAYFINDING LOGS MODAL
            ======================================================== */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              <div className="p-4 bg-amber-500 text-slate-950 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <h3 className="font-bold text-sm md:text-base font-display">
                    {lang === 'ar' ? 'سجل جولات الملاحة السحابية (Firebase)' : 'Cloud Wayfinding Session Logs'}
                  </h3>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="hover:bg-amber-600 p-1.5 rounded-lg transition text-slate-950 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-3.5 text-right" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
                <p className="text-xs text-slate-400 leading-normal">
                  {lang === 'ar'
                    ? 'تسجل هذه اللوحة الحية عمليات الملاحة النشطة والطلبات التي واجهتها أثناء تنقلك بالفندق للتتبع والتحليل المستمر.'
                    : 'This live dashboard stores your active navigation completions in Firestore to track resort exploration milestones.'
                  }
                </p>

                <div className="space-y-2.5">
                  {sessionsHistory.length > 0 ? (
                    sessionsHistory.map((sess, idx) => {
                      const formattedTime = sess.timestamp
                        ? new Date(sess.timestamp.seconds * 1000).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '';
                      
                      return (
                        <div key={sess.sessionId} className="bg-slate-950 hover:bg-slate-950/80 p-3.5 rounded-2xl border border-slate-850 flex items-center justify-between gap-3 text-right">
                          <div className="space-y-1 text-right flex-1 select-text">
                            <div className="flex items-center gap-1.5 justify-start">
                              <span className="text-xs bg-slate-900 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                                #{sess.buildingId}
                              </span>
                              <h4 className="text-xs font-bold text-white leading-normal">
                                {sess.buildingName}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2.5 text-[10px] text-slate-500 font-mono">
                              <span>Distance: {sess.distanceMeters}m</span>
                              <span>•</span>
                              <span>{formattedTime}</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1">
                            {sess.completed ? (
                              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                                {lang === 'ar' ? 'بنجاح ✓' : 'Reached ✓'}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold animate-pulse">
                                {lang === 'ar' ? 'بدأت ملاحة' : 'Started'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 text-xs text-slate-500 font-mono">
                      {lang === 'ar' ? 'لا توجد جولات ملاحة مسجلة حية حتى الآن.' : 'No active wayfinding history logged yet.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 transition rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {lang === 'ar' ? 'إغلاق نافذة السجل' : 'Close Dashboard'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            SCREEN 5: PHONE SCAN INTERACTIVE QR CODE DRAWER MODAL
            ======================================================== */}
        {showQrDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative z-10 flex flex-col" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
              <div className="p-4 bg-amber-500 text-slate-950 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  <h3 className="font-bold text-sm md:text-base font-display">
                    {lang === 'ar' ? 'مسح رمز المعاينة السحابي للأجهزة' : 'Scan Cloud Preview Link for Devices'}
                  </h3>
                </div>
                <button onClick={() => setShowQrDrawer(false)} className="hover:bg-amber-600 p-1.5 rounded-lg transition text-slate-950 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 flex flex-col items-center justify-center text-center space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {lang === 'ar'
                    ? 'امسح الرمز أدناه بوضع الكاميرا بهاتفك المحمول لفتح الرابط المؤمن مباشرة وتخطي قيود حظر المتصفح للحصول على واقع معزز كامل!'
                    : 'Scan this live code with your mobile smartphone camera to directly launch the fully secure physical testing environment!'
                  }
                </p>

                {currentUrl ? (
                  <div className="p-4 bg-white rounded-2xl border-4 border-amber-500/20 shadow-inner flex items-center justify-center">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`}
                      alt="Wayfinder QR Code"
                      className="w-48 h-48 block object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 rounded-2xl bg-slate-950/40 animate-pulse flex items-center justify-center border border-slate-800 text-xs text-slate-500">
                    {lang === 'ar' ? 'مطلوب بيئة إنترنت نشطة...' : 'Generating source code...'}
                  </div>
                )}

                <div className="w-full bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 select-all overflow-hidden text-ellipsis">
                  <span className="text-[10px] font-mono text-amber-500 font-bold block overflow-hidden text-ellipsis whitespace-nowrap">
                    {currentUrl}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
                <button 
                  onClick={() => setShowQrDrawer(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 transition rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {lang === 'ar' ? 'إغلاق الرمز' : 'Dismiss'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER METADATA DESCRIPTOR */}
      <footer className="bg-slate-900/40 p-4 border-t border-slate-900 text-center text-[10.5px] text-slate-500 mt-6 leading-relaxed">
        <p>
          {lang === 'ar'
            ? 'تطبيق موجّه المباني بالواقع المعزز (AR Hotel Wayfinder) © 2026. يحترم التطبيق خصوصيتك، ولا يرسل بيانات الكاميرا أو الجي بي إس لأي جهة خارجية.'
            : 'AR Hotel Wayfinder © 2026. Prioritizes guest safety. Camera video & GPS coordinates remain local to your device.'
          }
        </p>
        <p className="mt-1 font-mono text-[9px]">
          Target Architecture: SPA React / Vite • Port binding 3000 • DeviceOrientation Integration
        </p>
      </footer>
    </div>
  );
}
