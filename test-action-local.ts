import { submitOnboarding } from './app/onboarding/actions'

const formData = new FormData()
formData.append('calories', '2000')
formData.append('protein', '150')
formData.append('carbs', '200')
formData.append('fat', '50')
formData.append('meals', '4')
formData.append('proteins', JSON.stringify(['uuid-here']))
formData.append('carbs', JSON.stringify(['uuid-here']))
formData.append('fats', JSON.stringify(['uuid-here']))

submitOnboarding(formData).then(console.log).catch(console.error)
