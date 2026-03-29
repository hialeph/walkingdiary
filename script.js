/**
 * Walking Diary — 메인 스크립트
 *
 * 역할 요약:
 * - localStorage에 날짜별 "누적 걸음수"를 저장·불러오기
 * - 챌린지 기간(시작일~종료일)·목표 걸음수(app*)에 따른 통계 표시 (설정에서 변경 가능)
 * - Canvas로 최근 30일 누적 추이 및 최근 7일 일평균 추정 그래프 표시
 *
 * 데이터 모델: HISTORY_KEY에 { "YYYY-MM-DD": number(누적 걸음) } 형태의 JSON 저장
 * 입력: 누적 직접 입력 또는 "기준일 걸음"으로 전날 누적+당일 걸음으로 저장
 */

// ---------------------------------------------------------------------------
// 상수: 저장소 키·기본 챌린지 값 (실제 값은 loadAppSettings()로 SETTINGS_KEY에서 복원)
// ---------------------------------------------------------------------------
const HISTORY_KEY = 'walkingHistory';
/** 설정 저장 직전 히스토리 백업용 localStorage 키 */
const OLD_HISTORY_KEY = 'walkingHistory_old';
const SETTINGS_KEY = 'walkingDiarySettings';
/** 걸음 입력 방식: cumulative | daily */
const STEPS_ENTRY_MODE_KEY = 'walkingDiaryStepsEntryMode';

const DEFAULT_TARGET_STEPS = 4000000;
const DEFAULT_START_DATE = new Date(2026, 2, 11);
const DEFAULT_END_DATE = new Date(2027, 2, 10);

/** 실행 중 목표 누적 걸음수·챌린지 기간 (설정 팝업에서 갱신) */
let appTargetSteps = DEFAULT_TARGET_STEPS;
let appStartDate = new Date(DEFAULT_START_DATE.getTime());
let appEndDate = new Date(DEFAULT_END_DATE.getTime());

// ---------------------------------------------------------------------------
// DOM 참조: 입력·표시·모달·차트
// ---------------------------------------------------------------------------
const stepsInput = document.getElementById('steps');
const stepsInputMainLabel = document.getElementById('stepsInputMainLabel');
const stepsModeCumulative = document.getElementById('stepsModeCumulative');
const stepsModeDaily = document.getElementById('stepsModeDaily');
const clearStepsBtn = document.getElementById('clearStepsBtn');
const displayDateEl = document.getElementById('displayDate');
const displayDateBtn = document.getElementById('displayDateBtn');
const baseDatePicker = document.getElementById('baseDatePicker');
const saveBtn = document.getElementById('saveBtn');
const statsBtn = document.getElementById('statsBtn');
const noDataMsg = document.getElementById('noDataMsg');
const statsContent = document.getElementById('statsContent');
const statsModal = document.getElementById('statsModal');
const closeStatsBtn = document.getElementById('closeStatsBtn');
const cumulativeStatsChart = document.getElementById('cumulativeStatsChart');
const recentStatsChart = document.getElementById('recentStatsChart');
const barChartTooltip = document.getElementById('barChartTooltip');
const cumulativeChartTooltip = document.getElementById('cumulativeChartTooltip');

/** 최근 7일 막대 그래프 히트 테스트용 (drawWeeklyChart에서 갱신) */
let recentBarHitRegions = null;

/** 최근 30일 누적 그래프 — 라벨 있는 큰 점만 (drawWeeklyChart에서 갱신) */
let cumulativeDotHitRegions = null;

const standardDateEl = document.getElementById('standardDate');
const daysPassedEl = document.getElementById('daysPassed');
const totalStepsEl = document.getElementById('totalSteps');
const averageStepsEl = document.getElementById('averageSteps');
const daysLeftEl = document.getElementById('daysLeft');
const stepsLeftEl = document.getElementById('stepsLeft');
const requiredAverageStepsEl = document.getElementById('requiredAverageSteps');
const statsTargetHint = document.getElementById('statsTargetHint');

const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsStartDateInput = document.getElementById('settingsStartDate');
const settingsEndDateInput = document.getElementById('settingsEndDate');
const settingsTargetStepsInput = document.getElementById('settingsTargetSteps');
const settingsResetBtn = document.getElementById('settingsResetBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsRestoreBtn = document.getElementById('settingsRestoreBtn');

/** 사용자가 걸음을 입력·저장할 "기준 날짜" (DOMContentLoaded에서 보정) */
let selectedBaseDate = getYesterday();

// ---------------------------------------------------------------------------
// 날짜 유틸리티
// ---------------------------------------------------------------------------

/**
 * 어제 날짜를 Date 객체로 반환 (시·분·초는 현재 시각과 동일할 수 있으나, 이후 toDateOnly 등으로 날짜만 비교)
 * @returns {Date}
 */
function getYesterday() {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today;
}

/**
 * Date → localStorage/키에 쓰기 좋은 문자열 "YYYY-MM-DD"
 * @param {Date} date
 * @returns {string}
 */
function dateToKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * "YYYY-MM-DD" 키를 해당 일의 로컬 Date(자정)로 변환
 * @param {string} key
 * @returns {Date}
 */
function keyToDate(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * 시간 정보를 제거하고 연·월·일만 남긴 Date (일 단위 비교용)
 * @param {Date} date
 * @returns {Date}
 */
function toDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * date가 [minDate, maxDate] 달력 구간 안에 있는지 (일 단위)
 * @param {Date} date
 * @param {Date} minDate
 * @param {Date} maxDate
 * @returns {boolean}
 */
function isDateInRange(date, minDate, maxDate) {
    const target = toDateOnly(date).getTime();
    const min = toDateOnly(minDate).getTime();
    const max = toDateOnly(maxDate).getTime();
    return target >= min && target <= max;
}

/**
 * localStorage SETTINGS_KEY에서 시작일·종료일·목표 걸음을 불러 app*에 반영 (없거나 오류 시 기본값)
 */
function loadAppSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
        appTargetSteps = DEFAULT_TARGET_STEPS;
        appStartDate = new Date(DEFAULT_START_DATE.getTime());
        appEndDate = new Date(DEFAULT_END_DATE.getTime());
        refreshStatsTargetHint();
        return;
    }
    try {
        const o = JSON.parse(raw);
        const ts = Number(o.targetSteps);
        if (
            o &&
            typeof o.startDateKey === 'string' &&
            typeof o.endDateKey === 'string' &&
            Number.isFinite(ts) &&
            ts >= 1
        ) {
            appStartDate = keyToDate(o.startDateKey);
            appEndDate = keyToDate(o.endDateKey);
            appTargetSteps = Math.round(ts);
            refreshStatsTargetHint();
            return;
        }
    } catch (e) {
        /* ignore */
    }
    appTargetSteps = DEFAULT_TARGET_STEPS;
    appStartDate = new Date(DEFAULT_START_DATE.getTime());
    appEndDate = new Date(DEFAULT_END_DATE.getTime());
    refreshStatsTargetHint();
}

