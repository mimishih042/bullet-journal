import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ExtractModal.module.css';
import ExtractExample from '../assets/extract-example.png'

interface Props {
  onUpload: (file: File) => void;
  onCancel: () => void;
}

export default function ExtractModal({ onUpload, onCancel }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleAction = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    } else {
      fileInputRef.current?.click();
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <p className={styles.title}>Extract from sticker sheet</p>

        <div className={styles.body}>
          <p className={styles.description}>
            Upload your sticker sheet to create stickers.
          </p>

          <ul className={styles.tips}>
            <li>Use a sticker sheet with a <strong>white or light background</strong></li>
            <li>Make sure stickers have clear, visible edges</li>
          </ul>

          <button
            className={styles.imageBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Click to upload your sticker sheet"
          >
            <img
              src={previewUrl ?? ExtractExample}
              alt=""
              className={previewUrl ? styles.previewImg : styles.placeholderImg}
            />
            {!previewUrl && <span className={styles.imageBtnHint}>Click to upload</span>}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.uploadBtn} onClick={handleAction} disabled={!selectedFile}>
             Done
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}
