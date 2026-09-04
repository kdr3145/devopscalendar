// ⚠️ 여기에 본인의 Firebase 웹앱 설정값을 붙여넣으세요.
// Firebase 콘솔 → 프로젝트 설정(⚙️) → "내 앱" → 웹앱(</>) 등록 후 나오는 firebaseConfig 값입니다.
// (이 값들은 웹 클라이언트용 공개 설정이라 브라우저에 노출되어도 됩니다. 실제 보안은 Firestore 규칙/인증으로 합니다.)
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBWT-33WfpKjVw4vDaB-Kx2SQPxTwbsYWg",
  authDomain: "bkr-devops-vendor-calendar.firebaseapp.com",
  projectId: "bkr-devops-vendor-calendar",
  storageBucket: "bkr-devops-vendor-calendar.firebasestorage.app",
  messagingSenderId: "961007040519",
  appId: "1:961007040519:web:9e7b41f72760b3714052a2",
  measurementId: "G-THX6Z56YX3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
