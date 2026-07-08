'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { listCourses } from '@/lib/api';

export default function CourseSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentCourseId = searchParams.get('course');

  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listCourses().then(data => {
      if (mounted) {
        setCourses(data);
        setLoading(false);
        // If no course is selected but we have courses, automatically select the first one
        if (!currentCourseId && data.length > 0) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('course', data[0].id);
          router.replace(`${pathname}?${params.toString()}`);
        }
      }
    }).catch(err => {
      if (mounted) setLoading(false);
      console.error('Failed to load courses for selector', err);
    });
    return () => { mounted = false; };
  }, [currentCourseId, pathname, router, searchParams]);

  if (loading) {
    return <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading courses...</div>;
  }

  if (courses.length === 0) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('course', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Course:</label>
      <select 
        value={currentCourseId || ''} 
        onChange={handleChange}
        style={{
          padding: '0.3rem 0.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        <option value="" disabled>Select a course</option>
        {courses.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
