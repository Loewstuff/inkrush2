import { initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';

const app = initializeApp({ databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL });
export const db = getDatabase(app);

// Server clock minus this phone's clock, so every phone counts down from the same moment.
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
  offset = snap.val() || 0;
});
export const serverNow = () => Date.now() + offset;
