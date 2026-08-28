import assert from 'assert';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(join(root, relative), 'utf8');

{
    const rail = read('src/pages/workbench/components/RailNav.vue');
    const ids = [...rail.matchAll(/id:\s*'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(ids, ['devtools', 'logs']);
    assert.equal(ids.includes('diagnosis'), false);
    assert.equal(ids.includes('device'), false);
    assert.equal(/label:\s*'诊断'|label:\s*'设备'|label:\s*'时间轴'|label:\s*'回放'|label:\s*'报告'/.test(rail), false);
}

{
    const view = read('src/pages/workbench/WorkbenchView.vue');
    assert.match(view, /const activePanel = ref\('devtools'\)/);
    assert.equal(view.includes('DetailDrawer'), false);
    assert.equal(view.includes('DeviceInfoPanel'), false);
    assert.equal(view.includes('collect('), false);
    assert.equal(view.includes('复制报告'), false);
    assert.equal(view.includes('场景回放'), false);
    assert.equal(view.includes('上传 SourceMap'), false);
    assert.equal(view.includes('TimelinePanel'), false);
    assert.equal(view.includes('ReplayPanel'), false);
    assert.equal(view.includes('ReportPanel'), false);
    assert.match(view, /logcatManager.startStream/);
    assert.match(view, /DevToolsFrame/);
    assert.match(view, /LogcatView/);
    assert.equal(existsSync(join(root, 'src/pages/workbench/components/TimelinePanel.vue')), false);
    assert.equal(existsSync(join(root, 'src/pages/workbench/components/ReplayPanel.vue')), false);
    assert.equal(existsSync(join(root, 'src/pages/workbench/components/ReportPanel.vue')), false);
    assert.equal(existsSync(join(root, 'src/pages/workbench/components/DeviceInfoPanel.vue')), false);
}

{
    const session = read('src/pages/workbench/composables/useWorkbenchSession.js');
    assert.match(session, /let currentPanel = 'devtools'/);
    assert.equal(session.includes('从 DevTools 切回：重新连接'), false);
}

console.log('workbench-ia tests passed');
