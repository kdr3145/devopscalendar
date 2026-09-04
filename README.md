# 개발 근태 관제 (BKR)

밴더 개발자 근태·연차·투입 관리 대시보드. **GitHub Pages + Firebase(Firestore)** 로 동작하는 자체 호스팅 버전입니다.
등록·수정 내용이 실시간으로 모든 사용자에게 공유·저장되며, 접속은 **공용 비밀번호 게이트**로 보호합니다.

## 구성
- 화면/로직: 기존 대시보드 그대로 (요약 · 명단 · 연차/투입 현황 · 월 근태 종합 · 근태 달력)
- 저장소: **Firebase Firestore** (실시간 공유)
- 빌드/배포: **Vite** + **GitHub Pages(Actions 자동 배포)**
- 폰트: Pretendard (CDN)

---

## 1. Firebase 프로젝트 준비 (최초 1회)
1. https://console.firebase.google.com 에서 **프로젝트 추가**.
2. 좌측 **Firestore Database → 데이터베이스 만들기 → "테스트 모드"** 로 시작(추후 규칙 강화 가능).
3. 프로젝트 개요 옆 **⚙️ 프로젝트 설정 → 내 앱 → 웹앱(</>) 추가** → 표시되는 `firebaseConfig` 값을 복사.
4. `src/firebase-config.js` 에 그 값을 붙여넣기.

> firebaseConfig 값은 웹 클라이언트용 **공개 설정**이라 노출되어도 됩니다. 실제 접근 통제는 Firestore 규칙/인증으로 합니다.

## 2. 설치 & 초기 데이터 적재
```bash
npm install          # 의존성 설치
npm run seed         # 개발자 56명·일별 근태·공휴일·설정 초기 적재 (최초 1회)
```
- 공용 비밀번호 기본값: **bkr2026**  · 관리자 PIN 기본값: **1004**
  (둘 다 앱 실행 후 화면에서 바꿀 수 있고, `seed-data/meta.json` 에서 초기값을 바꿔도 됩니다.)

## 3. 로컬 실행(선택)
```bash
npm run dev          # http://localhost:5173
```

## 4. GitHub 올리고 자동 배포
```bash
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin https://github.com/<본인계정>/<저장소>.git
git push -u origin main
```
- GitHub 저장소 → **Settings → Pages → Build and deployment → Source: "GitHub Actions"** 선택.
- 이후 `main` 에 push 할 때마다 자동 빌드·배포됩니다.
- 주소: `https://<본인계정>.github.io/<저장소>/`

## 접속
- 페이지 진입 → **공용 비밀번호** 입력 → 대시보드.
- 과거 월 수정·개발자 추가/삭제·공휴일 등록은 상단 **관리자** 버튼(PIN) 인증 후 가능.

---

## 보안 참고 (중요)
- 기본 `firestore.rules` 는 "링크를 아는 누구나 읽기/쓰기"입니다. **사내 내부용**으로 시작하기엔 충분하지만, 공용 비밀번호 게이트는 **화면 접근만** 막을 뿐 데이터베이스 자체를 잠그지는 않습니다.
- 보안을 강화하려면 Firebase **Authentication(익명 또는 이메일)** 을 켜고, `firestore.rules` 의 "인증 필요" 버전으로 바꾸세요. (원하시면 인증 연동 버전도 만들어 드립니다.)

## 데이터 구조 (Firestore)
- `developers/{id}` — 개발자 정보 + 월별 시트 집계(monthly)
- `attendance/{devId}__{YYYY-MM}` — `{ devId, ym, year, month, days: { "일": "유형" } }`
- `meta/config` — `{ pin, gatePassword }`
- `meta/holidays` — `{ dates: { "YYYY-MM-DD": "공휴일명" } }`

집계 기준: 연차 = 휴가·여름 1.0, 오전·오후 반휴 0.5. 월별·누계는 일별 등록 실제값 기준(과거 월에 일별기록이 없을 때만 시트 집계값 사용).
