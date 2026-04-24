const http = require('http');
const fs = require('fs');
const path = require('path');

// ========== Configuration ==========

const PORT = process.env.ORCHESTRA_PORT || (49152 + Math.floor(Math.random() * 16383));
const HOST = process.env.ORCHESTRA_HOST || '127.0.0.1';
const URL_HOST = process.env.ORCHESTRA_URL_HOST || (HOST === '127.0.0.1' ? 'localhost' : HOST);
const ORCHESTRA_DIR = process.env.ORCHESTRA_DIR;
let ownerPid = process.env.ORCHESTRA_OWNER_PID ? Number(process.env.ORCHESTRA_OWNER_PID) : null;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let lastActivity = Date.now();
function touchActivity() { lastActivity = Date.now(); }

// ========== YAML Frontmatter Parser ==========

function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return {};
  const result = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Parse arrays like [001, 002]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    }
    // Parse numbers
    else if (/^\d+$/.test(val)) {
      val = Number(val);
    }
    result[key] = val;
  }
  return result;
}

// ========== State Reader ==========

let startTime = Date.now();

function readState() {
  const state = {
    config: {},
    dag: {},
    tasks: [],
    tokens: { run_total: {}, tasks: {} },
    history: [],
    connection: {
      status: 'connected',
      server_uptime_ms: Date.now() - startTime,
      last_update: new Date().toISOString()
    }
  };

  try {
    // Config
    const configPath = path.join(ORCHESTRA_DIR, 'config.md');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const fm = parseFrontmatter(configContent);
      state.config = { project: fm.project || '', status: fm.status || '', autonomy: '', agent_model: '' };
      // Parse body for defaults (autonomy and agent_model are in the body, not frontmatter)
      const autonomyMatch = configContent.match(/^autonomy:\s*(.+)$/m);
      const modelMatch = configContent.match(/^agent_model:\s*(.+)$/m);
      if (autonomyMatch) state.config.autonomy = autonomyMatch[1].trim();
      if (modelMatch) state.config.agent_model = modelMatch[1].trim();
    }

    // DAG
    const dagPath = path.join(ORCHESTRA_DIR, 'dag.md');
    if (fs.existsSync(dagPath)) {
      const dagContent = fs.readFileSync(dagPath, 'utf-8');
      const dagFm = parseFrontmatter(dagContent);
      state.dag.total_tasks = dagFm.total_tasks || 0;
      state.dag.completed = dagFm.completed || 0;
      state.dag.failed = dagFm.failed || 0;

      // Parse waves section — handles multiple formats:
      // Format A: "- Wave 1: [T001, T002]" or "- Wave 1: T001, T002" (single-line list items)
      // Format B: "### Wave 1 — done\n- T001: Title — done\n- T002: Title" (heading + sub-items)
      const wavesSection = dagContent.match(/## Waves\r?\n([\s\S]*?)(?=\r?\n## [^#]|$)/);
      if (wavesSection) {
        const wavesText = wavesSection[1].trim();
        const waves = [];

        // Try Format B first: "### Wave N" headings
        const headingPattern = /###\s*Wave\s+(\d+)[^\n]*/g;
        let headingMatch;
        const headingPositions = [];
        while ((headingMatch = headingPattern.exec(wavesText)) !== null) {
          headingPositions.push({ number: Number(headingMatch[1]), index: headingMatch.index, end: headingMatch.index + headingMatch[0].length });
        }

        if (headingPositions.length > 0) {
          // Format B: parse task items under each heading
          headingPositions.forEach((pos, i) => {
            const nextStart = i + 1 < headingPositions.length ? headingPositions[i + 1].index : wavesText.length;
            const sectionText = wavesText.slice(pos.end, nextStart);
            const taskIds = [];
            // Match "- T001: ..." or "- T001 ..." lines
            const taskLineRegex = /^-\s*([A-Za-z]?\d+)/gm;
            let taskMatch;
            while ((taskMatch = taskLineRegex.exec(sectionText)) !== null) {
              taskIds.push(taskMatch[1].trim());
            }
            waves.push({ number: pos.number, tasks: taskIds, status: 'pending' });
          });
        } else {
          // Format A: "- Wave N: ..." single-line items
          const waveLines = wavesText.split('\n').filter(l => /^\s*-\s*Wave\s+\d+/i.test(l));
          waveLines.forEach(line => {
            const numMatch = line.match(/Wave\s+(\d+)/i);
            const bracketMatch = line.match(/\[([^\]]+)\]/);
            let tasks = [];
            if (bracketMatch) {
              tasks = bracketMatch[1].split(',').map(s => s.trim()).filter(Boolean);
            } else {
              const afterColon = line.replace(/^.*Wave\s+\d+[^:]*:\s*/i, '').trim();
              if (afterColon) {
                tasks = afterColon.split(',').map(s => s.trim()).filter(Boolean);
              }
            }
            waves.push({ number: numMatch ? Number(numMatch[1]) : 0, tasks: tasks, status: 'pending' });
          });
        }

        // If still no waves found, try building from task table
        if (waves.length === 0) {
          // Fallback: parse the task table for a "Wave" column
          const tableRows = dagContent.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|$/gm);
          if (tableRows) {
            const waveMap = new Map();
            tableRows.forEach(row => {
              const cells = row.split('|').map(c => c.trim()).filter(Boolean);
              if (cells.length >= 4 && /^\d+$/.test(cells[cells.length - 1])) {
                const waveNum = Number(cells[cells.length - 1]);
                if (!waveMap.has(waveNum)) waveMap.set(waveNum, []);
                waveMap.get(waveNum).push(cells[0]);
              }
            });
            waveMap.forEach((tasks, num) => waves.push({ number: num, tasks: tasks, status: 'pending' }));
            waves.sort((a, b) => a.number - b.number);
          }
        }

        state.dag.waves = waves;
      }
    }

    // Normalize an ID for matching: strip T/t prefix, strip slug suffix, zero-pad
    function normalizeId(raw) {
      let s = String(raw).trim();
      s = s.replace(/^[Tt]/, '');           // strip T prefix
      s = s.replace(/-.+$/, '');            // strip slug (e.g., "001-context-brief" → "001")
      const num = parseInt(s, 10);
      return isNaN(num) ? s : String(num).padStart(3, '0');
    }

    // Tasks
    const tasksDir = path.join(ORCHESTRA_DIR, 'tasks');
    if (fs.existsSync(tasksDir)) {
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md')).sort();
      state.tasks = taskFiles.map(f => {
        const fm = parseFrontmatter(fs.readFileSync(path.join(tasksDir, f), 'utf-8'));
        let verification_status = fm.verification_status;
        if (!verification_status || verification_status === 'pending') {
          if (fm.evidence === false || fm.evidence === 'false') {
            verification_status = 'n/a';
          } else {
            verification_status = 'pending';
          }
        }
        return {
          id: normalizeId(fm.id || f.replace('.md', '')),
          title: fm.title || f.replace('.md', ''),
          status: fm.status || 'pending',
          verification_status: verification_status,
          depends_on: Array.isArray(fm.depends_on) ? fm.depends_on.map(normalizeId) : [],
          blocks: Array.isArray(fm.blocks) ? fm.blocks.map(normalizeId) : []
        };
      });

      // Build a map of normalized task IDs for quick lookup
      const taskById = new Map();
      state.tasks.forEach(t => taskById.set(t.id, t));

      // Compute wave status from task statuses
      if (state.dag.waves) {
        // Normalize wave task IDs too
        state.dag.waves.forEach(wave => {
          wave.tasks = wave.tasks.map(normalizeId);
          const waveTasks = wave.tasks.map(id => taskById.get(id)).filter(Boolean);
          // IMPORTANT: [].every() returns true — must check length > 0
          if (waveTasks.length > 0 && waveTasks.every(t => t.status === 'done')) wave.status = 'complete';
          else if (waveTasks.some(t => t.status === 'running')) wave.status = 'running';
          else if (waveTasks.some(t => t.status === 'failed')) wave.status = 'failed';
          else if (waveTasks.some(t => t.status === 'ready')) wave.status = 'ready';
          else wave.status = 'pending';
        });
        const runningWave = state.dag.waves.find(w => w.status === 'running' || w.status === 'ready');
        state.dag.current_wave = runningWave ? runningWave.number : (state.dag.waves.length > 0 ? state.dag.waves[state.dag.waves.length - 1].number : 0);
      }
    }

    // Token usage
    const tokenPath = path.join(ORCHESTRA_DIR, 'token-usage.json');
    if (fs.existsSync(tokenPath)) {
      const rawTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      // Normalize task keys in token data to match task IDs
      state.tokens = { run_total: rawTokens.run_total || {}, tasks: {} };
      if (rawTokens.tasks) {
        Object.keys(rawTokens.tasks).forEach(key => {
          state.tokens.tasks[normalizeId(key)] = rawTokens.tasks[key];
        });
      }
    }

    // History (last 20 entries)
    const historyPath = path.join(ORCHESTRA_DIR, 'history.md');
    if (fs.existsSync(historyPath)) {
      const historyContent = fs.readFileSync(historyPath, 'utf-8');
      const entryRegex = /^- \[(\d{2}:\d{2}(?::\d{2})?)\]\s*(.+)$/gm;
      const entries = [];
      let match;
      while ((match = entryRegex.exec(historyContent)) !== null) {
        entries.push({ time: match[1], text: match[2] });
      }
      state.history = entries.slice(-20).reverse();
    }
  } catch (err) {
    console.error('Error reading state:', err.message);
  }

  return state;
}

