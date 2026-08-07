const targets = { p: 153, f: 71, c: 251, k: 2254 };

const mealIcons = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6"/><path d="M8.46 10.46l-4.24-4.24"/><path d="M15.54 10.46l4.24-4.24"/><path d="M22 22H2"/><path d="M8 22v-3a4 4 0 0 1 8 0v3"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.6 21.4 2.6 5.4"/><path d="m21.5 15.3-2.8-2.8c-.8-.8-2.1-.8-2.9 0l-1.3 1.3c-.8.8-.8 2.1 0 2.9l2.8 2.8c.8.8 2.1.8 2.9 0l1.3-1.3c.8-.8.8-2.1 0-2.9z"/><path d="m8.7 2.5-2.8 2.8c-.8.8-.8 2.1 0 2.9l1.3 1.3c.8.8 2.1.8 2.9 0l2.8-2.8c.8-.8.8-2.1 0-2.9l-1.3-1.3c-.8-.8-2.1-.8-2.9 0z"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
];


const meals = [
    {
        name: "Meal 1 (Breakfast)",
        items: [
            { name: "Whole Eggs", num: "3", unit: "Pieces", p: 18, f: 15, c: 2, k: 234 },
            { name: "Reef High Fiber Bread", num: "1", unit: "Piece", p: 3, f: 1, c: 14, k: 76 },
            { name: "Almonds", num: "10", unit: "Grams", p: 2, f: 5, c: 2, k: 58 }
        ]
    },
    {
        name: "Meal 2 (Lunch)",
        items: [
            { name: "Chicken Breast", num: "206", unit: "Grams", p: 45, f: 3, c: 0, k: 210 },
            { name: "Sweet Potato", num: "250", unit: "Grams", p: 4, f: 0, c: 50, k: 215 },
            { name: "Broccoli", num: "50", unit: "Grams", p: 1, f: 0, c: 3, k: 17 },
            { name: "Olive Oil", num: "1", unit: "Tbsp", p: 0, f: 15, c: 0, k: 135 }
        ]
    },
    {
        name: "Meal 3 (Pre-Workout)",
        items: [
            { name: "Oats", num: "100", unit: "Grams", p: 13, f: 7, c: 60, k: 355 },
            { name: "Milk", num: "100", unit: "Grams", p: 3, f: 3, c: 5, k: 61 },
            { name: "Honey", num: "20", unit: "Grams", p: 0, f: 0, c: 16, k: 65 },
            { name: "Banana / Apple", num: "1", unit: "Piece", p: 1, f: 0, c: 27, k: 112 }
        ]
    },
    {
        name: "Meal 4 (Post-Workout)",
        items: [
            { name: "Whey Protein", num: "1", unit: "Scoop", p: 23, f: 2, c: 2, k: 118 },
            { name: "Banana / Apple", num: "1", unit: "Piece", p: 1, f: 0, c: 27, k: 112 }
        ]
    },
    {
        name: "Meal 5 (Dinner)",
        items: [
            { name: "Minced Beef Lean 5%", num: "150", unit: "Grams", p: 27, f: 8, c: 0, k: 176 },
            { name: "Sesame Burger Bun", num: "1", unit: "Piece", p: 7, f: 3, c: 38, k: 207 },
            { name: "Processed Cheese", num: "1", unit: "Piece", p: 3, f: 5, c: 1, k: 56 },
            { name: "Vegetables", num: "100", unit: "Grams", p: 2, f: 3, c: 4, k: 47 }
        ]
    }
];

const container = document.getElementById('meals-container');

// Render Meals
meals.forEach((meal, mIndex) => {
    const section = document.createElement('div');
    section.className = 'meal-section';
    section.id = `meal-${mIndex}`;
    section.innerHTML = `<div class="meal-header">${mealIcons[mIndex] || ''}${meal.name}</div><div class="food-list"></div>`;
    const list = section.querySelector('.food-list');

    meal.items.forEach((item, iIndex) => {
        const id = `m${mIndex}-i${iIndex}`;
        const row = document.createElement('div');
        row.className = 'food-row';

        row.innerHTML = `
            <label class="food-left" for="${id}">
                <input type="checkbox" id="${id}" class="custom-checkbox food-checkbox" 
                    data-p="${item.p}" data-f="${item.f}" data-c="${item.c}" data-k="${item.k}">
                <div class="food-name-container">
                    <span class="food-name-en">${item.name}</span>
                </div>
            </label>
            <div class="food-right">
                <div class="macros-string">
                    <span class="macro-tag m-p">${item.p} Protein</span>
                    <span class="macro-tag m-f">${item.f} Fat</span>
                    <span class="macro-tag m-c">${item.c} Carbs</span>
                    <span class="macro-tag m-k">${item.k} Calories</span>
                </div>
                <div class="qty-box">
                    <span class="qty-num">${item.num}</span>
                    <span class="qty-unit">${item.unit}</span>
                </div>
            </div>
        `;
        list.appendChild(row);
    });
    container.appendChild(section);
});

