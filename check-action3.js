const html = require('fs').readFileSync('action.html', 'utf8');
const match = html.match(/<div class="Box-row.*?v1\.0\.2.*?<\/div>/s);
if (match) {
  const m = match[0].match(/aria-label="([^"]+)"/g);
  console.log(m);
}
