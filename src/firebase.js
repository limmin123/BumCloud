import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDNf7aEgL7mTsjlEnxqmtKVFjGc6oNcg08",
  authDomain: "bum-cloud.firebaseapp.com",
  projectId: "bum-cloud",
  storageBucket: "bum-cloud.firebasestorage.app",
  messagingSenderId: "738817614940",
  appId: "1:738817614940:web:2b2f98405cdd350ee13299",
  measurementId: "G-QTMGDCXT4S"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// 로그인
export const auth = getAuth(app);