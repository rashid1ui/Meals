const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lgctsdompyyzpokfqjvd.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Tolerances and constants
const CALORIE_TOLERANCE = 0.05; // 5%
const PROTEIN_TOLERANCE = 5; // grams
const CARBS_TOLERANCE = 10; // grams
const FAT_TOLERANCE = 5; // grams
const MAX_ATTEMPTS = 3;

// Quantity limit validation based on unit
function isValidQuantity(quantity, unit) {
    if (typeof quantity !== 'number' || isNaN(quantity) || !isFinite(quantity) || quantity <= 0) {
        return false;
    }
    const u = unit.toLowerCase();
    if (u === 'grams' || u === 'ml') return quantity <= 1000;
    if (u === 'pieces' || u === 'piece') return quantity <= 10;
    if (u === 'tbsp' || u === 'tablespoon') return quantity <= 10;
    if (u === 'tsp' || u === 'teaspoon') return quantity <= 20;
    if (u === 'scoop' || u === 'scoops') return quantity <= 5;
    return quantity <= 1000; // fallback reasonable limit
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!DEEPSEEK_API_KEY) {
            return res.status(500).json({ error: 'Server misconfiguration: AI key missing' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Missing Authorization header' });
        }
        const token = authHeader.replace('Bearer ', '');
        
        // Authenticate User
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const { targets, meals_per_day, protein_food_ids, carb_food_ids, fat_food_ids } = req.body;
        
        // Basic validation
        if (!targets || !targets.calories || !targets.protein || !targets.carbs || !targets.fat) {
            return res.status(400).json({ error: 'Invalid targets' });
        }
        if (![3, 4, 5, 6].includes(meals_per_day)) {
            return res.status(400).json({ error: 'Invalid meals_per_day. Must be 3, 4, 5, or 6.' });
        }
        if (!Array.isArray(protein_food_ids) || protein_food_ids.length === 0 ||
            !Array.isArray(carb_food_ids) || carb_food_ids.length === 0 ||
            !Array.isArray(fat_food_ids) || fat_food_ids.length === 0) {
            return res.status(400).json({ error: 'Must provide at least one food ID for each category.' });
        }

        const allRequestedIds = [...new Set([...protein_food_ids, ...carb_food_ids, ...fat_food_ids])];

        // Fetch foods from DB
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: dbFoods, error: dbError } = await supabase
            .from('food_database')
            .select('*')
            .in('id', allRequestedIds)
            .eq('is_active', true);

        if (dbError) throw new Error('Database error fetching foods');

        if (dbFoods.length !== allRequestedIds.length) {
            return res.status(400).json({ error: 'One or more requested foods are inactive or do not exist.' });
        }

        // Validate categories mathematically matching what frontend requested
        for (const id of protein_food_ids) {
            const f = dbFoods.find(x => x.id === id);
            if (!['protein', 'dairy'].includes(f.category)) return res.status(400).json({ error: `Food ${f.name} is not a valid protein source.` });
        }
        for (const id of carb_food_ids) {
            const f = dbFoods.find(x => x.id === id);
            if (!['carbohydrate', 'fruit'].includes(f.category)) return res.status(400).json({ error: `Food ${f.name} is not a valid carbohydrate source.` });
        }
        for (const id of fat_food_ids) {
            const f = dbFoods.find(x => x.id === id);
            if (!['fat'].includes(f.category)) return res.status(400).json({ error: `Food ${f.name} is not a valid fat source.` });
        }

        const foodContext = dbFoods.map(f => ({
            id: f.id,
            name: f.name,
            category: f.category,
            serving_size: f.serving_size,
            serving_unit: f.serving_unit
        }));

        let attempt = 1;
        let lastErrorReason = "";

        while (attempt <= MAX_ATTEMPTS) {
            const systemPrompt = `You are a strict meal-planning engine.
Build a practical daily meal plan using ONLY the food IDs provided.
You are NOT responsible for nutritional facts. Never invent calories, protein, carbs, fat, or nutritional values.
Only select food IDs and quantities.

REQUIREMENTS:
- Generate exactly ${meals_per_day} meals.
- Hit these daily targets as closely as possible based on standard nutritional math:
  Calories: ${targets.calories}
  Protein: ${targets.protein}g
  Carbohydrates: ${targets.carbs}g
  Fat: ${targets.fat}g
- You can use the same food across multiple meals if it makes culinary sense.

ALLOWED FOODS (Source of Truth for IDs and Units):
${JSON.stringify(foodContext, null, 2)}

${lastErrorReason ? `PREVIOUS ATTEMPT FAILED BECAUSE: ${lastErrorReason}\nPlease adjust the quantities or food selections to fix this.` : ''}

OUTPUT FORMAT:
Return ONLY raw, valid JSON. No markdown fences.
{
  "diet": {
    "name": "Personalized Diet",
    "meals": [
      {
        "name": "Breakfast",
        "foods": [
          {
            "food_id": "uuid-here",
            "quantity": 100,
            "unit": "grams"
          }
        ]
      }
    ]
  }
}`;

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: 'Generate the meal plan.' }
                    ],
                    temperature: 0.2
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`AI Provider Error: ${text}`);
            }

            const aiData = await response.json();
            let jsonStr = aiData.choices[0].message.content.trim();
            jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            
            let parsedDiet;
            try {
                parsedDiet = JSON.parse(jsonStr);
            } catch (e) {
                lastErrorReason = "Your last response was not valid JSON.";
                attempt++;
                continue;
            }

            if (!parsedDiet.diet || !Array.isArray(parsedDiet.diet.meals)) {
                lastErrorReason = "Your JSON structure was incorrect. Missing diet or meals array.";
                attempt++;
                continue;
            }

            if (parsedDiet.diet.meals.length !== meals_per_day) {
                lastErrorReason = `You generated ${parsedDiet.diet.meals.length} meals instead of the requested ${meals_per_day}.`;
                attempt++;
                continue;
            }

            // Calculation and Validation
            let validStructure = true;
            let dailyP = 0, dailyC = 0, dailyF = 0, dailyK = 0;
            
            const validatedResponse = {
                diet: {
                    name: parsedDiet.diet.name || "Personalized Diet",
                    meals: [],
                    daily_totals: {}
                }
            };

            for (let mIdx = 0; mIdx < parsedDiet.diet.meals.length; mIdx++) {
                const meal = parsedDiet.diet.meals[mIdx];
                const validatedMeal = {
                    name: meal.name || `Meal ${mIdx + 1}`,
                    sort_order: mIdx,
                    foods: [],
                    totals: { protein: 0, carbs: 0, fat: 0, calories: 0 }
                };

                for (const item of meal.foods || []) {
                    const dbFood = dbFoods.find(f => f.id === item.food_id);
                    if (!dbFood) {
                        lastErrorReason = `You used an invalid food_id: ${item.food_id}.`;
                        validStructure = false;
                        break;
                    }
                    
                    if (!isValidQuantity(item.quantity, dbFood.serving_unit)) {
                        lastErrorReason = `You provided an invalid or absurd quantity (${item.quantity}) for unit (${dbFood.serving_unit}) for food ${dbFood.name}.`;
                        validStructure = false;
                        break;
                    }

                    const multiplier = item.quantity / dbFood.serving_size;
                    const p = dbFood.protein * multiplier;
                    const c = dbFood.carbs * multiplier;
                    const f = dbFood.fat * multiplier;
                    const k = dbFood.calories * multiplier;

                    validatedMeal.foods.push({
                        food_id: dbFood.id,
                        name: dbFood.name,
                        quantity: item.quantity,
                        unit: dbFood.serving_unit,
                        protein: p,
                        carbs: c,
                        fat: f,
                        calories: k
                    });

                    validatedMeal.totals.protein += p;
                    validatedMeal.totals.carbs += c;
                    validatedMeal.totals.fat += f;
                    validatedMeal.totals.calories += k;

                    dailyP += p;
                    dailyC += c;
                    dailyF += f;
                    dailyK += k;
                }
                
                if (!validStructure) break;
                validatedResponse.diet.meals.push(validatedMeal);
            }

            if (!validStructure) {
                attempt++;
                continue;
            }

            // Tolerance Check
            const calDiff = Math.abs(dailyK - targets.calories);
            const calTol = targets.calories * CALORIE_TOLERANCE;
            
            if (calDiff > calTol) {
                lastErrorReason = `Total calories (${Math.round(dailyK)}) deviated from target (${targets.calories}) by more than 5%.`;
                attempt++;
                continue;
            }

            if (Math.abs(dailyP - targets.protein) > PROTEIN_TOLERANCE) {
                lastErrorReason = `Total protein (${Math.round(dailyP)}g) deviated from target (${targets.protein}g) by more than ${PROTEIN_TOLERANCE}g.`;
                attempt++;
                continue;
            }
            if (Math.abs(dailyC - targets.carbs) > CARBS_TOLERANCE) {
                lastErrorReason = `Total carbohydrates (${Math.round(dailyC)}g) deviated from target (${targets.carbs}g) by more than ${CARBS_TOLERANCE}g.`;
                attempt++;
                continue;
            }
            if (Math.abs(dailyF - targets.fat) > FAT_TOLERANCE) {
                lastErrorReason = `Total fat (${Math.round(dailyF)}g) deviated from target (${targets.fat}g) by more than ${FAT_TOLERANCE}g.`;
                attempt++;
                continue;
            }

            // Sanity Check
            const theoreticalCals = (dailyP * 4) + (dailyC * 4) + (dailyF * 9);
            const sanityDiff = Math.abs(theoreticalCals - dailyK);
            if (sanityDiff > (targets.calories * 0.15)) { // 15% sanity leniency for fiber/sugar alcohols
                lastErrorReason = `Macro/calorie ratio sanity check failed. Theoretical cals (${Math.round(theoreticalCals)}) vs DB cals (${Math.round(dailyK)}).`;
                attempt++;
                continue;
            }

            // If we reach here, it passed all checks
            validatedResponse.diet.daily_totals = {
                protein: dailyP,
                carbs: dailyC,
                fat: dailyF,
                calories: dailyK
            };

            return res.status(200).json(validatedResponse);
        }

        // If it exits the while loop, it failed 3 times
        return res.status(422).json({ error: 'AI failed to generate a diet within required macronutrient tolerances after 3 attempts. Please try again or adjust targets.' });

    } catch (e) {
        console.error("API Error:", e);
        // Safe error message to avoid exposing keys
        return res.status(500).json({ error: 'An internal server error occurred while generating the diet.' });
    }
}
