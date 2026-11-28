/* =========================================
   일정 달력 – 움직임(기능) 파일
   만든 사람: 404 Lexia

   이 파일이 하는 일
   1. 배경 색 고르기
   2. 달력 그리기 (이전 달 / 다음 달, 날짜 누르기)
   3. 그날 일정 보여주기 + 완료 체크
   4. 포인트 계산 (1개 완료 = 1.5점, 3일 연속 = +6점)
   5. 일정 추가 / 고치기 창 (제목, 시간, 한 번 / 정규)
   6. 저장하기 (브라우저에 기억해서 새로고침해도 남아 있어요)
   ========================================= */


/* ---------- 0. 정해진 값들 ---------- */

// 배경 색 9가지 (진한 색, 연한 색, 버튼 색)
const COLORS = [
  { id: 'red',    name: '빨강', dark: '#E53935', light: '#FFCDD2', button: '#C62828' },
  { id: 'orange', name: '주황', dark: '#FB8C00', light: '#FFE0B2', button: '#E65100' },
  { id: 'yellow', name: '노랑', dark: '#FDD835', light: '#FFF9C4', button: '#8D6E00' },
  { id: 'green',  name: '초록', dark: '#43A047', light: '#C8E6C9', button: '#2E7D32' },
  { id: 'blue',   name: '파랑', dark: '#1E88E5', light: '#BBDEFB', button: '#1565C0' },
  { id: 'navy',   name: '남색', dark: '#283593', light: '#C5CAE9', button: '#283593' },
  { id: 'purple', name: '보라', dark: '#8E24AA', light: '#E1BEE7', button: '#7B1FA2' },
  { id: 'pink',   name: '핑크', dark: '#EC407A', light: '#F8BBD0', button: '#C2185B' },
  { id: 'brown',  name: '갈색', dark: '#795548', light: '#D7CCC8', button: '#5D4037' }
];

// 진한 바탕인데 제목 글씨를 검게 해야 잘 보이는 색
const DARK_TEXT_COLORS = ['orange', 'yellow'];

const POINT_PER_DONE = 1.5;   // 일정 1개 완료하면 받는 점수
const STREAK_DAYS = 3;        // 며칠 연속이면 보너스?
const STREAK_BONUS = 6;       // 연속 보너스 점수

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SAVE_NAME = '일정달력-404Lexia';  // 브라우저에 저장할 때 쓰는 이름


/* ---------- 1. 데이터 저장하는 곳 ---------- */
//
// 저장하는 곳은 두 가지예요.
//   (가) 서버가 켜져 있으면 → 서버(백엔드)에 저장해요.  (server.js)
//   (나) 서버가 없으면     → 이 브라우저 안에 저장해요. (localStorage)
//
// data 안에 앱의 모든 정보가 들어 있어요
//   theme     : 고른 배경 색 (예: 'red' 또는 'red-light')
//   schedules : 일정 목록
//   done      : 완료한 일정 { '2026-11-27|일정번호': true }

let data = { theme: 'red', schedules: [], done: {} };
let useServer = false;   // 서버랑 연결됐나요?

// 처음에 데이터 불러오기
async function loadData() {
  // (가) 서버에 물어보기
  try {
    const response = await fetch('/api/data');
    if (response.ok && (response.headers.get('Content-Type') || '').indexOf('json') >= 0) {
      useServer = true;
      return await response.json();
    }
  } catch (e) {
    // 서버가 없어요 → (나)로
  }
  // (나) 브라우저에서 꺼내기
  try {
    const text = localStorage.getItem(SAVE_NAME);
    if (text) return JSON.parse(text);
  } catch (e) {
    // 꺼내기에 실패하면 새로 시작해요
  }
  return { theme: 'red', schedules: [], done: {} };
}

// 브라우저에 저장하기 (서버가 없을 때만 써요)
function saveLocal() {
  try {
    localStorage.setItem(SAVE_NAME, JSON.stringify(data));
  } catch (e) {
    // 저장이 안 되는 브라우저에서는 그냥 넘어가요
  }
}

