'use client';

import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
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

      <AnimatePresence>
        {mounted && files.map((file, index) => (
          <motion.div
            key={`${file.name}-${index}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <button
                onClick={() => onFileRemove(index)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-red-500"
                type="button"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
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
    </div>
  );
} 