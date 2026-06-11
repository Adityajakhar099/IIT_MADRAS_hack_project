import React, { useState, useEffect, useRef } from 'react';
import { RULES_DATABASE } from './rules';
import { 
  LayoutDashboard, 
  FileSearch, 
  Calculator, 
  MessageSquare, 
  UploadCloud, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ChevronRight, 
  ShieldAlert, 
  User, 
  Sparkles, 
  Scale, 
  Send,
  HelpCircle,
  TrendingUp,
  MapPin,
  Calendar,
  DollarSign,
  Download
} from 'lucide-react';
import { saveFileToOfflineQueue, getOfflineQueue, removeFileFromOfflineQueue } from './indexedDb';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  ArcElement,
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';

// Register ChartJS elements
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement, 
  ArcElement,
  Title, 
  Tooltip, 
  Legend
);

// Pre-defined violations for auto-suggest
const VIOLATIONS_DATABASE = [
  "No Helmet",
  "No Seatbelt",
  "Signal Jumping",
  "Overspeeding",
  "Drunk Driving",
  "No Insurance",
  "No License",
  "Dangerous Driving",
  "Mobile Phone Usage",
  "Wrong Parking",
  "Triple Riding",
  "PUCC violation",
  "Driving without registration",
  "Illegal modification",
  "Rash driving"
];

// Levenshtein function for client-side fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getSimilarity(s1, s2) {
  let longer = s1.toLowerCase();
  let shorter = s2.toLowerCase();
  if (s1.length < s2.length) {
    longer = s2.toLowerCase();
    shorter = s1.toLowerCase();
  }
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - levenshteinDistance(longer, shorter)) / parseFloat(longerLength);
}

const VEHICLE_NORMALIZATION = {
  "bike": "Bike", "two-wheeler": "Bike", "2-wheeler": "Bike", "motorcycle": "Bike", "scooter": "Bike",
  "car": "Car", "four-wheeler": "Car", "4-wheeler": "Car", "lmv": "Car", "auto": "Car", "jeep": "Car", "suv": "Car",
  "truck": "Heavy Vehicle", "bus": "Heavy Vehicle", "heavy vehicle": "Heavy Vehicle", "hmv": "Heavy Vehicle"
};

function normalizeVehicleType(vehicleType) {
  if (!vehicleType) return null;
  const key = vehicleType.trim().toLowerCase();
  return VEHICLE_NORMALIZATION[key] || null;
}