// 서버에 보내기. 서버가 "안 돼요"라고 하면 그 이유를 알려 줘요.
async function sendToServer(method, address, body) {
  const response = await fetch(address, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const answer = await response.json();
  if (!response.ok) {
    throw new Error(answer.error || '서버에 저장하지 못했어요.');
  }
  return answer;
}

// 배경 색 저장
async function storeTheme(theme) {
  if (useServer) await sendToServer('PUT', '/api/theme', { theme: theme });
  data.theme = theme;
  if (!useServer) saveLocal();
}

// 완료 체크 저장
async function storeDone(date, id, done) {
  if (useServer) await sendToServer('POST', '/api/done', { date: date, id: id, done: done });
  const doneKey = date + '|' + id;
  if (done) {
    data.done[doneKey] = true;
  } else {
    delete data.done[doneKey];
  }
  if (!useServer) saveLocal();
}

// 새 일정 저장
async function storeSchedule(schedule) {
  if (useServer) {
    const saved = await sendToServer('POST', '/api/schedules', schedule);
    data.schedules.push(saved);
  } else {
    schedule.id = 's' + Date.now();
    data.schedules.push(schedule);
    saveLocal();
  }
}

// 고친 일정 저장
async function storeScheduleChange(id, changes) {
  let saved;
  if (useServer) {
    saved = await sendToServer('PUT', '/api/schedules/' + encodeURIComponent(id), changes);
  } else {
    saved = Object.assign({ id: id }, changes);
  }
  // 목록에서 옛날 일정을 새 일정으로 바꿔치기
  data.schedules = data.schedules.map(function (s) { return s.id === id ? saved : s; });
  // 빠진 날짜의 완료 체크는 지워요
  Object.keys(data.done).forEach(function (doneKey) {
    const parts = doneKey.split('|');
    if (parts[1] === id && saved.dates.indexOf(parts[0]) < 0) delete data.done[doneKey];
  });
  if (!useServer) saveLocal();
}

// 일정 지우기
async function storeScheduleDelete(id) {
  if (useServer) await sendToServer('DELETE', '/api/schedules/' + encodeURIComponent(id), {});
  data.schedules = data.schedules.filter(function (s) { return s.id !== id; });
  // 이 일정의 완료 체크도 모두 지워요
  Object.keys(data.done).forEach(function (doneKey) {
    if (doneKey.split('|')[1] === id) delete data.done[doneKey];
  });
  if (!useServer) saveLocal();
}

// 문제가 생겼을 때 잠깐 보여주는 알림
function showProblem(message) {
  const box = document.getElementById('알림');
  box.textContent = message;
  box.classList.remove('숨김');
  clearTimeout(showProblem.timer);
  showProblem.timer = setTimeout(function () { box.classList.add('숨김'); }, 3000);
}


/* ---------- 2. 날짜 도우미 ---------- */

// 숫자를 두 자리로: 5 → "05"
function twoDigits(n) {
  return String(n).padStart(2, '0');
}

// 날짜 이름표 만들기: (2026, 10, 27) → "2026-11-27"  (달은 0부터 세요!)
function makeKey(year, month, day) {
  return year + '-' + twoDigits(month + 1) + '-' + twoDigits(day);
}

// 날짜 이름표를 다시 숫자로: "2026-11-27" → { year: 2026, month: 10, day: 27 }
function readKey(key) {
  const parts = key.split('-');
  return { year: Number(parts[0]), month: Number(parts[1]) - 1, day: Number(parts[2]) };
}

// "2026-11-27" → "11월 27일 (금)"
function prettyDate(key) {
  const d = readKey(key);
  const weekday = new Date(d.year, d.month, d.day).getDay();
  return (d.month + 1) + '월 ' + d.day + '일 (' + WEEKDAYS[weekday] + ')';
}

const now = new Date();
const TODAY = makeKey(now.getFullYear(), now.getMonth(), now.getDate());

// 지금 달력에 보이는 달, 그리고 내가 누른 날짜
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let selectedKey = TODAY;


/* ---------- 3. 일정 도우미 ---------- */

// 어떤 날짜의 일정들 (시작 시간 순서로)
function schedulesOn(key) {
  return data.schedules
    .filter(function (s) { return s.dates.indexOf(key) >= 0; })
    .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
}

function isDone(key, id) {
  return data.done[key + '|' + id] === true;
}

// 그날 일정을 "전부" 끝냈나요?
function allDoneOn(key) {
  const list = schedulesOn(key);
  if (list.length === 0) return false;
  return list.every(function (s) { return isDone(key, s.id); });
}

// 일정이 하나라도 있는 날짜들 (오늘까지만, 날짜 순서로)
function daysWithSchedules() {
  const keys = [];
  data.schedules.forEach(function (s) {
    s.dates.forEach(function (k) {
      if (k <= TODAY && keys.indexOf(k) < 0) keys.push(k);
    });
  });
  return keys.sort();
}


/* ---------- 4. 포인트 계산 ---------- */

// 일정이 있는 날만 세요. 일정이 없는 날은 연속 기록을 끊지 않아요.
function calcPoints() {
  // (1) 완료한 일정 1개마다 1.5점
  let doneCount = 0;
  data.schedules.forEach(function (s) {
    s.dates.forEach(function (k) {
      if (isDone(k, s.id)) doneCount++;
    });
  });
  let points = doneCount * POINT_PER_DONE;

  // (2) 전부 끝낸 날이 3일 연속될 때마다 +6점
  let streak = 0;
  daysWithSchedules().forEach(function (k) {
    if (allDoneOn(k)) {
      streak++;
      if (streak % STREAK_DAYS === 0) points += STREAK_BONUS;
    } else if (k !== TODAY) {
      streak = 0;   // 지난 날을 다 못 끝냈으면 연속이 끊겨요
    }
  });
  return points;
}

// 지금 몇 일 연속 중인지 (오늘은 아직 하는 중이면 빼고 세요)
function currentStreak() {
  const keys = daysWithSchedules().reverse();
  let count = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (allDoneOn(k)) {
      count++;
    } else if (k === TODAY) {
      continue;
    } else {
      break;
    }
  }
  return count;
}


