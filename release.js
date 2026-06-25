const prompts = require('prompts');
const { execSync } = require('child_process');
const fs = require('fs');

function getNextVersion(version, bumpType) {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) {
        throw new Error(`Invalid package version: ${version}`);
    }

    if (bumpType === 'patch') parts[2] += 1;
    if (bumpType === 'minor') {
        parts[1] += 1;
        parts[2] = 0;
    }
    if (bumpType === 'major') {
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
    }

    return parts.join('.');
}

function localTagExists(tagName) {
    try {
        execSync(`git rev-parse -q --verify refs/tags/${tagName}`, { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

function remoteTagExists(tagName) {
    try {
        execSync(`git ls-remote --exit-code --tags origin refs/tags/${tagName}`, { stdio: 'ignore' });
        return true;
    } catch (error) {
        if (error.status === 2) return false;
        throw new Error(`Unable to check remote tag ${tagName}. Check network/proxy and try again.`);
    }
}

async function main() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = pkg.version;

    console.log(`📦 当前版本: v${currentVersion}`);

    const response = await prompts({
        type: 'select',
        name: 'bumpType',
        message: '请选择要发布的版本类型 (会自动升级版本号并打 Tag):',
        choices: [
            { title: 'Patch (小修小补)', description: '例如: 1.0.4 -> 1.0.5', value: 'patch' },
            { title: 'Minor (新功能)', description: '例如: 1.0.4 -> 1.1.0', value: 'minor' },
            { title: 'Major (重大更新)', description: '例如: 1.0.4 -> 2.0.0', value: 'major' },
            { title: '自定义版本号', value: 'custom' },
            { title: '取消', value: 'cancel' }
        ]
    });

    if (!response.bumpType || response.bumpType === 'cancel') {
        console.log('已取消发布流程。');
        return;
    }

    let versionTarget = response.bumpType;

    if (versionTarget === 'custom') {
        const customRes = await prompts({
            type: 'text',
            name: 'version',
            message: '请输入新的版本号 (例如: 1.0.5):',
            validate: value => value.match(/^[0-9]+\.[0-9]+\.[0-9]+$/) ? true : '版本号格式不正确 (应为 x.y.z)'
        });
        if (!customRes.version) {
            console.log('已取消发布流程。');
            return;
        }
        versionTarget = customRes.version;
    }

    const targetVersion = ['patch', 'minor', 'major'].includes(versionTarget)
        ? getNextVersion(currentVersion, versionTarget)
        : versionTarget;

    const confirm = await prompts({
        type: 'confirm',
        name: 'value',
        message: `确定要升级到 [${targetVersion}] 并在 GitHub 触发自动构建吗？`,
        initial: true
    });

    if (!confirm.value) {
        console.log('已取消发布流程。');
        return;
    }

    try {
        const tagName = `v${targetVersion}`;
        if (localTagExists(tagName) || remoteTagExists(tagName)) {
            throw new Error(`Tag ${tagName} already exists. Choose a newer custom version.`);
        }

        // 检查是否有未提交的代码
        const status = execSync('git status --porcelain').toString().trim();
        if (status) {
            console.log('\n⚠️ 发现有未提交的代码修改：');
            console.log(status);
            
            const commitFirst = await prompts({
                type: 'confirm',
                name: 'value',
                message: '您的工作区不干净，npm version 需要干净的工作区。是否自动为您将所有更改进行 commit？',
                initial: true
            });

            if (!commitFirst.value) {
                console.log('请先手动提交您的代码，然后再运行 npm run release。');
                return;
            }

            console.log('⏳ 正在提交代码...');
            execSync('git add .', { stdio: 'inherit' });
            execSync(`git commit -m "chore: prepare for release v${versionTarget}"`, { stdio: 'inherit' });
        }

        console.log('\n⏳ 正在更新版本并创建 Git Tag...');
        // npm version 会自动修改 package.json, 并且 commit, 最后打一个 vX.Y.Z 的 tag
        execSync(`npm version ${versionTarget}`, { stdio: 'inherit' });

        console.log('⏳ 正在推送代码和 Tag 到 GitHub...');
        // 将刚才的 commit 和 tag 一起推送到远端，触发 GitHub Actions
        execSync('git push origin HEAD --follow-tags', { stdio: 'inherit' });

        console.log('\n✅ 发布成功！');
        console.log('🚀 GitHub Actions 已经开始为您在云端打包发布。');
        console.log('👉 请前往 GitHub 仓库的 Actions 页面查看构建进度！');

    } catch (error) {
        console.error('\n❌ 发布过程中出错:', error.message);
    }
}

main();
