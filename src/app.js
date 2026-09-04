/* ============================ config ============================ */
const TODAY = new Date(2026,8,3); // 2026-09-03 (기준일)
const CUR_YM = ym(TODAY);
const YEARS = [2026,2025,2024];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const WD = ["일","월","화","수","목","금","토"];

// 근태 유형 정의 (범례)
const TYPES = {
  "O":  {label:"출근",  tk:"O",   cls:"t-work",  leave:0,   grp:"work"},
  "휴가":{label:"휴가",  tk:"휴",  cls:"t-vac",   leave:1,   grp:"vac"},
  "오전":{label:"오전반휴",tk:"오전",cls:"t-am",   leave:0.5, grp:"vac"},
  "오후":{label:"오후반휴",tk:"오후",cls:"t-pm",   leave:0.5, grp:"vac"},
  "야전":{label:"야전(야간후 오전오프)",tk:"야전",cls:"t-night",leave:0,grp:"night"},
  "야후":{label:"야후(야간후 오후오프)",tk:"야후",cls:"t-night",leave:0,grp:"night"},
  "여름":{label:"여름휴가",tk:"여름",cls:"t-summer",leave:1, grp:"vac"},
  "병가":{label:"병가",  tk:"병",  cls:"t-sick",  leave:0,   grp:"sick"},
  "재택":{label:"재택",  tk:"재택",cls:"t-home",  leave:0,   grp:"home"},
  "특근":{label:"특근",  tk:"특",  cls:"t-extra", leave:0,   grp:"extra"},
  "민방위":{label:"민방위",tk:"민방위",cls:"t-civil",leave:0, grp:"etc"},
};
const REG_TYPES=["O","휴가","여름","오전","오후","야전","야후","병가","재택","특근","민방위"];
function typeInfo(v){ return TYPES[v] || {label:v,tk:v,cls:"t-etc",leave:0,grp:"etc"}; }
const ANNUAL_QUOTA = 15;
function lvClass(u){ if(u>ANNUAL_QUOTA)return"lv-over"; if(u>=13)return"lv-caution"; if(u>=10)return"lv-warn"; return"lv-ok"; }

/* ============================ state ============================ */
const S = {
  db:null, connected:false,
  devs:[], meta:{pin:"1004"}, holidays:{},
  attYear:{},   // key `${devId}__${m}` -> {days} for S.year
  attMonth:{},  // key devId -> {days} for S.calYm
  view:"summary", year:2026, calYm:CUR_YM, calDev:null,
  admin:false, filterDiv:"ALL", search:"", rosterScope:"active",
  hmScope:"active", hmDiv:"ALL", monthScope:"current",
  unsubYear:null, unsubMonth:null,
};

