<template>
    <div class="diagnosis-detail" :class="{ 'empty-detail': !detail, loading: detail?.loading }">
        <template v-if="!detail">
            暂无诊断结果。
        </template>
        <template v-else-if="detail.loading">
            <p><strong>{{ detail.hint }}</strong></p>
            <p>{{ detail.message }}</p>
        </template>
        <template v-else-if="detail.diagnosis">
            <div class="detail-toolbar">
                <div>
                    <strong>{{ detail.diagnosis.target.title || 'Untitled' }}</strong>
                    <span>{{ detail.diagnosis.profile.label }}</span>
                </div>
                <div class="toolbar-actions">
                    <button class="btn ghost" @click="copyJson" type="button">复制 JSON</button>
                    <button class="btn ghost" @click="copyMd" type="button">复制 Markdown</button>
                    <button class="btn primary" @click="$emit('workbench', { device: detail.diagnosis.device, proc: detail.diagnosis.proc, target: detail.diagnosis.target })" type="button">调试工作台</button>
                </div>
            </div>
            <!-- Summary -->
            <div class="info-grid">
                <div><span>设备</span><strong>{{ detail.diagnosis.device.model || detail.diagnosis.device.id }} / Android {{ detail.diagnosis.device.androidVersion || '-' }}</strong></div>
                <div><span>页面</span><strong>{{ detail.diagnosis.snapshot?.href || detail.diagnosis.target.url || '-' }}</strong></div>
                <div><span>错误</span><strong>{{ detail.diagnosis.summary.errorCount }} 个有效错误，{{ detail.diagnosis.summary.warningCount }} 个警告/线索</strong></div>
                <div><span>Network</span><strong>{{ detail.diagnosis.summary.networkFailures }} 个失败请求</strong></div>
                <div><span>白屏</span><strong>{{ detail.diagnosis.summary.likelyBlank ? '疑似白屏' : '未发现明显白屏' }}</strong></div>
                <div><span>采集时间</span><strong>{{ detail.diagnosis.finishedAt }}</strong></div>
            </div>
            <!-- Guidance -->
            <section class="detail-section">
                <h3>优先排查方向</h3>
                <div v-if="!detail.diagnosis.guidance?.length" class="empty-mini">当前没有明显异常方向。建议先复现问题后重新采集。</div>
                <div v-else class="guidance-list">
                    <article v-for="(g, i) in detail.diagnosis.guidance" :key="i" class="guidance-card" :class="g.level">
                        <div class="guidance-rank">{{ i + 1 }}</div>
                        <div>
                            <h4>{{ g.title }}</h4>
                            <p>{{ g.reason }}</p>
                            <strong>下一步：{{ g.next }}</strong>
                        </div>
                    </article>
                </div>
            </section>
            <!-- Errors -->
            <section class="detail-section">
                <h3>错误归类</h3>
                <div v-if="!detail.diagnosis.errors.length" class="empty-mini">未采集到 Runtime/Console 错误。</div>
                <div v-else class="issue-list">
                    <article v-for="(err, i) in detail.diagnosis.errors" :key="i" class="issue" :class="[err.severity, { 'low-signal': err.lowSignal }]">
                        <div class="issue-head">
                            <span>{{ err.category }}{{ err.lowSignal ? ' · 低定位价值' : '' }}</span>
                            <small>{{ err.url || '' }}</small>
                        </div>
                        <p>{{ redact(err.message) }}</p>
                        <div v-if="err.action" class="issue-action">排查建议：{{ err.action }}</div>
                        <ol v-if="err.stack?.length" class="stack-list">
                            <li v-for="(frame, fi) in err.stack.slice(0, 6)" :key="fi">
                                <strong>{{ frame.functionName || '(anonymous)' }}</strong>
                                <span>{{ frame.source || '' }}</span>
                            </li>
                        </ol>
                    </article>
                </div>
            </section>
            <!-- Network -->
            <section class="detail-section">
                <h3>Network 失败</h3>
                <div v-if="!detail.diagnosis.network.length" class="empty-mini">未采集到失败请求。</div>
                <div v-else class="network-list">
                    <div v-for="(item, i) in detail.diagnosis.network" :key="i" class="network-row">
                        <span>{{ item.category }}</span>
                        <strong>{{ item.status || item.text || 'failed' }}</strong>
                        <code>{{ redact(item.url || item.requestId || '') }}</code>
                    </div>
                </div>
            </section>
            <!-- Snapshot -->
            <section class="detail-section">
                <h3>运行时快照</h3>
                <div v-if="!detail.diagnosis.snapshot" class="empty-mini">未获取到运行时快照。</div>
                <div v-else class="snapshot-block">
                    <div class="kv"><span>readyState</span><strong>{{ detail.diagnosis.snapshot.readyState }}</strong></div>
                    <div class="kv"><span>DOM 节点</span><strong>{{ detail.diagnosis.snapshot.domNodes }}</strong></div>
                    <div class="kv"><span>Vue Root</span><strong>{{ detail.diagnosis.snapshot.hasVueRoot ? '存在' : '未发现' }}</strong></div>
                    <div class="tag-cloud">
                        <span v-for="(val, key) in detail.diagnosis.snapshot.globals" :key="key" :class="val ? 'good' : 'bad'">{{ key }}: {{ val ? 'yes' : 'no' }}</span>
                    </div>
                    <h4>Android bridge</h4>
                    <div class="tag-cloud">
                        <span v-for="(val, key) in detail.diagnosis.snapshot.androidMethods" :key="key" :class="val ? 'good' : 'bad'">{{ key }}: {{ val ? 'yes' : 'no' }}</span>
                    </div>
                    <h4>Storage 关键字段</h4>
                    <pre>{{ redact(JSON.stringify(detail.diagnosis.snapshot.storage || {}, null, 2)) }}</pre>
                </div>
            </section>
            <!-- Logcat -->
            <section class="detail-section">
                <h3>logcat 摘要</h3>
                <div v-if="!detail.diagnosis.logcat?.length" class="empty-mini">logcat 没有匹配到关键日志。</div>
                <pre v-else class="logcat">{{ redact(detail.diagnosis.logcat.join('\n')) }}</pre>
            </section>
        </template>
    </div>
