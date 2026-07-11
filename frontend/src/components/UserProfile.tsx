'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserProfile() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url;
  const fullName = user.user_metadata?.full_name || 'User';
  const email = user.email;

  return (
    <div className="relative" ref={menuRef} style={{ position: 'relative' }}>
      {/* Avatar Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid var(--border-subtle)',
          cursor: 'pointer',
          padding: 0,
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}
        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
        onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {fullName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 12px)',
              right: 0,
              width: '280px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            {/* Header info */}
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {fullName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fullName}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {email}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: 'var(--space-sm)' }}>
              <button 
                onClick={signOut}
                className="card-hover"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--space-sm) var(--space-md)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-danger)',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)'
                }}
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
