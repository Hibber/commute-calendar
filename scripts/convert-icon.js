const sharp = require('sharp');

sharp('src/app/icon.jpg')
  .resize(256, 256)
  .png()
  .toFile('src/app/icon.png')
  .then(() => console.log('Successfully converted to PNG'))
  .catch(err => console.error('Error converting:', err));
