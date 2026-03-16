import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ── Schema ────────────────────────────────────────────
interface JournalDB extends DBSchema {
  photos: {
    key: string;
    value: { key: string; data: string };
  };
  settings: {
    key: string;
    value: { key: string; value: string };
  };
  stickers: {
    key: string;
    value: StickerItem;
  };
  'placed-stickers': {
    key: string;
    value: { key: string; stickers: PlacedSticker[] };
  };
}

const DB_NAME    = 'bullet-journal';
const DB_VERSION = 4;

const dbPromise: Promise<IDBPDatabase<JournalDB>> = openDB<JournalDB>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (!db.objectStoreNames.contains('photos'))
      db.createObjectStore('photos', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('settings'))
      db.createObjectStore('settings', { keyPath: 'key' });
    if (!db.objectStoreNames.contains('stickers'))
      db.createObjectStore('stickers', { keyPath: 'id' });

    // v4 migration: clear pixel-based placed-sticker data; positions are now fractions
    if (oldVersion > 0 && oldVersion < 4 && db.objectStoreNames.contains('placed-stickers'))
      db.deleteObjectStore('placed-stickers');
    if (!db.objectStoreNames.contains('placed-stickers'))
      db.createObjectStore('placed-stickers', { keyPath: 'key' });
  },

  blocked() {
    console.warn('IndexedDB upgrade blocked — close other tabs running this app.');
  },

  blocking() {
    // Another tab needs a newer version; close our connection so it can proceed.
    dbPromise.then(db => db.close());
  },
});

// ── Photos ────────────────────────────────────────────
export async function savePhoto(dateKey: string, dataURL: string): Promise<void> {
  const db = await dbPromise;
  await db.put('photos', { key: dateKey, data: dataURL });
}

export async function deletePhoto(dateKey: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('photos', dateKey);
}

export async function loadPhoto(dateKey: string): Promise<string | null> {
  const db = await dbPromise;
  const record = await db.get('photos', dateKey);
  return record?.data ?? null;
}

// ── Settings ──────────────────────────────────────────
export async function saveSetting(key: string, value: string): Promise<void> {
  const db = await dbPromise;
  await db.put('settings', { key, value });
}

export async function loadSetting(key: string): Promise<string | null> {
  const db = await dbPromise;
  const record = await db.get('settings', key);
  return record?.value ?? null;
}

// ── Sticker Pack ──────────────────────────────────────
export interface StickerItem {
  id: string;
  dataURL: string;
}

export async function saveStickerItem(item: StickerItem): Promise<void> {
  const db = await dbPromise;
  await db.put('stickers', item);
}

export async function loadAllStickers(): Promise<StickerItem[]> {
  const db = await dbPromise;
  return db.getAll('stickers');
}

export async function deleteStickerItem(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('stickers', id);
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
  const db = await dbPromise;
  await db.put('placed-stickers', { key: monthKey, stickers });
}

export async function loadPlacedStickers(monthKey: string): Promise<PlacedSticker[]> {
  const db = await dbPromise;
  const record = await db.get('placed-stickers', monthKey);
  return record?.stickers ?? [];
}
