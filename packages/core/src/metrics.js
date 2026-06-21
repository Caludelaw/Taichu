/**
 * Metrics Collector — Prometheus-compatible metrics registry
 *
 * Zero-dependency in-memory metrics for Taichu CMS.
 * Tracks:
 *   - HTTP request count by method, path, status
 *   - HTTP request duration histogram
 *   - Content document count by type
 *   - Memory usage (process heap)
 *
 * Exports metrics in Prometheus text format at GET /metrics.
 */

// ── Registry ──────────────────────────────────────────────
const counters = new Map();    // name → { help, type, labels: Map<labelsKey, value> }
const histograms = new Map();  // name → { help, type, buckets, observations: [] }
const gauges = new Map();      // name → { help, type, value }

// ── Counter ───────────────────────────────────────────────
function getOrCreateCounter(name, help) {
  if (!counters.has(name)) {
    counters.set(name, { help, type: 'counter', labels: new Map() });
  }
  return counters.get(name);
}

/**
 * Increment a counter metric.
 * @param {string} name - metric name (e.g. 'taichu_http_requests_total')
 * @param {string} help - HELP description
 * @param {Record<string,string>} [labels] - label key/value pairs
 */
export function counterInc(name, help, labels = {}) {
  const c = getOrCreateCounter(name, help);
  const key = labelsKey(labels);
  const prev = c.labels.get(key) || 0;
  c.labels.set(key, prev + 1);
}

/**
 * Record a histogram observation.
 * @param {string} name - metric name
 * @param {string} help - HELP description
 * @param {number} value - observed value
 * @param {number[]} [buckets] - bucket boundaries (default: standard HTTP buckets)
 * @param {Record<string,string>} [labels]
 */
export function histogramObserve(name, help, value, buckets, labels = {}) {
  if (!histograms.has(name)) {
    const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    histograms.set(name, {
      help,
      type: 'histogram',
      buckets: buckets || defaultBuckets,
      observations: [],
      labelSets: []
    });
  }
  const h = histograms.get(name);
  h.observations.push(value);
  h.labelSets.push(labels);
}

/**
 * Set a gauge value.
 * @param {string} name - metric name
 * @param {string} help - HELP description
 * @param {number} value
 */
export function gaugeSet(name, help, value) {
  gauges.set(name, { help, type: 'gauge', value });
}

// ── Convenience: track HTTP request ────────────────────────
/**
 * Record an HTTP request for metrics tracking.
 * Call this after the response is sent.
 * @param {string} method - HTTP method
 * @param {string} path - request path (use route pattern, not raw URL)
 * @param {number} statusCode - response status
 * @param {number} durationMs - request duration in milliseconds
 */
export function recordRequest(method, path, statusCode, durationMs) {
  const statusFamily = `${Math.floor(statusCode / 100)}xx`;
  counterInc('taichu_http_requests_total', 'Total HTTP requests', { method, path, status: String(statusCode) });
  histogramObserve(
    'taichu_http_request_duration_seconds',
    'HTTP request duration in seconds',
    durationMs / 1000,
    undefined,
    { method, path, status: statusFamily }
  );
}

/**
 * Collect system metrics (memory, uptime).
 * Call this right before generating metrics output.
 */
export function collectSystemMetrics() {
  const mem = process.memoryUsage();
  gaugeSet('taichu_process_heap_bytes', 'Process heap size in bytes', mem.heapUsed);
  gaugeSet('taichu_process_heap_total_bytes', 'Process heap total in bytes', mem.heapTotal);
  gaugeSet('taichu_process_rss_bytes', 'Process RSS in bytes', mem.rss);
  gaugeSet('taichu_process_external_bytes', 'Process external memory in bytes', mem.external);
  gaugeSet('taichu_process_uptime_seconds', 'Process uptime in seconds', process.uptime());
}

/**
 * Record content document counts (call after store operations).
 * @param {Record<string,number>} typeCounts - { article: 42, page: 7, ... }
 */
export function recordContentCounts(typeCounts) {
  for (const [type, count] of Object.entries(typeCounts)) {
    gaugeSet(`taichu_content_${type}_count`, `Total ${type} documents`, count);
  }
}

