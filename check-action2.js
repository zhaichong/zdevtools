const html = require('fs').readFileSync('action.html', 'utf8');
const lines = html.split('\n');
let found = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('v1.0.2')) {
    console.log('Found v1.0.2 at line', i);
    for (let j = Math.max(0, i - 10); j < Math.min(lines.length, i + 10); j++) {
      if (lines[j].includes('aria-label=')) {
        console.log(lines[j].match(/aria-label="([^"]+)"/)[1]);
      }
    }
    found = true;
    break;
  }
}
if (!found) console.log('not found');