/** 메인 카드 「걸음수 통계」 옆 목표 걸음 문구 */
function refreshStatsTargetHint() {
    if (!statsTargetHint) {
        return;
    }
    const n = appTargetSteps.toLocaleString();
    statsTargetHint.innerHTML = `[목표 <span class="stats-target-number">${n}</span>보]`;
}

function saveAppSettingsToStorage() {
    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
            startDateKey: dateToKey(appStartDate),
            endDateKey: dateToKey(appEndDate),
            targetSteps: appTargetSteps
        })
    );
}

/** 챌린지 기간 안으로 날짜 보정 */
function clampDateToChallengeRange(date) {
    if (isDateInRange(date, appStartDate, appEndDate)) {
        return toDateOnly(date);
    }
    const t = toDateOnly(date).getTime();
    const minT = toDateOnly(appStartDate).getTime();
    const maxT = toDateOnly(appEndDate).getTime();
    if (t < minT) {
        return toDateOnly(appStartDate);
    }
    return toDateOnly(appEndDate);
}

function syncBaseDatePickerBounds() {
    baseDatePicker.min = dateToKey(appStartDate);
    baseDatePicker.max = dateToKey(appEndDate);
}

function hasOldHistoryBackup() {
    const raw = localStorage.getItem(OLD_HISTORY_KEY);
    return raw != null && raw !== '';
}

function updateSettingsRestoreButton() {
    settingsRestoreBtn.disabled = !hasOldHistoryBackup();
}

function openSettingsModal() {
    settingsStartDateInput.value = dateToKey(appStartDate);
    settingsEndDateInput.value = dateToKey(appEndDate);
    settingsTargetStepsInput.value = String(appTargetSteps);
    settingsStartDateInput.disabled = true;
    settingsEndDateInput.disabled = true;
    settingsTargetStepsInput.disabled = true;
    settingsSaveBtn.disabled = true;
    updateSettingsRestoreButton();
    settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
    settingsStartDateInput.disabled = true;
    settingsEndDateInput.disabled = true;
    settingsTargetStepsInput.disabled = true;
    settingsSaveBtn.disabled = true;
}

/** 화면에 표시되는 "기준 날짜" 텍스트를 selectedBaseDate에 맞게 갱신 */
function updateDisplayDate() {
    displayDateEl.textContent = formatDate(selectedBaseDate);
}

// ---------------------------------------------------------------------------
// 히스토리 저장소 (localStorage)
// ---------------------------------------------------------------------------

/**
 * 저장된 히스토리 객체를 불러옴. 없거나 파싱 실패 시 빈 객체
 * @returns {Record<string, number|string>}
 */
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

/**
 * 히스토리 전체를 JSON 문자열로 저장
 * @param {Record<string, number>} history      
 */
function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

/**
 * HISTORY_KEY에 저장된 객체에서 특정 날짜 키 한 건을 삭제하고 다시 저장한다.
 * 화면을 갱신하려면 호출 후 `updateStats()` 등을 별도로 호출하면 된다.
 * @param {string} dateKey "YYYY-MM-DD"
 * @returns {boolean} 해당 키가 있어 삭제했으면 true, 없었으면 false
 */
function removeHistoryEntry(dateKey) {
    const history = loadHistory();
    if (!Object.prototype.hasOwnProperty.call(history, dateKey)) {
        return false;
    }
    delete history[dateKey];
    saveHistory(history);
    return true;
}

/**
 * 히스토리를 날짜 키 오름차순으로 정렬한 [dateKey, 숫자걸음] 배열
 * 숫자로 변환 불가한 항목은 제외
 * @returns {Array<[string, number]>}
 */
