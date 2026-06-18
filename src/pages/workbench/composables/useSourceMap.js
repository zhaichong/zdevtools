import { reactive } from 'vue';

/**
 * SourceMap 解析 composable
 * 支持上传 .map 文件、VLQ 解码、源码定位
 */
export function useSourceMap() {
    const sourceMaps = reactive(new Map());
    const sourceStats = reactive({ uploaded: 0, matched: 0 });

    function normalizeMapKey(...parts) {
        return parts.filter(Boolean).join('/').replace(/\\/g, '/').split('/').pop();
    }

    function fileNameFromUrl(url) {
        if (!url) return '';
        return String(url).split('?')[0].split('#')[0].split('/').pop();
    }

    async function handleSourceMapFiles(fileList) {
        const files = [...fileList].filter(file => file.name.endsWith('.map'));
        if (!files.length) return { count: 0, error: '未选择 map' };
        for (const file of files) {
            try {
                const map = JSON.parse(await file.text());
                const key = normalizeMapKey(file.webkitRelativePath || file.name, map.file);
                sourceMaps.set(key, {
                    fileName: file.name,
                    path: file.webkitRelativePath || file.name,
                    map,
                    mappings: parseMappings(map.mappings || '')
                });
            } catch (e) {
                console.warn('SourceMap parse failed', file.name, e);
            }
        }
        sourceStats.uploaded = sourceMaps.size;
        return { count: sourceStats.uploaded };
    }

    function findMapForFile(file) {
        const candidates = [file, `${file}.map`, file.replace(/\.js$/, '.js.map')].map(normalizeMapKey);
        for (const [key, value] of sourceMaps.entries()) {
            if (candidates.includes(key)
                || key.endsWith(`/${file}.map`)
                || key.endsWith(`/${file.replace(/\.js$/, '.js.map')}`)) {
                return value;
            }
        }
        return null;
    }

    function resolveSource(stack) {
        if (!stack?.length) return { mode: 'anonymous', reason: '没有可用于映射的调用栈' };
        for (const frame of stack) {
            const file = fileNameFromUrl(frame.url || frame.source || '');
            const line = Number(frame.lineNumber);
            const column = Number(frame.columnNumber);
            if (!file || !Number.isFinite(line) || !Number.isFinite(column)) continue;
            const mapEntry = findMapForFile(file);
            if (!mapEntry) return { mode: 'bundle', file, line, column, reason: `缺少 ${file}.map 或对应 SourceMap` };
            const original = originalPositionFor(mapEntry, line, column);
            if (original) return { mode: 'source-map', file, line, column, ...original };
            return { mode: 'bundle', file, line, column, reason: 'SourceMap 存在，但没有匹配到该行列' };
        }
        return { mode: 'anonymous', reason: '调用栈没有 bundle 文件和行列号' };
    }

    function applySourceToCauses(causes) {
        let matched = 0;
        for (const cause of causes) {
            const stack = cause.stack || [];
            const source = resolveSource(stack);
            cause.source = source;
            if (source.mode === 'source-map') matched++;
        }
        sourceStats.matched = matched;
    }

    return { sourceMaps, sourceStats, handleSourceMapFiles, resolveSource, applySourceToCauses };
}

// ---- VLQ 解码和 mappings 解析 ----

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlqSegment(segment) {
    const values = [];
    let value = 0;
    let shift = 0;
    for (const char of segment) {
        let digit = VLQ_CHARS.indexOf(char);
        if (digit < 0) continue;
        const continuation = digit & 32;
        digit &= 31;
        value += digit << shift;
        if (continuation) {
            shift += 5;
        } else {
            const negative = value & 1;
            values.push((value >> 1) * (negative ? -1 : 1));
            value = 0;
            shift = 0;
        }
    }
    return values;
}

function parseMappings(mappings) {
    const lines = [];
    let source = 0;
    let originalLine = 0;
    let originalColumn = 0;
    let name = 0;
    for (const lineText of String(mappings || '').split(';')) {
        const segments = [];
        let generatedColumn = 0;
        for (const segmentText of lineText.split(',')) {
            if (!segmentText) continue;
            const values = decodeVlqSegment(segmentText);
            generatedColumn += values[0] || 0;
            const segment = { generatedColumn };
            if (values.length >= 4) {
                source += values[1];
                originalLine += values[2];
                originalColumn += values[3];
                segment.source = source;
                segment.originalLine = originalLine;
                segment.originalColumn = originalColumn;
                if (values.length >= 5) {
                    name += values[4];
                    segment.name = name;
                }
            }
            segments.push(segment);
        }
        lines.push(segments);
    }
    return lines;
}

function originalPositionFor(entry, generatedLine, generatedColumn) {
    const map = entry.map;
    const segments = entry.mappings[generatedLine - 1] || [];
    let best = null;
    for (const segment of segments) {
        if (segment.generatedColumn <= generatedColumn - 1 && segment.source !== undefined) best = segment;
        if (segment.generatedColumn > generatedColumn - 1) break;
    }
    if (!best) return null;
    return {
        source: map.sources?.[best.source] || '',
        line: best.originalLine + 1,
        column: best.originalColumn + 1,
        name: best.name !== undefined ? map.names?.[best.name] || '' : ''
    };
}
