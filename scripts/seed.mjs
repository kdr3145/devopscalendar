// 초기 데이터 적재 스크립트 (한 번만 실행)
// 사용법: src/firebase-config.js 를 먼저 채운 뒤  ->  npm run seed
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, writeBatch } from "firebase/firestore";
import { firebaseConfig } from "../src/firebase-config.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, "..", "seed-data", f), "utf-8"));

const developers = load("developers.json");
const attendance = load("attendance.json");
const holidays = load("holidays.json");
const meta = load("meta.json");

const app = initializeApp(firebaseConfig);
const fs = getFirestore(app);

async function commitBatched(items, toRef) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(fs);
    for (const it of items.slice(i, i + 400)) {
      const { ref, data } = toRef(it);
      batch.set(ref, data);
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + 400, items.length)}/${items.length}`);
  }
}

async function main() {
  if (firebaseConfig.projectId === "YOUR_PROJECT_ID") {
    console.error("먼저 src/firebase-config.js 에 Firebase 설정값을 입력하세요.");
    process.exit(1);
  }
  console.log("developers…");
  await commitBatched(developers, (d) => ({ ref: doc(fs, "developers", d.id), data: d }));
  console.log("attendance…");
  await commitBatched(attendance, (a) => ({ ref: doc(fs, "attendance", a.id), data: a }));
  console.log("meta/config…");
  await import("firebase/firestore").then(({ setDoc }) => setDoc(doc(fs, "meta", "config"), meta));
  console.log("meta/holidays…");
  await import("firebase/firestore").then(({ setDoc }) => setDoc(doc(fs, "meta", "holidays"), holidays));
  console.log("✅ 시드 완료");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