const checkboxes = document.querySelectorAll('.food-checkbox');

function saveState() {
    const checkedItems = [];
    checkboxes.forEach(cb => {
        if (cb.checked) checkedItems.push(cb.id);
    });
    localStorage.setItem('dietTrackerStatePro', JSON.stringify(checkedItems));
}

function loadState() {
    try {
        const savedState = localStorage.getItem('dietTrackerStatePro');
        if (savedState) {
            const checkedItems = JSON.parse(savedState);
            if (Array.isArray(checkedItems)) {
                checkedItems.forEach(id => {
                    const cb = document.getElementById(id);
                    if (cb) {
                        cb.checked = true;
                        cb.closest('.food-row').classList.add('active');
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error loading state:", e);
    }
}

// A logical day starts at 3:00 AM. Time before 3:00 AM belongs to the previous calendar day.
function getLogicalDate(dateObj = new Date()) {
    const d = new Date(dateObj.getTime());
    d.setHours(d.getHours() - 3);
    return d;
}

function checkAutoReset() {
    const currentLogicalDateStr = getLocalDateStr(getLogicalDate());
    let activeLogicalDateStr = localStorage.getItem('dietTrackerActiveDatePro');
    
    if (!activeLogicalDateStr) {
        localStorage.setItem('dietTrackerActiveDatePro', currentLogicalDateStr);
        return;
    }
    
    if (activeLogicalDateStr !== currentLogicalDateStr) {
        // A new logical day has started.
        // Because stats are automatically saved on every click, yesterday is already fully saved.
        // Reset the active board for today.
        checkboxes.forEach(cb => cb.checked = false);
        saveState();
        
        if (typeof habitsData !== 'undefined' && !habitsData[currentLogicalDateStr]) {
            habitsData[currentLogicalDateStr] = { score: 0 };
        }
        
        updateDashboard();
        localStorage.setItem('dietTrackerActiveDatePro', currentLogicalDateStr);
    }
}

// Check for reset when tab becomes active again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkAutoReset();
    }
});

const currentDisplayed = { p: 0, f: 0, c: 0, k: 0 };
let hasCelebrated = false;
let celebrationTimeout = null;

// Store active animation requests to cancel them on rapid consecutive clicks
const animationRequests = {};

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    
    if (start === end) {
        obj.innerHTML = end;
        return;
    }
    
    // Cancel any existing animation for this element to prevent overlapping frames and jitter
    if (animationRequests[id]) {
        window.cancelAnimationFrame(animationRequests[id]);
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Easing function (easeOutCubic) for a more premium, natural slow-down at the end
        const easeOutProgress = 1 - Math.pow(1 - progress, 3);
        const val = easeOutProgress * (end - start) + start;
        
        obj.innerHTML = Math.floor(val);
        
        if (progress < 1) {
            animationRequests[id] = window.requestAnimationFrame(step);
        } else {
            // Ensure the exact final value is set at the end of the animation
            obj.innerHTML = end;
            delete animationRequests[id];
        }
    };
    
    animationRequests[id] = window.requestAnimationFrame(step);
}

function updateDashboard() {
    let current = { p: 0, f: 0, c: 0, k: 0 };

    checkboxes.forEach(cb => {
        const row = cb.closest('.food-row');
        if (cb.checked) {
            current.p += parseFloat(cb.dataset.p);
            current.f += parseFloat(cb.dataset.f);
            current.c += parseFloat(cb.dataset.c);
            current.k += parseFloat(cb.dataset.k);
            row.classList.add('active');
        } else {
            row.classList.remove('active');
        }
    });

    // Animated value update
    animateValue('p-val', currentDisplayed.p, current.p, 600);
    animateValue('f-val', currentDisplayed.f, current.f, 600);
    animateValue('c-val', currentDisplayed.c, current.c, 600);
    animateValue('k-val', currentDisplayed.k, current.k, 600);

    currentDisplayed.p = current.p;
    currentDisplayed.f = current.f;
    currentDisplayed.c = current.c;
    currentDisplayed.k = current.k;

    // Check for celebration (Protein OR Calories reach target)
    if (current.p >= targets.p || current.k >= targets.k) {
        if (!hasCelebrated) {
            hasCelebrated = true;
            const dashboard = document.getElementById('main-dashboard');
            if (dashboard) {
                // Clear any existing timeout to avoid glitching
                if (celebrationTimeout) clearTimeout(celebrationTimeout);
                
                // Trigger pure CSS celebration (glow, checkmark, confetti)
                dashboard.classList.add('celebrating');
                
                // Remove class after 3 seconds for smooth fade out
                celebrationTimeout = setTimeout(() => {
                    dashboard.classList.remove('celebrating');
                }, 3000);
            }
        }
    } else {
        // Reset flag if user unchecks items falling below target
        hasCelebrated = false;
    }
    
    // Automatic Habit Tracking: Calories directly dictate 70% of the daily progress.
    // We instantly recalculate without page refresh.
    try {
        if (typeof calculateTodayScore === 'function') {
            calculateTodayScore();
            saveHabitsData();
            renderWeeklyCards();
            renderMonthlyHeatmap();
        }
    } catch(e) {
        console.error("Error auto-updating dashboard analytics:", e);
    }

    updateBar('p-bar', current.p, targets.p);
    updateBar('f-bar', current.f, targets.f);
    updateBar('c-bar', current.c, targets.c);
    updateBar('k-bar', current.k, targets.k);

    saveState();
}

function updateBar(id, value, max) {
    const bar = document.getElementById(id);
    let percent = (value / max) * 100;
    if (percent > 100) percent = 100;
    bar.style.width = percent + '%';
}

// Theme toggle logic
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

function loadTheme() {
    const savedTheme = localStorage.getItem('dietTrackerTheme');
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
    }
}