/* ---------- 5. 화면 그리기 ---------- */

// 글자 안에 < > 같은 기호가 있어도 안전하게 보여주기
function safeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 고른 색 정보 찾기
function currentTheme() {
  const isLight = data.theme.endsWith('-light');
  const id = data.theme.replace('-light', '');
  const color = COLORS.find(function (c) { return c.id === id; }) || COLORS[0];
  return { color: color, isLight: isLight };
}

// 5-1. 배경 색 바꾸기
function drawTheme() {
  const t = currentTheme();
  const root = document.documentElement.style;
  root.setProperty('--배경색', t.isLight ? t.color.light : t.color.dark);
  root.setProperty('--진한색', t.color.button);
  const darkText = t.isLight || DARK_TEXT_COLORS.indexOf(t.color.id) >= 0;
  root.setProperty('--제목글씨색', darkText ? '#222222' : '#FFFFFF');
  document.getElementById('색이름').textContent = (t.isLight ? '연한 ' : '') + t.color.name;
  // 휴대폰 맨 위 상태바 색도 같이 바꾸기
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t.isLight ? t.color.light : t.color.dark);
}

// 5-2. 색 동그라미 18개
function drawSwatches() {
  let darkHtml = '';
  let lightHtml = '';
  COLORS.forEach(function (c) {
    const darkOn = data.theme === c.id ? ' 선택' : '';
    const lightOn = data.theme === c.id + '-light' ? ' 선택' : '';
    darkHtml += '<button class="동그라미' + darkOn + '" data-theme="' + c.id + '" style="background:' + c.dark + '" aria-label="' + c.name + '"></button>';
    lightHtml += '<button class="동그라미' + lightOn + '" data-theme="' + c.id + '-light" style="background:' + c.light + '" aria-label="연한 ' + c.name + '"></button>';
  });
  document.getElementById('진한색들').innerHTML = darkHtml;
  document.getElementById('연한색들').innerHTML = lightHtml;
}

// 5-3. 큰 달력
function drawCalendar() {
  document.getElementById('달제목').textContent = viewYear + '년 ' + (viewMonth + 1) + '월';

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();     // 1일이 무슨 요일?
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();     // 이 달은 며칠까지?

  let html = '';
  // 1일 앞의 빈칸
  for (let i = 0; i < firstWeekday; i++) {
    html += '<span class="빈칸"></span>';
  }
  // 날짜 버튼
  for (let day = 1; day <= lastDay; day++) {
    const key = makeKey(viewYear, viewMonth, day);
    const weekday = (firstWeekday + day - 1) % 7;
    let cls = '날짜';
    if (weekday === 0) cls += ' 일요일';
    if (weekday === 6) cls += ' 토요일';
    if (schedulesOn(key).length > 0) cls += ' 일정있음';
    if (key === TODAY) cls += ' 오늘';
    if (key === selectedKey) cls += ' 고른날';
    html += '<button class="' + cls + '" data-key="' + key + '" aria-label="' + prettyDate(key) + '">' + day + '</button>';
  }
  document.getElementById('날짜들').innerHTML = html;
}