/* ============================ helpers ============================ */
function ym(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function ymParts(s){const[a,b]=s.split("-");return[+a,+b];}
function firstOf(y,m){return new Date(y,m-1,1);}
function lastOf(y,m){return new Date(y,m,0);}
function pd(s){ if(!s)return null; const[a,b,c]=s.split("-"); return new Date(+a,+b-1,+c); }
function esc(s){return(s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function el(id){return document.getElementById(id);}

function isActiveInMonth(dev,y,m){
  const s=pd(dev.start), e=pd(dev.end);
  const lo=firstOf(y,m), hi=lastOf(y,m);
  if(s && s>hi) return false;
  if(e && e<lo) return false;
  return true;
}
function isCurrent(dev){ if(dev.active===false) return false; const e=pd(dev.end); return !e || e>=TODAY; }
function isActiveOnDate(dev,d){ const s=pd(dev.start), e=pd(dev.end); if(dev.active===false && !e) return d<=TODAY&&(!s||s<=d); if(s&&d<s)return false; if(e&&d>e)return false; return true; }

// 월 연차 사용량: 일별 등록값(실제) 우선, 과거 월에 기록 없으면 시트 집계값(시드)로 대체
function monthLeave(dev,y,m){
  const key=dev.id+"__"+m;
  const rec = (y===S.year) ? S.attYear[key] : null;
  if(rec && rec.days){ let t=0; for(const k in rec.days){t+=typeInfo(rec.days[k]).leave;} return {v:t,src:"live"}; }
  const ymStr=y+"-"+String(m).padStart(2,"0");
  if(ymStr<CUR_YM){
    const seed = dev.monthly && dev.monthly[String(y)] && dev.monthly[String(y)][String(m)];
    if(typeof seed==="number") return {v:seed,src:"seed"};
    return {v:null,src:"none"};
  }
  if(ymStr===CUR_YM) return {v:0,src:"cur"};
  return {v:null,src:"none"};
}
function annualUsed(dev,y){
  let t=0;
  for(let m=1;m<=12;m++){ const r=monthLeave(dev,y,m); if(r.v) t+=r.v; }
  return t;
}
function daysBreakdown(days){
  const b={vac:0,am:0,pm:0,night:0,sick:0,home:0,extra:0,work:0,civil:0,leave:0};
  for(const k in days){const t=days[k];const ty=typeInfo(t);
    b.leave+=ty.leave;
    if(t==="휴가"||t==="여름")b.vac++; else if(t==="오전")b.am++; else if(t==="오후")b.pm++;
    else if(t==="야전"||t==="야후")b.night++; else if(t==="병가")b.sick++;
    else if(t==="재택")b.home++; else if(t==="특근")b.extra++; else if(t==="민방위")b.civil++; else if(t==="O")b.work++;
  }
  return b;
}
function dstr(y,m,day){return y+"-"+String(m).padStart(2,"0")+"-"+String(day).padStart(2,"0");}
// 특정 날짜의 표기: 기록 우선 → 공휴일 → 상주 평일 자동 'O'
function dayInfo(dev,y,m,day,days){
  const rec = days && days[String(day)];
  if(rec) return {type:rec, auto:false};
  const d=new Date(y,m-1,day), dow=d.getDay();
  const inTen = isActiveOnDate(dev,d);
  const hol = S.holidays[dstr(y,m,day)];
  if(hol && inTen && dow!==0 && dow!==6) return {holiday:true, name:hol};
  if(dow===0||dow===6) return null;
  if(!inTen) return null;
  if(d>TODAY) return null;
  return {type:"O", auto:true};
}

/* ============================ db ============================ */
async function initDb(){
  let db=null;
  try{ db = await claude.use("db"); }catch(e){ db=null; }
  S.db=db;
  if(!db){ S.connected=false; setConn("off","오프라인 (저장 불가)"); render(); return; }
  S.connected=true; setConn("live","실시간 연결됨");
  // meta
  try{ const ms=await db.doc("meta/config").get(); if(ms.exists&&ms.data().pin) S.meta.pin=ms.data().pin; }catch(e){}
  // holidays (master, shared)
  db.doc("meta/holidays").onSnapshot(s=>{ S.holidays=(s.exists&&s.data().dates)||{}; render(); }, ()=>{});
  // developers
  db.collection("developers").onSnapshot(snap=>{
    S.devs = snap.docs.map(d=>d.data()).sort((a,b)=>(a.order||0)-(b.order||0));
    el("nRoster").textContent = S.devs.length? S.devs.length : "";
    render();
  }, err=>{ setConn("off","동기화 오류"); });
  subYear(); subMonth();
}
function subYear(){
  if(!S.db)return; if(S.unsubYear)S.unsubYear();
  S.attYear={};
  S.unsubYear = S.db.collection("attendance").where("year","==",S.year).onSnapshot(snap=>{
    const map={}; snap.docs.forEach(d=>{const v=d.data(); map[v.devId+"__"+v.month]=v;}); S.attYear=map;
    if(S.view==="heatmap"||S.view==="summary") render();
  }, ()=>{});
}
function subMonth(){
  if(!S.db)return; if(S.unsubMonth)S.unsubMonth();
  S.attMonth={};
  S.unsubMonth = S.db.collection("attendance").where("ym","==",S.calYm).onSnapshot(snap=>{
    const map={}; snap.docs.forEach(d=>{const v=d.data(); map[v.devId]=v;}); S.attMonth=map;
    if(S.view==="calendar") render();
  }, ()=>{});
}
async function writeDay(dev,day,type){
  if(!S.db) return;
  const [y,m]=ymParts(S.calYm);
  const ref=S.db.doc("attendance/"+dev.id+"__"+S.calYm);
  let days={};
  const cur=S.attMonth[dev.id];
  if(cur&&cur.days) days={...cur.days};
  if(type===null) delete days[String(day)]; else days[String(day)]=type;
  try{ await ref.set({devId:dev.id, ym:S.calYm, year:y, month:m, days}); }
  catch(e){ alert("저장 실패: "+(e&&e.message||e)); }
}
function setConn(st,txt){ const d=el("dot"); d.className="dot "+(st==="live"?"live":st==="off"?"off":""); el("connlab").textContent=txt; }

/* ============================ render dispatch ============================ */
function render(){
  el("tabs").querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.tab===S.view));
  el("adminBtn").className="btn"+(S.admin?" on":"");
  el("adminBtn").textContent=(S.admin?"🔓 관리자 ON":"🔒 관리자");
  el("pinBtn").hidden = !S.admin;
  const v=el("view");
  if(!S.devs.length){
    if(!S.connected && S.db===null){ v.innerHTML=emptyState("오프라인","저장 기능(db)에 연결할 수 없어 데이터를 표시할 수 없어요. 게시된 아티팩트 화면에서 열면 연결됩니다."); return; }
    v.innerHTML=loadingState(); return;
  }
  if(S.view==="summary") v.innerHTML=viewSummary();
  else if(S.view==="roster") v.innerHTML=viewRoster();
  else if(S.view==="heatmap") v.innerHTML=viewHeatmap();
  else if(S.view==="month") v.innerHTML=viewMonth();
  else if(S.view==="calendar") v.innerHTML=viewCalendar();
  el("foot").innerHTML = footNote();
}
function footNote(){
  return `기준일 <b class="mono">2026-09-03</b> · 연차 기준 <b class="mono">${ANNUAL_QUOTA}일/년</b> (휴가 1.0, 오전·오후 반휴 0.5 합산) · `+
    `과거 월은 잠금 상태이며 관리자 PIN 입력 시에만 수정할 수 있습니다. 월별·누계 수치는 일별 등록 실제값 기준이며, 과거 월에 일별기록이 없을 때만 시트 집계값을 사용합니다.`;
}
function loadingState(){ let r=""; for(let i=0;i<5;i++) r+=`<div class="skel" style="height:52px;margin-bottom:10px"></div>`; return `<div class="panel"><div class="panel-bd">${r}</div></div>`; }
function emptyState(t,d){ return `<div class="empty-state"><div class="es-t">${esc(t)}</div><div>${esc(d)}</div></div>`; }

/* ============================ view: summary ============================ */
function viewSummary(){
  const total=S.devs.length;
  const cur=S.devs.filter(isCurrent);
  const curN=cur.length;
  // 이번 달 등록 건수
  let regCnt=0; for(const id in S.attMonth){const d=S.attMonth[id]; if(d.days)regCnt+=Object.keys(d.days).length;}
  // 올해 연차: 현재 상주자 평균
  const curYearUsers=cur.filter(d=>isActiveInMonth(d,S.year,1)||true);
  let sum=0,cnt=0; cur.forEach(d=>{const u=annualUsed(d,S.year); if(u>0){sum+=u;cnt++;}});
  const avg = cnt? (sum/cnt) : 0;
  const over = cur.filter(d=>annualUsed(d,S.year)>ANNUAL_QUOTA).length;

  const byRole=groupCount(cur,"role"), byCo=groupCount(cur,"company");
  // 월별 연차 추이 (상주 인력 합, 선택연도)
  const trend=[]; let tmax=0;
  for(let m=1;m<=12;m++){ let t=0; cur.forEach(d=>{const r=monthLeave(d,S.year,m); if(r.v)t+=r.v;}); trend.push(t); if(t>tmax)tmax=t; }

  return `
  <div class="kpis">
    <div class="kpi"><div class="lab">총 등록 인원</div><div class="val mono">${total}<small>명</small></div><div class="sub">퇴사·철수 이력 포함 누적</div></div>
    <div class="kpi"><div class="lab"><span class="dot live" style="box-shadow:none;width:7px;height:7px"></span>현재 상주 인원</div><div class="val mono">${curN}<small>명</small></div><div class="sub">상주 종료일 미도래 기준</div></div>
    <div class="kpi"><div class="lab">${S.year} 평균 연차 사용</div><div class="val mono">${avg.toFixed(1)}<small>/ ${ANNUAL_QUOTA}일</small></div><div class="sub">상주자 중 사용 인원 ${cnt}명 평균</div></div>
    <div class="kpi"><div class="lab">연차 초과 인원</div><div class="val mono" style="color:${over?'var(--over)':'var(--ink)'}">${over}<small>명</small></div><div class="sub">${S.year} 기준 15일 초과</div></div>
  </div>

  <div class="panel">
    <div class="panel-hd"><h2>${S.year} 월별 연차 사용 추이</h2><span class="desc">상주 인력 합계 · 단위 일</span></div>
    <div class="panel-bd">
      <div class="trend">
        ${trend.map((t,i)=>{const h=tmax?Math.max(3,Math.round(t/tmax*96)):3;
          return `<div class="tcol"><div class="tbar" style="height:${h}px">${t?`<b>${t%1?t.toFixed(1):t}</b>`:""}</div><div class="tm">${i+1}</div></div>`;}).join("")}
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-hd"><h2>상주 인원 분포</h2><span class="desc">역할별 · 협력사별</span></div>
    <div class="panel-bd"><div class="dist2">
      <div><div class="dist-t">역할별</div>${barsHtml(byRole)}</div>
      <div><div class="dist-t">협력사별</div>${barsHtml(byCo)}</div>
    </div></div>
  </div>`;
}
function groupCount(list,key){
  const m={}; list.forEach(d=>{const k=d[key]||"미지정"; m[k]=(m[k]||0)+1;});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]);
}
function barsHtml(rows){
  const max=Math.max(1,...rows.map(r=>r[1]));
  return `<div class="barc">${rows.map(([k,v])=>`
    <div class="barrow"><div class="bl" title="${esc(k)}">${esc(k)}</div>
    <div class="bartrk"><div class="barfill" style="width:${Math.round(v/max*100)}%"></div></div>
    <div class="bv">${v}</div></div>`).join("")}</div>`;
}

