const fs = require('fs');
const path = require('path');

function walk(dir) {
    fs.readdirSync(dir).forEach(f => {
        let p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            walk(p);
        } else if (p.endsWith('.js') || p.endsWith('.css')) {
            let c = fs.readFileSync(p, 'utf8');
            let nc = c.replace(/(?<!-webkit-)mask(-(image|position|repeat|size))?:(var\(|radial-gradient|center|no-repeat|contain)/g, '-webkit-mask$1:$3');
            if (c !== nc) {
                fs.writeFileSync(p, nc, 'utf8');
                console.log('Patched:', p);
            }
        }
    });
}
walk('d:/inspect/devtools');