// 5-4. 고른 날짜의 일정 목록
function drawList() {
  const list = schedulesOn(selectedKey);
  const isFuture = selectedKey > TODAY;

  document.getElementById('목록제목').textContent = prettyDate(selectedKey);

  let doneCount = 0;
  let html = '';
  list.forEach(function (s) {
    const done = isDone(selectedKey, s.id);
    if (done) doneCount++;
    html +=
      '<div class="일정' + (done ? ' 완료' : '') + '">' +
        '<button class="체크" data-id="' + s.id + '"' + (isFuture ? ' disabled' : '') +
          ' aria-label="' + safeText(s.title) + (done ? ' 완료 취소' : ' 완료하기') + '">' + (done ? '✓' : '') + '</button>' +
        '<div class="일정내용">' +
          '<span class="일정제목">' + safeText(s.title) + '</span>' +
          '<span class="시간">' + s.start + ' ~ ' + s.end + '</span>' +
        '</div>' +
        (s.regular ? '<span class="꼬리표 정규">정규</span>' : '<span class="꼬리표 한번">한 번</span>') +
        '<button class="고치기" data-edit="' + s.id + '" aria-label="' + safeText(s.title) + ' 고치기">✏️</button>' +
      '</div>';
  });

  if (list.length === 0) {
    html = '<p class="없음">이 날은 일정이 없어요.<br>아래 버튼으로 추가해 보세요!</p>';
  } else if (isFuture) {
    html += '<p class="없음">아직 오지 않은 날이라 체크할 수 없어요.</p>';
  }

  document.getElementById('일정목록').innerHTML = html;
  document.getElementById('완료수').textContent = doneCount + ' / ' + list.length + ' 완료';
}

// 5-5. 포인트와 연속 보너스 안내
function drawPoints() {
  const points = calcPoints();
  document.getElementById('포인트').textContent = Number.isInteger(points) ? points : points.toFixed(1);

  const streak = currentStreak();
  const todayDone = allDoneOn(TODAY);
  let message;
  if (todayDone) {
    if (streak % STREAK_DAYS === 0) {
      message = '🎉 ' + streak + '일 연속 다 끝냈어요! 보너스 +' + STREAK_BONUS + '점!';
    } else {
      const left = STREAK_DAYS - (streak % STREAK_DAYS);
      message = '🔥 ' + streak + '일 연속! ' + left + '일 더 하면 +' + STREAK_BONUS + '점';
    }
  } else if (streak > 0) {
    const next = streak + 1;
    message = '🔥 ' + streak + '일 연속 성공 중! 오늘 다 끝내면 ' + next + '일째' +
      (next % STREAK_DAYS === 0 ? ' → +' + STREAK_BONUS + '점!' : '');
  } else {
    message = '🔥 오늘 일정을 다 끝내면 연속 기록이 시작돼요!';
  }
  document.getElementById('보너스글').textContent = message;
}

// 전부 다시 그리기
function drawAll() {
  drawTheme();
  drawSwatches();
  drawCalendar();
  drawList();
  drawPoints();
}


/* ---------- 6. 눌렀을 때 하는 일 ---------- */

// 색 동그라미 누르기
async function onSwatchClick(event) {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  try {
    await storeTheme(button.dataset.theme);
    drawAll();
  } catch (e) {
    showProblem(e.message);
  }
}
document.getElementById('진한색들').addEventListener('click', onSwatchClick);
document.getElementById('연한색들').addEventListener('click', onSwatchClick);

// 이전 달 / 다음 달
document.getElementById('이전달').addEventListener('click', function () {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  drawCalendar();
});
document.getElementById('다음달').addEventListener('click', function () {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  drawCalendar();
});

// 달력 날짜 누르기
document.getElementById('날짜들').addEventListener('click', function (event) {
  const button = event.target.closest('[data-key]');
  if (!button) return;
  selectedKey = button.dataset.key;
  drawCalendar();
  drawList();
});

// 완료 체크 누르기
document.getElementById('일정목록').addEventListener('click', async function (event) {
  // ✏️ 고치기 버튼을 눌렀으면 → 고치는 창 열기
  const editButton = event.target.closest('[data-edit]');
  if (editButton) {
    const schedule = data.schedules.find(function (s) { return s.id === editButton.dataset.edit; });
    if (schedule) openSheet(schedule);
    return;
  }

  // 체크 네모를 눌렀으면 → 완료 체크
  const button = event.target.closest('.체크');
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const nowDone = !isDone(selectedKey, id);   // 체크 ↔ 체크 취소
  button.disabled = true;                     // 저장하는 동안 두 번 못 누르게
  try {
    await storeDone(selectedKey, id, nowDone);
  } catch (e) {
    showProblem(e.message);
  }
  drawList();
  drawPoints();
});