themeToggle.addEventListener('click', () => {
    body.classList.toggle('light-mode');
    if (body.classList.contains('light-mode')) {
        localStorage.setItem('dietTrackerTheme', 'light');
    } else {
        localStorage.setItem('dietTrackerTheme', 'dark');
    }
});

checkboxes.forEach(cb => cb.addEventListener('change', updateDashboard));

// --- Daily Progress & Habit Tracker Logic ---
const trackerTabs = document.querySelectorAll('.tab-btn');
const trackerContents = document.querySelectorAll('.tracker-content');

let habitsData = {};

function initHabitsTracker() {
    if (trackerTabs.length === 0) return;
    
    // 1. Tab Switching
    trackerTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            trackerTabs.forEach(t => t.classList.remove('active'));
            trackerContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // 2. Load Data
    try {
        const saved = localStorage.getItem('dietTrackerHabitsPro');
        if (saved) {
            habitsData = JSON.parse(saved);
        }
    } catch (e) {
        console.error("Error parsing habits data:", e);
        habitsData = {};
    }
    
    // Create today if not exists
    const todayStr = getLocalDateStr(getLogicalDate());
    if (!habitsData[todayStr]) {
        habitsData[todayStr] = {
            score: 0
        };
    }

    calculateTodayScore();
    renderWeeklyCards();
    renderMonthlyHeatmap();
}

function getLocalDateStr(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Analytics Helper Functions
function getScoreLevel(score) {
    if (score === 100) return 4;
    if (score >= 80) return 3;
    if (score >= 50) return 2;
    if (score >= 25) return 1;
    return 0;
}

function animateProgressRing(elementId, percent) {
    const ring = document.getElementById(elementId);
    if (!ring) return;
    const radius = ring.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (percent / 100) * circumference;
    
    // Set level color
    const level = getScoreLevel(percent);
    ring.className.baseVal = `ring-fill level-${level}`;
    
    // Animate
    setTimeout(() => {
        ring.style.strokeDashoffset = offset;
    }, 50);
}

function animateCounter(elementId, targetVal) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let current = parseInt(el.innerText) || 0;
    if (current === targetVal) return;
    
    const duration = 800; // ms
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart
        const ease = 1 - Math.pow(1 - progress, 4);
        const val = Math.round(current + (targetVal - current) * ease);
        el.innerText = val;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.innerText = targetVal;
        }
    }
    requestAnimationFrame(update);
}

