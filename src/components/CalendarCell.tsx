import { useState, useEffect, useRef } from 'react';
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

  const openCrop = (file: File) => {
    if (!dateKey || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => setPendingImage(e.target!.result as string);
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected after cancel
    if (inputRef.current) inputRef.current.value = '';
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
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && openCrop(e.target.files[0])}
          />
        )}
      </div>

      {pendingImage && (
        <CropModal
          imageSrc={pendingImage}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}
