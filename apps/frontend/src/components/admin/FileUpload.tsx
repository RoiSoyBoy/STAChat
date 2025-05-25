"use client";

import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudArrowUpIcon,
  DocumentIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { db } from "@/lib/firebase"; // Removed app, firebaseAuthService, onAuthStateChanged, User
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

interface FileUploadProps {
  userId: string; // This userId should correspond to the backend's DEV_USER_ID if auth is bypassed
}

export function FileUpload({ userId }: FileUploadProps) {
  const [files, setFiles] = useState<Array<{ name: string; size: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<
    Array<{ id: string; filename: string; url: string }>
  >([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  // Removed currentAuthUser and authLoading states

  useEffect(() => {
    // Fetch documents if userId is provided
    if (userId) {
      const fetchDocs = async () => {
        setLoadingDocs(true);
        try {
          const snap = await getDocs(collection(db, `users/${userId}/uploads`));
          setUploadedDocs(
            snap.docs.map((docData) => ({ id: docData.id, ...docData.data() }) as any)
          );
        } catch (e) {
          console.error("Error fetching documents:", e);
          toast.error("שגיאה בטעינת מסמכים");
        } finally {
          setLoadingDocs(false);
        }
      };
      fetchDocs();
    } else {
      // If no userId, perhaps clear docs or show a message
      setUploadedDocs([]);
      setLoadingDocs(false);
      console.warn("FileUpload: No userId prop provided, cannot fetch documents.");
    }
  }, [userId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      setFiles(
        acceptedFiles.map((file) => ({
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)}MB`,
        }))
      );
      setUploading(true);
      try {
        const file = acceptedFiles[0];
        const formData = new FormData();
        formData.append("file", file);

        let endpoint = "";
        if (file.type === "application/pdf") {
          endpoint = "/api/v1/process-pdf"; // CORRECTED ENDPOINT
        } else if (
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // DOCX
          file.type === "text/plain" // TXT
        ) {
          endpoint = "/api/upload";
        } else {
          // Should not happen due to dropzone accept config, but as a fallback
          toast.error(`סוג קובץ לא נתמך: ${file.type}`);
          setUploading(false);
          return;
        }

        // Auth logic removed as per "no auth system yet"
        // The backend must be set to BYPASS_FIREBASE_AUTH=true and use DEV_USER_ID

        // Ensure userId prop is available if backend operations depend on it (even in bypass mode)
        if (!userId) {
          toast.error("מזהה משתמש חסר. לא ניתן להעלות קובץ.");
          console.error("FileUpload: userId prop is missing, cannot proceed with upload.");
          setUploading(false);
          return;
        }
        
        const headers: HeadersInit = {}; // No Authorization header

        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
          headers: headers, // Sent without Authorization
        });

        if (!res.ok) {
          let errorText = `שגיאת שרת: ${res.status}`;
          try {
            const serverErrorData = await res.json(); // Try to parse error response as JSON
            errorText = serverErrorData.error || serverErrorData.message || errorText;
          } catch (e) {
            // If error response is not JSON, try to get text
            try {
              errorText = await res.text() || errorText;
            } catch (textErr) {
              // Keep default errorText
            }
          }
          console.error("Upload failed, server response not OK:", res.status, errorText);
          toast.error(errorText);
        } else {
          // Response is OK (2xx status)
          let data;
          try {
            const responseText = await res.text(); // Read as text first
            if (!responseText) { // Handle empty response body for 200/204
                console.log("Upload successful with empty response body.");
                toast.success("הקובץ הועלה בהצלחה (אין תוכן בתגובה).");
                 // Refresh document list since backend likely succeeded
                const snap = await getDocs(collection(db, `users/${userId}/uploads`));
                setUploadedDocs(
                  snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any)
                );
                // Potentially return or skip further data processing if response is empty
            } else {
                data = JSON.parse(responseText); // Then parse
                if (data.error) {
                    console.error("Upload responded OK, but application error in JSON:", data.error);
                    toast.error(data.error || "שגיאה מהשרת בעיבוד הקובץ.");
                } else {
                    toast.success(data.message || "הקובץ הועלה ועובד בהצלחה");
                    // Refresh document list
                    const snap = await getDocs(collection(db, `users/${userId}/uploads`));
                    setUploadedDocs(
                        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any)
                    );
                }
            }
          } catch (jsonError) {
            console.error("Upload succeeded (status OK) but failed to parse/process JSON response:", jsonError);
            toast.error("שגיאה בעיבוד התגובה מהשרת.");
            // Consider if a refresh is still appropriate if backend likely succeeded but response was malformed
          }
        }
      } catch (e: any) {
        console.error("Generic upload error catch block:", e);
        toast.error(e.message || "שגיאה כללית בהעלאת הקובץ.");
      } finally {
        setUploading(false);
      }
    },
  });

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/uploads`, id));
      setUploadedDocs((docs) => docs.filter((d) => d.id !== id));
      toast.success("המסמך נמחק");
    } catch (e) {
      toast.error("שגיאה במחיקת מסמך");
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div {...getRootProps()}>
        <motion.div
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragActive
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 hover:border-blue-400 hover:bg-gray-50"
          }`}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm text-gray-600">
            {isDragActive
              ? "שחרר את הקבצים כאן"
              : "גרור קבצים לכאן או לחץ לבחירת קבצים"}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            PDF, DOCX, XLSX, XLS, או TXT עד 10MB
          </p>
        </motion.div>
      </div>
      {uploading && <div className="text-blue-500">מעלה קובץ...</div>}
      <AnimatePresence>
        {files.map((file, index) => (
          <motion.div
            key={`${file.name}-${index}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="font-medium text-gray-700">{file.name}</p>
                  <p className="text-sm text-gray-500">{file.size}</p>
                </div>
                <DocumentIcon className="h-8 w-8 text-gray-400" />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="mt-6">
        <h3 className="font-bold mb-2 text-right">מסמכים שהועלו</h3>
        {loadingDocs ? (
          <div>טוען...</div>
        ) : uploadedDocs.length === 0 ? (
          <div className="text-gray-400">לא הועלו מסמכים</div>
        ) : (
          <ul className="space-y-2">
            {uploadedDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-right text-blue-600 hover:underline"
                >
                  {doc.filename}
                </a>
                <button
                  className="btn btn-xs btn-error"
                  onClick={() => handleRemove(doc.id)}
                >
                  מחק
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
