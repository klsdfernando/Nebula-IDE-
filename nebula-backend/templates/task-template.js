export function generateTaskHTML(data) {
  const { title = "Task Plan", phases = [] } = data;

  let phasesHtml = "";

  phases.forEach((phase, index) => {
    let tasksHtml = "";
    let completedCount = 0;
    
    if (phase.tasks && Array.isArray(phase.tasks)) {
      phase.tasks.forEach(task => {
        if (task.done) completedCount++;
        tasksHtml += `
          <div class="task-item ${task.done ? 'done' : ''}">
            <div class="checkbox">
              ${task.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>
            <div class="task-text">${escapeHtml(task.text)}</div>
          </div>
        `;
      });
    }

    const totalTasks = phase.tasks ? phase.tasks.length : 0;
    const progressPercent = totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);
    const isPhaseComplete = totalTasks > 0 && completedCount === totalTasks;

    phasesHtml += `
      <div class="phase-card ${isPhaseComplete ? 'phase-complete' : ''}">
        <div class="phase-header">
          <h3 class="phase-title">
            <span class="phase-number">${index + 1}</span>
            ${escapeHtml(phase.name)}
          </h3>
          <div class="phase-progress">
            <span class="progress-text">${completedCount}/${totalTasks}</span>
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${progressPercent}%"></div>
            </div>
          </div>
        </div>
        <div class="task-list">
          ${tasksHtml}
        </div>
      </div>
    `;
  });

  const totalTasksAll = phases.reduce((acc, p) => acc + (p.tasks ? p.tasks.length : 0), 0);
  const completedTasksAll = phases.reduce((acc, p) => acc + (p.tasks ? p.tasks.filter(t => t.done).length : 0), 0);
  const totalProgress = totalTasksAll === 0 ? 0 : Math.round((completedTasksAll / totalTasksAll) * 100);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        :root {
            --bg-base: var(--vscode-editor-background, #1e1e2e);
            --bg-card: var(--vscode-editorWidget-background, #28283d);
            --bg-card-hover: var(--vscode-list-hoverBackground, #32324a);
            --text-main: var(--vscode-editor-foreground, #e0e0e0);
            --text-muted: var(--vscode-descriptionForeground, #a0a0b8);
            --accent-primary: var(--vscode-textLink-foreground, #7aa2f7);
            --accent-success: #9ece6a;
            --border-color: var(--vscode-editorGroup-border, #3b3b54);
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.5;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            font-size: 28px;
            font-weight: 600;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header h1 svg {
            color: var(--accent-primary);
            width: 28px;
            height: 28px;
        }

        .overall-progress {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .status-badge {
            background: rgba(122, 162, 247, 0.15);
            color: var(--accent-primary);
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        
        .status-badge.complete {
            background: rgba(158, 206, 106, 0.15);
            color: var(--accent-success);
        }

        .phase-card {
            background-color: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 24px;
            overflow: hidden;
            transition: border-color 0.2s;
        }

        .phase-card:hover {
            border-color: #54547a;
        }

        .phase-complete {
            border-color: rgba(158, 206, 106, 0.3);
        }

        .phase-complete .phase-number {
            background-color: var(--accent-success);
            color: #1a1b26;
        }

        .phase-header {
            padding: 16px 20px;
            background-color: rgba(0, 0, 0, 0.1);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .phase-title {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .phase-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background-color: #3b3b54;
            color: var(--text-muted);
            border-radius: 50%;
            font-size: 12px;
            font-weight: 700;
        }

        .phase-progress {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .progress-text {
            font-size: 13px;
            color: var(--text-muted);
            font-variant-numeric: tabular-nums;
        }

        .progress-bar-container {
            width: 80px;
            height: 6px;
            background-color: var(--bg-base);
            border-radius: 3px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background-color: var(--accent-primary);
            border-radius: 3px;
            transition: width 0.3s ease;
        }

        .phase-complete .progress-bar {
            background-color: var(--accent-success);
        }

        .task-list {
            padding: 12px 20px;
        }

        .task-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .task-item:last-child {
            border-bottom: none;
        }

        .checkbox {
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            border: 2px solid var(--border-color);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 2px;
            transition: all 0.2s;
        }

        .task-item.done .checkbox {
            background-color: var(--accent-success);
            border-color: var(--accent-success);
            color: #1a1b26;
        }

        .task-text {
            font-size: 14px;
            color: var(--text-main);
            transition: color 0.2s;
        }

        .task-item.done .task-text {
            color: var(--text-muted);
            text-decoration: line-through;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
                ${escapeHtml(title)}
            </h1>
            <div class="overall-progress">
                <span class="status-badge ${totalProgress === 100 ? 'complete' : ''}">
                    ${totalProgress === 100 ? 'COMPLETE' : 'IN PROGRESS'}
                </span>
            </div>
        </div>

        <div class="phases">
            ${phasesHtml}
        </div>
    </div>
    <script>
        // Listen for VS Code theme variables from Simple Browser parent
        window.addEventListener('message', event => {
            if (event.data && event.data.type === 'theme') {
                const vars = event.data.themeVars;
                for (const key in vars) {
                    if (vars[key]) {
                        document.documentElement.style.setProperty(key, vars[key]);
                    }
                }
            }
        });

        // Real-time artifact reload polling
        let lastContent = null;
        setInterval(() => {
            fetch(window.location.href, { cache: "no-store", headers: { 'Cache-Control': 'no-cache' } })
                .then(res => res.text())
                .then(html => {
                    const bodyMatch = html.match(/<body[^>]*>([\\s\\S]*)<\\/body>/i);
                    if (bodyMatch) {
                        const newContent = bodyMatch[1];
                        if (lastContent === null) {
                            lastContent = document.body.innerHTML;
                        }
                        if (newContent !== lastContent) {
                            document.body.innerHTML = newContent;
                            lastContent = newContent;
                        }
                    }
                })
                .catch(err => console.error("Poll error:", err));
        }, 1500);
    </script>
</body>
</html>`;
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