function getSortedHistoryEntries() {
    const history = loadHistory();
    return Object.entries(history)
        .filter(([, value]) => Number.isFinite(Number(value)))
        .map(([dateKey, value]) => [dateKey, Number(value)])
        .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * 예전 단일 키 저장 방식(walkingSteps + walkingDate)을 새 HISTORY_KEY 구조로 한 번만 이관
 * 이미 해당 날짜 키가 있으면 덮어쓰지 않음
 */
function migrateLegacyDataIfNeeded() {
    const legacySteps = localStorage.getItem('walkingSteps');
    const legacyDate = localStorage.getItem('walkingDate');
    const history = loadHistory();

    if (legacySteps && legacyDate ) {
        // const steps = Number(legacySteps);
        // if (Number.isFinite(steps)) {
        //     history[legacyDate] = steps;
        //     saveHistory(history);
        // }
        console.log(legacyDate);
        removeHistoryEntry(legacyDate);
    }
}

/**
 * 가장 최근(달력상 마지막) 기록 한 건 — 없으면 null
 * @returns {[string, number]|null}
 */
function getLatestEntry() {
    const entries = getSortedHistoryEntries();
    return entries.length ? entries[entries.length - 1] : null;
}

function loadStepsEntryModeFromStorage() {
    if (!stepsModeCumulative || !stepsModeDaily) {
        return;
    }
    const v = localStorage.getItem(STEPS_ENTRY_MODE_KEY);
    if (v === 'daily') {
        stepsModeDaily.checked = true;
    } else {
        stepsModeCumulative.checked = true;
    }
}

function saveStepsEntryModeToStorage() {
    localStorage.setItem(STEPS_ENTRY_MODE_KEY, isDailyStepsEntryMode() ? 'daily' : 'cumulative');
}

function isDailyStepsEntryMode() {
    return Boolean(stepsModeDaily && stepsModeDaily.checked);
}

function updateStepsInputMainLabel() {
    if (!stepsInputMainLabel) {
        return;
    }
    stepsInputMainLabel.textContent = isDailyStepsEntryMode()
        ? '기준날짜 하루 걸음수 (전날 누적에 더해 저장)'
        : '기준날짜까지 누적된 걸음수';
}

function onStepsEntryModeChange() {
    saveStepsEntryModeToStorage();
    updateStepsInputMainLabel();
    syncStepsInputFromSelectedDate();
}

/**
 * 입력 방식에 따라 누적값 또는 (저장된 누적 − 전날 누적) 하루 걸음을 입력창에 표시
 */
function syncStepsInputFromSelectedDate() {
    const key = dateToKey(selectedBaseDate);
    const history = loadHistory();
    const sorted = getSortedHistoryEntries();

    if (isDailyStepsEntryMode()) {
        const cum = Number(history[key]);
        if (Number.isFinite(cum)) {
            const prev = getPrevDayCumulative(key, sorted);
            const daily = Math.max(0, Math.round(cum - prev));
            stepsInput.value = String(daily);
        } else {
            stepsInput.value = '';
        }
    } else {
        const n = Number(history[key]);
        if (Number.isFinite(n)) {
            stepsInput.value = String(Math.round(n));
        } else {
            stepsInput.value = '';
        }
    }
}

/**
 * 기준 날짜 상태·표시·hidden date input·걸음 입력창을 동기화
 * @param {Date} date
 */
function setSelectedBaseDate(date) {
    selectedBaseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    updateDisplayDate();
    baseDatePicker.value = dateToKey(selectedBaseDate);
    syncStepsInputFromSelectedDate();
}

// ---------------------------------------------------------------------------
// 저장 및 메인 통계 패널
// ---------------------------------------------------------------------------

/**
 * 입력한 걸음수를 selectedBaseDate 키로 저장
 * - 누적 모드: 입력값을 그대로 누적 걸음으로 저장
 * - 기준일 걸음 모드: 전날까지 누적 + 입력값을 누적 걸음으로 저장
 */
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

    if (!isDateInRange(baseDate, appStartDate, appEndDate)) {
        alert(`현재 날짜는 ${formatDate(appStartDate)}부터 ${formatDate(appEndDate)}까지의 범위를 벗어납니다.`);
        return;
    }

    const history = loadHistory();
    const sorted = getSortedHistoryEntries();

    if (isDailyStepsEntryMode()) {
        const prevKey = dateKeyPreviousDay(baseDateKey);
        const prevDayDate = keyToDate(prevKey);
        if (isDateInRange(prevDayDate, appStartDate, appEndDate)) {
            const prevVal = history[prevKey];
            if (!Number.isFinite(Number(prevVal))) {
                alert('이전 날짜 걸음수 정보를 먼저 입력하세요.');
                return;
            }
        }
        const prevCum = getPrevDayCumulative(baseDateKey, sorted);
        history[baseDateKey] = Math.round(prevCum + steps);
    } else {
        history[baseDateKey] = steps;
    }
    saveHistory(history);

    updateStats(baseDateKey);
}

/**
 * 상단 통계 카드 갱신
 * @param {string} [preferredDateKey] — 있으면 그 날짜의 누적값을 "기준"으로 우선 사용(방금 저장한 날 등)
 *        없으면 전체 중 가장 최근 기록일 기준
 */
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

    // 시작일부터 기준일까지 경과 일수(최소 1 — 당일만 있어도 0으로 나누지 않음)
    const daysPassed = Math.max(1, calculateDaysPassed(appStartDate, selectedDate));
    // 기준일부터 종료일까지 남은 일수
    const daysLeft = Math.max(0, calculateDaysPassed(selectedDate, appEndDate));
    const stepsLeft = Math.max(0, appTargetSteps - steps);
    const averageSteps = Math.round(steps / daysPassed);
    const requiredAverageSteps = daysLeft > 0 ? Math.round(stepsLeft / daysLeft) : 0;

    standardDateEl.textContent = formatDate(selectedDate);
    daysPassedEl.textContent = `${daysPassed}일`;
    totalStepsEl.textContent = `${steps.toLocaleString()}보`;
    averageStepsEl.textContent = `${averageSteps.toLocaleString()}보`;
    daysLeftEl.textContent = `${daysLeft}일`;
    stepsLeftEl.textContent = `${stepsLeft.toLocaleString()}보`;
    requiredAverageStepsEl.textContent = `${requiredAverageSteps.toLocaleString()}보`;
}

// ---------------------------------------------------------------------------
// 차트용: 누적 시계열·일별 추정
// ---------------------------------------------------------------------------

