/* =========================================
   일정 달력 – 서버 (백엔드)
   만든 사람: 404 Lexia

   서버가 하는 일
   1. 화면 파일(index.html, style.css, app.js)을 브라우저에 보내 줘요.
   2. 일정, 완료 체크, 배경 색을 data.json 파일에 저장해요.
      → 그래서 브라우저를 바꿔도, 컴퓨터를 껐다 켜도 남아 있어요.

   실행하는 법 (터미널에서 이 폴더로 와서)
     node server.js
   그다음 브라우저에서 http://localhost:3000 을 열어요.

   설치할 것이 없어요! Node.js에 원래 들어 있는 도구만 써요.
   ========================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const APP_FOLDER = path.join(__dirname, '..', '앱');       // 화면 파일이 있는 곳
const DATA_FILE = path.join(__dirname, 'data.json');       // 데이터를 저장하는 파일

// 고를 수 있는 배경 색 이름 (app.js의 COLORS와 같아야 해요)
const COLOR_IDS = ['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple', 'pink', 'brown'];


/* ---------- 1. 데이터 읽기 / 쓰기 ---------- */

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    // 파일이 아직 없으면 빈 데이터로 시작해요
    return { theme: 'red', schedules: [], done: {} };
  }
}

function writeData(data) {
  // 먼저 임시 파일에 쓰고 바꿔치기해요 (쓰다가 꺼져도 파일이 안 깨지게)
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, DATA_FILE);
}


/* ---------- 2. 검사 도우미 ---------- */

// "15:00" 처럼 생겼나요?
function isTime(text) {
  return typeof text === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

// "2026-11-27" 처럼 생겼고 진짜 있는 날짜인가요?
function isDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// 서버 컴퓨터 기준 오늘 날짜 "2026-11-28"
function todayKey() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate());
}


// 일정 내용이 올바른지 검사해요 (추가할 때, 고칠 때 둘 다 써요)
//   괜찮으면 → { schedule: {...} }
//   문제가 있으면 → { error: "이유" }
function checkSchedule(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const regular = body.regular === true;
  const dates = Array.isArray(body.dates) ? body.dates : [];

  if (title === '') return { error: '제목을 써 주세요.' };
  if (title.length > 30) return { error: '제목은 30글자까지만 쓸 수 있어요.' };
  if (!isTime(body.start) || !isTime(body.end) || body.end <= body.start) {
    return { error: '끝 시간은 시작 시간보다 늦어야 해요.' };
  }
  if (dates.length === 0 || !dates.every(isDate)) return { error: '날짜가 올바르지 않아요.' };
  if (!regular && dates.length !== 1) return { error: '한 번 일정은 날짜가 하나여야 해요.' };

  return {
    schedule: {
      title: title,
      start: body.start,
      end: body.end,
      regular: regular,
      dates: Array.from(new Set(dates)).sort()      // 같은 날짜 두 번 → 한 번만
    }
  };
}


/* ---------- 3. 응답 보내기 도우미 ---------- */

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// 잘못된 요청일 때: { error: "이유" }
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

