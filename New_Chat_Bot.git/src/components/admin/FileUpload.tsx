'use client';

import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
<<<<<<< HEAD
import { toast } from 'react-toastify';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

interface FileUploadProps {
  userId: string;
}

export function FileUpload({ userId }: FileUploadProps) {
  const [files, setFiles] = useState<Array<{ name: string; size: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ id: string; filename: string; url: string }>>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      setLoadingDocs(true);
      try {
        const snap = await getDocs(collection(db, `users/${userId}/uploads`));
        setUploadedDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      } catch (e) {
        toast.error('שגיאה בטעינת מסמכים');
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [userId]);
=======

interface FileUploadProps {
  onFilesAdded: (files: Array<{ name: string; size: string }>) => void;
  onFileRemove: (index: number) => void;
  files: Array<{ name: string; size: string }>;
}

export function FileUpload({ onFilesAdded, onFileRemove, files }: FileUploadProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
<<<<<<< HEAD
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      setFiles(acceptedFiles.map(file => ({ name: file.name, size: `${(file.size / (1024 * 1024)).toFixed(1)}MB` })));
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', acceptedFiles[0]);
        const res = await fetch('/api/process-pdf', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          toast.error(data.error || 'שגיאה בהעלאת הקובץ');
        } else {
          toast.success('הקובץ הועלה ועובד בהצלחה');
          // Refresh document list
          const snap = await getDocs(collection(db, `users/${userId}/uploads`));
          setUploadedDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
        }
      } catch (e) {
        toast.error('שגיאה בהעלאת הקובץ');
      } finally {
        setUploading(false);
      }
    }
  });

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/uploads`, id));
      setUploadedDocs(docs => docs.filter(d => d.id !== id));
      toast.success('המסמך נמחק');
    } catch (e) {
      toast.error('שגיאה במחיקת מסמך');
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
=======
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map(file => ({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)}MB`
      }));
      onFilesAdded(newFiles);
    }
  });

  // During SSR or before hydration, render a simplified version
  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm text-gray-600">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
      <div {...getRootProps()}>
        <motion.div
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
          }`}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm text-gray-600">
            {isDragActive ? 'שחרר את הקבצים כאן' : 'גרור קבצים לכאן או לחץ לבחירת קבצים'}
          </p>
          <p className="mt-2 text-xs text-gray-500">PDF, DOCX, או TXT עד 10MB</p>
        </motion.div>
      </div>
<<<<<<< HEAD
      {uploading && <div className="text-blue-500">מעלה קובץ...</div>}
      <AnimatePresence>
        {files.map((file, index) => (
=======

      <AnimatePresence>
        {mounted && files.map((file, index) => (
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
          <motion.div
            key={`${file.name}-${index}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
<<<<<<< HEAD
=======
              <button
                onClick={() => onFileRemove(index)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-red-500"
                type="button"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
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
<<<<<<< HEAD
      <div className="mt-6">
        <h3 className="font-bold mb-2 text-right">מסמכים שהועלו</h3>
        {loadingDocs ? (
          <div>טוען...</div>
        ) : uploadedDocs.length === 0 ? (
          <div className="text-gray-400">לא הועלו מסמכים</div>
        ) : (
          <ul className="space-y-2">
            {uploadedDocs.map(doc => (
              <li key={doc.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="truncate text-right text-blue-600 hover:underline">{doc.filename}</a>
                <button className="btn btn-xs btn-error" onClick={() => handleRemove(doc.id)}>מחק</button>
              </li>
            ))}
          </ul>
        )}
      </div>
=======
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
    </div>
  );
} 