fetch('https://github.com/zhaichong/zdevtools/actions/workflows/release.yml/badge.svg')
  .then(r => r.text())
  .then(t => {
    if (t.includes('failing')) console.log('FAILING');
    else if (t.includes('passing')) console.log('PASSING');
    else console.log('UNKNOWN', t.substring(0, 100));
  });