// 브라우저가 보낸 JSON 읽기
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > 100000) {          // 너무 크면 거절
        reject(new Error('too big'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}


/* ---------- 4. API (데이터 주고받는 주소) ---------- */
//
//  GET  /api/data            → 저장된 모든 데이터 보내 주기
//  POST /api/schedules       → 새 일정 추가하기
//  PUT  /api/schedules/번호  → 일정 고치기
//  DELETE /api/schedules/번호 → 일정 지우기
//  POST /api/done            → 완료 체크 / 체크 취소
//  PUT  /api/theme           → 배경 색 바꾸기

async function handleApi(req, res) {
  const url = req.url.split('?')[0];

  // 4-1. 모든 데이터 보내 주기
  if (req.method === 'GET' && url === '/api/data') {
    return sendJson(res, 200, readData());
  }

  // 여기서부터는 브라우저가 보낸 내용을 읽어야 해요
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendError(res, 400, '보낸 내용을 읽을 수 없어요.');
  }

  // 4-2. 새 일정 추가하기
  //   보내는 내용: { title, start, end, regular, dates: ["2026-11-27", ...] }
  if (req.method === 'POST' && url === '/api/schedules') {
    const checked = checkSchedule(body);
    if (checked.error) return sendError(res, 400, checked.error);

    const data = readData();
    const schedule = Object.assign({ id: 's' + Date.now() + Math.floor(Math.random() * 1000) }, checked.schedule);
    data.schedules.push(schedule);
    writeData(data);
    return sendJson(res, 201, schedule);
  }

  // 4-3. 일정 고치기
  //   주소: /api/schedules/일정번호   보내는 내용: 새 일정과 똑같아요
  if (req.method === 'PUT' && url.startsWith('/api/schedules/')) {
    const id = decodeURIComponent(url.slice('/api/schedules/'.length));
    const data = readData();
    const index = data.schedules.findIndex((s) => s.id === id);
    if (index < 0) return sendError(res, 404, '그런 일정이 없어요.');

    const checked = checkSchedule(body);
    if (checked.error) return sendError(res, 400, checked.error);

    const schedule = Object.assign({ id: id }, checked.schedule);
    data.schedules[index] = schedule;

    // 빠진 날짜의 완료 체크는 지워요
    Object.keys(data.done).forEach((doneKey) => {
      const [date, doneId] = doneKey.split('|');
      if (doneId === id && schedule.dates.indexOf(date) < 0) delete data.done[doneKey];
    });

    writeData(data);
    return sendJson(res, 200, schedule);
  }

  // 4-3b. 일정 지우기
  //   주소: /api/schedules/일정번호
  if (req.method === 'DELETE' && url.startsWith('/api/schedules/')) {
    const id = decodeURIComponent(url.slice('/api/schedules/'.length));
    const data = readData();
    if (!data.schedules.some((s) => s.id === id)) return sendError(res, 404, '그런 일정이 없어요.');

    data.schedules = data.schedules.filter((s) => s.id !== id);
    // 이 일정의 완료 체크도 모두 지워요
    Object.keys(data.done).forEach((doneKey) => {
      if (doneKey.split('|')[1] === id) delete data.done[doneKey];
    });

    writeData(data);
    return sendJson(res, 200, { deleted: id });
  }

  // 4-4. 완료 체크 / 체크 취소
  //   보내는 내용: { date: "2026-11-27", id: "s123", done: true }
  if (req.method === 'POST' && url === '/api/done') {
    const data = readData();
    const schedule = data.schedules.find((s) => s.id === body.id);

    if (!schedule) return sendError(res, 404, '그런 일정이 없어요.');
    if (!isDate(body.date) || schedule.dates.indexOf(body.date) < 0) {
      return sendError(res, 400, '그 날짜에는 이 일정이 없어요.');
    }
    if (body.date > todayKey()) {
      return sendError(res, 400, '아직 오지 않은 날은 체크할 수 없어요.');
    }

    const key = body.date + '|' + body.id;
    if (body.done === true) {
      data.done[key] = true;
    } else {
      delete data.done[key];
    }
    writeData(data);
    return sendJson(res, 200, { date: body.date, id: body.id, done: body.done === true });
  }

  // 4-5. 배경 색 바꾸기
  //   보내는 내용: { theme: "red" } 또는 { theme: "red-light" }
  if (req.method === 'PUT' && url === '/api/theme') {
    const base = typeof body.theme === 'string' ? body.theme.replace(/-light$/, '') : '';
    if (COLOR_IDS.indexOf(base) < 0) return sendError(res, 400, '그런 색은 없어요.');

    const data = readData();
    data.theme = body.theme;
    writeData(data);
    return sendJson(res, 200, { theme: data.theme });
  }

  return sendError(res, 404, '그런 주소는 없어요.');
}


/* ---------- 5. 화면 파일 보내 주기 ---------- */

const FILE_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function sendFile(req, res) {
  let name = decodeURIComponent(req.url.split('?')[0]);
  if (name === '/') name = '/index.html';

  // 앱 폴더 바깥의 파일은 절대 보내지 않아요 (보안)
  const filePath = path.join(APP_FOLDER, name);
  if (!filePath.startsWith(APP_FOLDER + path.sep)) {
    res.writeHead(403);
    return res.end('안 돼요');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('파일을 찾을 수 없어요');
    }
    const type = FILE_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}


/* ---------- 6. 서버 켜기 ---------- */

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch((e) => {
      console.error(e);
      sendError(res, 500, '서버에 문제가 생겼어요.');
    });
  } else {
    sendFile(req, res);
  }
});

server.listen(PORT, () => {
  console.log('일정 달력 서버가 켜졌어요! → http://localhost:' + PORT);
});
