import { v } from './version';
export const VERSION = v;
export const ENV: 'Local' | 'Test' | 'Production' = 'Production';

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

export const WS = 'wss://api.chaman.seagloo.com/sdc-websocket';
export const API = 'https://api.chaman.seagloo.com/sdc-cliente';
export const TILES_URL = 'https://api.chaman.seagloo.com/data';
