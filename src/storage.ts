const DB_NAME    = 'bullet-journal';
const DB_VERSION = 4;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db         = (e.target as IDBOpenDBRequest).result;
      const oldVersion = e.oldVersion;

      if (!db.objectStoreNames.contains('photos'))
        db.createObjectStore('photos',   { keyPath: 'key' });
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('stickers'))
        db.createObjectStore('stickers', { keyPath: 'id' });

      // v4 migration: clear pixel-based placed-sticker data; positions are now fractions
      if (oldVersion > 0 && oldVersion < 4 && db.objectStoreNames.contains('placed-stickers'))
        db.deleteObjectStore('placed-stickers');
      if (!db.objectStoreNames.contains('placed-stickers'))
        db.createObjectStore('placed-stickers', { keyPath: 'key' });
    };

    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = e => reject((e.target as IDBOpenDBRequest).error);
  });
}

// ── Photos ────────────────────────────────────────────
export async function savePhoto(dateKey: string, dataURL: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put({ key: dateKey, data: dataURL });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

export async function deletePhoto(dateKey: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(dateKey);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

export async function loadPhoto(dateKey: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('photos', 'readonly');
    const req = tx.objectStore('photos').get(dateKey);
    req.onsuccess = e =>
      resolve(((e.target as IDBRequest).result as { data: string } | undefined)?.data ?? null);
    req.onerror = e => reject((e.target as IDBRequest).error);
  });
}

// ── Settings ──────────────────────────────────────────
export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

export async function loadSetting(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = e =>
      resolve(((e.target as IDBRequest).result as { value: string } | undefined)?.value ?? null);
    req.onerror = e => reject((e.target as IDBRequest).error);
  });
}

// ── Sticker Pack ──────────────────────────────────────
export interface StickerItem {
  id: string;
  dataURL: string;
}

export async function saveStickerItem(item: StickerItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stickers', 'readwrite');
    tx.objectStore('stickers').put(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

export async function loadAllStickers(): Promise<StickerItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('stickers', 'readonly');
    const req = tx.objectStore('stickers').getAll();
    req.onsuccess = e => resolve((e.target as IDBRequest).result as StickerItem[]);
    req.onerror   = e => reject((e.target as IDBRequest).error);
  });
}

export async function deleteStickerItem(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stickers', 'readwrite');
    tx.objectStore('stickers').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

// ── Placed Stickers (per month) ───────────────────────
export interface PlacedSticker {
  id: string;
  stickerDataURL: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export async function savePlacedStickers(monthKey: string, stickers: PlacedSticker[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('placed-stickers', 'readwrite');
    tx.objectStore('placed-stickers').put({ key: monthKey, stickers });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject((e.target as IDBRequest).error);
  });
}

export async function loadPlacedStickers(monthKey: string): Promise<PlacedSticker[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('placed-stickers', 'readonly');
    const req = tx.objectStore('placed-stickers').get(monthKey);
    req.onsuccess = e => {
      const result = (e.target as IDBRequest).result as { stickers: PlacedSticker[] } | undefined;
      resolve(result?.stickers ?? []);
    };
    req.onerror = e => reject((e.target as IDBRequest).error);
  });
}
