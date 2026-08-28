import assert from 'assert';
import { useRootCauses } from '../src/pages/workbench/composables/useRootCauses.js';

const { buildRootCauses } = useRootCauses();

{
    const causes = buildRootCauses(
        [{ type: 'js', message: 'Uncaught   ', time: 10 }],
        null,
        '',
        null,
        []
    );
    assert.equal(causes.length, 1);
    assert.equal(causes[0].kind, 'low-signal');
    assert.equal(causes[0].priority, 'P3');
    assert.equal(causes[0].lastSeen, 10);
    assert.equal(causes[0].firstSeen, 10);
}

{
    const causes = buildRootCauses(
        [{ type: 'js', message: 'Uncaught TypeError: boom', time: 10, stack: [{ url: 'https://app.test/app.js', lineNumber: 4, columnNumber: 1 }] }],
        null,
        '',
        null,
        []
    );
    assert.equal(causes[0].kind, 'js');
    assert.equal(causes[0].priority, 'P1');
    assert.equal(causes[0].lastSeen, 10);
}

{
    const causes = buildRootCauses(
        [{ type: 'network', method: 'GET', status: 401, url: 'https://api.test/x?auth=super-token', time: 10, message: '401' }],
        null,
        '',
        null,
        []
    );
    assert.equal(causes[0].kind, 'network');
    const blob = JSON.stringify(causes);
    assert.ok(!blob.includes('super-token'), blob);
}

console.log('root-cause tests passed');
