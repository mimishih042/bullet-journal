import { useState, useEffect, useRef } from 'react';
import { heicTo, isHeic } from 'heic-to';
import styles from './CalendarCell.module.css';
import { savePhoto, loadPhoto, deletePhoto } from '../storage';
import CropModal from './CropModal';

interface Props {
  day: number;
  dateKey: string | null;
  isOtherMonth: boolean;
  isToday: boolean;
}

export default function CalendarCell({ day, dateKey, isOtherMonth, isToday }: Props) {
  const [photoURL,   setPhotoURL]   = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // null = closed, 'loading' = open + converting, string = open + ready
  const [pendingImage, setPendingImage] = useState<string | null>(null);
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

  const openCrop = async (file: File) => {
    if (!dateKey) return;

    // isHeic reads magic bytes — reliable even when MIME type is empty (Safari/iOS)
    const heicFile = await isHeic(file).catch(() => false)
      || file.type === 'image/heic' || file.type === 'image/heif'
      || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (!heicFile && !file.type.startsWith('image/')) return;

    if (inputRef.current) inputRef.current.value = '';

    if (heicFile) {
      // Open the modal immediately with a loading state, then fill in the image
      setPendingImage('loading');
      try {
        const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
        setPendingImage(URL.createObjectURL(blob));
      } catch {
        // heic-to failed — file may already be JPEG (OS pre-converted); try native
        setPendingImage(URL.createObjectURL(file));
      }
      return;
    }

    setPendingImage(URL.createObjectURL(file));
  };

  const handleCropConfirm = async (croppedDataURL: string) => {
    if (!dateKey) return;
    setPendingImage(null);
    setPhotoURL(croppedDataURL);
    await savePhoto(dateKey, croppedDataURL);
  };

  const handleCropCancel = () => {
    setPendingImage(null);
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
    if (file) openCrop(file);
  };

  const cellClass = [
    styles.cell,
    isOtherMonth && styles.otherMonth,
    isToday      && styles.today,
    photoURL     && styles.hasPhoto,
    isDragOver   && styles.dragOver,
  ].filter(Boolean).join(' ');

  return (
    <>
      <div
        className={cellClass}
        data-today={isToday ? 'true' : undefined}
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
                +
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
            accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,.heic,.heif"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) openCrop(e.target.files[0]); }}
          />
        )}
      </div>

      {pendingImage && (
        <CropModal
          imageSrc={pendingImage === 'loading' ? null : pendingImage}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}
