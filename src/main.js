import "./style.css";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";
import { makeClaudeDb } from "./db-firebase.js";

const fbApp = initializeApp(firebaseConfig);
const fs = getFirestore(fbApp);

const gate = document.getElementById("gate");
const input = document.getElementById("gate-pw");
const btn = document.getElementById("gate-btn");
const err = document.getElementById("gate-err");

let gatePw = undefined; // undefined = 아직 로드 안됨, null = 미설정(게이트 없음)
async function loadGatePw() {
  try {
    const s = await getDoc(doc(fs, "meta", "config"));
    gatePw = s.exists() && s.data().gatePassword != null ? String(s.data().gatePassword) : null;
  } catch (e) { gatePw = null; }
}
loadGatePw();

async function tryPass() {
  if (gatePw === undefined) await loadGatePw();
  const v = input.value;
  if (gatePw === null || v === gatePw) {
    try { sessionStorage.setItem("bkr_gate", "1"); } catch (e) {}
    startApp();
  } else {
    err.textContent = "비밀번호가 일치하지 않습니다.";
    input.value = ""; input.focus();
  }
}
btn.addEventListener("click", tryPass);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryPass(); });

let started = false;
async function startApp() {
  if (started) return; started = true;
  gate.hidden = true;
  makeClaudeDb(fs);          // sets window.claude
  await import("./app.js");  // defines the app + window.__bootApp
  window.__bootApp();
}

let remembered = false;
try { remembered = sessionStorage.getItem("bkr_gate") === "1"; } catch (e) {}
if (remembered) startApp(); else input.focus();
