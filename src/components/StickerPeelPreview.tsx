import styles from './StickerLayer.module.css';

interface Props {
  src:      string;
  /** Unique string used to scope SVG filter IDs — pass the sticker's id */
  filterId: string;
}

/**
 * Renders the peel visual for a sticker thumbnail.
 * Uses the same CSS and SVG filters as PlacedStickerItem so the animation
 * stays identical.  The host div is 100 × 100% of its container.
 */
export default function StickerPeelPreview({ src, filterId }: Props) {
  const backFilterId   = `stickerBack-prev-${filterId}`;
  const shadowFilterId = `stickerShadow-prev-${filterId}`;

  return (
    <div className={styles.stickerPeelHost}>
      <div
        className={styles.sticker}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <svg width="0" height="0" className={styles.filterSvg}>
          <defs>
            <filter id={backFilterId}>
              <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
              <feFlood floodColor="rgb(179,179,179)" result="flood" />
              <feComposite operator="in" in="flood" in2="shape" />
            </filter>
            <filter id={shadowFilterId}>
              <feDropShadow dx="1" dy="3" stdDeviation="3"
                floodColor="black" floodOpacity="0.45" />
            </filter>
          </defs>
        </svg>

        <div className={styles.peelContainer}>
          <div
            className={styles.stickerMain}
            style={{ filter: `url(#${shadowFilterId})` }}
          >
            <div className={styles.stickerMainInner}>
              <img src={src} draggable={false} alt="" className={styles.stickerImg} />
            </div>
          </div>

          <div className={styles.stickerFlap}>
            <div className={styles.stickerFlapInner}>
              <img
                src={src}
                draggable={false}
                alt=""
                className={styles.stickerFlapImg}
                style={{ filter: `url(#${backFilterId})` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