</template>

<script setup>
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    detail: { type: Object, default: null }
});

function copyJson() {
    if (props.detail?.diagnosis) {
        navigator.clipboard.writeText(JSON.stringify(props.detail.diagnosis, null, 2));
    }
}

function copyMd() {
    if (!props.detail?.diagnosis) return;
    const d = props.detail.diagnosis;
    const lines = [
        '# ztools 诊断报告', '',
        `- 项目识别: ${d.profile.label}`,
        `- 设备: ${d.device.model || d.device.id} Android ${d.device.androidVersion || '-'}`,
        `- 页面: ${d.snapshot?.href || d.target.url || '-'}`,
        `- 错误: ${d.summary.errorCount}`,
        `- Network 失败: ${d.summary.networkFailures}`,
        `- 疑似白屏: ${d.summary.likelyBlank ? '是' : '否'}`, '',
        '## 优先排查方向',
        ...(d.guidance?.length ? d.guidance.map(g => `- ${g.title}: ${g.next}`) : ['- 暂无明显方向']), '',
        '## 错误',
        ...(d.errors.length ? d.errors.map(e => `- [${e.category}] ${redact(e.message || '')}`) : ['- 无']), '',
        '## Network',
        ...(d.network.length ? d.network.map(n => `- ${n.status || ''} ${n.category}: ${redact(n.url || n.text || '')}`) : ['- 无']), '',
        '## logcat', '```', redact((d.logcat || []).slice(-80).join('\n')), '```'
    ];
    navigator.clipboard.writeText(lines.join('\n'));
}
</script>