/**
 * sortedEntries는 날짜 오름차순. dateKey 당일 또는 그 이전 중 "가장 가까운" 기록의 누적값
 * (같은 날 여러 번 저장하면 마지막 값이 남고, 키 단위로 하나만 존재한다고 가정)
 * @param {string} dateKey
 * @param {Array<[string, number]>} sortedEntries
 * @returns {number}
 */
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

/**
 * 달력 기준 하루 전 날짜 키
 * @param {string} dateKey "YYYY-MM-DD"
 * @returns {string}
 */
function dateKeyPreviousDay(dateKey) {
    const d = keyToDate(dateKey);
    d.setDate(d.getDate() - 1);
    return dateToKey(d);
}

/**
 * 기준일 **전날**까지의 누적 걸음(전날 또는 그 이전 마지막 기록)
 * @param {string} baseDateKey
 * @param {Array<[string, number]>} sortedEntries
 * @returns {number}
 */
function getPrevDayCumulative(baseDateKey, sortedEntries) {
    const prevKey = dateKeyPreviousDay(baseDateKey);
    return getCumulativeValueOnOrBefore(prevKey, sortedEntries);
}

/**
 * 두 달력 날짜 사이의 일수 차이 (시작일 제외·종료일 기준 등 단순 차이; calculateDaysPassed와 +1 규칙이 다름)
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {number}
 */
function dayDiff(fromDate, toDate) {
    const start = toDateOnly(fromDate).getTime();
    const end = toDateOnly(toDate).getTime();
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * targetDateKey보다 이전 날짜 키 중 마지막(가장 가까운 과거) 항목
 * @param {string} targetDateKey
 * @param {Array<[string, number]>} sortedEntries
 * @returns {[string, number]|null}
 */
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

/**
 * targetDateKey보다 이후 첫 항목
 * @param {string} targetDateKey
 * @param {Array<[string, number]>} sortedEntries
 * @returns {[string, number]|null}
 */
function findNextKnownEntry(targetDateKey, sortedEntries) {
    for (const entry of sortedEntries) {
        if (entry[0] > targetDateKey) {
            return entry;
        }
    }
    return null;
}

/**
 * 최신 기록일부터 역으로 30일, 각 날짜에 그날까지의 누적 걸음(해당 일 포함 최신 기록)
 * labels: 오늘·어제(로컬) 달력 + 오늘과의 일수 차이가 7의 배수인 날에 "M/D" 표시
 * referenceValues: 챌린지 기간 대비 목표 진행에 따른 이론 누적(선형) — 목표 꺾은선과 비교용
 * @returns {null|{ labels: string[], values: number[], referenceValues: number[], referenceLabel: string, referenceColor: string }}
 */
function buildLast30DaysCumulativeSeries() {
    const sortedEntries = getSortedHistoryEntries();
    if (!sortedEntries.length) {
        return null;
    }

    const latestEntry = getLatestEntry();
    if (!latestEntry) {
        return null;
    }
    const endDate = keyToDate(latestEntry[0]);
    const todayOnly = toDateOnly(new Date());
    const yesterdayOnly = toDateOnly(getYesterday());
    const labels = [];
    const values = [];
    const dateKeys = [];

    for (let i = 29; i >= 0; i--) {
        const currentDate = new Date(endDate);
        currentDate.setDate(endDate.getDate() - i);
        const key = dateToKey(currentDate);
        const dateLabel = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
        const isCalendarToday = dateToKey(currentDate) === dateToKey(todayOnly);
        const isCalendarYesterday = dateToKey(currentDate) === dateToKey(yesterdayOnly);
        const weekAlignedToday =
            Math.abs(dayDiff(toDateOnly(currentDate), todayOnly)) % 7 === 0;
        labels.push(isCalendarToday || isCalendarYesterday || weekAlignedToday ? dateLabel : '');
        values.push(getCumulativeValueOnOrBefore(key, sortedEntries));
        dateKeys.push(key);
    }

    const totalPeriodDays = calculateDaysPassed(appStartDate, appEndDate);
    const targetValues = dateKeys.map((dateKey) => {
        const date = keyToDate(dateKey);
        const daysPassed = Math.max(0, Math.min(totalPeriodDays, calculateDaysPassed(appStartDate, date)));
        return Math.round((appTargetSteps * daysPassed) / totalPeriodDays);
    });

    return {
        labels,
        values,
        referenceValues: targetValues,
        referenceLabel: `목표 누적(${appTargetSteps.toLocaleString()}보 기준)`,
        referenceColor: '#e74c3c'
    };
}

/**
 * 특정 날짜의 "일 평균 걸음" 추정
 * - 해당 날에 기록이 있으면: 이전 기록과의 누적 차이를 사이 일수로 나눔
 * - 없으면: 앞뒤 기록이 모두 있을 때 그 구간을 선형으로 나눠 해당 날 몫 추정
 * @param {string} dateKey
 * @param {Array<[string, number]>} sortedEntries
 * @param {Map<string, number>} valueMap — 빠른 조회용
 * @returns {number}
 */
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

/**
 * 최근 기록일부터 역으로 7일치 라벨·일별 추정 걸음
 * drawWeeklyChart에서 막대 그래프 + 보조선(일주일 평균·평균 걸어야 될 걸음)으로 표시
 * @returns {null|object} drawWeeklyChart에 넘길 series 객체
 */
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
    const latestCumulative = Number(latestEntry[1]);

    // updateStats와 동일: 최신 기록일 기준 남은 기간·남은 걸음으로 역산한 일평균 목표
    const daysLeft = Math.max(0, calculateDaysPassed(endDate, appEndDate));
    const stepsLeft = Math.max(0, appTargetSteps - latestCumulative);
    const requiredAverageDaily = daysLeft > 0 ? Math.round(stepsLeft / daysLeft) : 0;

    return {
        labels,
        values,
        averageValue: averageDaily,
        averageLabel: `일주일 평균 걸음 ${averageDaily.toLocaleString()}보`,
        averageColor: '#27ae60',
        requiredAverageValue: requiredAverageDaily,
        requiredAverageLabel: `평균 걸어야 될 걸음 ${requiredAverageDaily.toLocaleString()}보`,
        requiredAverageColor: '#e74c3c'
    };
}

