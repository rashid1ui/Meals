const targets = { p: 153, f: 71, c: 251, k: 2254 };

const mealIcons = [
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meal-icon" style="margin-right: 8px;"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meal-icon" style="margin-right: 8px;"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>`,
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meal-icon" style="margin-right: 8px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meal-icon" style="margin-right: 8px;"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.6 21.4 2.6 5.4"/><path d="m21.5 15.3-2.8-2.8c-.8-.8-2.1-.8-2.9 0l-1.3 1.3c-.8.8-.8 2.1 0 2.9l2.8 2.8c.8.8 2.1.8 2.9 0l1.3-1.3c.8-.8.8-2.1 0-2.9z"/><path d="m8.7 2.5-2.8 2.8c-.8.8-.8 2.1 0 2.9l1.3 1.3c.8.8 2.1.8 2.9 0l2.8-2.8c.8-.8.8-2.1 0-2.9l-1.3-1.3c-.8-.8-2.1-.8-2.9 0z"/></svg>`,
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meal-icon" style="margin-right: 8px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`
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
    const savedState = localStorage.getItem('dietTrackerStatePro');
    if (savedState) {
        const checkedItems = JSON.parse(savedState);
        checkedItems.forEach(id => {
            const cb = document.getElementById(id);
            if (cb) {
                cb.checked = true;
                // Add active class immediately on load
                cb.closest('.food-row').classList.add('active');
            }
        });
    }
}

function resetDay() {
    if (confirm("Are you sure you want to clear today's selection?")) {
        checkboxes.forEach(cb => cb.checked = false);
        currentWater = 0;
        updateWaterUI();
        saveWaterState();
        updateDashboard();
    }
}

const currentDisplayed = { p: 0, f: 0, c: 0, k: 0 };
let hasCelebrated = false;

function animateValue(id, start, end, duration) {
    if (start === end) return;
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const val = progress * (end - start) + start;
        obj.innerHTML = Math.floor(val);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
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

    // Check for celebration
    if (current.p >= targets.p && current.f >= targets.f && current.c >= targets.c && current.k >= targets.k) {
        if (!hasCelebrated && typeof confetti === 'function') {
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.6 }
            });
            hasCelebrated = true;
        }
    } else {
        hasCelebrated = false;
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

// Water Tracker Logic
const waterGlassesContainer = document.getElementById('water-glasses');
const waterCount = document.getElementById('water-count');
let currentWater = 0;
const totalGlasses = 8;

function initWaterTracker() {
    if(!waterGlassesContainer) return;
    waterGlassesContainer.innerHTML = '';
    for (let i = 0; i < totalGlasses; i++) {
        const glass = document.createElement('div');
        glass.className = 'water-glass';
        glass.addEventListener('click', () => toggleWater(i));
        waterGlassesContainer.appendChild(glass);
    }
    loadWaterState();
}

function toggleWater(index) {
    // If clicking the current exact level, unfill it (decrease by 1)
    if (index === currentWater - 1) {
        currentWater = index;
    } else {
        currentWater = index + 1;
    }
    updateWaterUI();
    saveWaterState();
}

function updateWaterUI() {
    if(!waterCount) return;
    const glasses = document.querySelectorAll('.water-glass');
    glasses.forEach((glass, idx) => {
        if (idx < currentWater) {
            glass.classList.add('full');
        } else {
            glass.classList.remove('full');
        }
    });
    waterCount.innerText = currentWater;
}

function saveWaterState() {
    localStorage.setItem('dietTrackerWaterPro', currentWater.toString());
}

function loadWaterState() {
    const saved = localStorage.getItem('dietTrackerWaterPro');
    if (saved) {
        currentWater = parseInt(saved);
        updateWaterUI();
    }
}

initWaterTracker();
loadTheme();
loadState();
updateDashboard();
