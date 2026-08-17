import fs from 'fs/promises';

async function generateSeed() {
  const data = await fs.readFile('data/usda-foods.json', 'utf8');
  const foods = JSON.parse(data);

  let sql = `-- ==============================================================================
-- USDA FoodData Central Dataset Seed
-- ==============================================================================
-- Data Source: USDA FoodData Central (Foundation & SR Legacy)
-- Description: This file is a controlled food-data seed for the application.
-- 
-- IMPORTANT NOTES:
-- 1. All nutritional values are normalized per 100g.
-- 2. Preparation state is explicitly included in the food name/metadata (e.g., Raw, Dry).
-- 3. IDEMPOTENCY WARNING: If the 'food_database' schema lacks a UNIQUE constraint 
--    on the 'name' column, running this script multiple times WILL create duplicates.
--    Please execute this script ONLY ONCE unless resetting the database.
-- ==============================================================================\n\n`;

  sql += `INSERT INTO food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, is_active)\nVALUES\n`;

  const values = foods.map((f, i) => {
    // Escape single quotes in names if any
    const name = f.name.replace(/'/g, "''");
    // Ensure numeric formatting
    const isLast = i === foods.length - 1;
    return `  ('${name}', '${f.category}', ${f.serving_size}, '${f.serving_unit}', ${f.calories}, ${f.protein}, ${f.carbs}, ${f.fat}, true)${isLast ? ';' : ','}`;
  });

  sql += values.join('\n') + '\n\n';

  sql += `-- ==============================================================================
-- Verification Queries
-- ==============================================================================

-- 1. Total inserted food count
SELECT COUNT(*) AS total_foods FROM food_database;

-- 2. Count by category
SELECT category, COUNT(*) AS category_count 
FROM food_database 
GROUP BY category 
ORDER BY category;

-- 3. Count of active foods
SELECT COUNT(*) AS active_foods FROM food_database WHERE is_active = true;

-- 4. Duplicate canonical names (Should return 0 rows)
SELECT name, COUNT(*) 
FROM food_database 
GROUP BY name 
HAVING COUNT(*) > 1;

-- 5. Records with serving_size != 100 (Should return 0 rows)
SELECT id, name, serving_size FROM food_database WHERE serving_size != 100;

-- 6. Records with serving_unit != 'grams' (Should return 0 rows)
SELECT id, name, serving_unit FROM food_database WHERE serving_unit != 'grams';

-- 7. Records with NULL macronutrients (Should return 0 rows)
SELECT id, name 
FROM food_database 
WHERE calories IS NULL OR protein IS NULL OR carbs IS NULL OR fat IS NULL;

-- 8. Records with negative macro values (Should return 0 rows)
SELECT id, name, calories, protein, carbs, fat 
FROM food_database 
WHERE calories < 0 OR protein < 0 OR carbs < 0 OR fat < 0;
`;

  // Make sure supabase directory exists
  await fs.mkdir('supabase', { recursive: true });
  await fs.writeFile('supabase/seed.sql', sql);
  
  console.log('Successfully generated supabase/seed.sql');
}

generateSeed();