/**
 * 메인 통계의 「평균 하루 걸음」과 동일: 최신 기록일 누적 ÷ (시작일~기준일 경과 일수)
 * @returns {number|null}
 */
function getOverallAverageDailyStepsFromLatest() {
    const latestEntry = getLatestEntry();
    if (!latestEntry) {
        return null;
    }
    const [, steps] = latestEntry;
    const selectedDate = keyToDate(latestEntry[0]);
    const daysPassed = Math.max(1, calculateDaysPassed(appStartDate, selectedDate));
    return Math.round(steps / daysPassed);
}

/**
 * 통계 팝업: 최근 7일 차트와 SVG 사이 격려 문구 (일주일 평균·전체 평균 하루 vs 평균 걸어야 될 걸음)
 */
function updateRecentStatsEncouragement() {
    const el = document.getElementById('recentStatsEncouragement');
    if (!el) {
        return;
    }
    const series = buildRecentWeekSeries();
    const overallAvg = getOverallAverageDailyStepsFromLatest();
    if (!series || overallAvg === null) {
        el.hidden = true;
        el.textContent = '';
        return;
    }

    const weeklyAvg = series.averageValue;
    const required = series.requiredAverageValue;
    console.log(weeklyAvg, required);
    console.log(overallAvg, required);
    if (overallAvg < required) {
        el.textContent =
        weeklyAvg > required
            ? '잘하고 있어 조금 더 화이팅!!!'
            : '아직 부족해 힘을 내자. 가자가자!!!';
        //el.textContent = '아직 부족해 좀 더 힘을 내야해. 가자가자!!!';
    } else {
        /* 일주일 평균 ≥ 목표선: 전체 평균 하루 걸음과 비교 (주간이 초과한 경우와 같음일 때 동일 규칙) */
        el.textContent =
            weeklyAvg > required
                ? '잘하고 있어 이대로 쭉 가는거야!!!'
                : '방심은 금물 다시 힘을내!!!';
    }
    el.hidden = false;
}

function hideBarChartTooltip() {
    if (!barChartTooltip) {
        return;
    }
    barChartTooltip.hidden = true;
    barChartTooltip.textContent = '';
}

/**
 * 막대 중앙 위에 풍선 표시 (퍼센트 좌표는 래퍼·캔버스 동일 비율 가정)
 * @param {{ left: number, right: number, top: number, value: number, dateLabel: string }} region
 */
function showBarChartTooltip(region) {
    if (!barChartTooltip || !recentStatsChart) {
        return;
    }
    barChartTooltip.textContent = `${region.dateLabel}  ${region.value.toLocaleString()}보`;
    barChartTooltip.hidden = false;
    const centerX = (region.left + region.right) / 2;
    const topY = region.top;
    const w = recentStatsChart.width;
    const h = recentStatsChart.height;
    barChartTooltip.style.left = `${(centerX / w) * 100}%`;
    barChartTooltip.style.top = `${(topY / h) * 100}%`;
    barChartTooltip.style.transform = 'translate(-50%, calc(-100% - 10px))';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ x: number, y: number }}
 */
