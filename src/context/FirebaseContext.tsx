import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from '../lib/firebase';

export interface GuestProfile {
  userId: string;
  guestName: string;
  roomNumber: string;
  favoriteBuildings: number[];
  updatedAt?: any;
}

export interface NavigationSession {
  sessionId: string;
  userId: string;
  buildingId: number;
  buildingName: string;
  distanceMeters: number;
  completed: boolean;
  timestamp: any;
}

export interface BuildingTip {
  tipId: string;
  buildingId: number;
  userId: string;
  userName: string;
  userEmail: string;
  caption: string;
  createdAt: any;
}

interface FirebaseContextType {
  user: User | null;
  guestProfile: GuestProfile | null;
  authLoading: boolean;
  profileLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  updateGuestProfile: (name: string, room: string) => Promise<void>;
  toggleFavorite: (buildingId: number) => Promise<void>;
  logWayfindingSession: (buildingId: number, buildingName: string, distanceMeters: number, completed: boolean) => Promise<void>;
  submitBuildingTip: (buildingId: number, caption: string) => Promise<void>;
  deleteBuildingTip: (tipId: string) => Promise<void>;
  activeTips: BuildingTip[];
  loadBuildingTips: (buildingId: number) => () => void;
  sessionsHistory: NavigationSession[];
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guestProfile, setGuestProfile] = useState<GuestProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeTips, setActiveTips] = useState<BuildingTip[]>([]);
  const [sessionsHistory, setSessionsHistory] = useState<NavigationSession[]>([]);

  // Monitor Authentication state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // Authenticated! Load or bootstrap guest profile
        await syncGuestProfile(currentUser);
        // Load navigation sessions
        loadSessionsHistory(currentUser.uid);
      } else {
        setGuestProfile(null);
        setSessionsHistory([]);
      }
    });

    return unsubscribeAuth;
  }, []);

  // Sync Guest Profile document
  const syncGuestProfile = async (currentUser: User) => {
    setProfileLoading(true);
    const profileRef = doc(db, 'guests', currentUser.uid);

    try {
      const docSnap = await getDoc(profileRef);
      if (docSnap.exists()) {
        setGuestProfile(docSnap.data() as GuestProfile);
      } else {
        // Create initial default profile on first login
        const newProfile: GuestProfile = {
          userId: currentUser.uid,
          guestName: currentUser.displayName || 'Guest User',
          roomNumber: '',
          favoriteBuildings: [],
          updatedAt: serverTimestamp()
        };
        await setDoc(profileRef, newProfile);
        setGuestProfile(newProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `guests/${currentUser.uid}`);
    } finally {
      setProfileLoading(false);
    }
  };

  // Google Sign-In helper
  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google authentication failed", err);
    }
  };

  // Sign-Out helper
  const logoutUser = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // Update profile info
  const updateGuestProfile = async (name: string, room: string) => {
    if (!user) return;
    setProfileLoading(true);
    const profileRef = doc(db, 'guests', user.uid);

    try {
      await updateDoc(profileRef, {
        guestName: name.trim(),
        roomNumber: room.trim(),
        updatedAt: serverTimestamp()
      });
      setGuestProfile(prev => prev ? { ...prev, guestName: name.trim(), roomNumber: room.trim() } : null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `guests/${user.uid}`);
    } finally {
      setProfileLoading(false);
    }
  };

  // Toggle favorite status for a resort building
  const toggleFavorite = async (buildingId: number) => {
    if (!user || !guestProfile) return;
    const profileRef = doc(db, 'guests', user.uid);
    const isFav = guestProfile.favoriteBuildings.includes(buildingId);

    try {
      await updateDoc(profileRef, {
        favoriteBuildings: isFav ? arrayRemove(buildingId) : arrayUnion(buildingId)
      });
      setGuestProfile(prev => {
        if (!prev) return null;
        const newFavorites = isFav 
          ? prev.favoriteBuildings.filter(id => id !== buildingId)
          : [...prev.favoriteBuildings, buildingId];
        return { ...prev, favoriteBuildings: newFavorites };
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `guests/${user.uid}`);
    }
  };

  // Log a complete or checkpoint wayfinding session
  const logWayfindingSession = async (
    buildingId: number, 
    buildingName: string, 
    distanceMeters: number, 
    completed: boolean
  ) => {
    if (!user) return;
    const sessionRef = doc(collection(db, 'sessions'));
    
    try {
      const payload: NavigationSession = {
        sessionId: sessionRef.id,
        userId: user.uid,
        buildingId,
        buildingName,
        distanceMeters: Math.round(distanceMeters),
        completed,
        timestamp: serverTimestamp()
      };
      await setDoc(sessionRef, payload);
      
      // Update local sessions state dynamically
      setSessionsHistory(prev => [payload, ...prev]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `sessions/${sessionRef.id}`);
    }
  };

  // Fetch the guest's navigation logs history
  const loadSessionsHistory = async (userId: string) => {
    const queryPath = 'sessions';
    try {
      const q = query(
        collection(db, queryPath), 
        where('userId', '==', userId)
      );
      const querySnap = await getDocs(q);
      const historyList: NavigationSession[] = [];
      querySnap.forEach((doc) => {
        historyList.push(doc.data() as NavigationSession);
      });
      // Sort manually in case database composite indexes are initializing
      historyList.sort((a, b) => {
        const aT = a.timestamp?.seconds || 0;
        const bT = b.timestamp?.seconds || 0;
        return bT - aT;
      });
      setSessionsHistory(historyList);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, queryPath);
    }
  };

  // Subscribe to raw live tips left on a specific building
  const loadBuildingTips = (buildingId: number) => {
    const queryPath = 'tips';
    try {
      const q = query(
        collection(db, queryPath),
        where('buildingId', '==', buildingId)
      );
      const unsubscribe = onSnapshot(q, (docSnap) => {
        const tipsList: BuildingTip[] = [];
        docSnap.forEach((doc) => {
          tipsList.push(doc.data() as BuildingTip);
        });
        // Sort newest first
        tipsList.sort((a, b) => {
          const aT = a.createdAt?.seconds || 0;
          const bT = b.createdAt?.seconds || 0;
          return bT - aT;
        });
        setActiveTips(tipsList);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, queryPath);
      });
      return unsubscribe;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, queryPath);
      return () => {};
    }
  };

  // Submit a new building tip
  const submitBuildingTip = async (buildingId: number, caption: string) => {
    if (!user || !guestProfile) return;
    const documentRef = doc(collection(db, 'tips'));

    try {
      const payload: BuildingTip = {
        tipId: documentRef.id,
        buildingId,
        userId: user.uid,
        userName: guestProfile.guestName,
        userEmail: user.email || '',
        caption: caption.trim().substring(0, 200), // Enforce length limit
        createdAt: serverTimestamp()
      };
      await setDoc(documentRef, payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `tips/${documentRef.id}`);
    }
  };

  // Delete a tip if current user is creator
  const deleteBuildingTip = async (tipId: string) => {
    if (!user) return;
    const targetRef = doc(db, 'tips', tipId);

    try {
      await deleteDoc(targetRef);
      // Clean up item from local snapshot state
      setActiveTips(prev => prev.filter(t => t.tipId !== tipId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tips/${tipId}`);
    }
  };

  return (
    <FirebaseContext.Provider value={{
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
    }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
