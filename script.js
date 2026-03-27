// 상수 정의
const TARGET_STEPS = 4000000; // 목표 걸음수
const START_DATE = new Date(2026, 2, 11); // 시작일 (로컬 날짜 기준)
const END_DATE = new Date(2027, 2, 10); // 종료일 (로컬 날짜 기준)
const HISTORY_KEY = 'walkingHistory';

// DOM 요소
const stepsInput = document.getElementById('steps');
const displayDateEl = document.getElementById('displayDate');
const displayDateBtn = document.getElementById('displayDateBtn');
const baseDatePicker = document.getElementById('baseDatePicker');
const saveBtn = document.getElementById('saveBtn');
const statsBtn = document.getElementById('statsBtn');
const recentStatsBtn = document.getElementById('recentStatsBtn');
const noDataMsg = document.getElementById('noDataMsg');
const statsContent = document.getElementById('statsContent');
const statsModal = document.getElementById('statsModal');
const statsModalTitle = document.getElementById('statsModalTitle');
const closeStatsBtn = document.getElementById('closeStatsBtn');
const weeklyChart = document.getElementById('weeklyChart');

// 데이터 표시 요소
const standardDateEl = document.getElementById('standardDate');
const daysPassedEl = document.getElementById('daysPassed');
const totalStepsEl = document.getElementById('totalSteps');
const averageStepsEl = document.getElementById('averageSteps');
const daysLeftEl = document.getElementById('daysLeft');
const stepsLeftEl = document.getElementById('stepsLeft');
const requiredAverageStepsEl = document.getElementById('requiredAverageSteps');
let selectedBaseDate = getYesterday();

// 어제 날짜 가져오기 함수
function getYesterday() {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today;
}

function dateToKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function keyToDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function toDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isDateInRange(date, minDate, maxDate) {
    const target = toDateOnly(date).getTime();
    const min = toDateOnly(minDate).getTime();
    const max = toDateOnly(maxDate).getTime();
    return target >= min && target <= max;
}

// 날짜 표시 업데이트 함수
function updateDisplayDate() {
    displayDateEl.textContent = formatDate(selectedBaseDate);
}

function loadHistory() {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getSortedHistoryEntries() {
    const history = loadHistory();
    return Object.entries(history)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([dateKey, value]) => [dateKey, Number(value)])
        .sort(([a], [b]) => a.localeCompare(b));
}

function migrateLegacyDataIfNeeded() {
    const legacySteps = localStorage.getItem('walkingSteps');
    const legacyDate = localStorage.getItem('walkingDate');
    const history = loadHistory();

    if (legacySteps && legacyDate && !history[legacyDate]) {
        const steps = Number(legacySteps);
        if (Number.isFinite(steps)) {
            history[legacyDate] = steps;
            saveHistory(history);
        }
    }
}

function getLatestEntry() {
    const entries = getSortedHistoryEntries();
    return entries.length ? entries[entries.length - 1] : null;
}

function setSelectedBaseDate(date) {
    selectedBaseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    updateDisplayDate();
    baseDatePicker.value = dateToKey(selectedBaseDate);
}

// 데이터 저장 함수 (어제 날짜 기준으로 날짜별 누적 저장)
function saveData() {
    const steps = parseInt(stepsInput.value, 10);

    if (isNaN(steps)) {
        alert('걸음수를 입력해 주세요.');
        return;
    }

    if (steps < 0) {
        alert('걸음수는 0 이상이어야 합니다.');
        return;
    }

    const baseDate = selectedBaseDate;
    const baseDateKey = dateToKey(baseDate);

    // 날짜 범위 검증
    if (!isDateInRange(baseDate, START_DATE, END_DATE)) {
        alert(`현재 날짜는 ${formatDate(START_DATE)}부터 ${formatDate(END_DATE)}까지의 범위를 벗어납니다.`);
        return;
    }

    const history = loadHistory();
    history[baseDateKey] = steps;
    saveHistory(history);

    updateStats(baseDateKey);
}

// 통계 업데이트 함수 (선택 날짜 우선, 없으면 최근 저장일)
function updateStats(preferredDateKey) {
    const history = loadHistory();
    let selectedEntry = null;
    if (preferredDateKey && Number.isFinite(Number(history[preferredDateKey]))) {
        selectedEntry = [preferredDateKey, Number(history[preferredDateKey])];
    }
    const latestEntry = selectedEntry || getLatestEntry();

    if (!latestEntry) {
        noDataMsg.style.display = 'block';
        statsContent.style.display = 'none';
        return;
    }

    const [dateKey, steps] = latestEntry;
    const selectedDate = keyToDate(dateKey);

    noDataMsg.style.display = 'none';
    statsContent.style.display = 'block';

    const daysPassed = Math.max(1, calculateDaysPassed(START_DATE, selectedDate));
    const daysLeft = Math.max(0, calculateDaysPassed(selectedDate, END_DATE));
    const stepsLeft = Math.max(0, TARGET_STEPS - steps);
    const averageSteps = Math.round(steps / daysPassed);
    const requiredAverageSteps = daysLeft > 0 ? Math.round(stepsLeft / daysLeft) : 0;

    // 통계 표시
    standardDateEl.textContent = formatDate(selectedDate);
    daysPassedEl.textContent = `${daysPassed}일`;
    totalStepsEl.textContent = `${steps.toLocaleString()}보`;
    averageStepsEl.textContent = `${averageSteps.toLocaleString()}보`;
    daysLeftEl.textContent = `${daysLeft}일`;
    stepsLeftEl.textContent = `${stepsLeft.toLocaleString()}보`;
    requiredAverageStepsEl.textContent = `${requiredAverageSteps.toLocaleString()}보`;
}