// ========== SSE Connections ==========

const sseClients = new Set();

function sendSSE(res, data) {
  res.write('data: ' + JSON.stringify(data) + '\n\n');
}

function broadcastState() {
  const state = readState();
  for (const res of sseClients) {
    try { sendSSE(res, state); } catch (e) { sseClients.delete(res); }
  }
}

// ========== HTTP Handler ==========

function handleRequest(req, res) {
  touchActivity();

  if (req.method === 'GET' && req.url === '/') {
    // Serve dashboard HTML
    const htmlPath = path.join(__dirname, 'dashboard.html');
    if (!fs.existsSync(htmlPath)) {
      res.writeHead(404);
      res.end('dashboard.html not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(htmlPath, 'utf-8'));
  } else if (req.method === 'GET' && req.url === '/events') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial state immediately
    sendSSE(res, readState());
    sseClients.add(res);

    // Keepalive every 15 seconds
    const keepalive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(keepalive); sseClients.delete(res); }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ========== File Watching ==========

const debounceTimers = new Map();

function watchFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const watcher = fs.watch(filePath, () => {
      const key = filePath;
      if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
      debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key);
        touchActivity();
        broadcastState();
      }, 100));
    });
    watcher.on('error', (err) => console.error('Watch error on', filePath, ':', err.message));
    return watcher;
  } catch (e) {
    console.error('Failed to watch', filePath, ':', e.message);
    return null;
  }
}