// ── Prometheus Text Format ─────────────────────────────────
function labelsKey(labels) {
  if (!labels || Object.keys(labels).length === 0) return '';
  const parts = [];
  for (const [k, v] of Object.entries(labels)) {
    parts.push(`${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  return `{${parts.join(',')}}`;
}

function formatBucket(val) {
  if (val === Infinity) return '+Inf';
  // Ensure consistent floating-point formatting for Prometheus
  return Number.isInteger(val) ? String(val) : val.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function renderCounter(name, c) {
  const lines = [];
  lines.push(`# HELP ${name} ${c.help}`);
  lines.push(`# TYPE ${name} ${c.type}`);
  for (const [labels, value] of c.labels) {
    lines.push(`${name}${labels} ${value}`);
  }
  return lines.join('\n');
}

function renderHistogram(name, h) {
  const lines = [];
  lines.push(`# HELP ${name} ${h.help}`);
  lines.push(`# TYPE ${name} ${h.type}`);

  // Bucket counts
  const bucketCounts = new Map();
  for (const b of h.buckets) {
    bucketCounts.set(b, 0);
  }
  bucketCounts.set(Infinity, 0);

  // Group observations by label set
  const labelGroups = new Map();
  for (let i = 0; i < h.observations.length; i++) {
    const ls = labelsKey(h.labelSets[i] || {});
    if (!labelGroups.has(ls)) {
      labelGroups.set(ls, { observations: [], bucketsCopy: null });
    }
    labelGroups.get(ls).observations.push(h.observations[i]);
  }

  for (const [ls, group] of labelGroups.entries()) {
    const bc = new Map();
    for (const b of h.buckets) bc.set(b, 0);
    bc.set(Infinity, 0);

    let sum = 0;
    for (const v of group.observations) {
      sum += v;
      for (let i = 0; i < h.buckets.length; i++) {
        if (v <= h.buckets[i]) {
          bc.set(h.buckets[i], bc.get(h.buckets[i]) + 1);
        }
      }
      bc.set(Infinity, bc.get(Infinity) + 1);
    }

    // Accumulate
    let cumulative = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cumulative += bc.get(h.buckets[i]);
      bc.set(h.buckets[i], cumulative);
    }

    const suffix = ls ? ` ${ls}` : '';
    for (const b of h.buckets) {
      lines.push(`${name}_bucket${suffix} {le="${formatBucket(b)}"} ${bc.get(b)}`);
    }
    lines.push(`${name}_bucket${suffix} {le="+Inf"} ${bc.get(Infinity)}`);
    lines.push(`${name}_sum${suffix} ${sum}`);
    lines.push(`${name}_count${suffix} ${group.observations.length}`);
  }

  return lines.join('\n');
}

function renderGauge(name, g) {
  const lines = [];
  lines.push(`# HELP ${name} ${g.help}`);
  lines.push(`# TYPE ${name} ${g.type}`);
  lines.push(`${name} ${g.value}`);
  return lines.join('\n');
}

/**
 * Generate Prometheus text format output.
 * @returns {string} Prometheus metrics text
 */
export function generateMetrics() {
  collectSystemMetrics();

  const parts = [];

  for (const [name, c] of counters) {
    parts.push(renderCounter(name, c));
  }

  for (const [name, h] of histograms) {
    parts.push(renderHistogram(name, h));
  }

  for (const [name, g] of gauges) {
    parts.push(renderGauge(name, g));
  }

  return parts.join('\n\n') + '\n';
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
  counters.clear();
  histograms.clear();
  gauges.clear();
}

/**
 * Get current gauge value for testing.
 * @param {string} name
 * @returns {number|undefined}
 */
export function getGauge(name) {
  const g = gauges.get(name);
  return g ? g.value : undefined;
}

/**
 * Get counter value by label set.
 * @param {string} name
 * @param {Record<string,string>} labels
 * @returns {number}
 */
export function getCounter(name, labels = {}) {
  const c = counters.get(name);
  if (!c) return 0;
  return c.labels.get(labelsKey(labels)) || 0;
}