/* ============================ view: roster ============================ */
function viewRoster(){
  let list=S.devs.slice();
  if(S.rosterScope==="active") list=list.filter(isCurrent);
  if(S.search){const q=S.search.toLowerCase();
    list=list.filter(d=>(d.name+d.role+d.company+d.title+(d.email||"")).toLowerCase().includes(q));}
  const adm=S.admin;
  const colspan = adm?12:11;
  const rows=list.map(d=>{
    const on=isCurrent(d);
    return `<tr class="${on?"":"inactive"}">
      <td class="nm">${esc(d.name)} <span class="muted" style="font-weight:400">${esc(d.title||"")}</span></td>
      <td>${esc(d.role)}</td>
      <td>${esc(d.company||"-")}</td>
      <td class="mono">${d.phone?esc(d.phone):'<span class="muted">-</span>'}</td>
      <td>${d.email?`<a class="mail" href="mailto:${esc(d.email)}">${esc(d.email)}</a>`:'<span class="muted">-</span>'}</td>
      <td>${d.personalEmail?`<a class="mail" href="mailto:${esc(d.personalEmail)}">${esc(d.personalEmail)}</a>`:'<span class="muted">-</span>'}</td>
      <td class="mono">${esc(d.start||"-")}</td>
      <td class="mono">${d.end?esc(d.end):(on?'<span class="chip on-badge dot" style="font-family:var(--sans)">상주중</span>':'<span class="muted">철수</span>')}</td>
      <td>${esc(d.dur||"-")}</td>
      <td>${on?'<span class="chip on-badge dot">활성</span>':'<span class="chip off-badge">'+(d.note==="퇴사"?"퇴사":"철수")+'</span>'}</td>
      <td class="muted">${esc(d.note||d.sub&&("대체: "+d.sub)||"")}</td>
      ${adm?`<td style="white-space:nowrap"><button class="ic-btn" data-editdev="${d.id}" title="수정">✎</button><button class="ic-btn danger" data-deldev="${d.id}" title="삭제">🗑</button></td>`:""}
    </tr>`;}).join("");
  return `
  <div class="panel">
    <div class="panel-hd">
      <h2>개발자 명단 · 연락처</h2>
      <div class="sp"></div>
      <div class="filters">
        ${adm?`<button class="btn primary" data-adddev="1">+ 개발자 추가</button>`:""}
        <div class="seg" data-role="scope">
          <button data-scope="active" class="${S.rosterScope==="active"?"on":""}">상주중</button>
          <button data-scope="all" class="${S.rosterScope==="all"?"on":""}">전체</button>
        </div>
        <div class="search"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input type="search" data-role="search" placeholder="이름·역할·협력사 검색" value="${esc(S.search)}"></div>
      </div>
    </div>
    <div class="tbl-scroll"><table>
      <thead><tr><th>성명</th><th>역할</th><th>소속</th><th>휴대폰</th><th>회사이메일</th><th>개인이메일</th><th>상주 시작</th><th>상주 종료</th><th>상주기간</th><th>상태</th><th>비고</th>${adm?"<th>관리</th>":""}</tr></thead>
      <tbody>${rows||`<tr><td colspan="${colspan}" class="empty-state">조건에 맞는 인원이 없습니다.</td></tr>`}</tbody>
    </table></div>
    <div class="panel-bd" style="border-top:1px solid var(--border);padding-top:12px;display:flex;align-items:center;gap:12px">
      <div class="muted" style="font-size:12px">표시 ${list.length}명 · 전체 ${S.devs.length}명 · 현재 상주 ${S.devs.filter(isCurrent).length}명</div>
      ${adm?"":`<div class="muted" style="font-size:11.5px;margin-left:auto">개발자 추가·수정·삭제는 상단 <b>관리자</b> 인증 후 가능합니다.</div>`}
    </div>
  </div>`;
}

