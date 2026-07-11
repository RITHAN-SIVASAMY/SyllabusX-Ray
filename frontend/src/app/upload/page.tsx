/**
 * Upload Page — PDF Ingestion Interface
 * ========================================
 * Drag-and-drop zone for uploading syllabus and PYQ files.
 * Features real-time processing status tracking.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { uploadDocument, getProcessingStatus } from '@/lib/api';
import type { FileType } from '@/types';
import UserProfile from '@/components/UserProfile';

export default function UploadPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Form state
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [university, setUniversity] = useState('');
  const [fileType, setFileType] = useState<FileType>('pyq');
  const [examYear, setExamYear] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/');
  }, [authLoading, isAuthenticated, router]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleFilesSelect = useCallback((files: FileList | File[]) => {
    const validFiles: File[] = [];
    const maxFiles = 10;
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
    let errorMessage = '';

    const newFiles = Array.from(files);
    
    if (selectedFiles.length + newFiles.length > maxFiles) {
      setError(`You can only upload up to ${maxFiles} files at once.`);
      return;
    }

    for (const file of newFiles) {
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        errorMessage = 'Only PDF, Word, and PowerPoint files are accepted.';
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        errorMessage = `File ${file.name} is too large (max 20MB).`;
        continue;
      }
      validFiles.push(file);
    }
    
    if (errorMessage && validFiles.length === 0) {
      setError(errorMessage);
    } else {
      if (errorMessage) setError(errorMessage); // Show warning but still add valid ones
      else setError('');
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }, [selectedFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  }, [handleFilesSelect]);

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !courseName.trim()) {
      setError('Please select at least one file and enter a course name');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`Uploading file ${i + 1} of ${selectedFiles.length}: ${file.name}...`);
      
      try {
        const result = await uploadDocument(
          file,
          courseName.trim(),
          fileType,
          courseCode || undefined,
          university || undefined,
          examYear ? parseInt(examYear) : undefined
        );

        setUploadProgress(`Processing file ${i + 1} of ${selectedFiles.length} with Docling...`);
        
        // Poll for status synchronously before moving to next file
        await new Promise<void>((resolve, reject) => {
          const pollInterval = setInterval(async () => {
            try {
              const status = await getProcessingStatus(result.document_id);
              if (status.processing_status === 'completed') {
                clearInterval(pollInterval);
                successCount++;
                resolve();
              } else if (status.processing_status === 'failed') {
                clearInterval(pollInterval);
                failCount++;
                reject(new Error(`Failed to process ${file.name}`));
              } else {
                setUploadProgress(`Processing file ${i + 1} of ${selectedFiles.length}: ${status.processing_status}...`);
              }
            } catch (err) {
              clearInterval(pollInterval);
              failCount++;
              reject(err);
            }
          }, 3000);
          
          setTimeout(() => {
            clearInterval(pollInterval);
            failCount++;
            reject(new Error(`Timeout processing ${file.name}`));
          }, 300000); // 5 minutes timeout per file
        }).catch((err) => {
           console.error(err);
           // Continue to next file even if this one fails
        });
      } catch (err) {
         console.error(`Failed to upload ${file.name}:`, err);
         failCount++;
      }
    }
    
    setUploading(false);
    setUploadProgress('');
    if (successCount > 0 && failCount === 0) {
      setSuccess(`✅ Successfully processed all ${successCount} files!`);
      setSelectedFiles([]);
    } else if (successCount > 0 && failCount > 0) {
      setSuccess(`✅ Processed ${successCount} files, but ${failCount} failed. Check dashboard for details.`);
      setSelectedFiles([]);
    } else {
      setError('All uploads failed. Please try again.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md) var(--space-2xl)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Upload Documents</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <UserProfile />
        </div>
      </header>

      <main style={{ maxWidth: '700px', margin: '0 auto', padding: 'var(--space-2xl)' }}>
        {/* Form */}
        <div className="glass-card" style={{ padding: 'var(--space-xl)' }}>
          {/* Course Details */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
              Course Details
            </h2>
            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Course Name *
                </label>
                <input className="input-field" value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="e.g., Data Structures and Algorithms" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Course Code</label>
                  <input className="input-field" value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="e.g., CS402" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>University</label>
                  <input className="input-field" value={university} onChange={e => setUniversity(e.target.value)} placeholder="e.g., VIT" />
                </div>
              </div>
            </div>
          </div>

          {/* File Type */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Document Type</h2>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {[
                { key: 'pyq' as FileType, label: '📝 Past Year Paper (PYQ)', desc: 'Exam question papers' },
                { key: 'syllabus' as FileType, label: '📋 Syllabus', desc: 'Course module outline' },
              ].map(t => (
                <button
                  key={t.key}
                  className={`mode-btn ${fileType === t.key ? 'active' : ''}`}
                  onClick={() => setFileType(t.key)}
                  style={{ flex: 1, textAlign: 'left', padding: 'var(--space-md)' }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{t.desc}</div>
                </button>
              ))}
            </div>
            {fileType === 'pyq' && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Exam Year</label>
                <input className="input-field" type="number" value={examYear} onChange={e => setExamYear(e.target.value)} placeholder="e.g., 2023" min={2000} max={2030} style={{ maxWidth: '150px' }} />
              </div>
            )}
          </div>

          {/* Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-3xl)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all var(--transition-normal)',
              background: dragActive ? 'rgba(100, 180, 255, 0.05)' : 'transparent',
              marginBottom: 'var(--space-xl)',
            }}
          >
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={e => e.target.files && handleFilesSelect(e.target.files)} style={{ display: 'none' }} />
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>
              {selectedFiles.length > 0 ? '📚' : '📄'}
            </div>
            <p style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
              {selectedFiles.length > 0 ? `${selectedFiles.length} files selected` : 'Drop your documents here or click to browse'}
            </p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
              Maximum file size: 20MB per file
            </p>
            {selectedFiles.length > 0 && (
                <div style={{ marginTop: 'var(--space-md)', textAlign: 'left', background: 'var(--bg-primary)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)' }}>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.85rem' }}>
                        {selectedFiles.map((f, i) => (
                            <li key={i} style={{ color: 'var(--text-secondary)' }}>
                                {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                            </li>
                        ))}
                    </ul>
                    <button 
                       type="button" 
                       onClick={(e) => { e.stopPropagation(); setSelectedFiles([]); }}
                       style={{ marginTop: 'var(--space-sm)', background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                    >
                       Clear Selection
                    </button>
                </div>
            )}
          </div>

          {/* Status Messages */}
          {error && (
            <div style={{ padding: 'var(--space-md)', background: 'hsla(0, 60%, 55%, 0.1)', border: '1px solid var(--accent-danger)', borderRadius: 'var(--radius-md)', color: 'var(--accent-danger)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: 'var(--space-md)', background: 'hsla(160, 60%, 50%, 0.1)', border: '1px solid var(--accent-success)', borderRadius: 'var(--radius-md)', color: 'var(--accent-success)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
              {success}
            </div>
          )}
          {uploadProgress && (
            <div className="animate-subtle-pulse" style={{ padding: 'var(--space-md)', background: 'hsla(200, 80%, 60%, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-md)', color: 'var(--accent-primary)', marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
              ⏳ {uploadProgress}
            </div>
          )}

          {/* Upload Button */}
          <button className="btn-primary" onClick={handleUpload} disabled={selectedFiles.length === 0 || !courseName.trim() || uploading} style={{ width: '100%', padding: 'var(--space-md)', fontSize: '1rem' }}>
            {uploading ? '⏳ Processing...' : '🚀 Upload & Process'}
          </button>
        </div>
      </main>
    </div>
  );
}
