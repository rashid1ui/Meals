const targets = { p: 153, f: 71, c: 251, k: 2254 };

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
    section.innerHTML = `<div class="meal-header">${meal.name}</div><div class="food-list"></div>`;
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
        updateDashboard();
    }
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

    // Simple value update
    document.getElementById('p-val').innerText = current.p;
    document.getElementById('f-val').innerText = current.f;
    document.getElementById('c-val').innerText = current.c;
    document.getElementById('k-val').innerText = current.k;

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

loadTheme();
loadState();
updateDashboard();