// ========== Server Startup ==========

function startServer() {
  startTime = Date.now();

  if (!ORCHESTRA_DIR) {
    console.error(JSON.stringify({ error: 'ORCHESTRA_DIR environment variable is required' }));
    process.exit(1);
  }

  if (!fs.existsSync(ORCHESTRA_DIR)) {
    console.error(JSON.stringify({ error: '.orchestra/ directory not found at ' + ORCHESTRA_DIR }));
    process.exit(1);
  }

  const server = http.createServer(handleRequest);

  // Watch specific files and directories
  const watchers = [
    watchFile(path.join(ORCHESTRA_DIR, 'config.md')),
    watchFile(path.join(ORCHESTRA_DIR, 'dag.md')),
    watchFile(path.join(ORCHESTRA_DIR, 'history.md')),
    watchFile(path.join(ORCHESTRA_DIR, 'token-usage.json')),
    watchFile(path.join(ORCHESTRA_DIR, 'tasks'))
  ].filter(Boolean);

  // Owner PID validation at startup
  if (ownerPid) {
    try { process.kill(ownerPid, 0); }
    catch (e) {
      if (e.code !== 'EPERM') {
        console.log(JSON.stringify({ type: 'owner-pid-invalid', pid: ownerPid }));
        ownerPid = null;
      }
    }
  }

  function ownerAlive() {
    if (!ownerPid) return true;
    try { process.kill(ownerPid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  }

  function shutdown(reason) {
    console.log(JSON.stringify({ type: 'server-stopped', reason }));
    const infoFile = path.join(ORCHESTRA_DIR, 'dashboard-info.json');
    if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile);
    watchers.forEach(w => { try { w.close(); } catch (e) {} });
    clearInterval(lifecycleCheck);
    server.close(() => process.exit(0));
  }

  const lifecycleCheck = setInterval(() => {
    if (!ownerAlive()) shutdown('owner process exited');
    else if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) shutdown('idle timeout');
  }, 60 * 1000);
  lifecycleCheck.unref();

  server.listen(PORT, HOST, () => {
    const info = {
      type: 'server-started',
      port: Number(PORT),
      host: HOST,
      url_host: URL_HOST,
      url: 'http://' + URL_HOST + ':' + PORT,
      orchestra_dir: path.resolve(ORCHESTRA_DIR)
    };
    console.log(JSON.stringify(info));
    fs.writeFileSync(
      path.join(ORCHESTRA_DIR, 'dashboard-info.json'),
      JSON.stringify({ url: info.url, port: info.port }) + '\n'
    );
  });
}

if (require.main === module) {
  startServer();
}
