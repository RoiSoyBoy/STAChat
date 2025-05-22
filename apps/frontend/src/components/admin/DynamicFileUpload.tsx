'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';

// Define a loading component
const FileUploadLoading = () => (
  <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200">
    <p className="text-gray-500">Loading File Uploader...</p>
  </div>
);

// Dynamically import the original FileUpload component
const OriginalFileUpload = dynamic(() => 
  import('./FileUpload').then(mod => mod.FileUpload), 
  { 
    ssr: false, // Disable SSR for this component if it relies on browser APIs
    loading: () => <FileUploadLoading />,
  }
);

// Re-export with the same props
// First, get the props type from the original component
// We need to ensure FileUpload is exported from './FileUpload.tsx'
// For now, let's assume FileUploadProps is correctly defined and exported or inferrable.
// If FileUploadProps is not exported from the original file, this might need adjustment.
// We'll assume it's: export function FileUpload({ userId }: FileUploadProps)
// And FileUploadProps is: interface FileUploadProps { userId: string; }

type FileUploadProps = ComponentProps<typeof OriginalFileUpload>;

export const DynamicFileUpload = (props: FileUploadProps) => {
  return <OriginalFileUpload {...props} />;
};

export default DynamicFileUpload;
