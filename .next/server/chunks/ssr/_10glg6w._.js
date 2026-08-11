module.exports=[13095,(a,b,c)=>{"use strict";function d(a){for(let b=0;b<a.length;b++){let c=a[b];if("function"!=typeof c)throw Object.defineProperty(Error(`A "use server" file can only export async functions, found ${typeof c}.
Read more: https://nextjs.org/docs/messages/invalid-use-server-value`),"__NEXT_ERROR_CODE",{value:"E352",enumerable:!1,configurable:!0})}}Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"ensureServerEntryExports",{enumerable:!0,get:function(){return d}})},87210,a=>{"use strict";var b=a.i(37936),c=a.i(98310),d=a.i(5246);a.i(70396);var e=a.i(73727),f=a.i(82655);async function g(a){let b=await (0,f.getUser)();if(!b)return{error:"Not authenticated"};let g=await (0,c.createClient)(),{data:h}=await g.from("diet_plans").select("id").eq("user_id",b.id).limit(1);h&&h.length>0&&((await (0,d.cookies)()).set("gym_meals_onboarded","true",{path:"/"}),(0,e.redirect)("/dashboard"));let{data:i}=await g.from("profiles").select("updated_at").eq("id",b.id).single();if(!i)return{error:"Profile not found"};let j=new Date().toISOString(),{data:k,error:l}=await g.from("profiles").update({updated_at:j}).eq("id",b.id).eq("updated_at",i.updated_at).select("id");if(l||!k||0===k.length)return{error:"Your request is currently being processed. Please wait."};let m=parseInt(a.get("calories")),n=parseInt(a.get("protein")),o=parseInt(a.get("carbs")),p=parseInt(a.get("fat")),q=parseInt(a.get("meals")),r=JSON.parse(a.get("proteins")||"[]"),s=JSON.parse(a.get("carbs")||"[]"),t=JSON.parse(a.get("fats")||"[]");if(!m||!n||!o||!p||!q)return{error:"Missing macro targets"};if(0===r.length||0===s.length||0===t.length)return{error:"Must provide at least one food ID for each category."};let u=[...new Set([...r,...s,...t])],{data:v,error:w}=await g.from("food_database").select("*").in("id",u).eq("is_active",!0);if(w||!v||v.length!==u.length)return{error:"One or more requested foods are inactive or do not exist."};let x=v.map(a=>({id:a.id,name:a.name,category:a.category,serving_size:a.serving_size,serving_unit:a.serving_unit})),y=process.env.DEEPSEEK_API_KEY;if(!y)return{error:"Server misconfiguration: AI key missing"};let z=1,A="",B=null;for(;z<=3;){let a=`You are a strict meal-planning engine.
Build a practical daily meal plan using ONLY the food IDs provided.
You are NOT responsible for nutritional facts. Never invent calories, protein, carbs, fat, or nutritional values.
Only select food IDs and quantities.

REQUIREMENTS:
- Generate exactly ${q} meals.
- Hit these daily targets as closely as possible based on standard nutritional math:
  Calories: ${m}
  Protein: ${n}g
  Carbohydrates: ${o}g
  Fat: ${p}g
- You can use the same food across multiple meals if it makes culinary sense.

ALLOWED FOODS (Source of Truth for IDs and Units):
${JSON.stringify(x,null,2)}

${A?`PREVIOUS ATTEMPT FAILED BECAUSE: ${A}
Please adjust the quantities or food selections to fix this.`:""}

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
}`;try{let b,c=await fetch("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${y}`},body:JSON.stringify({model:"deepseek-chat",messages:[{role:"system",content:a},{role:"user",content:"Generate the meal plan."}],temperature:.2})});if(!c.ok)throw Error("AI Provider Error");let d=(await c.json()).choices[0].message.content.trim();d=d.replace(/^```json\n?/,"").replace(/\n?```$/,"");try{b=JSON.parse(d)}catch(a){A="Your last response was not valid JSON.",z++;continue}if(!b.diet||!Array.isArray(b.diet.meals)||b.diet.meals.length!==q){A="Your JSON structure was incorrect or meal count mismatch.",z++;continue}let e=!0,f=0,g=0,h=0,i=0,j={name:b.diet.name||"Personalized Diet",meals:[]};for(let a=0;a<b.diet.meals.length;a++){let c=b.diet.meals[a],d={name:c.name||"Meal ${mIdx + 1}",sort_order:a,foods:[]};for(let a of c.foods||[]){let b=v.find(b=>b.id===a.food_id);if(!b){A="You used an invalid food_id: ${item.food_id}.",e=!1;break}if(!function(a,b){if("number"!=typeof a||isNaN(a)||!isFinite(a)||a<=0)return!1;let c=b.toLowerCase();return"grams"===c||"ml"===c?a<=1e3:"pieces"===c||"piece"===c||"tbsp"===c||"tablespoon"===c?a<=10:"tsp"===c||"teaspoon"===c?a<=20:"scoop"===c||"scoops"===c?a<=5:a<=1e3}(a.quantity,b.serving_unit)){A="You provided an invalid or absurd quantity (${item.quantity}) for unit (${dbFood.serving_unit}) for food ${dbFood.name}.",e=!1;break}let c=a.quantity/b.serving_size,j=b.protein*c,k=b.carbs*c,l=b.fat*c,m=b.calories*c;d.foods.push({food_id:b.id,name:b.name,quantity:a.quantity,unit:b.serving_unit,protein:j,carbs:k,fat:l,calories:m}),f+=j,g+=k,h+=l,i+=m}if(!e)break;j.meals.push(d)}if(!e){z++;continue}if(Math.abs(i-m)>.05*m){A="Total calories deviated from target by more than 5%.",z++;continue}if(Math.abs(f-n)>5){A="Total protein deviated from target by more than ${PROTEIN_TOLERANCE}g.",z++;continue}if(Math.abs(g-o)>10){A="Total carbs deviated from target by more than ${CARBS_TOLERANCE}g.",z++;continue}if(Math.abs(h-p)>5){A="Total fat deviated from target by more than ${FAT_TOLERANCE}g.",z++;continue}B=j;break}catch(a){return console.error(a),{error:"An internal server error occurred while generating the diet."}}}if(!B)return{error:"AI failed to generate a valid diet within required tolerances after 3 attempts. Try adjusting targets."};let{data:C,error:D}=await g.from("diet_plans").insert({user_id:b.id,name:B.name,calories_target:m,protein_target:n,carbs_target:o,fat_target:p}).select().single();if(D||!C)return{error:"Failed to save diet plan."};try{for(let a of B.meals){let{data:c,error:d}=await g.from("meals").insert({user_id:b.id,diet_plan_id:C.id,name:a.name,sort_order:a.sort_order}).select().single();if(d||!c)throw Error("Meal insert failed");let e=a.foods.map((a,d)=>({user_id:b.id,meal_id:c.id,name:a.name,quantity:a.quantity,unit:a.unit,protein:a.protein,fat:a.fat,carbs:a.carbs,calories:a.calories,sort_order:d})),{error:f}=await g.from("foods").insert(e);if(f)throw Error("Food insert failed")}(await (0,d.cookies)()).set("gym_meals_onboarded","true",{path:"/",secure:!0,sameSite:"lax",maxAge:31536e3})}catch(a){return await g.from("diet_plans").delete().eq("id",C.id),{error:"Failed to save meals. Rolling back."}}await g.from("profiles").update({updated_at:new Date().toISOString()}).eq("id",b.id),(0,e.redirect)("/dashboard")}(0,a.i(13095).ensureServerEntryExports)([g]),(0,b.registerServerReference)(g,"40010464d3f944fc1992aca3fb40bc29d837b5f392",null),a.s([],70237),a.i(70237),a.s(["40010464d3f944fc1992aca3fb40bc29d837b5f392",0,g],87210)},37936,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"registerServerReference",{enumerable:!0,get:function(){return d.registerServerReference}});let d=a.r(11857)}];

//# sourceMappingURL=_10glg6w._.js.map