function getCumulativeValueOnOrBefore(dateKey, sortedEntries) {
    let result = 0;
    for (const [entryKey, value] of sortedEntries) {
        if (entryKey <= dateKey) {
            result = value;
        } else {
            break;
        }
    }
    return result;
}

function dayDiff(fromDate, toDate) {
    const start = toDateOnly(fromDate).getTime();
    const end = toDateOnly(toDate).getTime();
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function findPreviousKnownEntry(targetDateKey, sortedEntries) {
    let prev = null;
    for (const entry of sortedEntries) {
        if (entry[0] < targetDateKey) {
            prev = entry;
        } else {
            break;
        }
    }
    return prev;
}

function findNextKnownEntry(targetDateKey, sortedEntries) {
    for (const entry of sortedEntries) {
        if (entry[0] > targetDateKey) {
            return entry;
        }
    }
    return null;
}

function buildCumulativeSaturdaySeries() {
    const sortedEntries = getSortedHistoryEntries();
    if (!sortedEntries.length) {
        return null;
    }

    const latestEntry = getLatestEntry();
    if (!latestEntry) {
        return null;
    }
    const [lastDateKey] = latestEntry;
    const lastDate = keyToDate(lastDateKey);
    const lastDay = lastDate.getDay(); // 0=일, 6=토
    const diffToSaturday = (lastDay + 1) % 7;
    const latestSaturday = new Date(lastDate);
    latestSaturday.setDate(lastDate.getDate() - diffToSaturday);
    const labels = [];
    const values = [];
    const dateKeys = [];

    for (let i = 9; i >= 0; i--) {
        const currentDate = new Date(latestSaturday);
        currentDate.setDate(currentDate.getDate() - i * 7);
        const key = dateToKey(currentDate);
        labels.push(`${currentDate.getMonth() + 1}/${currentDate.getDate()}`);
        values.push(getCumulativeValueOnOrBefore(key, sortedEntries));
        dateKeys.push(key);
    }

    const totalPeriodDays = calculateDaysPassed(START_DATE, END_DATE);
    const targetValues = dateKeys.map((dateKey) => {
        const date = keyToDate(dateKey);
        const daysPassed = Math.max(0, Math.min(totalPeriodDays, calculateDaysPassed(START_DATE, date)));
        return Math.round((TARGET_STEPS * daysPassed) / totalPeriodDays);
    });

    return {
        labels,
        values,
        referenceValues: targetValues,
        referenceLabel: '목표 누적(400만보 기준)',
        referenceColor: '#e74c3c'
    };
}

function estimateDailyStepsForDate(dateKey, sortedEntries, valueMap) {
    const exactValue = valueMap.get(dateKey);
    const previousEntry = findPreviousKnownEntry(dateKey, sortedEntries);

    if (exactValue !== undefined) {
        if (!previousEntry) {
            return Math.max(0, Math.round(exactValue));
        }

        const currentDate = keyToDate(dateKey);
        const previousDate = keyToDate(previousEntry[0]);
        const gapDays = dayDiff(previousDate, currentDate);
        if (gapDays <= 0) {
            return 0;
        }

        const estimated = (exactValue - previousEntry[1]) / gapDays;
        return Math.max(0, Math.round(estimated));
    }

    const nextEntry = findNextKnownEntry(dateKey, sortedEntries);
    if (previousEntry && nextEntry) {
        const prevDate = keyToDate(previousEntry[0]);
        const nextDate = keyToDate(nextEntry[0]);
        const gapDays = dayDiff(prevDate, nextDate);
        if (gapDays <= 0) {
            return 0;
        }

        const estimated = (nextEntry[1] - previousEntry[1]) / gapDays;
        return Math.max(0, Math.round(estimated));
    }

    return 0;
}

function buildRecentWeekSeries() {
    const sortedEntries = getSortedHistoryEntries();
    if (!sortedEntries.length) {
        return null;
    }

    const valueMap = new Map(sortedEntries);
    const latestEntry = getLatestEntry();
    if (!latestEntry) {
        return null;
    }

    const endDate = keyToDate(latestEntry[0]);
    const labels = [];
    const values = [];

    for (let i = 6; i >= 0; i--) {
        const currentDate = new Date(endDate);
        currentDate.setDate(endDate.getDate() - i);
        const dateKey = dateToKey(currentDate);
        labels.push(`${currentDate.getMonth() + 1}/${currentDate.getDate()}`);
        values.push(estimateDailyStepsForDate(dateKey, sortedEntries, valueMap));
    }

    const averageDaily = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return {
        labels,
        values,
        averageValue: averageDaily,
        averageLabel: `평균 하루 걸음 ${averageDaily.toLocaleString()}보`
    };
}

function drawWeeklyChart(series) {
    const ctx = weeklyChart.getContext('2d');
    const width = weeklyChart.width;
    const height = weeklyChart.height;
    ctx.clearRect(0, 0, width, height);

    if (!series) {
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '16px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('저장된 데이터가 없습니다.', width / 2, height / 2);
        return;
    }

    const { labels, values, averageValue, averageLabel, referenceValues, referenceLabel, referenceColor } = series;
    const padding = { top: 30, right: 30, bottom: 50, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allValues = [...values];
    if (typeof averageValue === 'number') {
        allValues.push(averageValue);
    }
    if (Array.isArray(referenceValues)) {
        allValues.push(...referenceValues);
    }

    const maxDataValue = Math.max(...allValues, 10);
    const minDataValue = Math.min(...allValues, 0);
    const extra = Math.max(1, Math.round((maxDataValue - minDataValue) * 0.1));
    const yMin = Math.max(0, minDataValue - extra);
    const yMax = maxDataValue + extra;
    const yRange = Math.max(1, yMax - yMin);

    const xAt = (index) => padding.left + (chartW * index) / (labels.length - 1);
    const yAt = (value) => padding.top + ((yMax - value) / yRange) * chartH;

    // 배경 격자
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // 축
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y축 눈금
    ctx.fillStyle = '#34495e';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const value = Math.round(yMax - (yRange * i) / 4);
        const y = padding.top + (chartH * i) / 4;
        ctx.fillText(`${value.toLocaleString()}`, padding.left - 8, y + 4);
    }

    // X축 눈금
    ctx.textAlign = 'center';
    labels.forEach((label, idx) => {
        const x = xAt(idx);
        ctx.fillText(label, x, height - padding.bottom + 20);
    });

    // 기준선/기준 그래프
    if (typeof averageValue === 'number') {
        const avgY = yAt(averageValue);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, avgY);
        ctx.lineTo(width - padding.right, avgY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#e74c3c';
        ctx.textAlign = 'left';
        ctx.fillText(averageLabel, padding.left + 6, avgY - 8);
    } else if (Array.isArray(referenceValues) && referenceValues.length === values.length) {
        const color = referenceColor || '#e74c3c';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        referenceValues.forEach((value, idx) => {
            const x = xAt(idx);
            const y = yAt(value);
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(referenceLabel || '기준선', padding.left + 6, yAt(referenceValues[0]) - 8);
    }

    // 누적 꺾은선 그래프
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((value, idx) => {
        const x = xAt(idx);
        const y = yAt(value);
        if (idx === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // 점 표시
    ctx.fillStyle = '#3498db';
    values.forEach((value, idx) => {
        const x = xAt(idx);
        const y = yAt(value);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

function openStatsModal() {
    const series = buildCumulativeSaturdaySeries();
    statsModalTitle.textContent = '토요일 기준 최근 10주 누적 걸음수';
    drawWeeklyChart(series);
    statsModal.style.display = 'flex';
}

function openRecentStatsModal() {
    const series = buildRecentWeekSeries();
    statsModalTitle.textContent = '최근 7일 걸음수';
    drawWeeklyChart(series);
    statsModal.style.display = 'flex';
}

function closeStatsModal() {
    statsModal.style.display = 'none';
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
statsBtn.addEventListener('click', openStatsModal);
recentStatsBtn.addEventListener('click', openRecentStatsModal);
closeStatsBtn.addEventListener('click', closeStatsModal);
displayDateBtn.addEventListener('click', () => {
    if (typeof baseDatePicker.showPicker === 'function') {
        baseDatePicker.showPicker();
    } else {
        baseDatePicker.click();
    }
});
baseDatePicker.addEventListener('change', () => {
    if (!baseDatePicker.value) {
        return;
    }

    const pickedDate = keyToDate(baseDatePicker.value);
    if (!isDateInRange(pickedDate, START_DATE, END_DATE)) {
        alert(`기준 날짜는 ${formatDate(START_DATE)}부터 ${formatDate(END_DATE)}까지 선택할 수 있습니다.`);
        setSelectedBaseDate(getYesterday());
        return;
    }

    setSelectedBaseDate(pickedDate);
    updateStats(baseDatePicker.value);
});
statsModal.addEventListener('click', (event) => {
    if (event.target === statsModal) {
        closeStatsModal();
    }
});

// 초기 데이터 로드
document.addEventListener('DOMContentLoaded', () => {
    migrateLegacyDataIfNeeded();
    setSelectedBaseDate(getYesterday());
    baseDatePicker.min = dateToKey(START_DATE);
    baseDatePicker.max = dateToKey(END_DATE);

    const latestEntry = getLatestEntry();
    if (latestEntry) {
        stepsInput.value = latestEntry[1];
    }

    updateStats();
});