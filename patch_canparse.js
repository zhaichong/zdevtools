const fs = require('fs');
const path = require('path');

const filePath = 'd:/inspect/devtools/ui/components/icon_button/icon_button.js';
let c = fs.readFileSync(filePath, 'utf8');
let nc = c.replace(/\(function\(u\)\{try\{new URL\(u\);return true;\}catch\{return false;\}\}\)\(\)/g, '(function(u){try{new URL(u);return true;}catch{return false;}})(i)');

if (c !== nc) {
    fs.writeFileSync(filePath, nc, 'utf8');
    console.log('Fixed URL.canParse in:', filePath);
}
