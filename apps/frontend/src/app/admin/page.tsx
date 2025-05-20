'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/admin/Card';
import { FileUpload } from '@/components/admin/FileUpload';
import { LinkIcon, DocumentPlusIcon } from '@heroicons/react/24/outline'; // Added DocumentPlusIcon
import { useTheme } from '@/lib/ThemeContext';
import { debounce } from 'lodash';
import { toast } from 'react-toastify';
import { useDropzone } from 'react-dropzone';
import { validateFileUpload, validateUrl, validateColorContrast } from '@/lib/validation';
import { processTrainingData } from '@/lib/trainingData';
import { useSettings } from '@/lib/SettingsContext';

interface AdminDashboardProps {
  initialUrls?: string[];
  initialColor?: string;
  initialLogo?: string;
}

export default function AdminDashboard({
  initialUrls = [],
  initialColor = '#0066cc',
  initialLogo = '',
}: AdminDashboardProps) {
  // TODO: Replace with actual user ID from auth
  const userId = 'admin';
  const { primaryColor, setPrimaryColor } = useTheme();
  const { updateSettings } = useSettings();
  const [color, setColor] = useState(initialColor);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(initialLogo);
  const [greeting, setGreeting] = useState('שלום! איך אני יכול/ה לעזור לך היום?');
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [newUrl, setNewUrl] = useState('');
  const [googleSheetUrl, setGoogleSheetUrl] = useState(''); // State for Google Sheet URL
  const [isIngestingGoogleSheet, setIsIngestingGoogleSheet] = useState(false); // Loading state for GSheet ingestion
  const [files, setFiles] = useState<Array<{ name: string; size: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      try {
        console.log('Fetching settings...');
        const res = await fetch('/api/settings');
        if (!res.ok) {
          throw new Error(`Failed to fetch settings: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        console.log('Settings received:', data);
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid settings data received');
        }
        setColor(data.primaryColor || initialColor);
        setGreeting(data.greeting || 'שלום! איך אני יכול/ה לעזור לך היום?');
        setLogoUrl(data.logoUrl || '');
        setPrimaryColor(data.primaryColor || initialColor);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load settings');
        toast.error('שגיאה בטעינת ההגדרות');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, [setPrimaryColor, initialColor]);

  // Debounced color change handler
  const debouncedSetColorHandler = useMemo(
    () => debounce((newColor: string) => {
      if (!validateColorContrast(newColor)) {
        toast.warning('צבע זה עלול להקשות על קריאת הטקסט. אנא בחר צבע עם ניגודיות טובה יותר.');
      }
      setColor(newColor);
      updateSettings({ primaryColor: newColor });
    }, 300),
    [updateSettings, setColor]
  );

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSetColorHandler(e.target.value);
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogo(file);
      // Upload logo to /api/upload
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success && data.url) {
          setLogoUrl(data.url);
          updateSettings({ logoUrl: data.url });
        } else {
          toast.error('שגיאה בהעלאת הלוגו');
        }
      } catch (error) {
        toast.error('שגיאה בהעלאת הלוגו');
      }
    }
  };

  const handleAddUrl = async () => {
    if (!validateUrl(newUrl)) {
      toast.error('כתובת URL לא תקינה');
      return;
    }

    if (urls.includes(newUrl)) {
      toast.error('כתובת URL זו כבר קיימת');
      return;
    }

    // Send the URL to the backend for processing
    try {
      const requestedUrl = newUrl; // URL being sent
      const timestamp = new Date().toISOString();
      console.log(`[CLIENT_FETCH_WRAPPER] Requesting URL: ${requestedUrl} at ${timestamp}`);

      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add Authorization header if auth is re-enabled
          // 'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ urls: [newUrl] }), // Send as an array
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to add URL: ${response.statusText}`);
      }

      const resultData = await response.json();
      // console.log('URL processing result:', resultData); // Original log

      const contentPreview = resultData.results && resultData.results[0] && typeof resultData.results[0].status === 'string' 
        ? `Status: ${resultData.results[0].status}, Chunks: ${resultData.results[0].chunkCount}` 
        : JSON.stringify(resultData).substring(0, 200) + '...';
      
      console.log(`[CLIENT_FETCH_WRAPPER] Response for ${requestedUrl}: ${contentPreview}`);
      
      if (resultData.results && resultData.results[0] && resultData.results[0].status !== 'error') {
        setUrls([...urls, requestedUrl]);
        setNewUrl('');
        toast.success(`כתובת URL נוספה בהצלחה: ${requestedUrl}`);
      } else if (resultData.results && resultData.results[0] && resultData.results[0].error) {
        throw new Error(resultData.results[0].error);
      }

    } catch (error) {
      console.error(`[CLIENT_FETCH_WRAPPER] Error for ${newUrl}:`, error); // Log newUrl as requestedUrl might be out of scope
      toast.error(`שגיאה בהוספת כתובת URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleIngestGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      toast.error('אנא הזן כתובת URL של Google Sheet');
      return;
    }
    // Basic URL validation (can be improved)
    if (!googleSheetUrl.startsWith('https://docs.google.com/spreadsheets/')) {
      toast.error('כתובת URL לא תקינה של Google Sheet');
      return;
    }

    setIsIngestingGoogleSheet(true);
    try {
      const response = await fetch('/api/ingest-google-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sheetUrl: googleSheetUrl }),
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || `Failed to ingest Google Sheet: ${response.statusText}`);
      }
      
      toast.success(`Google Sheet "${resultData.sheetTitle || googleSheetUrl}" עובד בהצלחה.`);
      setGoogleSheetUrl(''); // Clear input on success
    } catch (error) {
      console.error('Error ingesting Google Sheet:', error);
      toast.error(`שגיאה בעיבוד Google Sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsIngestingGoogleSheet(false);
    }
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    // TODO: Add backend call to remove/archive the URL data if needed
    setUrls(urls.filter(url => url !== urlToRemove));
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const validation = validateFileUpload(file);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setLogo(data.url);
      toast.success('הלוגו הועלה בהצלחה');
    } catch (error) {
      toast.error('שגיאה בהעלאת הקובץ');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
  });

  const handleTrainingDataUpload = async (files: File[]) => {
    try {
      for (const file of files) {
        const data = await processTrainingData(file);
        // Here you would typically send this to your backend
        console.log('Processed training data:', data);
      }
      toast.success('קבצי האימון עובדו בהצלחה');
    } catch (error) {
      toast.error('שגיאה בעיבוד קבצי האימון');
    }
  };

  // Pagination
  const totalPages = Math.ceil(urls.length / itemsPerPage);
  const paginatedUrls = urls.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSave = async () => {
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryColor: color, greeting, logoUrl }),
      });
      if (res.ok) {
        setPrimaryColor(color);
        setSaveStatus('success');
        toast.success('ההגדרות נשמרו בהצלחה');
      } else {
        setSaveStatus('error');
        toast.error('שגיאה בשמירת ההגדרות');
      }
    } catch (err) {
      setSaveStatus('error');
      toast.error('שגיאה בשמירת ההגדרות');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="max-w-lg w-full p-6 rounded-lg bg-red-50 text-red-800 shadow">
          <h2 className="text-lg font-semibold mb-2">שגיאה בטעינת העמוד</h2>
          <p className="mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-red-100 px-4 py-2 hover:bg-red-200 transition"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">טוען הגדרות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 md:px-0 flex flex-col items-center" dir="rtl">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h2 className="text-3xl font-bold text-gray-900">הגדרות צ׳אט בוט</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card title="הגדרות כלליות">
            <div className="space-y-6">
              <div>
                <label htmlFor="greeting" className="block text-sm font-medium text-gray-700 mb-1">הודעת פתיחה</label>
                <input
                  type="text"
                  id="greeting"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                />
              </div>
              <div>
                <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">צבע ראשי</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="color"
                    value={color}
                    onChange={handleColorChange}
                    className="h-8 w-8 rounded-md border border-gray-300"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => debouncedSetColorHandler(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">לוגו</label>
                <div className="flex items-center gap-4">
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-14 w-14 rounded-full object-cover border border-gray-200 shadow"
                    />
                  )}
                  <label className="relative cursor-pointer rounded-md bg-white font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500 px-3 py-2 border border-blue-200 shadow-sm">
                    <span>העלה לוגו</span>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={handleLogoChange}
                      accept="image/jpeg,image/png"
                    />
                  </label>
                </div>
              </div>
              <div>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition"
                >
                  {loading ? 'שומר...' : 'שמור שינויים'}
                </button>
              </div>
            </div>
          </Card>
          <Card title="נתוני אימון">
            {/* FileUpload manages its own state and needs userId */}
            <FileUpload userId={userId} />
          </Card>
        </div>
        
        {/* Google Sheets Ingestion Card */}
        <Card title="הוספת נתונים מ-Google Sheets">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              הדבק את הקישור ל-Google Sheet שברצונך להשתמש בו לאימון הבוט. ודא שהגיליון משותף כראוי (לפחות 'Viewer' לכל מי שיש לו את הקישור, או לחשבון השירות אם מוגדר).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={googleSheetUrl}
                onChange={(e) => setGoogleSheetUrl(e.target.value)}
                placeholder="הדבק קישור ל-Google Sheet"
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                disabled={isIngestingGoogleSheet}
              />
              <button
                onClick={handleIngestGoogleSheet}
                disabled={isIngestingGoogleSheet || !googleSheetUrl.trim()}
                className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50"
              >
                <DocumentPlusIcon className="h-5 w-5" />
                {isIngestingGoogleSheet ? 'מעבד...' : 'הוסף גיליון'}
              </button>
            </div>
            {isIngestingGoogleSheet && (
              <div className="text-sm text-green-600">מעבד את הגיליון, אנא המתן...</div>
            )}
          </div>
        </Card>

        <Card title="רשימת כתובות URL">
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="הוסף כתובת URL חדשה"
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              />
              <button
                onClick={handleAddUrl}
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition"
              >
                הוסף
              </button>
            </div>
            <div className="space-y-2">
              {paginatedUrls.map((url, index) => (
                <motion.div
                  key={url}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3 bg-white shadow-sm"
                >
                  <span className="text-sm text-gray-600 break-all">{url}</span>
                  <button
                    onClick={() => handleRemoveUrl(url)}
                    className="text-red-500 hover:text-red-700 px-2 py-1 rounded transition"
                  >
                    מחק
                  </button>
                </motion.div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-2">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-3 py-1 rounded ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
