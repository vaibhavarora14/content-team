require('dotenv').config();
const { generateStoryboardImages } = require('./src/functions/breakdown');
const fs = require('fs');

const script = fs.readFileSync('./script.md', 'utf8');

(async () => {
  try {
    const imageUrls = await generateStoryboardImages(script, false);
    console.log('\n✅ All 5 images generated and saved to output/images/');
    console.log('Stable URLs:', imageUrls);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