/* ---------- 7. 일정 추가 / 고치기 창 ---------- */
// 같은 창을 두 가지로 써요.
//   새 일정 추가 : editingId 가 null
//   일정 고치기  : editingId 에 고치는 일정의 번호

const sheet = document.getElementById('추가판');
const titleInput = document.getElementById('제목칸');
const startInput = document.getElementById('시작칸');
const endInput = document.getElementById('끝칸');
const onceButton = document.getElementById('한번버튼');
const regularButton = document.getElementById('정규버튼');
const miniCalendar = document.getElementById('작은달력');
const errorText = document.getElementById('안내글');

// 창 안에서 고르고 있는 값
let editingId = null;      // 고치는 중인 일정 번호 (새 일정이면 null)
let formRegular = false;   // 정규인가요?
let formDates = [];        // 정규일 때 고른 날짜들
let formOnceDate = '';     // 한 번일 때의 날짜

// schedule 을 주면 "고치기", 안 주면 "새 일정 추가"
function openSheet(schedule) {
  editingId = schedule ? schedule.id : null;

  if (schedule) {
    // 원래 내용을 칸에 채워 넣기
    titleInput.value = schedule.title;
    startInput.value = schedule.start;
    endInput.value = schedule.end;
    formRegular = schedule.regular;
    formDates = schedule.dates.slice();
    formOnceDate = schedule.regular ? selectedKey : schedule.dates[0];
  } else {
    titleInput.value = '';
    startInput.value = '15:00';
    endInput.value = '16:00';
    formRegular = false;
    formDates = [selectedKey];     // 지금 고른 날짜를 미리 골라 둬요
    formOnceDate = selectedKey;
  }

  // 지우기 버튼: 고칠 때만 보여요. "이 날만 빼기"는 정규 일정일 때만 있어요.
  document.getElementById('지우기칸').classList.toggle('숨김', !schedule);
  document.getElementById('이날지우기').classList.toggle('숨김', !(schedule && schedule.regular));
  resetDeleteButtons();

  document.getElementById('창제목').textContent = schedule ? '일정 고치기' : '새 일정 추가';
  document.getElementById('저장버튼').textContent = schedule ? '고친 내용 저장' : '저장하기';
  const d = readKey(formOnceDate);
  onceButton.textContent = '한 번 (' + (d.month + 1) + '/' + d.day + ')';
  errorText.textContent = '';
  drawForm();
  sheet.classList.remove('숨김');
  titleInput.focus();
}

function closeSheet() {
  sheet.classList.add('숨김');
}

// 창 안의 버튼 모양 + 작은 달력 그리기
function drawForm() {
  onceButton.classList.toggle('선택', !formRegular);
  regularButton.classList.toggle('선택', formRegular);
  miniCalendar.classList.toggle('숨김', !formRegular);

  document.getElementById('작은달제목').textContent = (viewMonth + 1) + '월';
  document.getElementById('선택수').textContent = formDates.length;

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < firstWeekday; i++) {
    html += '<span></span>';
  }
  for (let day = 1; day <= lastDay; day++) {
    const key = makeKey(viewYear, viewMonth, day);
    const on = formDates.indexOf(key) >= 0;
    html += '<button class="작은날짜' + (on ? ' 선택' : '') + '" data-key="' + key + '" aria-pressed="' + on + '">' + day + '</button>';
  }
  document.getElementById('작은날짜들').innerHTML = html;
}

// 저장하기
async function saveSchedule() {
  const title = titleInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;

  // 빠뜨린 게 있는지 확인
  if (title === '') {
    errorText.textContent = '제목을 써 주세요.';
    titleInput.focus();
    return;
  }
  if (start === '' || end === '' || end <= start) {
    errorText.textContent = '끝 시간은 시작 시간보다 늦어야 해요.';
    return;
  }
  if (formRegular && formDates.length === 0) {
    errorText.textContent = '반복할 날짜를 하나 이상 골라 주세요.';
    return;
  }

  const schedule = {
    title: title,
    start: start,
    end: end,
    regular: formRegular,
    dates: formRegular ? formDates.slice().sort() : [formOnceDate]
  };

  // 저장하기 (새 일정 → 추가, 고치는 중 → 바꾸기)
  const saveButton = document.getElementById('저장버튼');
  saveButton.disabled = true;
  try {
    if (editingId) {
      await storeScheduleChange(editingId, schedule);
    } else {
      await storeSchedule(schedule);
    }
    closeSheet();
    drawAll();
  } catch (e) {
    errorText.textContent = e.message;   // 서버가 알려 준 이유
  }
  saveButton.disabled = false;
}

