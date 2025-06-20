// Content of apps/frontend/src/app/admin/page.tsx will be moved here
// and this file will be dynamically imported by a new page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
// import { useTranslation } from 'react-i18next'; // Import useTranslation
import Image from "next/image"; // Import next/image
import { motion } from "framer-motion";
import { Card } from "@/components/admin/Card";
import DynamicFileUpload from "@/components/admin/DynamicFileUpload";
import { LinkIcon, DocumentPlusIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/lib/ThemeContext";
import { debounce } from "lodash";
import { toast } from "react-toastify";
import { useDropzone } from "react-dropzone";
import { validateFileUpload, validateUrl, validateColorContrast } from "shared";
import { processTrainingData } from "../../lib/trainingData";
import { useSettings } from "@/lib/SettingsContext";

interface AdminDashboardProps {
  initialUrls?: string[];
  initialColor?: string;
  initialLogo?: string;
}

export default function AdminDashboardContent({
  // Renamed from AdminDashboard
  initialUrls = [],
  initialColor = "#0066cc",
  initialLogo = "",
}: AdminDashboardProps) {
  // const { t } = useTranslation('common'); // Initialize useTranslation - REMOVED
  const userId = "admin"; // TODO: Replace with actual user ID from auth
  const { primaryColor, setPrimaryColor } = useTheme();
  const { updateSettings } = useSettings();
  const [color, setColor] = useState(initialColor);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(initialLogo);
  const [greeting, setGreeting] = useState(
    "שלום! איך אני יכול/ה לעזור לך היום?"
  );
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [newUrl, setNewUrl] = useState("");
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [isIngestingGoogleSheet, setIsIngestingGoogleSheet] = useState(false);
  // const [files, setFiles] = useState<Array<{ name: string; size: string }>>([]); // This state seems unused now
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  // const [isUploading, setIsUploading] = useState(false); // This state seems unused now (related to logo dropzone)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/settings"); // Added /v1
        if (!res.ok) {
          throw new Error(
            `Failed to fetch settings: ${res.status} ${res.statusText}`
          );
        }
        const data = await res.json();
        if (!data || typeof data !== "object") {
          throw new Error("Invalid settings data received");
        }
        setColor(data.primaryColor || initialColor);
        setGreeting(data.greeting || "שלום! איך אני יכול/ה לעזור לך היום?");
        setLogoUrl(data.logoUrl || "");
        setPrimaryColor(data.primaryColor || initialColor);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load settings"
        );
        toast.error("שגיאה בטעינת ההגדרות");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, [setPrimaryColor, initialColor]);

  const debouncedSetColorHandler = useMemo(
    () =>
      debounce((newColor: string) => {
        if (!validateColorContrast(newColor)) {
          toast.warning(
            "צבע זה עלול להקשות על קריאת הטקסט. אנא בחר צבע עם ניגודיות טובה יותר."
          );
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
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/v1/upload", { // Added /v1
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success && data.url) {
          setLogoUrl(data.url);
          updateSettings({ logoUrl: data.url });
        } else {
          toast.error("שגיאה בהעלאת הלוגו");
        }
      } catch (error) {
        toast.error("שגיאה בהעלאת הלוגו");
      }
    }
  };

  const handleAddUrl = async () => {
    if (!validateUrl(newUrl)) {
      toast.error("כתובת URL לא תקינה");
      return;
    }
    if (urls.includes(newUrl)) {
      toast.error("כתובת URL זו כבר קיימת");
      return;
    }
    try {
      const requestedUrl = newUrl;
      const response = await fetch("/api/v1/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [newUrl] }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Failed to add URL: ${response.statusText}`
        );
      }
      const resultData = await response.json();
      if (
        resultData.results &&
        resultData.results[0] &&
        resultData.results[0].status !== "error"
      ) {
        setUrls([...urls, requestedUrl]);
        setNewUrl("");
        toast.success(`כתובת URL נוספה בהצלחה: ${requestedUrl}`);
      } else if (
        resultData.results &&
        resultData.results[0] &&
        resultData.results[0].error
      ) {
        throw new Error(resultData.results[0].error);
      }
    } catch (error) {
      toast.error(
        `שגיאה בהוספת כתובת URL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const handleIngestGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      toast.error("אנא הזן כתובת URL של Google Sheet");
      return;
    }
    if (!googleSheetUrl.startsWith("https://docs.google.com/spreadsheets/")) {
      toast.error("כתובת URL לא תקינה של Google Sheet");
      return;
    }
    setIsIngestingGoogleSheet(true);
    try {
      const response = await fetch("/api/v1/ingest-google-sheet", { // Added /v1
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: googleSheetUrl }),
      });
      const resultData = await response.json();
      if (!response.ok) {
        throw new Error(
          resultData.error || // Use error from JSON if available
            `Failed to ingest Google Sheet: ${response.status} ${response.statusText}` // Include status
        );
      }
      toast.success(
        `Google Sheet "${resultData.sheetTitle || googleSheetUrl}" עובד בהצלחה.`
      );
      setGoogleSheetUrl("");
    } catch (error) {
      toast.error(
        `שגיאה בעיבוד Google Sheet: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsIngestingGoogleSheet(false);
    }
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    setUrls(urls.filter((url) => url !== urlToRemove));
  };

  // This onDrop is for the logo upload, it seems.
  // The FileUpload component has its own dropzone.
  // Let's remove the unused isUploading and files state if they are truly unused.
  // The `isUploading` state is used by the logo's dropzone.
  const [isLogoUploading, setIsLogoUploading] = useState(false); // Renamed for clarity
  const onDropLogo = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      const validation = validateFileUpload(file); // This uses the shared one for images
      if (!validation.isValid) {
        toast.error(validation.error);
        return;
      }
      setIsLogoUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/v1/upload", { // Added /v1
          // This API endpoint is generic
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
            throw new Error(errorData.error || `Upload failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // Assuming the generic /api/upload returns a URL for the uploaded file
        if (data.success && data.url) { // Check for success flag
          setLogoUrl(data.url); // Update logoUrl state
          updateSettings({ logoUrl: data.url }); // Persist
          toast.success("הלוגו הועלה בהצלחה");
        } else {
          toast.error(data.error || "שגיאה בהעלאת הלוגו (שרת)"); // Clarify server error
        }
      } catch (error) {
        toast.error("שגיאה בהעלאת הקובץ");
      } finally {
        setIsLogoUploading(false);
      }
    },
    [updateSettings]
  ); // Added updateSettings to dependency array

  const {
    getRootProps: getLogoRootProps,
    getInputProps: getLogoInputProps,
    isDragActive: isLogoDragActive,
  } = useDropzone({
    onDrop: onDropLogo,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
  });

  const handleTrainingDataUpload = async (uploadedFiles: File[]) => {
    // Parameter name changed for clarity
    try {
      for (const file of uploadedFiles) {
        const data = await processTrainingData(file);
        console.log("Processed training data:", data);
        // TODO: Send 'data' (QnAPair[]) to the backend
      }
      toast.success("קבצי האימון עובדו בהצלחה");
    } catch (error) {
      toast.error(
        `שגיאה בעיבוד קבצי האימון: ${error instanceof Error ? error.message : "שגיאה לא ידועה"}`
      );
    }
  };

  const totalPages = Math.ceil(urls.length / itemsPerPage);
  const paginatedUrls = urls.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSave = async () => {
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/v1/settings", { // Added /v1
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryColor: color, greeting, logoUrl }),
      });
      if (res.ok) {
        setPrimaryColor(color);
        setSaveStatus("success");
        toast.success("ההגדרות נשמרו בהצלחה");
      } else {
        const errorData = await res.json().catch(() => ({})); // Try to parse error JSON
        setSaveStatus("error");
        toast.error(errorData.error || "שגיאה בשמירת ההגדרות");
      }
    } catch (err) {
      setSaveStatus("error");
      toast.error(`שגיאה בשמירת ההגדרות: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  if (error) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
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
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">טוען הגדרות...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-50 py-8 px-4 md:px-0 flex flex-col items-center"
      dir="rtl"
    >
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h2 className="text-3xl font-bold text-gray-900">
            {"לוח בקרה למנהל"}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card title={"הגדרות כלליות"}>
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="greeting"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {"תווית הודעת ברכה"}
                </label>
                <input
                  type="text"
                  id="greeting"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                />
              </div>
              <div>
                <label
                  htmlFor="color"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {"צבע ראשי"}
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {"לוגו"}
                </label>
                <div
                  {...getLogoRootProps()}
                  className={`mt-1 flex items-center gap-4 ${isLogoDragActive ? "outline-dashed outline-2 outline-offset-2 outline-blue-500" : ""}`}
                >
                  <input {...getLogoInputProps()} />
                  {logoUrl && (
                    <Image
                      src={logoUrl}
                      alt="Logo"
                      width={56} // h-14 w-14 => 3.5rem * 16px/rem = 56px
                      height={56}
                      className="rounded-full object-cover border border-gray-200 shadow"
                    />
                  )}
                  <span className="relative cursor-pointer rounded-md bg-white font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500 px-3 py-2 border border-gray-300 shadow-sm">
                    {isLogoUploading
                      ? "מעלה..."
                      : isLogoDragActive
                        ? "גרור או לחץ כדי להעלות לוגו"
                        : "העלה לוגו"}
                  </span>
                </div>
              </div>
              <div>
                <button
                  onClick={handleSave}
                  disabled={loading || saveStatus === "success"}
                  className="w-full inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition"
                >
                  {loading
                    ? "מעלה..."
                    : saveStatus === "success"
                      ? "שמור שינויים" + "!"
                      : "שמור שינויים"}
                </button>
              </div>
            </div>
          </Card>
          <Card title={"כרטיס נתוני אימון"}>
            <DynamicFileUpload userId={userId} />
          </Card>
        </div>
        <Card title={"כרטיס גוגל שיטס"}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              הדבק את הקישור ל-Google Sheet שברצונך להשתמש בו לאימון הבוט. ודא
              שהגיליון משותף כראוי.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={googleSheetUrl}
                onChange={(e) => setGoogleSheetUrl(e.target.value)}
                placeholder={"הכנס כתובת גיליון גוגל"}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                disabled={isIngestingGoogleSheet}
                aria-label={"הכנס כתובת גיליון גוגל"}
              />
              <button
                onClick={handleIngestGoogleSheet}
                disabled={isIngestingGoogleSheet || !googleSheetUrl.trim()}
                className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50"
                aria-label={
                  isIngestingGoogleSheet ? "מעבד גיליון..." : "הוסף גיליון"
                }
              >
                <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
                {isIngestingGoogleSheet ? "מעבד גיליון..." : "הוסף גיליון"}
              </button>
            </div>
            {isIngestingGoogleSheet && (
              <div className="text-sm text-green-600">
                {"מעבד גיליון..."}, אנא המתן...
              </div>
            )}
          </div>
        </Card>
        <Card title={"כרטיס רשימת כתובות URL"}>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={"הוסף כתובת URL חדשה"}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              />
              <button
                onClick={handleAddUrl}
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition"
              >
                {"הוסף"}
              </button>
            </div>
            <div className="space-y-2">
              {paginatedUrls.map((url) => (
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
                    aria-label={`מחק כתובת URL ${url}`}
                  >
                    {"מחק"}
                  </button>
                </motion.div>
              ))}
            </div>
            {totalPages > 1 && (
              <div
                className="flex justify-center gap-2 mt-2"
                role="navigation"
                aria-label="ניווט עמודים לרשימת כתובות URL"
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-3 py-1 rounded ${currentPage === i + 1 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                    aria-label={`עבור לעמוד ${i + 1}`}
                    aria-current={currentPage === i + 1 ? "page" : undefined}
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
