import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, onValue, ref } from 'firebase/database';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
export const db = getDatabase(app);

// Anonymous sign-in: players never see it. The browser keeps the same id across visits, and the database rules use it to know who's who.
export async function signIn() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

// Server clock minus this phone's clock, so every phone counts down from the same moment.
let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
  offset = snap.val() || 0;
});
export const serverNow = () => Date.now() + offset;