function getCurrentMacros() {
    let macros = { p: 0, k: 0 };
    const foodCbs = document.querySelectorAll('.food-checkbox');
    foodCbs.forEach(cb => {
        if (cb.checked) {
            macros.p += parseFloat(cb.dataset.p);
            macros.k += parseFloat(cb.dataset.k);
        }
    });
    return macros;
}

function calculateTodayScore() {
    const todayStr = getLocalDateStr(getLogicalDate());
    const data = habitsData[todayStr];
    if (!data) return;
    
    // Nutrition = 100% of score (MIN of Calories and Protein Progress)
    const current = getCurrentMacros();
    
    let calPercent = (current.k / targets.k) * 100;
    if (calPercent > 100) calPercent = 100;
    if (calPercent < 0) calPercent = 0;
    
    let proPercent = (current.p / targets.p) * 100;
    if (proPercent > 100) proPercent = 100;
    if (proPercent < 0) proPercent = 0;
    
    const nutritionPercent = Math.min(calPercent, proPercent);
    
    data.score = Math.round(nutritionPercent);
    
    // Today UI Updates
    animateProgressRing('today-ring-fill', data.score);
    animateCounter('today-percent', data.score);
    
    // Streak logic needs history, render streaks
    const currentStreak = calculateCurrentStreak();
    document.getElementById('today-streak').innerText = currentStreak;
    
    // Calculate Yesterday Comparison
    let dYesterday = getLogicalDate();
    dYesterday.setDate(dYesterday.getDate() - 1);
    const yStr = getLocalDateStr(dYesterday);
    const yData = habitsData[yStr] || { score: 0 };
    
    const yScoreEl = document.getElementById('yesterday-score');
    const yDeltaEl = document.getElementById('yesterday-delta');
    
    if (yScoreEl && yDeltaEl) {
        yScoreEl.innerText = `${yData.score}%`;
        const diff = data.score - yData.score;
        if (diff > 0) {
            yDeltaEl.innerText = `▲ +${diff}%`;
            yDeltaEl.className = 'y-delta positive';
        } else if (diff < 0) {
            yDeltaEl.innerText = `▼ ${diff}%`;
            yDeltaEl.className = 'y-delta negative';
        } else {
            yDeltaEl.innerText = `— Same`;
            yDeltaEl.className = 'y-delta neutral';
        }
    }
}

function saveHabitsData() {
    localStorage.setItem('dietTrackerHabitsPro', JSON.stringify(habitsData));
}

function renderWeeklyCards() {
    const container = document.getElementById('weekly-cards');
    if(!container) return;
    container.innerHTML = '';
    
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let totalScore = 0;
    let completed = 0, partial = 0, missed = 0;
    
    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = getLogicalDate();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateStr(d);
        const dayName = i === 0 ? 'Today' : days[d.getDay()];
        const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const data = habitsData[dateStr] || { score: 0 };
        totalScore += data.score;
        
        if (data.score >= 80) completed++;
        else if (data.score >= 50) partial++;
        else missed++;
        
        const level = getScoreLevel(data.score);
        
        const card = document.createElement('div');
        card.className = `day-card`;
        
        let habitsHtml = '';
        if (habitsData[dateStr]) {
             habitsHtml = `
                <div class="history-habits-details">
                    <div class="history-habit-item ${data.workout?'done':''}">${data.workout?'✅':'✗'} Workout</div>
                    <div class="history-habit-item ${data.sleep?'done':''}">${data.sleep?'✅':'✗'} Sleep</div>
                </div>
             `;
        } else {
             habitsHtml = `<div class="history-habits-details"><div class="history-habit-item">No data</div></div>`;
        }

        card.innerHTML = `
            <div class="day-card-name">${dayName}</div>
            <div class="day-card-date">${shortDate}</div>
            <div class="mini-ring">
                <svg viewBox="0 0 44 44">
                    <circle class="ring-bg level-none" cx="22" cy="22" r="18"></circle>
                    <circle class="ring-fill level-${level}" cx="22" cy="22" r="18" style="stroke-dashoffset: ${113 - (data.score/100)*113}"></circle>
                </svg>
                <div class="mini-pct">${data.score}%</div>
            </div>
            ${habitsHtml}
        `;
        
        card.addEventListener('click', () => {
            const details = card.querySelector('.history-habits-details');
            if(details.style.display === 'block') details.style.display = 'none';
            else details.style.display = 'block';
        });
        
        container.appendChild(card);
    }
    
    const avg = Math.round(totalScore / 7);
    animateCounter('week-percent', avg);
    animateProgressRing('week-ring-fill', avg);
    
    document.getElementById('week-streak').innerText = calculateCurrentStreak();
    document.getElementById('week-best-streak').innerText = calculateLongestStreak();
    document.getElementById('week-completed').innerText = completed;
    document.getElementById('week-partial').innerText = partial;
    document.getElementById('week-missed').innerText = missed;
}

