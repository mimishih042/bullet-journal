import { createPortal } from 'react-dom';
import styles from './ExtractModal.module.css';
import ExtractExample from '../assets/extract-example.png'

interface Props {
  onUpload: () => void;
  onCancel: () => void;
}

export default function ExtractModal({ onUpload, onCancel }: Props) {
  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        <p className={styles.title}>Extract stickers from sheet</p>

        <div className={styles.body}>
          <p className={styles.description}>
            Upload a photo of your sticker sheet and the app will automatically
            cut out each sticker with a transparent background — no editing needed.
          </p>

          <ul className={styles.tips}>
            <li>Use a sheet with a <strong>white or light background</strong></li>
            <li>Make sure stickers have clear, visible edges</li>
            <li>Good lighting and a straight-on angle give the best results</li>
          </ul>
          {/* <div className={styles.howToPlaceholder}> */}
            <img src={ExtractExample} alt='' className={styles.placeholderImg}/>
          {/* </div> */}
        </div>

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.uploadBtn} onClick={onUpload}>
            Upload image
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}