function calculateFineClientSide(state, vehicleType, violation, repeatOffense) {
  const stateKey = state.trim().toLowerCase();
  const rules = RULES_DATABASE[stateKey];
  if (!rules) {
    throw new Error(`State '${state}' is not supported. Supported states are: Rajasthan, Maharashtra`);
  }

  const normalizedVehicle = normalizeVehicleType(vehicleType);
  if (!normalizedVehicle) {
    throw new Error(`Vehicle type '${vehicleType}' is invalid. Supported categories are Bike, Car, Heavy Vehicle.`);
  }

  // Find exact or fuzzy matched violation
  const allViolations = Array.from(new Set(rules.map(r => r.violation)));
  let matchedViolation = null;

  // Exact match first
  for (let v of allViolations) {
    if (v.toLowerCase() === violation.trim().toLowerCase()) {
      matchedViolation = v;
      break;
    }
  }

  // Fuzzy match (cutoff 0.6)
  if (!matchedViolation) {
    let bestMatch = null;
    let highestSimilarity = 0;
    for (let v of allViolations) {
      const similarity = getSimilarity(violation, v);
      if (similarity > highestSimilarity && similarity >= 0.6) {
        highestSimilarity = similarity;
        bestMatch = v;
      }
    }
    matchedViolation = bestMatch;
  }

  if (!matchedViolation) {
    throw new Error(`Unknown violation: '${violation}'.`);
  }

  const violationRules = rules.filter(r => r.violation === matchedViolation);
  let matchedRule = null;
  for (let r of violationRules) {
    const ruleVt = r.vehicle_type.toLowerCase();
    if (ruleVt === 'all' || ruleVt === 'any' || ruleVt === normalizedVehicle.toLowerCase()) {
      matchedRule = r;
      break;
    }
  }

  if (!matchedRule) {
    throw new Error(`Violation '${matchedViolation}' is not applicable to vehicle type '${normalizedVehicle}'.`);
  }

  const fineAmount = repeatOffense ? matchedRule.repeat_fine : matchedRule.fine;

  return {
    state: matchedRule.state,
    vehicle_type: normalizedVehicle,
    violation: matchedRule.violation,
    law_section: matchedRule.law_section,
    fine: fineAmount,
    repeat_offense: repeatOffense,
    license_suspension: matchedRule.license_suspension,
    isOffline: true
  };
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const appRef = useRef(null);

  // Connection and Queue States
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [ocrQueue, setOcrQueue] = useState([]);
  const [networkAlert, setNetworkAlert] = useState(null);

  // PWA Installation States
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // Stats Counters
  const [statCounts, setStatCounts] = useState({ ocr: 0, fines: 0, compliances: 0 });

  // --- MODERNIZATION STATES ---
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aegis-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [ocrHistory, setOcrHistory] = useState(() => {
    const saved = localStorage.getItem('aegis-ocr-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [calculatorHistory, setCalculatorHistory] = useState(() => {
    const saved = localStorage.getItem('aegis-calc-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [challanPreviewUrl, setChallanPreviewUrl] = useState(null);
  const [recordedSpeed, setRecordedSpeed] = useState(80);
  const [isListening, setIsListening] = useState(false);
  const [activities, setActivities] = useState([
    { id: 1, time: 'Just Now', type: 'OCR Scan', detail: 'RJ-14-2C-1249 parsed successfully', severity: 'low' },
    { id: 2, time: '2 mins ago', type: 'Fine Calculation', detail: 'MH-12-AB-9876 computed: ₹5,000 (Drunk Driving)', severity: 'high' },
    { id: 3, time: '10 mins ago', type: 'Legal Query', detail: 'Helmets law section clarification requested', severity: 'low' }
  ]);

  // Sync theme
  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('aegis-theme', theme);
  }, [theme]);

  // Sync OCR history
  useEffect(() => {
    localStorage.setItem('aegis-ocr-history', JSON.stringify(ocrHistory));
  }, [ocrHistory]);

  // Sync Calculator history
  useEffect(() => {
    localStorage.setItem('aegis-calc-history', JSON.stringify(calculatorHistory));
  }, [calculatorHistory]);

  // Load IndexedDB offline queue on mount
  useEffect(() => {
    const loadSavedQueue = async () => {
      try {
        const saved = await getOfflineQueue();
        if (saved && saved.length > 0) {
          setOcrQueue(saved);
          console.log(`Loaded ${saved.length} pending files from IndexedDB`);
        }
      } catch (err) {
        console.error("Failed to load offline queue from IndexedDB:", err);
      }
    };
    loadSavedQueue();
  }, []);

  // PWA Install prompt listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('Aegis App was successfully installed!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice for PWA installation: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Toast notifications & Heartbeat connectivity check
  useEffect(() => {
    let checkInterval;

    const checkConnectivity = async () => {
      // If browser says we are offline, don't even ping the server
      if (!navigator.onLine) {
        if (!isOffline) {
          setIsOffline(true);
          setNetworkAlert({
            type: 'offline',
            message: 'No internet connection detected. Switched to offline database mode.'
          });
          setTimeout(() => setNetworkAlert(null), 5000);
        }
        return;
      }

      // If navigator says we are online, ping the FastAPI backend to verify it's actually alive
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5 seconds timeout

        const res = await fetch('/health', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          if (isOffline) {
            setIsOffline(false);
            setNetworkAlert({
              type: 'online',
              message: 'Connection to FastAPI backend server restored!'
            });
            setTimeout(() => setNetworkAlert(null), 5000);
          }
        } else {
          throw new Error("Backend server returned non-OK status");
        }
      } catch (err) {
        if (!isOffline) {
          setIsOffline(true);
          setNetworkAlert({
            type: 'offline',
            message: 'FastAPI backend server is unreachable. Switched to offline database mode.'
          });
          setTimeout(() => setNetworkAlert(null), 5000);
        }
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setNetworkAlert({
        type: 'offline',
        message: 'No internet connection detected. Switched to offline database mode.'
      });
      setTimeout(() => setNetworkAlert(null), 5000);
    };

    const handleOnline = () => {
      checkConnectivity();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and periodic heartbeat
    checkConnectivity();
    checkInterval = setInterval(checkConnectivity, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, [isOffline]);

  // Simulated telemetry activity feed additions
  useEffect(() => {
    const interval = setInterval(() => {
      const mockVehicles = ['RJ-14-EF-7789', 'MH-02-XY-3412', 'DL-3C-AS-9923', 'KA-01-MJ-8854'];
      const mockViolations = ['Overspeeding', 'No Seatbelt', 'Signal Jumping', 'Triple Riding'];
      const vehicle = mockVehicles[Math.floor(Math.random() * mockVehicles.length)];
      const violation = mockViolations[Math.floor(Math.random() * mockViolations.length)];
      
      const newActivity = {
        id: Date.now(),
        time: 'Just Now',
        type: Math.random() > 0.5 ? 'OCR Scan' : 'Fine Query',
        detail: `${vehicle}: ${violation} detected`,
        severity: violation === 'Overspeeding' || violation === 'Drunk Driving' ? 'high' : 'low'
      };
      setActivities(prev => [newActivity, ...prev.slice(0, 4)]);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // --- CARD 3D TILT EFFECT ---
  const handleCardMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.setProperty('--x', `${x}px`);
    card.style.setProperty('--y', `${y}px`);

    const width = rect.width;
    const height = rect.height;
    const rotateX = -12 * ((y - height / 2) / (height / 2));
    const rotateY = 12 * ((x - width / 2) / (width / 2));

    gsap.to(card, {
      rotateX: rotateX,
      rotateY: rotateY,
      transformPerspective: 1000,
      duration: 0.35,
      ease: 'power2.out'
    });
  };

  const handleCardMouseLeave = (e) => {
    const card = e.currentTarget;
    gsap.to(card, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.5,
      ease: 'power2.out'
    });
  };

  // --- MAGNETIC BUTTON EFFECT ---
  const handleMagneticMouseMove = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    gsap.to(btn, {
      x: x * 0.3,
      y: y * 0.3,
      duration: 0.3,
      ease: 'power2.out'
    });
  };

  const handleMagneticMouseLeave = (e) => {
    const btn = e.currentTarget;
    gsap.to(btn, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: 'elastic.out(1.1, 0.4)'
    });
  };

  // GSAP animation for stats load
  useEffect(() => {
    if (activeTab === 'dashboard') {
      const targets = { ocr: 0, fines: 0, compliances: 0 };
      gsap.to(targets, {
        ocr: 42,
        fines: 87500,
        compliances: 96,
        duration: 1.5,
        ease: 'power3.out',
        onUpdate: () => {
          setStatCounts({
            ocr: Math.floor(targets.ocr),
            fines: Math.floor(targets.fines),
            compliances: Math.floor(targets.compliances)
          });
        }
      });
    }
  }, [activeTab]);

  // Tab change animation with staggered entrance of elements
  const handleTabChange = (tabId) => {
    gsap.to('.main-content', {
      opacity: 0,
      y: 15,
      duration: 0.25,
      onComplete: () => {
        setActiveTab(tabId);
        gsap.fromTo('.main-content', 
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
        );
      }
    });
  };

  // Stagger elements inside each panel when the tab changes
  useEffect(() => {
    // Reveal headers
    gsap.fromTo('.header-title h2, .header-title p',
      { opacity: 0, x: -25 },
      { opacity: 1, x: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out' }
    );

    if (activeTab === 'dashboard') {
      gsap.fromTo('.stat-card', 
        { opacity: 0, y: 35 }, 
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.7, ease: 'power2.out' }
      );
      gsap.fromTo('.main-content .glass-card:not(.stat-card)', 
        { opacity: 0, y: 40 }, 
        { opacity: 1, y: 0, stagger: 0.15, duration: 0.8, ease: 'power3.out', delay: 0.1 }
      );
    } else if (activeTab === 'challan') {
      gsap.fromTo('.dropzone-container',
        { opacity: 0, scale: 0.96 },
        { opacity: 1, scale: 1, duration: 0.75, ease: 'power3.out' }
      );
    } else if (activeTab === 'calculator') {
      gsap.fromTo('.calculator-container form > div',
        { opacity: 0, y: 25 },
        { opacity: 1, y: 0, stagger: 0.12, duration: 0.65, ease: 'power2.out' }
      );
    } else if (activeTab === 'chatbot') {
      gsap.fromTo('.chat-messages-container',
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.75, ease: 'power3.out' }
      );
      gsap.fromTo('.chat-suggestions-sidebar',
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.75, ease: 'power3.out', delay: 0.1 }
      );
    }
  }, [activeTab]);

  // --- TAB 1: DASHBOARD ---
  const lineChartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'OCR Scans',
        data: [12, 19, 28, 22, 35, 42],
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Fine Queries',
        data: [25, 45, 60, 50, 78, 95],
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.05)',
        tension: 0.4,
        fill: true,
      }
    ],
  };

  const barChartData = {
    labels: ['No Helmet', 'Overspeeding', 'Signal Jump', 'Drunk Driving', 'Seatbelt'],
    datasets: [
      {
        label: 'Fines Collected (INR)',
        data: [15000, 32000, 18000, 90000, 12000],
        backgroundColor: [
          '#7c3aed',
          '#4c1d95',
          '#ec4899',
          '#1e1b4b',
          'rgba(124, 58, 237, 0.5)'
        ],
        borderWidth: 0,
        borderRadius: 8
      }
    ]
  };

  const doughnutData = {
    labels: ['Rajasthan', 'Maharashtra', 'Other Jurisdictions'],
    datasets: [
      {
        data: [55, 30, 15],
        backgroundColor: [
          '#4c1d95',
          '#7c3aed',
          '#ec4899'
        ],
        borderWidth: 0
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: theme === 'dark' ? '#a78bfa' : '#4c1d95',
          font: { family: 'Outfit', size: 12 }
        }
      }
    },
    scales: {
      x: {
        grid: { color: theme === 'dark' ? 'rgba(167, 139, 250, 0.08)' : 'rgba(76, 29, 149, 0.08)' },
        ticks: { color: theme === 'dark' ? '#a78bfa' : '#4c1d95', font: { family: 'Outfit' } }
      },
      y: {
        grid: { color: theme === 'dark' ? 'rgba(167, 139, 250, 0.08)' : 'rgba(76, 29, 149, 0.08)' },
        ticks: { color: theme === 'dark' ? '#a78bfa' : '#4c1d95', font: { family: 'Outfit' } }
      }
    }
  };

  // --- TAB 2: CHALLAN OCR ANALYZER ---
  const [challanFile, setChallanFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrError, setOcrError] = useState('');
  const ocrScannerRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setChallanFile(file);
      processChallanFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setChallanFile(file);
      processChallanFile(file);
    }
  };

  function processChallanFile(file) {
    // Setup preview URL if image
    if (file.type.startsWith('image/')) {
      setChallanPreviewUrl(URL.createObjectURL(file));
    } else {
      setChallanPreviewUrl(null);
    }

    if (isOffline) {
      const saveFile = async () => {
        try {
          const dbId = await saveFileToOfflineQueue(file);
          file.dbId = dbId;
          setOcrQueue(prev => {
            if (prev.some(f => f.name === file.name && f.size === file.size)) return prev;
            return [...prev, file];
          });
        } catch (err) {
          console.error("Failed to save queued file to IndexedDB:", err);
        }
      };
      saveFile();
      setNetworkAlert({
        type: 'queue',
        message: `Offline mode: Added '${file.name}' to the upload queue. It will automatically process when connection is restored.`
      });
      return;
    }

    setIsOcrProcessing(true);
    setOcrError('');
    setOcrResult(null);

    // Dynamic scanner laser animation
    gsap.killTweensOf('.scanner-laser');
    gsap.set('.scanner-laser', { top: '0%', opacity: 1 });
    gsap.to('.scanner-laser', {
      top: '100%',
      duration: 1.8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    const formData = new FormData();
    formData.append('file', file);

    fetch('/challan/analyze', {
      method: 'POST',
      body: formData
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to process document');
        }
        return res.json();
      })
      .then((data) => {
        setOcrResult(data);
        setIsOcrProcessing(false);
        gsap.killTweensOf('.scanner-laser');
        gsap.set('.scanner-laser', { opacity: 0 });

        // Add to history
        setOcrHistory(prev => {
          const newHist = [
            {
              vehicle_number: data.vehicle_number || "Not Found",
              violation: data.violation || "Not Found",
              fine_amount: data.fine_amount || "Not Specified",
              date: data.date && data.date !== "Not Found" ? data.date : new Date().toLocaleDateString()
            },
            ...prev
          ];
          return newHist.slice(0, 10);
        });
        
        // Burst confetti
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#3b82f6', '#a855f7', '#10b981']
        });

        // Staggered reveal of result panel contents
        setTimeout(() => {
          gsap.fromTo('.ocr-results-layout > div',
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, stagger: 0.2, duration: 0.8, ease: 'power3.out' }
          );
        }, 50);
      })
      .catch((err) => {
        setOcrError(err.message);
        setIsOcrProcessing(false);
        gsap.killTweensOf('.scanner-laser');
        gsap.set('.scanner-laser', { opacity: 0 });
      });
  }

  // Sync / Process queued files when connection is restored
  useEffect(() => {
    if (!isOffline && ocrQueue.length > 0) {
      setNetworkAlert({
        type: 'sync',
        message: `Restored connection! Processing ${ocrQueue.length} queued challan upload(s)...`
      });
      
      const queueToProcess = [...ocrQueue];
      setOcrQueue([]);
      
      // Process one by one with a slight stagger and delete from IndexedDB
      queueToProcess.forEach((file, index) => {
        setTimeout(async () => {
          if (file.dbId) {
            try {
              await removeFileFromOfflineQueue(file.dbId);
              console.log(`Successfully removed file ${file.name} from IndexedDB queue`);
            } catch (err) {
              console.error("Failed to remove file from IndexedDB:", err);
            }
          }
          processChallanFile(file);
        }, index * 1200);
      });
      
      setTimeout(() => setNetworkAlert(null), 6000);
    }
  }, [isOffline, ocrQueue]);

  // --- TAB 3: DYNAMIC FINE CALCULATOR ---
  const [calcState, setCalcState] = useState('Rajasthan');
  const [calcVehicle, setCalcVehicle] = useState('Car');
  const [calcViolation, setCalcViolation] = useState('');
  const [calcRepeat, setCalcRepeat] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calcError, setCalcError] = useState('');
  const [animatedFine, setAnimatedFine] = useState(0);

  const handleViolationChange = (e) => {
    const value = e.target.value;
    setCalcViolation(value);
    
    if (value.trim()) {
      const filtered = VIOLATIONS_DATABASE.filter(v => 
        v.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const selectSuggestion = (v) => {
    setCalcViolation(v);
    setSuggestions([]);
  };

  const displayCalculationResult = (data) => {
    // Calculate overspeeding surcharge if applicable
    let finalFine = data.fine;
    let surchargeAmount = 0;
    let limit = 0;
    if (calcViolation.toLowerCase().includes('speed') || calcViolation.toLowerCase().includes('overspeed')) {
      limit = calcVehicle === 'Bike' ? 50 : calcVehicle === 'Car' ? 70 : 60;
      surchargeAmount = Math.max(0, recordedSpeed - limit) * 120;
      finalFine += surchargeAmount;
    }

    const enrichedData = {
      ...data,
      fine: finalFine,
      surcharge: surchargeAmount,
      speedLimit: limit,
      recordedSpeed: recordedSpeed
    };

    setCalcResult(enrichedData);
    setIsCalculating(false);

    // Add to history
    setCalculatorHistory(prev => {
      const newHist = [
        {
          violation: data.violation,
          state: data.state,
          vehicle_type: data.vehicle_type,
          fine: finalFine,
          date: new Date().toLocaleDateString()
        },
        ...prev
      ];
      return newHist.slice(0, 10);
    });

    // Animate counter
    const targetVal = finalFine;
    const countObj = { val: 0 };
    gsap.to(countObj, {
      val: targetVal,
      duration: 1.3,
      ease: 'power3.out',
      onUpdate: () => {
        setAnimatedFine(Math.floor(countObj.val));
      }
    });

    // Animate results card entrance
    setTimeout(() => {
      gsap.fromTo('.calculation-result',
        { opacity: 0, y: 30, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
      );
    }, 50);
  };

  const handleCalculate = (e) => {
    e.preventDefault();
    if (!calcViolation) return;

    setIsCalculating(true);
    setCalcError('');
    setCalcResult(null);

    const runLocalCalculation = () => {
      try {
        const localResult = calculateFineClientSide(calcState, calcVehicle, calcViolation, calcRepeat);
        displayCalculationResult(localResult);
      } catch (err) {
        setCalcError(err.message);
        setIsCalculating(false);
      }
    };

    if (isOffline) {
      setTimeout(() => runLocalCalculation(), 400); // Small delay to simulate processing
      return;
    }

    fetch('/fine/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state: calcState,
        vehicle_type: calcVehicle,
        violation: calcViolation,
        repeat_offense: calcRepeat
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Calculation error');
        }
        return res.json();
      })
      .then((data) => {
        displayCalculationResult(data);
      })
      .catch((err) => {
        console.warn("Backend calculation failed. Falling back to local rules engine: ", err);
        runLocalCalculation();
      });
  };

  // --- TAB 4: LEGAL COMPLIANCE CHATBOT ---
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: 'Hello! I am your AI Traffic Compliance Officer. Ask me anything about traffic rules, laws, or penalties in India.',
      sources: []
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatBottomRef = useRef(null);

  const suggestedPrompts = [
    {
      title: "Helmet Offence",
      prompt: "What is the penalty for driving without a helmet in Rajasthan?"
    },
    {
      title: "Seatbelt rules",
      prompt: "What is the penalty for driving without a seatbelt in Maharashtra?"
    },
    {
      title: "Drunk Driving",
      prompt: "Explain the details and suspension policy for Drunk Driving."
    }
  ];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotTyping]);

  // Springy/elastic animation for new chat bubble entrance
  useEffect(() => {
    const bubbles = document.querySelectorAll('.chat-bubble-wrapper');
    if (bubbles.length > 0) {
      const lastBubble = bubbles[bubbles.length - 1];
      gsap.fromTo(lastBubble,
        { opacity: 0, scale: 0.82, y: 25 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(1.4)' }
      );
    }
  }, [messages]);

  const sendChatMessage = (textToSend) => {
    const query = textToSend || chatInput;
    if (!query.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { sender: 'user', text: query }]);
    if (!textToSend) setChatInput('');
    setIsBotTyping(true);

    const runOfflineChat = () => {
      setTimeout(() => {
        const queryLower = query.toLowerCase();
        let answer = "";
        let sources = [];

        // Check if query matches any known violation keywords
        const keywords = [
          { key: "helmet", name: "No Helmet" },
          { key: "seatbelt", name: "No Seatbelt" },
          { key: "signal", name: "Signal Jumping" },
          { key: "speed", name: "Overspeeding" },
          { key: "drunk", name: "Drunk Driving" },
          { key: "drink", name: "Drunk Driving" },
          { key: "insurance", name: "No Insurance" },
          { key: "license", name: "No License" },
          { key: "phone", name: "Mobile Phone Usage" },
          { key: "mobile", name: "Mobile Phone Usage" },
          { key: "park", name: "Wrong Parking" },
          { key: "triple", name: "Triple Riding" },
          { key: "pucc", name: "PUCC violation" },
          { key: "pollution", name: "PUCC violation" },
          { key: "registration", name: "Driving without registration" },
          { key: "modify", name: "Illegal modification" },
          { key: "modification", name: "Illegal modification" },
          { key: "rash", name: "Rash driving" }
        ];

        let matchedViolations = [];
        keywords.forEach(item => {
          if (queryLower.includes(item.key) && !matchedViolations.includes(item.name)) {
            matchedViolations.push(item.name);
          }
        });

        if (matchedViolations.length > 0) {
          answer = `🤖 **Offline Cop Mode:** I detected inquiries regarding the following violations in your message: **${matchedViolations.join(', ')}**.\n\nHere are the details from our local database:\n\n`;
          
          matchedViolations.forEach(violationName => {
            answer += `#### 🚦 ${violationName}\n`;
            
            // Get Rajasthan details
            const rajRule = RULES_DATABASE.rajasthan.find(r => r.violation === violationName);
            if (rajRule) {
              answer += `- **Rajasthan**: Base penalty of **₹${rajRule.fine}** (₹${rajRule.repeat_fine} repeat). Section: **${rajRule.law_section}**. License: **${rajRule.license_suspension === 'None' ? 'No suspension' : `Suspended ${rajRule.license_suspension}`}**.\n`;
              sources.push(rajRule.law_section);
            }
            
            // Get Maharashtra details
            const mahRule = RULES_DATABASE.maharashtra.find(r => r.violation === violationName);
            if (mahRule) {
              answer += `- **Maharashtra**: Base penalty of **₹${mahRule.fine}** (₹${mahRule.repeat_fine} repeat). Section: **${mahRule.law_section}**. License: **${mahRule.license_suspension === 'None' ? 'No suspension' : `Suspended ${mahRule.license_suspension}`}**.\n`;
              if (!sources.includes(mahRule.law_section)) sources.push(mahRule.law_section);
            }
            answer += `\n`;
          });
          
          answer += `*Note: You are currently offline. Full contextual explanations using Gemini RAG are unavailable until connection is restored.*`;
        } else {
          answer = `🤖 **Offline Cop Mode:** You are currently offline. Because the FastAPI server is unreachable, I cannot process general AI-based legal queries using Gemini.\n\nHowever, I can fetch **exact penalties and law sections** from our offline database. Please ask me about specific offences, for example:\n- *Helmet regulations*\n- *Seatbelt violations*\n- *Drunk driving penalties*\n- *Overspeeding fines*\n- *Wrong parking fines*\n\nOnce connection is restored, full chat capabilities will resume automatically!`;
        }

        setMessages(prev => [...prev, {
          sender: 'assistant',
          text: answer,
          sources: sources
        }]);
        setIsBotTyping(false);
      }, 800);
    };

    if (isOffline) {
      runOfflineChat();
      return;
    }

    fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: query })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to generate response');
        }
        return res.json();
      })
      .then((data) => {
        setMessages(prev => [...prev, {
          sender: 'assistant',
          text: data.answer,
          sources: data.sources || []
        }]);
        setIsBotTyping(false);
      })
      .catch((err) => {
        console.warn("RAG query fetch failed. Falling back to local responder: ", err);
        runOfflineChat();
      });
  };

  // --- VOICE SPEECH RECOGNITION ---
  const startVoiceRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      setIsListening(true);
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(transcript);
    };
    
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognition.start();
  };

  // --- EXPORT RAG CHAT REPORT ---
  const handleExportChat = () => {
    if (messages.length === 0) return;
    const transcriptText = messages.map(m => 
      `[${m.sender === 'user' ? 'CITIZEN' : 'AI LEGAL COP'}]\n${m.text}\n${m.sources && m.sources.length > 0 ? `References: ${m.sources.join(', ')}` : ''}\n-------------------`
    ).join('\n\n');
    
    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Aegis_Traffic_Legal_Cop_Report_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  return (
    <div className="app-container" ref={appRef}>
      {/* Premium Connection Toast Banner */}
      {networkAlert && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: 'var(--glass-bg)',
          border: `1px solid ${networkAlert.type === 'offline' ? 'var(--accent-rose)' : networkAlert.type === 'online' ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          maxWidth: '400px',
          backdropFilter: 'blur(12px)',
          transition: 'all 0.3s ease-in-out'
        }}>
          <span style={{ fontSize: '1.25rem' }}>
            {networkAlert.type === 'offline' ? '⚠️' : networkAlert.type === 'online' ? '✅' : '🔄'}
          </span>
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {networkAlert.message}
          </div>
        </div>
      )}
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-icon">
              <Scale size={24} />
            </div>
            <h1>Aegis Traffic AI</h1>
          </div>
          
          <nav>
            <ul className="nav-links">
              <li className="nav-item">
                <button 
                  className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => handleTabChange('dashboard')}
                >
                  <LayoutDashboard className="nav-icon" size={18} />
                  <span>Dashboard</span>
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-button ${activeTab === 'challan' ? 'active' : ''}`}
                  onClick={() => handleTabChange('challan')}
                >
                  <FileSearch className="nav-icon" size={18} />
                  <span>Challan OCR</span>
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-button ${activeTab === 'calculator' ? 'active' : ''}`}
                  onClick={() => handleTabChange('calculator')}
                >
                  <Calculator className="nav-icon" size={18} />
                  <span>Fine Calculator</span>
                </button>
              </li>
              <li className="nav-item">
                <button 
                  className={`nav-button ${activeTab === 'chatbot' ? 'active' : ''}`}
                  onClick={() => handleTabChange('chatbot')}
                >
                  <MessageSquare className="nav-icon" size={18} />
                  <span>AI Legal Cop</span>
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-avatar">H</div>
            <div className="user-info">
              <p className="name">IIT M Hackathon</p>
              <p className="role">Demo Profile</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="header">
          <div className="header-title">
            {activeTab === 'dashboard' && (
              <>
                <h2>Analytics Dashboard</h2>
                <p>System summaries and compliance statistics</p>
              </>
            )}
            {activeTab === 'challan' && (
              <>
                <h2>Challan Analyzer</h2>
                <p>Upload files (JPG/PNG/PDF) to run intelligent OCR and explanations</p>
              </>
            )}
            {activeTab === 'calculator' && (
              <>
                <h2>Compliance Calculator</h2>
                <p>Determine exact fines and penalties according to local law sections</p>
              </>
            )}
            {activeTab === 'chatbot' && (
              <>
                <h2>Traffic Compliance RAG Chat</h2>
                <p>Ask legal rules questions verified against local legislation databases</p>
              </>
            )}
          </div>
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isInstallable && (
              <button 
                className="btn-chat-action" 
                onClick={handleInstallApp}
                title="Install Aegis Traffic App"
                style={{ 
                  fontSize: '0.9rem', 
                  padding: '0.6rem 1rem', 
                  borderRadius: '20px', 
                  background: 'var(--accent-purple)', 
                  border: '1px solid var(--glass-border)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontWeight: 600,
                  transition: 'var(--transition-fast)'
                }}
              >
                <Download size={16} />
                <span>Install App</span>
              </button>
            )}
            <button 
              className="btn-chat-action" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              style={{ 
                fontSize: '1.2rem', 
                padding: '0.6rem', 
                borderRadius: '50%', 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--glass-border)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <div className={`badge-status ${isOffline ? 'offline' : ''}`} style={isOffline ? { borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' } : {}}>
              <span className="status-dot" style={isOffline ? { backgroundColor: 'var(--accent-rose)', boxShadow: '0 0 10px var(--accent-rose)', animation: 'pulse-dot 1.5s infinite' } : {}}></span>
              <span>{isOffline ? 'Offline Mode (Local DB)' : 'FastAPI Connected'}</span>
            </div>
          </div>
        </header>

        {/* Dynamic Tab Interfaces */}

        {/* Tab 1: Dashboard Panel */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="dashboard-grid">
              <div className="glass-card stat-card">
                <div className="stat-icon-wrapper blue">
                  <FileSearch size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{statCounts.ocr}</span>
                  <span className="stat-label">Documents Parsed</span>
                </div>
              </div>

              <div className="glass-card stat-card">
                <div className="stat-icon-wrapper purple">
                  <Calculator size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">₹{(statCounts.fines).toLocaleString('en-IN')}</span>
                  <span className="stat-label">Total Penalties</span>
                </div>
              </div>

              <div className="glass-card stat-card">
                <div className="stat-icon-wrapper emerald">
                  <CheckCircle size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{statCounts.compliances}%</span>
                  <span className="stat-label">Accuracy SLA</span>
                </div>
              </div>

              <div className="glass-card stat-card">
                <div className="stat-icon-wrapper amber">
                  <Clock size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">1.4s</span>
                  <span className="stat-label">Response Time</span>
                </div>
              </div>
            </div>

            <div className="analytics-row">
              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>System Usage Over Time</h3>
                <div className="chart-container">
                  <Line data={lineChartData} options={chartOptions} />
                </div>
              </div>
              
              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Interactive Regional Telemetry (GIS)</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Click on regions to inspect telemetry statistics.
                </p>
                <div className="gis-map-canvas">
                  <svg viewBox="0 0 400 300" className="gis-map-india-svg">
                    {/* Rajasthan */}
                    <path 
                      d="M 50,50 L 150,40 L 170,90 L 140,140 L 80,130 L 40,90 Z" 
                      className={`map-region-path ${selectedRegion === 'Rajasthan' ? 'active' : ''}`} 
                      onClick={() => setSelectedRegion('Rajasthan')}
                    />
                    <text x="100" y="90" fill="var(--text-primary)" fontSize="10" fontWeight="700" pointerEvents="none" textAnchor="middle">RAJASTHAN</text>
                    
                    {/* Maharashtra */}
                    <path 
                      d="M 120,150 L 190,140 L 250,180 L 200,240 L 130,220 L 100,180 Z" 
                      className={`map-region-path ${selectedRegion === 'Maharashtra' ? 'active' : ''}`} 
                      onClick={() => setSelectedRegion('Maharashtra')}
                    />
                    <text x="175" y="195" fill="var(--text-primary)" fontSize="10" fontWeight="700" pointerEvents="none" textAnchor="middle">MAHARASHTRA</text>

                    {/* Other */}
                    <path 
                      d="M 180,50 L 280,60 L 310,120 L 220,130 L 180,90 Z" 
                      className={`map-region-path ${selectedRegion === 'Other' ? 'active' : ''}`} 
                      onClick={() => setSelectedRegion('Other')}
                    />
                    <text x="240" y="90" fill="var(--text-muted)" fontSize="9" fontWeight="500" pointerEvents="none" textAnchor="middle">Other States</text>
                  </svg>
                </div>
              </div>
            </div>

            <div className="map-layout-grid" style={{ marginBottom: '2rem' }}>
              <div className="glass-card map-infobox">
                <h3 style={{ fontWeight: 600 }}>Region Details: {selectedRegion}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                  <div className="map-info-stat" style={{ padding: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Compliance</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '0.2rem' }}>
                        {selectedRegion === 'Rajasthan' ? '92.4%' : selectedRegion === 'Maharashtra' ? '88.1%' : '90.5%'}
                      </div>
                    </div>
                  </div>

                  <div className="map-info-stat" style={{ padding: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Citations</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-amber)', marginTop: '0.2rem' }}>
                        {selectedRegion === 'Rajasthan' ? '1,280' : selectedRegion === 'Maharashtra' ? '2,490' : '3,770'}
                      </div>
                    </div>
                  </div>

                  <div className="map-info-stat" style={{ padding: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Primary Violation</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-rose)', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedRegion === 'Rajasthan' ? 'No Helmet' : selectedRegion === 'Maharashtra' ? 'Speeding' : 'Wrong Parking'}
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  className="btn-primary" 
                  style={{ marginTop: '1rem', padding: '0.75rem', width: 'fit-content' }}
                  onClick={() => setSelectedRegion('All')}
                >
                  Clear Filter
                </button>
              </div>

              <div className="glass-card">
                <h3 style={{ marginBottom: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} className="text-purple" style={{ color: 'var(--accent-purple)' }} /> Live Feed Telemetry
                </h3>
                <div className="live-feed-panel">
                  {activities.map((act) => (
                    <div key={act.id} className={`feed-event-card ${act.severity === 'high' ? 'alert-item' : ''}`} style={{ padding: '0.75rem 1rem' }}>
                      <div className="feed-event-header">
                        <span style={{ color: act.type === 'OCR Scan' ? 'var(--accent-blue)' : 'var(--accent-purple)', fontWeight: 700 }}>{act.type}</span>
                        <span>{act.time}</span>
                      </div>
                      <div className="feed-event-desc" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{act.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="analytics-row" style={{ marginBottom: '2rem' }}>
              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={20} className="text-purple" /> Cost Breakdown by Violation Type
                </h3>
                <div className="chart-container" style={{ minHeight: '300px' }}>
                  <Bar data={barChartData} options={chartOptions} />
                </div>
              </div>

              <div className="glass-card">
                <h3 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Recent Parsed Documents</h3>
                {ocrHistory.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</span>
                    <p style={{ fontSize: '0.85rem' }}>No documents parsed yet in this session</p>
                  </div>
                ) : (
                  <div className="live-feed-panel">
                    {ocrHistory.map((hist, idx) => (
                      <div key={idx} className="feed-event-card" style={{ padding: '0.75rem 1rem' }}>
                        <div className="feed-event-header">
                          <span style={{ fontWeight: 700 }}>{hist.vehicle_number}</span>
                          <span>{hist.date}</span>
                        </div>
                        <div className="feed-event-desc" style={{ color: 'var(--accent-purple)', fontSize: '0.85rem', marginTop: '0.2rem' }}>{hist.violation}</div>
                        <div className="feed-event-meta" style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', marginTop: '0.2rem', fontWeight: 600 }}>{hist.fine_amount}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Challan OCR Analyzer */}
        {activeTab === 'challan' && (
          <div className="glass-card">
            <div 
              className={`dropzone-container ${dragActive ? 'drag-active' : ''} ${isOcrProcessing ? 'scanning' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('challan-input').click()}
            >
              {challanPreviewUrl ? (
                <div className="ocr-preview-box">
                  <img src={challanPreviewUrl} className="ocr-preview-img" alt="Challan document" />
                  {isOcrProcessing && <div className="ocr-laser"></div>}
                </div>
              ) : challanFile ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ fontSize: '3rem' }}>📄</div>
                  <div style={{ fontWeight: 700 }}>{challanFile.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>PDF Compliance Document Selected</div>
                  {isOcrProcessing && <div className="ocr-laser"></div>}
                </div>
              ) : (
                <>
                  <UploadCloud className="dropzone-icon" size={48} />
                  <p className="dropzone-title">Drag & Drop Challan File</p>
                  <p className="dropzone-desc">Supports clear images (JPG, PNG) or PDF compliance files</p>
                </>
              )}
              <input 
                id="challan-input" 
                type="file" 
                style={{ display: 'none' }} 
                accept="image/*,.pdf" 
                onChange={handleFileChange}
                disabled={isOcrProcessing}
              />
            </div>

            {/* Offline Queue Display */}
            {ocrQueue.length > 0 && (
              <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-tertiary)', border: '1px dashed var(--accent-amber)', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  <Clock size={16} style={{ color: 'var(--accent-amber)' }} /> Pending Reconnection Queue ({ocrQueue.length} document{ocrQueue.length > 1 ? 's' : ''})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {ocrQueue.map((file, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', color: 'var(--text-primary)' }}>📄 {file.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--accent-amber)', borderRadius: '50%', display: 'inline-block' }}></span> Waiting...
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {ocrError && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', padding: '1.25rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: 'hsl(345, 90%, 55%)' }}>
                <AlertTriangle />
                <div>
                  <p style={{ fontWeight: 600 }}>OCR Processing Failed</p>
                  <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{ocrError}</p>
                </div>
              </div>
            )}

            {/* OCR Processing State */}
            {isOcrProcessing && (
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <div className="typing-indicator" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Connecting to Gemini model for citation parsing and generating human-friendly explanation...</p>
              </div>
            )}

            {/* Parsed Results */}
            {ocrResult && (
              <div className="ocr-results-layout">
                <div>
                  <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <ShieldAlert size={20} style={{ color: 'var(--accent-rose)' }} /> Parsed Infringement Details
                  </h3>
                  <div className="ocr-details-grid">
                    <div className="ocr-detail-item">
                      <span className="label">Vehicle Identification</span>
                      <span className="value">{ocrResult.vehicle_number || "Not Found"}</span>
                    </div>
                    <div className="ocr-detail-item">
                      <span className="label">Offence Violation</span>
                      <span className="value" style={{ color: 'var(--accent-amber)' }}>{ocrResult.violation || "Not Found"}</span>
                    </div>
                    <div className="ocr-detail-item">
                      <span className="label">Calculated Fine</span>
                      <span className="value fine">
                        {ocrResult.fine_amount ? `₹${ocrResult.fine_amount}` : "Not Specified"}
                      </span>
                    </div>
                    <div className="ocr-detail-item">
                      <span className="label">Issuing Authority</span>
                      <span className="value">{ocrResult.authority || "Not Found"}</span>
                    </div>
                    <div className="ocr-detail-item">
                      <span className="label">Date of Offense</span>
                      <span className="value">
                        {ocrResult.date && ocrResult.date !== "Not Found" ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Calendar size={14} /> {ocrResult.date}</span>
                        ) : "Not Found"}
                      </span>
                    </div>
                    <div className="ocr-detail-item">
                      <span className="label">Location</span>
                      <span className="value">
                        {ocrResult.location && ocrResult.location !== "Not Found" ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={14} /> {ocrResult.location}</span>
                        ) : "Not Found"}
                      </span>
                    </div>
                  </div>

                  <div className="cross-actions-wrapper">
                    <button 
                      className="btn-secondary-action" 
                      onClick={() => {
                        setCalcState(ocrResult.authority && ocrResult.authority.toLowerCase().includes('maharashtra') ? 'Maharashtra' : 'Rajasthan');
                        setCalcViolation(ocrResult.violation || '');
                        handleTabChange('calculator');
                      }}
                    >
                      <Calculator size={16} />
                      <span>Verify Penalty Section</span>
                    </button>
                    <button 
                      className="btn-secondary-action"
                      onClick={() => {
                        const q = `What is the legal section and suspension criteria for "${ocrResult.violation}" in ${ocrResult.location || 'India'}?`;
                        setChatInput(q);
                        handleTabChange('chatbot');
                        setTimeout(() => sendChatMessage(q), 600);
                      }}
                    >
                      <MessageSquare size={16} />
                      <span>Consult Legal RAG</span>
                    </button>
                  </div>
                </div>

                <div className="ocr-explanation">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={18} /> Citizen AI Explanation
                  </h3>
                  <div className="ocr-text-box">
                    {ocrResult.explanation}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Compliance Fine Calculator */}
        {activeTab === 'calculator' && (
          <div className="glass-card calculator-container">
            <form onSubmit={handleCalculate}>
              
              {/* State Selection */}
              <div className="form-group">
                <label className="form-label">Select State Jurisdiction</label>
                <select 
                  className="custom-select" 
                  value={calcState}
                  onChange={(e) => setCalcState(e.target.value)}
                >
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Maharashtra">Maharashtra</option>
                </select>
              </div>

              {/* Vehicle Type Selection */}
              <div className="form-group">
                <label className="form-label">Select Vehicle Category</label>
                <div className="vehicle-selector">
                  <div 
                    className={`vehicle-card ${calcVehicle === 'Bike' ? 'active' : ''}`}
                    onClick={() => setCalcVehicle('Bike')}
                  >
                    <span className="vehicle-icon">🏍️</span>
                    <span className="vehicle-name">Bike / Two-Wheeler</span>
                  </div>
                  <div 
                    className={`vehicle-card ${calcVehicle === 'Car' ? 'active' : ''}`}
                    onClick={() => setCalcVehicle('Car')}
                  >
                    <span className="vehicle-icon">🚗</span>
                    <span className="vehicle-name">Car / LMV</span>
                  </div>
                  <div 
                    className={`vehicle-card ${calcVehicle === 'Heavy Vehicle' ? 'active' : ''}`}
                    onClick={() => setCalcVehicle('Heavy Vehicle')}
                  >
                    <span className="vehicle-icon">🚛</span>
                    <span className="vehicle-name">Heavy Vehicle</span>
                  </div>
                </div>
              </div>

              {/* Violation Autocomplete input */}
              <div className="form-group">
                <label className="form-label">Traffic Violation Offence</label>
                <input 
                  type="text" 
                  className="custom-input" 
                  placeholder="e.g., Signal Jumping, No Helmet, Drunk Driving..." 
                  value={calcViolation}
                  onChange={handleViolationChange}
                  onFocus={() => {
                    if (!calcViolation) setSuggestions(VIOLATIONS_DATABASE);
                  }}
                  onBlur={() => {
                    // Close suggestions after small delay to let items register click
                    setTimeout(() => setSuggestions([]), 200);
                  }}
                />
                {suggestions.length > 0 && (
                  <div className="suggestions-box">
                    {suggestions.map((v, i) => (
                      <div 
                        key={i} 
                        className="suggestion-item"
                        onMouseDown={() => selectSuggestion(v)}
                      >
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overspeeding speed slider */}
              {(calcViolation.toLowerCase().includes('speed') || calcViolation.toLowerCase().includes('overspeed')) && (
                <div className="slider-control-group" style={{ marginBottom: '2rem' }}>
                  <div className="slider-header">
                    <span className="form-label" style={{ marginBottom: 0 }}>Vehicle Recorded Speed</span>
                    <span className="slider-val-bubble">{recordedSpeed} km/h</span>
                  </div>
                  <input 
                    type="range" 
                    min="40" 
                    max="180" 
                    value={recordedSpeed}
                    onChange={(e) => setRecordedSpeed(Number(e.target.value))}
                    className="premium-range-slider"
                  />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Excess speed calculated above the speed limit ({calcVehicle === 'Bike' ? '50' : calcVehicle === 'Car' ? '70' : '60'} km/h for {calcVehicle === 'Bike' ? 'Two-Wheelers' : calcVehicle === 'Car' ? 'LMV / Cars' : 'Heavy Vehicles'}) will carry an extra surcharge of ₹120 per km/h.
                  </p>
                </div>
              )}

              {/* Repeat Offence Switch */}
              <div className="form-group">
                <div className="toggle-group">
                  <div className="toggle-info">
                    <span className="toggle-title">Repeat Offence</span>
                    <span className="toggle-desc">Has this violation been committed before within target jurisdiction?</span>
                  </div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={calcRepeat}
                      onChange={(e) => setCalcRepeat(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary"
                disabled={isCalculating || !calcViolation}
              >
                {isCalculating ? "Calculating Rules..." : (
                  <>
                    <Scale size={18} />
                    <span>Calculate Fine</span>
                  </>
                )}
              </button>
            </form>

            {/* Error Message */}
            {calcError && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', padding: '1.25rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: 'hsl(345, 90%, 55%)' }}>
                <AlertTriangle />
                <div>
                  <p style={{ fontWeight: 600 }}>Calculation Failed</p>
                  <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{calcError}</p>
                </div>
              </div>
            )}

            {/* Output result card */}
            {calcResult && (
              <div className="calculation-result" style={calcResult.isOffline ? { borderColor: 'var(--accent-amber)' } : {}}>
                {calcResult.isOffline && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    background: 'rgba(236, 72, 153, 0.1)',
                    color: 'var(--accent-amber)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    marginBottom: '1.25rem',
                    border: '1px solid rgba(236, 72, 153, 0.2)'
                  }}>
                    🛡️ Local Database Verification
                  </div>
                )}
                <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1.5px', color: 'var(--text-secondary)' }}>
                  Computed Fine Amount
                </h3>
                <div className="result-fine-value">
                  ₹{animatedFine}
                </div>

                {calcResult.surcharge > 0 && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                    <div>Base Legal Penalty: <strong>₹{calcResult.fine - calcResult.surcharge}</strong></div>
                    <div>Over-speed Surcharge (+{calcResult.recordedSpeed - calcResult.speedLimit} km/h): <strong style={{ color: 'var(--accent-rose)' }}>+₹{calcResult.surcharge}</strong></div>
                  </div>
                )}
                
                <div className="result-meta-grid">
                  <div className="result-meta-card">
                    <div className="label">Law Section</div>
                    <div className="value">{calcResult.law_section}</div>
                  </div>
                  <div className="result-meta-card">
                    <div className="label">Jurisdiction</div>
                    <div className="value">{calcResult.state}</div>
                  </div>
                  <div className="result-meta-card">
                    <div className="label">License Action</div>
                    <div className={`value ${calcResult.license_suspension !== 'None' ? 'active-suspension' : 'no-suspension'}`}>
                      {calcResult.license_suspension === 'None' ? 'No Suspension' : `Suspended ${calcResult.license_suspension}`}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Tab 4: AI Legal Chatbot */}
        {activeTab === 'chatbot' && (
          <div className="chat-layout">
            <div className="chat-messages-container">
              <div className="chat-header-bar">
                <Sparkles size={18} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ fontWeight: 600 }}>Legal Traffic Assistant (RAG)</span>
              </div>

              <div className="chat-actions-top-bar">
                <button className="btn-chat-action" onClick={handleExportChat}>
                  📥 Export Chat History
                </button>
                <button className="btn-chat-action" onClick={() => setMessages([{ sender: 'assistant', text: 'Hello! I am your AI Traffic Compliance Officer. Ask me anything about traffic rules, laws, or penalties in India.', sources: [] }])}>
                  🗑️ Clear Thread
                </button>
              </div>

              <div className="chat-history">
                {messages.map((m, idx) => (
                  <div key={idx} className={`chat-bubble-wrapper ${m.sender === 'user' ? 'user' : 'assistant'}`}>
                    <div className="chat-bubble">
                      <p>{m.text}</p>
                      
                      {/* Citations Box */}
                      {m.sources && m.sources.length > 0 && (
                        <div className="citations-box">
                          <span className="title">Legal References Cited:</span>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            {m.sources.map((s, sIdx) => (
                              <span 
                                key={sIdx} 
                                className="citation-tag"
                                style={{ cursor: 'pointer' }}
                                onClick={() => sendChatMessage(`What does Section ${s} mean and what are its regulations?`)}
                                title={`Click to ask about Section ${s}`}
                              >
                                <Scale size={10} /> {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isBotTyping && (
                  <div className="chat-bubble-wrapper assistant">
                    <div className="chat-bubble">
                      <div className="typing-indicator">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatBottomRef} />
              </div>

              {isListening && (
                <div className="speech-wave-wrapper" style={{ padding: '0.5rem', background: 'rgba(244, 63, 94, 0.04)', borderTop: '1px solid var(--glass-border)' }}>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'var(--accent-rose)', fontWeight: 600 }}>Listening... Speak now</span>
                </div>
              )}

              <div className="chat-input-bar">
                <button 
                  className={`btn-speech ${isListening ? 'listening' : ''}`}
                  onClick={startVoiceRecognition}
                  title="Voice Search"
                  disabled={isBotTyping}
                  style={{ marginRight: '0.25rem' }}
                >
                  🎤
                </button>
                <input 
                  type="text" 
                  className="chat-input-field" 
                  placeholder="Ask about fine modifications, signal regulations, speed limits, legal sections..." 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendChatMessage();
                  }}
                  disabled={isBotTyping}
                />
                <button 
                  className="btn-send"
                  onClick={() => sendChatMessage()}
                  disabled={isBotTyping || !chatInput.trim()}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>

            {/* Sidebar quick suggestions */}
            <div className="chat-suggestions-sidebar">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={16} /> Sample Enquiries
              </h3>
              {suggestedPrompts.map((p, idx) => (
                <div 
                  key={idx} 
                  className="suggestion-prompt-card"
                  onClick={() => sendChatMessage(p.prompt)}
                >
                  <div className="icon-label">
                    <Sparkles size={12} />
                    <span>{p.title}</span>
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{p.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
