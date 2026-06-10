import { v } from './version';
export const VERSION = v;
export const ENV: 'Local' | 'Test' | 'Production' = 'Local';

// Firebase
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
};
export const VAPID_KEY = '';

export const GOOGLE_PROVIDER_ID = '';

// Apis locales para CHAMAN2026
export const WS = 'ws://127.0.0.1:5006';
export const API = 'http://127.0.0.1:5002';
export const TILES_URL = 'http://127.0.0.1:5002/data';
