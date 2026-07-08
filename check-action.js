fetch('https://github.com/zhaichong/zdevtools/actions/workflows/release.yml')
  .then(r => r.text())
  .then(t => {
    const fs = require('fs');
    fs.writeFileSync('action.html', t);
  });