/* ============================ view: heatmap ============================ */
function viewHeatmap(){
  let list=S.devs.slice();
  if(S.hmScope==="active") list=list.filter(isCurrent);
  const rows=list.map(d=>{
    let cells="";
    for(let m=1;m<=12;m++){
      const ymc=S.year+"-"+String(m).padStart(2,"0");
      if(!isActiveInMonth(d,S.year,m)){ cells+=`<td class="cell idle"></td>`; continue; }
      const r=monthLeave(d,S.year,m); const v=r.v;
      const clk=`data-hmcell="${d.id}" data-hmym="${ymc}"`;
      if(v==null){ cells+=`<td class="cell z hmk" ${clk} title="${MONTHS[m-1]} · 달력 열기">·</td>`; }
      else{ cells+=`<td class="cell hmk${v?"":" z"}" ${clk} title="${MONTHS[m-1]} ${v}일 · 클릭하면 달력 열기">${v?(v%1?v.toFixed(1):v):"0"}</td>`; }
    }
    const u=annualUsed(d,S.year); const cls=lvClass(u);
    return `<tr>
      <th class="rh"><div class="rn">${esc(d.name)}${isCurrent(d)?"":' <span class="muted" style="font-weight:400;font-size:10px">·종료</span>'}</div><div class="rr">${esc(d.role)} · ${esc(d.company||"-")}</div></th>
      ${cells}
      <td class="cum ${cls}"><span class="cv">${u%1?u.toFixed(1):u}</span> <span class="cx">/${ANNUAL_QUOTA}</span></td>
    </tr>`;}).join("");
  return `
  <div class="panel">
    <div class="panel-hd">
      <h2>${S.year} 연차·투입 현황</h2>
      <span class="desc">셀=월 연차 사용일 · <span class="cell idle" style="display:inline-block;width:20px;border:none;padding:2px 6px;border-radius:4px"></span> 미투입</span>
      <div class="sp"></div>
      <div class="filters">
        <div class="seg" data-role="hmscope">
          <button data-hmscope="active" class="${S.hmScope==="active"?"on":""}">상주중</button>
          <button data-hmscope="all" class="${S.hmScope==="all"?"on":""}">전체</button>
        </div>
      </div>
    </div>
    <div class="panel-bd" style="padding-bottom:12px">
      <div class="lvlegend">
        <b style="color:var(--ink-2)">연차 누계</b>
        <span><i class="sw" style="background:var(--ok-bg);border-color:var(--ok)"></i> 여유 &lt;10</span>
        <span><i class="sw" style="background:var(--warn-bg);border-color:var(--warn)"></i> 주의 10~12</span>
        <span><i class="sw" style="background:var(--caution-bg);border-color:var(--caution)"></i> 경고 13~15</span>
        <span><i class="sw" style="background:var(--over-bg);border-color:var(--over)"></i> 초과 &gt;15</span>
      </div>
    </div>
    <div class="hm-scroll"><table class="hm">
      <thead><tr><th class="rh">개발자</th>${MONTHS.map(m=>`<th class="mh">${m.replace("월","")}</th>`).join("")}<th class="cum-h">연차 누계</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="14" class="empty-state">해당 인원이 없습니다.</td></tr>`}</tbody>
    </table></div>
  </div>`;
}

/* ============================ view: calendar ============================ */
function viewCalendar(){
  const [y,m]=ymParts(S.calYm);
  const locked = S.calYm<CUR_YM;
  const editable = (!locked || S.admin);
  // dev select: 상주중 인력만 (철수·종료 제외). 히트맵에서 이동한 대상은 예외 포함
  let base=S.devs.filter(isCurrent);
  if(S.calDev && !base.some(d=>d.id===S.calDev)){ const cd=S.devs.find(d=>d.id===S.calDev); if(cd) base=[cd,...base]; }
  const opts=base.map(d=>({d,act:isActiveInMonth(d,y,m)})).sort((a,b)=>(b.act-a.act)||(a.d.order-b.d.order));
  if((!S.calDev || !base.some(d=>d.id===S.calDev)) && opts.length) S.calDev=(opts.find(o=>o.act)||opts[0]).d.id;
  const dev=S.devs.find(d=>d.id===S.calDev);
  const devActive = dev? isActiveInMonth(dev,y,m):false;
  const canEdit = editable && devActive && S.connected;
  const rec = dev? S.attMonth[dev.id]:null;
  const days = rec&&rec.days? rec.days:{};

  // build calendar grid
  const first=firstOf(y,m), start=first.getDay(), dim=lastOf(y,m).getDate();
  let cells="";
  for(let i=0;i<start;i++) cells+=`<div class="day empty"></div>`;
  for(let dd=1;dd<=dim;dd++){
    const dcell=new Date(y,m-1,dd), dow=dcell.getDay();
    const isToday = (y===TODAY.getFullYear()&&m===TODAY.getMonth()+1&&dd===TODAY.getDate());
    const inTen = dev?isActiveOnDate(dev,dcell):false;
    const info=dayInfo(dev,y,m,dd,days);
    let mk="";
    if(info){ if(info.holiday){ mk=`<div class="mk hol" title="${esc(info.name)}">${esc(info.name)}</div>`; }
      else { const ty=typeInfo(info.type); mk=`<div class="mk ${ty.cls}${info.auto?" auto":""}${ty.tk.length>2?" small":""}">${esc(ty.tk==="O"?"ㅇ":ty.tk)}</div>`; } }
    const cellEdit=canEdit&&inTen;
    const cl=["day",dow===0?"sun":dow===6?"sat":"",isToday?"today":"",(!inTen)?"inact":"",cellEdit?"clk":"ro"].filter(Boolean).join(" ");
    cells+=`<div class="${cl}" ${cellEdit?`data-day="${dd}"`:""}><div class="dn">${dd}</div>${mk}</div>`;
  }
  const b=daysBreakdown(days);
  const monthU=dev?(monthLeave(dev,y,m).v||0):0;
  const annU=dev?annualUsed(dev,y):0;
  const acol=annU>ANNUAL_QUOTA?'var(--over)':annU>=13?'var(--caution)':annU>=10?'var(--warn)':'var(--ok)';
  const brkRow=(cls,label,val)=>`<div class="r"><span class="k"><i class="tag ${cls}"></i>${label}</span><span class="v">${val}</span></div>`;

  return `
  <div class="panel">
    <div class="panel-hd">
      <div class="caltop">
        <div class="mnav big">
          <button data-mnav="-1" aria-label="이전 달">‹</button>
          <span class="mlab">${y}.${String(m).padStart(2,"0")}</span>
          <button data-mnav="1" aria-label="다음 달">›</button>
        </div>
        <select class="sel" data-role="caldev" style="min-width:200px;font-size:13.5px">
          ${opts.map(o=>`<option value="${o.d.id}"${o.d.id===S.calDev?" selected":""}>${esc(o.d.name)} · ${esc(o.d.role)}${o.act?"":" (미투입)"}</option>`).join("")}
        </select>
        ${locked?`<span class="lockpill locked">🔒 마감된 월${S.admin?" · 관리자 수정가능":""}</span>`:`<span class="lockpill openm">✎ 등록 가능</span>`}
        ${S.admin?`<button class="btn" data-holiday="1" style="margin-left:auto">📅 공휴일 관리</button>`:""}
      </div>
    </div>
    <div class="panel-bd">
      <div class="grid-2" style="grid-template-columns:1fr 260px;gap:24px">
        <div>
          <div class="cal">
            ${WD.map((w,i)=>`<div class="wd ${i===0?"sun":i===6?"sat":""}">${w}</div>`).join("")}
            ${cells}
          </div>
          ${canEdit?`<p class="footnote">날짜 칸을 클릭해 근태 유형을 등록/변경하세요. 빈 평일은 자동으로 <b>ㅇ(출근)</b>으로 표시됩니다. 저장은 실시간 공유됩니다.</p>`:
            locked&&!S.admin?`<p class="footnote">⚠ 마감된 월입니다. 수정하려면 상단 <b>관리자</b> 버튼으로 PIN을 입력하세요.</p>`:
            !devActive?`<p class="footnote">해당 개발자는 이 달에 미투입 상태입니다.</p>`:
            !S.connected?`<p class="footnote">오프라인 상태로 등록할 수 없습니다.</p>`:""}
        </div>
        <div class="calside">
          <div class="calsum">
            <div class="lab" style="font-size:11.5px;color:var(--ink-2);font-weight:500;margin-bottom:8px">${esc(dev?dev.name:"-")} · ${y}.${String(m).padStart(2,"0")}</div>
            <div class="big mono">${monthU%1?monthU.toFixed(1):monthU}<small> 연차일</small></div>
            <div class="brk">
              ${brkRow("t-vac","휴가·여름",b.vac+"일")}
              ${brkRow("t-am","오전반휴",b.am+"회")}
              ${brkRow("t-pm","오후반휴",b.pm+"회")}
              ${brkRow("t-night","야전·야후",b.night+"회")}
              ${brkRow("t-sick","병가",b.sick+"일")}
              ${brkRow("t-home","재택",b.home+"일")}
              ${brkRow("t-extra","특근",b.extra+"일")}
            </div>
          </div>
          <div class="calsum">
            <div class="lab" style="font-size:11.5px;color:var(--ink-2);font-weight:500;margin-bottom:8px">${y} 연차 누계</div>
            <div class="big mono" style="color:${acol}">${annU%1?annU.toFixed(1):annU}<small> / ${ANNUAL_QUOTA}일</small></div>
            <div class="bartrk" style="margin-top:12px;height:8px"><div class="barfill" style="width:${Math.min(100,Math.round(annU/ANNUAL_QUOTA*100))}%;background:${acol}"></div></div>
            <div class="footnote" style="margin-top:8px">잔여 ${Math.max(0,ANNUAL_QUOTA-annU).toFixed(annU%1?1:0)}일</div>
          </div>
        </div>
      </div>
      <div class="legend-br full">${legendHtml()}</div>
    </div>
  </div>`;
}
function legendHtml(){
  return `<div class="tlegend">${REG_TYPES.map(k=>{const t=typeInfo(k);
    return `<span class="tl"><span class="tk ${t.cls}">${esc(t.tk==="O"?"ㅇ":t.tk)}</span>${esc(t.label.split("(")[0])}</span>`;}).join("")}</div>`;
}

/* ============================ view: month (전체 종합) ============================ */
function viewMonth(){
  const [y,m]=ymParts(S.calYm);
  const locked=S.calYm<CUR_YM; const editable=(!locked||S.admin);
  const dim=lastOf(y,m).getDate();
  let list=S.devs.filter(d=>isActiveInMonth(d,y,m));
  if(S.monthScope==="current") list=list.filter(isCurrent);
  list.sort((a,b)=>a.order-b.order);
  const headDays=[];
  for(let dd=1;dd<=dim;dd++){ const dow=new Date(y,m-1,dd).getDay(); headDays.push({dd,dow,
    today:(y===TODAY.getFullYear()&&m===TODAY.getMonth()+1&&dd===TODAY.getDate())}); }
  const rows=list.map(d=>{
    const rec=S.attMonth[d.id]; const days=rec&&rec.days?rec.days:{};
    const canEdit = editable && S.connected;
    let cs="";
    for(const h of headDays){
      const dcell=new Date(y,m-1,h.dd); const inTen=isActiveOnDate(d,dcell);
      const info=dayInfo(d,y,m,h.dd,days);
      let mk="";
      if(info){ if(info.holiday){ mk=`<span class="mm hol" title="${esc(info.name)}">휴</span>`; }
        else { const ty=typeInfo(info.type); mk=`<span class="mm ${ty.cls}${info.auto?" auto":""}">${esc(ty.tk==="O"?"ㅇ":(ty.tk.length>2?ty.tk.slice(0,2):ty.tk))}</span>`; } }
      const wk=h.dow===0||h.dow===6; const cellEdit=canEdit&&inTen;
      cs+=`<td class="mc${wk?" wke":""}${h.today?" tdy":""}${!inTen?" inact":""}" ${cellEdit?`data-mday="${h.dd}" data-mdev="${d.id}"`:""}>${mk}</td>`;
    }
    const u=monthLeave(d,y,m).v||0;
    return `<tr><th class="rh"><div class="rn">${esc(d.name)}</div><div class="rr">${esc(d.role)} · ${esc(d.company||"-")}</div></th>${cs}<td class="mtot mono">${u%1?u.toFixed(1):u}</td></tr>`;
  }).join("");
  return `
  <div class="panel">
    <div class="panel-hd">
      <div class="caltop">
        <div class="mnav big">
          <button data-mnav="-1" aria-label="이전 달">‹</button>
          <span class="mlab">${y}.${String(m).padStart(2,"0")}</span>
          <button data-mnav="1" aria-label="다음 달">›</button>
        </div>
        <h2 style="margin:0 4px">월 근태 종합</h2>
        <div class="seg" data-role="mscope">
          <button data-mscope="current" class="${S.monthScope!=="all"?"on":""}">상주중</button>
          <button data-mscope="all" class="${S.monthScope==="all"?"on":""}">해당월 전체</button>
        </div>
        ${locked?`<span class="lockpill locked">🔒 마감된 월${S.admin?" · 수정가능":""}</span>`:`<span class="lockpill openm">✎ 등록 가능</span>`}
        ${S.admin?`<button class="btn" data-holiday="1" style="margin-left:auto">📅 공휴일 관리</button>`:""}
      </div>
    </div>
    <div class="hm-scroll"><table class="hm mgrid">
      <thead>
        <tr><th class="rh">개발자 (${list.length})</th>${headDays.map(h=>`<th class="md${h.dow===0?" sun":h.dow===6?" sat":""}${h.today?" tdy":""}">${h.dd}</th>`).join("")}<th class="cum-h">연차</th></tr>
        <tr><th class="rh sub"></th>${headDays.map(h=>`<th class="mdw${h.dow===0?" sun":h.dow===6?" sat":""}">${WD[h.dow]}</th>`).join("")}<th class="cum-h sub"></th></tr>
      </thead>
      <tbody>${rows||`<tr><td colspan="${dim+2}" class="empty-state">해당 월 상주 인원이 없습니다.</td></tr>`}</tbody>
    </table></div>
    <div class="panel-bd">
      <p class="footnote" style="margin:0 0 4px">${editable&&S.connected?"칸을 클릭해 해당 인력의 근태를 바로 등록/변경할 수 있어요. 빈 평일은 자동으로 ㅇ(출근), 미투입 기간은 빗금으로 표시됩니다.":"마감된 월은 관리자 인증 후 수정할 수 있어요."}</p>
      <div class="legend-br full">${legendHtml()}</div>
    </div>
  </div>`;
}

/* ============================ popover (day register) ============================ */
let POP=null;
function openPop(dayEl, devId, day){
  closePop();
  const dev=S.devs.find(d=>d.id===(devId||S.calDev)); if(!dev)return;
  if(day==null) day=+dayEl.dataset.day;
  const cur=(S.attMonth[dev.id]&&S.attMonth[dev.id].days||{})[String(day)];
  const p=document.createElement("div"); p.className="pop";
  p.innerHTML=`<div class="ph">${esc(dev.name)} · ${S.calYm.replace("-",".")}.${String(day).padStart(2,"0")} 근태 선택</div>
    <div class="pg">
      ${REG_TYPES.map(k=>{const t=typeInfo(k);return `<button class="pt" data-type="${esc(k)}" style="${cur===k?"border-color:var(--accent);background:var(--surface-2)":""}"><span class="tk ${t.cls}">${esc(t.tk==="O"?"ㅇ":t.tk)}</span>${esc(t.label.split("(")[0])}</button>`;}).join("")}
      <button class="pt clr" data-type="__clear">지우기</button>
    </div>`;
  document.body.appendChild(p);
  const r=dayEl.getBoundingClientRect();
  let left=r.left, top=r.bottom+6;
  const pw=216, ph=p.offsetHeight;
  if(left+pw>window.innerWidth-10) left=window.innerWidth-pw-10;
  if(top+ph>window.innerHeight-10) top=r.top-ph-6;
  p.style.left=Math.max(10,left)+"px"; p.style.top=Math.max(10,top)+"px";
  p.addEventListener("click",async e=>{
    const b=e.target.closest("button.pt"); if(!b)return;
    const t=b.dataset.type; closePop();
    await writeDay(dev,day,t==="__clear"?null:t);
  });
  POP=p;
  setTimeout(()=>document.addEventListener("mousedown",outPop),0);
}
function outPop(e){ if(POP&&!POP.contains(e.target)) closePop(); }
function closePop(){ if(POP){POP.remove();POP=null;document.removeEventListener("mousedown",outPop);} }

/* ============================ admin modal ============================ */
function openAdmin(){
  if(S.admin){ S.admin=false; render(); return; }
  const bg=document.createElement("div"); bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <h3>관리자 인증</h3>
    <p>마감된 과거 월의 근태를 수정·삭제하려면 관리자 PIN을 입력하세요. 세션 동안만 유지되며 새로고침하면 해제됩니다.</p>
    <input type="password" inputmode="numeric" id="pinInput" maxlength="8" placeholder="••••" autocomplete="off">
    <div class="err" id="pinErr"></div>
    <div class="mrow">
      <button class="btn" data-act="cancel">취소</button>
      <button class="btn primary" data-act="ok">인증</button>
    </div>
    <p class="footnote" style="margin-top:14px">관리자 PIN은 아티팩트 데이터에 저장되어 있으며, 인증 후 <b>PIN 변경</b>도 가능합니다.</p>
  </div>`;
  document.body.appendChild(bg);
  const input=bg.querySelector("#pinInput"); input.focus();
  const submit=()=>{
    if(input.value===String(S.meta.pin)){ S.admin=true; bg.remove(); render(); }
    else { bg.querySelector("#pinErr").textContent="PIN이 일치하지 않습니다."; input.value=""; input.focus(); }
  };
  bg.addEventListener("click",e=>{
    if(e.target===bg){bg.remove();return;}
    const a=e.target.closest("button"); if(!a)return;
    if(a.dataset.act==="cancel")bg.remove(); else if(a.dataset.act==="ok")submit();
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter")submit();});
}
function openChangePin(){
  const bg=document.createElement("div"); bg.className="modal-bg";
  bg.innerHTML=`<div class="modal">
    <h3>관리자 PIN 변경</h3>
    <p>새 PIN을 입력하세요. 4자리 이상 숫자를 권장합니다. 변경 즉시 아티팩트 데이터에 저장되어 모든 사용자에게 적용됩니다.</p>
    <input type="password" inputmode="numeric" id="npin" maxlength="8" placeholder="새 PIN" autocomplete="off">
    <div class="err" id="npErr"></div>
    <div class="mrow">
      <button class="btn" data-act="cancel">취소</button>
      <button class="btn primary" data-act="ok">저장</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const input=bg.querySelector("#npin"); input.focus();
  const save=async()=>{
    const v=input.value.trim();
    if(v.length<4){ bg.querySelector("#npErr").textContent="4자리 이상 입력하세요."; return; }
    try{ if(S.db) await S.db.doc("meta/config").set({pin:v}); S.meta.pin=v; bg.remove(); }
    catch(e){ bg.querySelector("#npErr").textContent="저장 실패: "+(e&&e.message||e); }
  };
  bg.addEventListener("click",e=>{
    if(e.target===bg){bg.remove();return;}
    const a=e.target.closest("button"); if(!a)return;
    if(a.dataset.act==="cancel")bg.remove(); else if(a.dataset.act==="ok")save();
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter")save();});
}

/* ============================ holiday manager ============================ */
function openHolidayMgr(){
  const render=()=>{
    const ds=Object.keys(S.holidays).sort();
    return `<div class="modal wide">
      <h3>공휴일 관리</h3>
      <p>등록한 공휴일은 <b>마스터에 저장되어 모든 개발자 달력에 공통</b>으로 표시되고, 해당일은 자동 출근(ㅇ) 표기에서 제외됩니다.</p>
      <div class="fgrid" style="grid-template-columns:150px 1fr auto;align-items:end">
        <div class="fld"><label>날짜</label><input id="h_date" type="date" class="mono" value="${CUR_YM}-01"></div>
        <div class="fld"><label>공휴일명</label><input id="h_name" placeholder="예: 추석연휴"></div>
        <button class="btn primary" data-hadd="1" style="padding:9px 14px">추가</button>
      </div>
      <div class="err" id="h_err"></div>
      <div class="hol-list">
        ${ds.length?ds.map(d=>`<div class="hol-row"><span class="mono">${esc(d)}</span><span class="hn">${esc(S.holidays[d])}</span><button class="ic-btn danger" data-hdel="${esc(d)}">🗑</button></div>`).join(""):'<div class="muted" style="padding:12px">등록된 공휴일이 없습니다.</div>'}
      </div>
      <div class="mrow"><button class="btn" data-act="close">닫기</button></div>
    </div>`;
  };
  const bg=document.createElement("div"); bg.className="modal-bg";
  bg.innerHTML=render(); document.body.appendChild(bg);
  const redraw=()=>{ bg.innerHTML=render(); };
  const save=async(obj)=>{ try{ if(S.db) await S.db.doc("meta/holidays").set({dates:obj}); S.holidays=obj; }catch(e){ const el2=bg.querySelector("#h_err"); if(el2)el2.textContent="저장 실패: "+(e&&e.message||e);} };
  bg.addEventListener("click",async e=>{
    if(e.target===bg){bg.remove();return;}
    const a=e.target.closest("button"); if(!a)return;
    if(a.dataset.act==="close"){bg.remove();return;}
    if(a.dataset.hadd!=null){ const dt=bg.querySelector("#h_date").value; const nm=bg.querySelector("#h_name").value.trim();
      if(!dt||!nm){bg.querySelector("#h_err").textContent="날짜와 이름을 입력하세요.";return;}
      await save({...S.holidays,[dt]:nm}); redraw(); return; }
    if(a.dataset.hdel){ const o={...S.holidays}; delete o[a.dataset.hdel]; await save(o); redraw(); return; }
  });
}

/* ============================ developer add/edit/delete ============================ */
function selField(id,label,opts,cur){
  cur=cur||""; const has=opts.includes(cur); const custom=(!has&&cur!=="");
  return `<div class="fld"><label>${esc(label)}</label>
    <select id="${id}" data-selcustom>
      <option value=""${cur===""?" selected":""}>선택…</option>
      ${opts.map(o=>`<option value="${esc(o)}"${o===cur?" selected":""}>${esc(o)}</option>`).join("")}
      <option value="__c"${custom?" selected":""}>+ 직접 입력</option>
    </select>
    <input id="${id}_c" class="cinp" placeholder="직접 입력" value="${custom?esc(cur):""}" ${custom?"":"hidden"}></div>`;
}
function selVal(bg,id){const s=bg.querySelector("#"+id);return s.value==="__c"?bg.querySelector("#"+id+"_c").value.trim():s.value;}
function openDevForm(devId){
  const d = devId? S.devs.find(x=>x.id===devId) : null;
  const roles=[...new Set(S.devs.map(x=>x.role))].filter(Boolean);
  const cos=[...new Set(S.devs.map(x=>x.company))].filter(Boolean);
  const f=(v)=>esc(v||"");
  const bg=document.createElement("div"); bg.className="modal-bg";
  bg.innerHTML=`<div class="modal wide">
    <h3>${d?"개발자 수정":"개발자 추가"}</h3>
    <div class="fgrid">
      <div class="fld"><label>성명 *</label><input id="f_name" value="${f(d&&d.name)}"></div>
      <div class="fld"><label>직함</label><input id="f_title" value="${f(d&&d.title)}" placeholder="예: 부장"></div>
      ${selField("f_role","역할",roles,d&&d.role)}
      ${selField("f_company","소속(협력사)",cos,d&&d.company)}
      <div class="fld"><label>휴대폰</label><input id="f_phone" class="mono" value="${f(d&&d.phone)}" placeholder="010-0000-0000"></div>
      <div class="fld"><label>회사 이메일</label><input id="f_email" value="${f(d&&d.email)}" placeholder="id@bkrpartner.co.kr"></div>
      <div class="fld"><label>개인 이메일 (Gmail)</label><input id="f_pemail" value="${f(d&&d.personalEmail)}" placeholder="id@gmail.com"></div>
      <div class="fld"><label>대체자</label><input id="f_sub" value="${f(d&&d.sub)}"></div>
      <div class="fld"><label>상주 시작일</label><input id="f_start" class="mono" value="${f(d&&d.start)}" placeholder="2026-01-01"></div>
      <div class="fld"><label>상주 종료일 (철수/퇴사 시)</label><input id="f_end" class="mono" value="${f(d&&d.end)}" placeholder="비우면 상주중"></div>
      <div class="fld full"><label>비고</label><input id="f_note" value="${f(d&&d.note)}" placeholder="예: 프로젝트명, 퇴사 등"></div>
    </div>
    <div class="err" id="f_err"></div>
    <div class="mrow">
      ${d?`<button class="btn del" data-act="del">삭제</button>`:""}
      <button class="btn" data-act="cancel">취소</button>
      <button class="btn primary" data-act="ok">${d?"저장":"추가"}</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  bg.querySelector("#f_name").focus();
  const val=(id)=>bg.querySelector(id).value.trim();
  const save=async()=>{
    const name=val("#f_name"); if(!name){ bg.querySelector("#f_err").textContent="성명을 입력하세요."; return; }
    const start=val("#f_start"), end=val("#f_end");
    const dur=durText(start,end);
    const rec={ id: d?d.id : ("n"+Date.now().toString(36)),
      order: d?d.order : (Math.max(0,...S.devs.map(x=>x.order||0))+1),
      div: d?(d.div||""):"", name, title:val("#f_title"), role:selVal(bg,"f_role"),
      company:selVal(bg,"f_company"), phone:val("#f_phone"), email:val("#f_email"),
      personalEmail:val("#f_pemail"), sub:val("#f_sub"), start, end, dur,
      note:val("#f_note"), active: end?false:true,
      monthly: d?(d.monthly||{}):{} };
    try{ if(S.db) await S.db.doc("developers/"+rec.id).set(rec); bg.remove(); }
    catch(e){ bg.querySelector("#f_err").textContent="저장 실패: "+(e&&e.message||e); }
  };
  const del=async()=>{
    if(!d) return;
    if(!confirm(`'${d.name}' 개발자를 명단에서 삭제할까요?\n(등록된 근태 기록은 남아 있으며, 명단에서만 제거됩니다.)`)) return;
    try{ if(S.db) await S.db.doc("developers/"+d.id).delete(); bg.remove(); }
    catch(e){ bg.querySelector("#f_err").textContent="삭제 실패: "+(e&&e.message||e); }
  };
  bg.addEventListener("click",e=>{
    if(e.target===bg){bg.remove();return;}
    const a=e.target.closest("button"); if(!a)return;
    if(a.dataset.act==="cancel")bg.remove();
    else if(a.dataset.act==="ok")save();
    else if(a.dataset.act==="del")del();
  });
}
function durText(start,end){
  const s=pd(start); if(!s) return "";
  const e=pd(end)||TODAY;
  let mo=(e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth());
  if(e.getDate()<s.getDate()) mo--;
  if(mo<0) mo=0;
  const y=Math.floor(mo/12), mm=mo%12;
  return (y?y+"년 ":"")+(mm?mm+"개월":(y?"":"0개월"));
}

/* ============================ events ============================ */
document.addEventListener("click",e=>{
  const tab=e.target.closest(".tab"); if(tab){ S.view=tab.dataset.tab; closePop(); render(); return; }
  if(e.target.closest("#adminBtn")){ openAdmin(); return; }
  if(e.target.closest("#pinBtn")){ openChangePin(); return; }
  if(e.target.closest("[data-holiday]")){ openHolidayMgr(); return; }
  if(e.target.closest("#themeBtn")){ toggleTheme(); return; }
  const scope=e.target.closest("[data-scope]"); if(scope){ S.rosterScope=scope.dataset.scope; render(); return; }
  const hs=e.target.closest("[data-hmscope]"); if(hs){ S.hmScope=hs.dataset.hmscope; render(); return; }
  const ms=e.target.closest("[data-mscope]"); if(ms){ S.monthScope=ms.dataset.mscope; render(); return; }
  if(e.target.closest("[data-adddev]")){ openDevForm(null); return; }
  const ed=e.target.closest("[data-editdev]"); if(ed){ openDevForm(ed.dataset.editdev); return; }
  const de=e.target.closest("[data-deldev]"); if(de){ openDevForm(de.dataset.deldev); return; }
  const hc=e.target.closest("[data-hmcell]"); if(hc){ S.calDev=hc.dataset.hmcell; S.calYm=hc.dataset.hmym; S.view="calendar"; closePop(); subMonth(); render(); return; }
  const mn=e.target.closest("[data-mnav]"); if(mn){ moveMonth(+mn.dataset.mnav); return; }
  const mcell=e.target.closest(".mc[data-mday]"); if(mcell){ openPop(mcell, mcell.dataset.mdev, +mcell.dataset.mday); return; }
  const day=e.target.closest(".day.clk[data-day]"); if(day){ openPop(day); return; }
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.hasAttribute&&t.hasAttribute("data-selcustom")){ const c=t.parentElement.querySelector(".cinp"); if(c){c.hidden=(t.value!=="__c"); if(t.value==="__c")c.focus();} return; }
  if(t.id==="yearSel"){ S.year=+t.value; subYear(); render(); return; }
  if(t.dataset.role==="divfilter"){ S.filterDiv=t.value; render(); return; }
  if(t.dataset.role==="hmdiv"){ S.hmDiv=t.value; render(); return; }
  if(t.dataset.role==="caldev"){ S.calDev=t.value; render(); return; }
});
document.addEventListener("input",e=>{
  if(e.target.dataset.role==="search"){ S.search=e.target.value; const pos=e.target.selectionStart; render();
    const ni=el("view").querySelector('[data-role="search"]'); if(ni){ni.focus(); try{ni.setSelectionRange(pos,pos);}catch(_){}}}
});
window.addEventListener("resize",closePop);
function moveMonth(delta){
  let [y,m]=ymParts(S.calYm); m+=delta; if(m<1){m=12;y--;} if(m>12){m=1;y++;}
  if(y<2024){y=2024;m=1;} if(y>2027){y=2027;m=12;}
  S.calYm=y+"-"+String(m).padStart(2,"0"); closePop(); subMonth(); render();
}
function toggleTheme(){
  const r=document.documentElement;
  const cur=r.getAttribute("data-theme");
  const sysDark=matchMedia("(prefers-color-scheme:dark)").matches;
  const now = cur? cur : (sysDark?"dark":"light");
  r.setAttribute("data-theme", now==="dark"?"light":"dark");
}



/* ============================ boot (called by main.js after gate) ============================ */
window.__bootApp = function(){
  const ys=el("yearSel"); ys.innerHTML=YEARS.map(y=>`<option value="${y}"${y===S.year?" selected":""}>${y}년</option>`).join("");
  render();
  if(window.claude&&claude.use) initDb();
  else { S.db=null; setConn("off","오프라인"); render(); }
};