function clientXYToCanvasXY(canvas, clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return {
        x: (clientX - r.left) * scaleX,
        y: (clientY - r.top) * scaleY
    };
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {null|{ left: number, right: number, top: number, bottom: number, value: number, dateLabel: string }}
 */
function findRecentBarAtCanvasXY(x, y) {
    if (!recentBarHitRegions || recentBarHitRegions.length === 0) {
        return null;
    }
    for (let i = recentBarHitRegions.length - 1; i >= 0; i--) {
        const reg = recentBarHitRegions[i];
        if (x >= reg.left && x <= reg.right && y >= reg.top && y <= reg.bottom) {
            return reg;
        }
    }
    return null;
}

function onRecentStatsChartPointerDown(event) {
    if (!statsModal || statsModal.style.display !== 'flex' || !recentStatsChart) {
        return;
    }
    hideCumulativeChartTooltip();
    const { x, y } = clientXYToCanvasXY(recentStatsChart, event.clientX, event.clientY);
    const region = findRecentBarAtCanvasXY(x, y);
    if (region) {
        showBarChartTooltip(region);
    } else {
        hideBarChartTooltip();
    }
}

function hideCumulativeChartTooltip() {
    if (!cumulativeChartTooltip) {
        return;
    }
    cumulativeChartTooltip.hidden = true;
    cumulativeChartTooltip.textContent = '';
    cumulativeChartTooltip.style.left = '';
    cumulativeChartTooltip.style.top = '';
    cumulativeChartTooltip.style.transform = '';
    cumulativeChartTooltip.style.visibility = '';
}

/**
 * @param {{ cx: number, cy: number, value: number, dateLabel: string }} region
 */
function showCumulativeChartTooltip(region) {
    if (!cumulativeChartTooltip || !cumulativeStatsChart) {
        return;
    }
    const wrap = cumulativeChartTooltip.parentElement;
    if (!wrap) {
        return;
    }

    cumulativeChartTooltip.textContent = `${region.dateLabel}  누적 ${region.value.toLocaleString()}보`;
    cumulativeChartTooltip.hidden = false;
    cumulativeChartTooltip.style.visibility = 'hidden';

    const w = cumulativeStatsChart.width;
    const h = cumulativeStatsChart.height;
    const scaleX = wrap.clientWidth / w;
    const scaleY = wrap.clientHeight / h;
    const pointX = region.cx * scaleX;
    const pointY = region.cy * scaleY;

    const placeTooltip = () => {
        const pad = 6;
        const tipW = cumulativeChartTooltip.offsetWidth;
        const wr = wrap.clientWidth;
        let leftPx = pointX - tipW / 2;
        leftPx = Math.max(pad, Math.min(leftPx, wr - tipW - pad));
        cumulativeChartTooltip.style.left = `${leftPx}px`;
        cumulativeChartTooltip.style.top = `${pointY}px`;
        cumulativeChartTooltip.style.transform = 'translate(0, calc(-100% - 10px))';
        cumulativeChartTooltip.style.visibility = 'visible';
    };

    requestAnimationFrame(() => {
        if (!cumulativeChartTooltip || cumulativeChartTooltip.hidden) {
            return;
        }
        placeTooltip();
    });
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {null|{ cx: number, cy: number, value: number, dateLabel: string, hitR: number }}
 */
function findCumulativeDotAtCanvasXY(x, y) {
    if (!cumulativeDotHitRegions || cumulativeDotHitRegions.length === 0) {
        return null;
    }
    for (let i = cumulativeDotHitRegions.length - 1; i >= 0; i--) {
        const reg = cumulativeDotHitRegions[i];
        const dx = x - reg.cx;
        const dy = y - reg.cy;
        if (dx * dx + dy * dy <= reg.hitR * reg.hitR) {
            return reg;
        }
    }
    return null;
}

function onCumulativeStatsChartPointerDown(event) {
    if (!statsModal || statsModal.style.display !== 'flex' || !cumulativeStatsChart) {
        return;
    }
    hideBarChartTooltip();
    const { x, y } = clientXYToCanvasXY(cumulativeStatsChart, event.clientX, event.clientY);
    const region = findCumulativeDotAtCanvasXY(x, y);
    if (region) {
        showCumulativeChartTooltip(region);
    } else {
        hideCumulativeChartTooltip();
    }
}

/**
 * Canvas 2D로 주간 차트 렌더링
 * - 최근 30일 누적: 목표 꺾은선 + 실제 누적 꺾은선
 * - 최근 7일: 막대 + 일주일 평균·평균 걸어야 될 보조선(문구는 그래프 아래)
 * @param {HTMLCanvasElement} canvas
 * @param {null|object} series — buildLast30DaysCumulativeSeries / buildRecentWeekSeries 반환값
 */
function drawWeeklyChart(canvas, series) {
    if (!canvas) {
        return;
    }
    if (canvas === recentStatsChart) {
        recentBarHitRegions = null;
        hideBarChartTooltip();
    }
    if (canvas === cumulativeStatsChart) {
        cumulativeDotHitRegions = null;
        hideCumulativeChartTooltip();
    }
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (!series) {
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '24px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('저장된 데이터가 없습니다.', width / 2, height / 2);
        return;
    }

    const {
        labels,
        values,
        averageValue,
        averageLabel,
        averageColor,
        referenceValues,
        referenceLabel,
        referenceColor,
        requiredAverageValue,
        requiredAverageLabel,
        requiredAverageColor
    } = series;

    /** 최근 7일 통계: 막대 그래프 (30일 누적용 reference 곡선은 없을 때) */
    const isBarChart = typeof averageValue === 'number' && !Array.isArray(referenceValues);

    const has30DayReference =
        !isBarChart &&
        Array.isArray(referenceValues) &&
        referenceValues.length === values.length;

    const targetLabelFontPx = 38;
    const barLegendFontPx = 38;
    const dateAxisLabelFontPx = 28;
    const padding = {
        top: has30DayReference ? 48 : 30,
        right: 30,
        left: 75,
        bottom: isBarChart ? 172 : 72
    };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Y축 스케일: 막대·선형 모두 평균선 값 포함(막대 위 보조선이 잘리지 않게)
    const allValues = [...values];
    if (typeof averageValue === 'number') {
        allValues.push(averageValue);
    }
    if (typeof requiredAverageValue === 'number') {
        allValues.push(requiredAverageValue);
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
    const baselineY = height - padding.bottom;

    // 가로 격자선
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // Y축·X축 뼈대
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = '#34495e';
    ctx.font = '21px Segoe UI';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const value = Math.round(yMax - (yRange * i) / 4);
        const y = padding.top + (chartH * i) / 4;
        ctx.fillText(`${value.toLocaleString()}`, padding.left - 8, y + 4);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${dateAxisLabelFontPx}px Segoe UI`;
    const dateLabelY = baselineY + 38;
    labels.forEach((label, idx) => {
        if (!label) {
            return;
        }
        const x = isBarChart
            ? padding.left + (chartW * (idx + 0.5)) / labels.length
            : xAt(idx);
        ctx.fillText(label, x, dateLabelY);
    });

    // 최근 7일: 막대 (X는 슬롯 중앙 기준)
    if (isBarChart) {
        const slotW = chartW / labels.length;
        const barW = Math.max(8, slotW * 0.52);
        if (canvas === recentStatsChart) {
            recentBarHitRegions = [];
        }
        values.forEach((value, idx) => {
            const cx = padding.left + slotW * (idx + 0.5);
            const left = cx - barW / 2;
            const top = yAt(value);
            const belowRequired =
                typeof requiredAverageValue === 'number' && value < requiredAverageValue;
            ctx.fillStyle = belowRequired ? '#a9d6f2' : '#3498db';
            ctx.fillRect(left, top, barW, baselineY - top);
            ctx.strokeStyle = belowRequired ? '#7eb8e0' : '#2980b9';
            ctx.lineWidth = 1;
            ctx.strokeRect(left, top, barW, baselineY - top);
            if (canvas === recentStatsChart && recentBarHitRegions) {
                recentBarHitRegions.push({
                    left,
                    top,
                    right: left + barW,
                    bottom: baselineY,
                    value: Math.round(value),
                    dateLabel: labels[idx] || ''
                });
            }
        });
    } else if (Array.isArray(referenceValues) && referenceValues.length === values.length) {
        // 최근 30일 누적 모드: 목표 누적 꺾은선
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
        ctx.textBaseline = 'top';
        ctx.font = `${targetLabelFontPx}px Segoe UI`;
        ctx.fillText(referenceLabel || '기준선', padding.left + 6, padding.top + 4);
        ctx.textBaseline = 'alphabetic';
    }

    if (typeof averageValue === 'number') {
        const avgY = yAt(averageValue);
        const avgLineColor = averageColor || '#e74c3c';
        ctx.strokeStyle = avgLineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, avgY);
        ctx.lineTo(width - padding.right, avgY);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!isBarChart) {
            ctx.fillStyle = avgLineColor;
            ctx.textAlign = 'right';
            ctx.font = '21px Segoe UI';
            ctx.fillText(averageLabel, width - padding.right - 6, avgY - 8);
        }
    }

    if (typeof requiredAverageValue === 'number') {
        const reqY = yAt(requiredAverageValue);
        const lineColor = requiredAverageColor || '#27ae60';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(padding.left, reqY);
        ctx.lineTo(width - padding.right, reqY);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!isBarChart) {
            ctx.fillStyle = lineColor;
            ctx.textAlign = 'left';
            ctx.font = '21px Segoe UI';
            ctx.fillText(requiredAverageLabel || '평균 걸어야 될 걸음', padding.left + 6, reqY + 22);
        }
    }

    // 최근 30일 누적: 실제 누적 꺾은선 + 점
    if (!isBarChart) {
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

        ctx.fillStyle = '#3498db';
        const dotRadiusSmall = 4;
        const dotRadiusLabeled = 8;
        const dotHitPadding = 6;
        if (canvas === cumulativeStatsChart) {
            cumulativeDotHitRegions = [];
        }
        values.forEach((value, idx) => {
            const x = xAt(idx);
            const y = yAt(value);
            const r = labels[idx] ? dotRadiusLabeled : dotRadiusSmall;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            if (canvas === cumulativeStatsChart && labels[idx] && cumulativeDotHitRegions) {
                cumulativeDotHitRegions.push({
                    cx: x,
                    cy: y,
                    hitR: dotRadiusLabeled + dotHitPadding,
                    value: Math.round(value),
                    dateLabel: labels[idx]
                });
            }
        });
    }

    if (isBarChart) {
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = `${barLegendFontPx}px Segoe UI`;
        let legY = dateLabelY + dateAxisLabelFontPx + 14;
        if (typeof averageValue === 'number') {
            ctx.fillStyle = averageColor || '#e74c3c';
            ctx.fillText(averageLabel, padding.left, legY);
            legY += barLegendFontPx + 10;
        }
        if (typeof requiredAverageValue === 'number') {
            ctx.fillStyle = requiredAverageColor || '#27ae60';
            ctx.fillText(requiredAverageLabel || '평균 걸어야 될 걸음', padding.left, legY);
        }
        ctx.textBaseline = 'alphabetic';
    }
}

/** 통계 풀팝업: 위 최근 30일 누적, 아래 최근 7일 */
function openStatsModal() {
    drawWeeklyChart(cumulativeStatsChart, buildLast30DaysCumulativeSeries());
    drawWeeklyChart(recentStatsChart, buildRecentWeekSeries());
    updateRecentStatsEncouragement();
    statsModal.style.display = 'flex';
}

function closeStatsModal() {
    hideBarChartTooltip();
    hideCumulativeChartTooltip();
    statsModal.style.display = 'none';
}

/**
 * 설정 저장 직전 스냅샷을 OLD_HISTORY_KEY에 JSON으로 보관 (히스토리 + 시작일·종료일·목표)
 * @returns {string} 저장한 JSON 문자열
 */
function writeFullBackupToOldKey() {
    let historyObj = {};
    try {
        const pr = localStorage.getItem(HISTORY_KEY);
        if (pr) {
            const parsed = JSON.parse(pr);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                historyObj = parsed;
            }
        }
    } catch (e) {
        historyObj = {};
    }
    const payload = {
        history: historyObj,
        settings: {
            startDateKey: dateToKey(appStartDate),
            endDateKey: dateToKey(appEndDate),
            targetSteps: appTargetSteps
        }
    };
    const out = JSON.stringify(payload);
    localStorage.setItem(OLD_HISTORY_KEY, out);
    return out;
}

/**
 * 설정 저장: 기존 히스토리·설정을 OLD_HISTORY_KEY에 백업 후 히스토리 초기화·새 기간·목표 반영
 */
function applySettingsSaveFromModal() {
    const startK = settingsStartDateInput.value;
    const endK = settingsEndDateInput.value;
    const targetN = parseInt(settingsTargetStepsInput.value, 10);

    if (!startK || !endK) {
        alert('시작일과 종료일을 입력해 주세요.');
        return;
    }
    if (!Number.isFinite(targetN) || targetN < 1) {
        alert('목표 걸음수는 1 이상의 숫자로 입력해 주세요.');
        return;
    }

    const sd = keyToDate(startK);
    const ed = keyToDate(endK);
    if (toDateOnly(ed).getTime() < toDateOnly(sd).getTime()) {
        alert('종료일은 시작일과 같거나 이후여야 합니다.');
        return;
    }

    writeFullBackupToOldKey();

    appStartDate = sd;
    appEndDate = ed;
    appTargetSteps = Math.round(targetN);
    saveAppSettingsToStorage();
    saveHistory({});
    refreshStatsTargetHint();

    settingsStartDateInput.disabled = true;
    settingsEndDateInput.disabled = true;
    settingsTargetStepsInput.disabled = true;
    settingsSaveBtn.disabled = true;

    syncBaseDatePickerBounds();
    setSelectedBaseDate(clampDateToChallengeRange(getYesterday()));

    updateStats();
    updateSettingsRestoreButton();
    closeSettingsModal();
}

/**
 * OLD_HISTORY_KEY 백업을 복구: 히스토리 + (있으면) 시작일·종료일·목표.
 * 예전 형식(히스토리 객체만 JSON)도 그대로 히스토리로 복구한다.
 */
function restoreHistoryFromBackup() {
    if (!hasOldHistoryBackup()) {
        return;
    }
    const backup = localStorage.getItem(OLD_HISTORY_KEY);
    let historyObj = {};
    let settingsFromBackup = null;

    try {
        const parsed = JSON.parse(backup);
        if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            parsed.history != null &&
            parsed.settings != null &&
            typeof parsed.history === 'object' &&
            !Array.isArray(parsed.history) &&
            typeof parsed.settings === 'object' &&
            !Array.isArray(parsed.settings)
        ) {
            historyObj = parsed.history;
            settingsFromBackup = parsed.settings;
        } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            historyObj = parsed;
        }
    } catch (e) {
        historyObj = {};
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyObj));

    if (
        settingsFromBackup &&
        typeof settingsFromBackup.startDateKey === 'string' &&
        typeof settingsFromBackup.endDateKey === 'string' &&
        Number.isFinite(Number(settingsFromBackup.targetSteps))
    ) {
        const rs = keyToDate(settingsFromBackup.startDateKey);
        const re = keyToDate(settingsFromBackup.endDateKey);
        const rt = Math.max(1, Math.round(Number(settingsFromBackup.targetSteps)));
        if (toDateOnly(re).getTime() >= toDateOnly(rs).getTime()) {
            appStartDate = rs;
            appEndDate = re;
            appTargetSteps = rt;
            saveAppSettingsToStorage();
        }
    }

    localStorage.removeItem(OLD_HISTORY_KEY);

    updateSettingsRestoreButton();
    syncBaseDatePickerBounds();
    setSelectedBaseDate(clampDateToChallengeRange(getYesterday()));

    settingsStartDateInput.value = dateToKey(appStartDate);
    settingsEndDateInput.value = dateToKey(appEndDate);
    settingsTargetStepsInput.value = String(appTargetSteps);

    refreshStatsTargetHint();
    updateStats();
}

// ---------------------------------------------------------------------------
// 포맷·일수 (통계에서 사용하는 "포함 일수" 규칙)
// ---------------------------------------------------------------------------

/**
 * 시작일과 종료일 둘 다 달력상 하루로 포함한 경과 일수
 * 예: 같은 날이면 1일
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number}
 */
function calculateDaysPassed(startDate, endDate) {
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.round(timeDiff / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * UI용 한글 날짜 문자열
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ---------------------------------------------------------------------------
// 이벤트 바인딩
// ---------------------------------------------------------------------------

saveBtn.addEventListener('click', saveData);
clearStepsBtn.addEventListener('click', () => {
    stepsInput.value = '';
    stepsInput.focus();
});

if (stepsModeCumulative) {
    stepsModeCumulative.addEventListener('change', onStepsEntryModeChange);
}
if (stepsModeDaily) {
    stepsModeDaily.addEventListener('change', onStepsEntryModeChange);
}
statsBtn.addEventListener('click', openStatsModal);
closeStatsBtn.addEventListener('click', closeStatsModal);

if (recentStatsChart) {
    recentStatsChart.addEventListener('pointerdown', onRecentStatsChartPointerDown);
}
if (cumulativeStatsChart) {
    cumulativeStatsChart.addEventListener('pointerdown', onCumulativeStatsChartPointerDown);
}

settingsBtn.addEventListener('click', openSettingsModal);
closeSettingsBtn.addEventListener('click', closeSettingsModal);
settingsResetBtn.addEventListener('click', () => {
    settingsStartDateInput.value = dateToKey(new Date());
    settingsStartDateInput.disabled = false;
    settingsEndDateInput.disabled = false;
    settingsTargetStepsInput.disabled = false;
    settingsSaveBtn.disabled = false;
});
settingsSaveBtn.addEventListener('click', applySettingsSaveFromModal);
settingsRestoreBtn.addEventListener('click', restoreHistoryFromBackup);

settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
});

/** 날짜 입력은 네이티브 picker로 열기 (지원 시 showPicker, 아니면 click 폴백) */
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
    if (!isDateInRange(pickedDate, appStartDate, appEndDate)) {
        alert(`기준 날짜는 ${formatDate(appStartDate)}부터 ${formatDate(appEndDate)}까지 선택할 수 있습니다.`);
        setSelectedBaseDate(clampDateToChallengeRange(getYesterday()));
        return;
    }

    setSelectedBaseDate(pickedDate);
    updateStats(baseDatePicker.value);
});

/** 모달 배경(오버레이) 클릭 시 닫기 — 내용물 클릭은 event.target이 달라서 무시됨 */
statsModal.addEventListener('click', (event) => {
    if (event.target === statsModal) {
        closeStatsModal();
    }
});

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    loadAppSettings();
    migrateLegacyDataIfNeeded();
    loadStepsEntryModeFromStorage();
    updateStepsInputMainLabel();
    syncBaseDatePickerBounds();
    setSelectedBaseDate(clampDateToChallengeRange(getYesterday()));

    updateStats();
});
