// 상수 정의
const TARGET_STEPS = 4000000; // 목표 걸음수
const START_DATE = new Date('2025-02-28'); // 시작일
const END_DATE = new Date('2026-02-27'); // 종료일

// DOM 요소
const stepsInput = document.getElementById('steps');
const displayDateEl = document.getElementById('displayDate');
const saveBtn = document.getElementById('saveBtn');
const noDataMsg = document.getElementById('noDataMsg');
const statsContent = document.getElementById('statsContent');

// 데이터 표시 요소
const standardDateEl = document.getElementById('standardDate');
const daysPassedEl = document.getElementById('daysPassed');
const totalStepsEl = document.getElementById('totalSteps');
const averageStepsEl = document.getElementById('averageSteps');
const daysLeftEl = document.getElementById('daysLeft');
const stepsLeftEl = document.getElementById('stepsLeft');
const requiredAverageStepsEl = document.getElementById('requiredAverageSteps');

// 어제 날짜 가져오기 함수
function getYesterday() {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today;
}

// 어제 날짜로 기준일 표시 업데이트
updateDisplayDate();

// 날짜 표시 업데이트 함수
function updateDisplayDate() {
    const yesterday = getYesterday();
    displayDateEl.textContent = formatDate(yesterday);
}

// 데이터 저장 함수
function saveData() {
    const steps = parseInt(stepsInput.value);
    
    if (isNaN(steps)) {
        alert('걸음수를 입력해 주세요.');
        return;
    }

    const yesterday = getYesterday();
    const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD 형식
    
    // 날짜 범위 검증
    if (yesterday < START_DATE || yesterday > END_DATE) {
        alert(`현재 날짜는 ${formatDate(START_DATE)}부터 ${formatDate(END_DATE)}까지의 범위를 벗어납니다.`);
        return;
    }

    // 데이터 저장
    localStorage.setItem('walkingSteps', steps);
    localStorage.setItem('walkingDate', yesterdayStr);

    // 통계 업데이트
    updateStats();
}

// 통계 업데이트 함수
function updateStats() {
    const steps = parseInt(localStorage.getItem('walkingSteps'));
    const date = localStorage.getItem('walkingDate');

    if (isNaN(steps) || !date) {
        noDataMsg.style.display = 'block';
        statsContent.style.display = 'none';
        return;
    }

    noDataMsg.style.display = 'none';
    statsContent.style.display = 'block';

    const selectedDate = new Date(date);
    const daysPassed = calculateDaysPassed(START_DATE, selectedDate);
    const daysLeft = calculateDaysPassed(selectedDate, END_DATE);
    const stepsLeft = TARGET_STEPS - steps;
    const averageSteps = Math.round(steps / daysPassed);
    const requiredAverageSteps = Math.round(stepsLeft / daysLeft);

    // 통계 표시
    standardDateEl.textContent = formatDate(selectedDate);
    daysPassedEl.textContent = `${daysPassed}일`;
    totalStepsEl.textContent = `${steps.toLocaleString()}보`;
    averageStepsEl.textContent = `${averageSteps.toLocaleString()}보`;
    daysLeftEl.textContent = `${daysLeft}일`;
    stepsLeftEl.textContent = `${stepsLeft.toLocaleString()}보`;
    requiredAverageStepsEl.textContent = `${requiredAverageSteps.toLocaleString()}보`;
}

// 두 날짜 사이의 일수 계산 (둘 다 포함)
function calculateDaysPassed(startDate, endDate) {
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;
}

// 날짜 포맷 함수 (YYYY년 MM월 DD일)
function formatDate(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// 저장 버튼 이벤트 리스너
saveBtn.addEventListener('click', saveData);

// 초기 데이터 로드
document.addEventListener('DOMContentLoaded', () => {
    const savedSteps = localStorage.getItem('walkingSteps');
    const savedDate = localStorage.getItem('walkingDate');

    if (savedSteps && savedDate) {
        stepsInput.value = savedSteps;
        updateStats();
    }
}); 