// ----- 지우기 -----
// 실수로 지우지 않게, 처음 누르면 "정말요?" 하고 한 번 더 눌러야 지워져요.
let askingDelete = null;   // 지금 물어보는 중인 버튼 ('day' 또는 'all')

function resetDeleteButtons() {
  askingDelete = null;
  const dayButton = document.getElementById('이날지우기');
  const allButton = document.getElementById('전부지우기');
  const d = readKey(selectedKey);
  dayButton.textContent = (d.month + 1) + '/' + d.day + '만 빼기';
  allButton.textContent = dayButton.classList.contains('숨김') ? '일정 지우기' : '반복 일정 전부 지우기';
  dayButton.classList.remove('확인중');
  allButton.classList.remove('확인중');
}

async function onDeleteClick(kind, button) {
  // 처음 누름 → 물어보기
  if (askingDelete !== kind) {
    resetDeleteButtons();
    askingDelete = kind;
    button.classList.add('확인중');
    button.textContent = '정말요? 한 번 더 누르면 지워져요';
    return;
  }

  // 두 번째 누름 → 진짜 지우기
  const schedule = data.schedules.find(function (s) { return s.id === editingId; });
  if (!schedule) return;
  button.disabled = true;
  try {
    const leftDates = schedule.dates.filter(function (k) { return k !== selectedKey; });
    if (kind === 'day' && leftDates.length > 0) {
      // 이 날만 빼고 나머지 날짜는 그대로
      await storeScheduleChange(schedule.id, {
        title: schedule.title,
        start: schedule.start,
        end: schedule.end,
        regular: true,
        dates: leftDates
      });
    } else {
      // 일정 통째로 지우기 (마지막 하루를 빼는 것도 통째로 지우기예요)
      await storeScheduleDelete(schedule.id);
    }
    closeSheet();
    drawAll();
  } catch (e) {
    errorText.textContent = e.message;
  }
  button.disabled = false;
}

document.getElementById('이날지우기').addEventListener('click', function (event) {
  onDeleteClick('day', event.currentTarget);
});
document.getElementById('전부지우기').addEventListener('click', function (event) {
  onDeleteClick('all', event.currentTarget);
});

document.getElementById('추가버튼').addEventListener('click', function () { openSheet(null); });
document.getElementById('닫기버튼').addEventListener('click', closeSheet);
document.getElementById('저장버튼').addEventListener('click', saveSchedule);

// 어두운 바깥 부분을 누르면 닫기
sheet.addEventListener('click', function (event) {
  if (event.target === sheet) closeSheet();
});

// Esc 키로 닫기
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !sheet.classList.contains('숨김')) closeSheet();
});

// 한 번 / 정규 고르기
onceButton.addEventListener('click', function () {
  formRegular = false;
  errorText.textContent = '';
  drawForm();
});
regularButton.addEventListener('click', function () {
  formRegular = true;
  errorText.textContent = '';
  drawForm();
});

// 작은 달력에서 날짜 고르기 (한 번 더 누르면 취소)
document.getElementById('작은날짜들').addEventListener('click', function (event) {
  const button = event.target.closest('[data-key]');
  if (!button) return;
  const key = button.dataset.key;
  const where = formDates.indexOf(key);
  if (where >= 0) {
    formDates.splice(where, 1);
  } else {
    formDates.push(key);
  }
  errorText.textContent = '';
  drawForm();
});

// 글자를 다시 쓰면 안내 글 지우기
[titleInput, startInput, endInput].forEach(function (input) {
  input.addEventListener('input', function () { errorText.textContent = ''; });
});


/* ---------- 8. 시작! ---------- */
loadData().then(function (loaded) {
  data = loaded;
  document.getElementById('저장위치').textContent = useServer ? '☁️ 서버에 저장 중' : '💾 이 브라우저에 저장 중';
  drawAll();
});
