import { useState, useEffect, useRef } from 'react';
import styles from './CalendarCell.module.css';
import { savePhoto, loadPhoto, deletePhoto } from '../storage';

interface Props {
  day: number;
  dateKey: string | null;
  isOtherMonth: boolean;
  isToday: boolean;
}

export default function CalendarCell({ day, dateKey, isOtherMonth, isToday }: Props) {
  const [photoURL,   setPhotoURL]   = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dateKey) return;
    let cancelled = false;
    setPhotoURL(null);
    loadPhoto(dateKey).then(url => {
      if (!cancelled && url) setPhotoURL(url);
    });
    return () => { cancelled = true; };
  }, [dateKey]);

  const handleFile = (file: File) => {
    if (!dateKey || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const url = e.target!.result as string;
      setPhotoURL(url);
      await savePhoto(dateKey, url);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dateKey) return;
    setPhotoURL(null);
    await deletePhoto(dateKey);
  };

  const handleCellClick = () => {
    if (isOtherMonth || photoURL) return;
    inputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const cellClass = [
    styles.cell,
    isOtherMonth && styles.otherMonth,
    isToday      && styles.today,
    photoURL     && styles.hasPhoto,
    isDragOver   && styles.dragOver,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cellClass}
      onClick={handleCellClick}
      onDragOver={e => { e.preventDefault(); if (!isOtherMonth) setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <span className={styles.cellDate}>{day}</span>

      {photoURL && (
        <>
          <img className={styles.cellPhoto} src={photoURL} alt="" />
          <button
            className={styles.removeBtn}
            title="Remove photo"
            onClick={handleRemovePhoto}
          >
            ×
          </button>
        </>
      )}

      {!isOtherMonth && (
        <div className={styles.uploadHint}>
          {photoURL ? (
            <button
              className={styles.actionBtn}
              title="Replace photo"
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
            >
              📷
            </button>
          ) : (
            <span>＋</span>
          )}
        </div>
      )}

      {!isOtherMonth && dateKey && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      )}
    </div>
  );
}