function calculateCurrentStreak() {
    let streak = 0;
    let d = getLogicalDate();
    while (true) {
        const dateStr = getLocalDateStr(d);
        const data = habitsData[dateStr];
        if (!data || data.score < 100) {
            // If today is not 100% yet, check yesterday to not break the streak prematurely
            if (streak === 0 && getLocalDateStr(getLogicalDate()) === dateStr) {
                d.setDate(d.getDate() - 1);
                continue; 
            }
            break;
        }
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

function calculateLongestStreak() {
    let longest = 0;
    let current = 0;
    const dates = Object.keys(habitsData).sort();
    let lastDateObj = null;
    
    dates.forEach(dateStr => {
        if (habitsData[dateStr].score === 100) {
            const d = new Date(dateStr);
            if (lastDateObj) {
                const diffTime = Math.abs(d - lastDateObj);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if (diffDays === 1) {
                    current++;
                } else {
                    current = 1;
                }
            } else {
                current = 1;
            }
            lastDateObj = d;
            if (current > longest) longest = current;
        } else {
            current = 0;
            lastDateObj = null;
        }
    });
    return longest;
}

function renderMonthlyHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    const historyList = document.getElementById('monthly-history');
    if(!grid || !historyList) return;
    
    grid.innerHTML = '';
    historyList.innerHTML = '';
    
    let totalScore = 0;
    let perfect = 0, completed = 0, partial = 0, missed = 0;
    
    const daysToGenerate = 28;
    
    for (let i = daysToGenerate - 1; i >= 0; i--) {
        const d = getLogicalDate();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateStr(d);
        
        const data = habitsData[dateStr] || { score: 0 };
        totalScore += data.score;
        
        if (data.score === 100) perfect++;
        else if (data.score >= 80) completed++;
        else if (data.score >= 50) partial++;
        else missed++;
        
        let level = getScoreLevel(data.score);
        
        // Heatmap cell
        const cell = document.createElement('div');
        cell.className = `heat-cell bg-level-${level}`;
        cell.setAttribute('data-title', `${dateStr}: ${data.score}%`);
        
        // History row
        let statusText = 'Missed 🔴';
        if(data.score === 100) statusText = 'Perfect ⭐';
        else if(data.score >= 80) statusText = 'Completed ✅';
        else if(data.score >= 50) statusText = 'Partial 🟡';
        
        const row = document.createElement('div');
        row.className = 'history-row';
        
        let habitsHtml = '';
        if (habitsData[dateStr]) {
             habitsHtml = `
                <div class="history-habits-details">
                    <div class="history-habit-item ${data.workout?'done':''}">${data.workout?'✅':'✗'} Workout</div>
                    <div class="history-habit-item ${data.sleep?'done':''}">${data.sleep?'✅':'✗'} Sleep</div>
                </div>
             `;
        } else {
             habitsHtml = `<div class="history-habits-details"><div class="history-habit-item">No data</div></div>`;
        }
        
        row.innerHTML = `
            <div class="history-header">
                <span class="history-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span class="history-pct level-${level}">${data.score}%</span>
                <span class="history-status">${statusText}</span>
            </div>
            ${habitsHtml}
        `;
        
        row.addEventListener('click', () => {
            row.classList.toggle('expanded');
        });
        
        grid.appendChild(cell);
        
        // prepend to show newest first in history
        historyList.prepend(row);
    }
    
    const avg = Math.round(totalScore / daysToGenerate);
    animateCounter('month-percent', avg);
    animateProgressRing('month-ring-fill', avg);
    
    document.getElementById('month-streak').innerText = calculateCurrentStreak();
    document.getElementById('month-best-streak').innerText = calculateLongestStreak();
    document.getElementById('month-perfect').innerText = perfect;
    document.getElementById('month-completed').innerText = completed;
    document.getElementById('month-partial').innerText = partial;
    document.getElementById('month-missed').innerText = missed;
}

// Ensure the habits tracker initializes on load
initHabitsTracker();
loadTheme();
loadState();
checkAutoReset();
updateDashboard();
