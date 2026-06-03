export function generateImplementationHTML(data) {
  const { title = "Implementation Plan", summary = "", changes = [], verification = [] } = data;

  let changesHtml = "";

  changes.forEach((changeGroup) => {
    let filesHtml = "";
    
    if (changeGroup.files && Array.isArray(changeGroup.files)) {
      changeGroup.files.forEach(file => {
        let fileClass = "";
        let iconHtml = "";
        
        switch(file.type) {
            case '[NEW]':
                fileClass = "file-new";
                iconHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`;
                break;
            case '[MODIFY]':
                fileClass = "file-modify";
                iconHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
                break;
            case '[DELETE]':
                fileClass = "file-delete";
                iconHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>`;
                break;
        }

        filesHtml += `
          <div class="file-item">
            <div class="file-header">
                <div class="file-badge ${fileClass}">
                    ${iconHtml}
                    ${escapeHtml(file.type)}
                </div>
                <div class="file-path">${escapeHtml(file.path)}</div>
            </div>
            <div class="file-desc">${escapeHtml(file.description)}</div>
          </div>
        `;
      });
    }

    changesHtml += `
      <div class="component-card">
        <div class="component-header">
          <h3 class="component-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            ${escapeHtml(changeGroup.component)}
          </h3>
          <span class="file-count">${changeGroup.files ? changeGroup.files.length : 0} files</span>
        </div>
        <div class="file-list">
          ${filesHtml}
        </div>
      </div>
    `;
  });

  let verificationHtml = "";
  if (verification && verification.length > 0) {
      verificationHtml = `
        <div class="verification-card">
            <h3 class="section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>
                Verification Steps
            </h3>
            <ul class="verify-list">
                ${verification.map(v => `<li>${escapeHtml(v)}</li>`).join('')}
            </ul>
        </div>
      `;
  }

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
            --accent-warning: #e0af68;
            --accent-danger: #f7768e;
            --border-color: var(--vscode-editorGroup-border, #3b3b54);
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 30px;
            padding-bottom: 25px;
            border-bottom: 1px solid var(--border-color);
        }

        .header h1 {
            font-size: 28px;
            font-weight: 600;
            margin: 0 0 12px 0;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--text-main);
        }

        .header h1 svg {
            color: var(--accent-primary);
            width: 28px;
            height: 28px;
        }

        .summary {
            font-size: 15px;
            color: var(--text-muted);
            margin: 0;
            max-width: 90%;
            line-height: 1.6;
            background: var(--bg-card);
            padding: 16px;
            border-radius: 8px;
            border-left: 3px solid var(--accent-primary);
        }

        .section-heading {
            font-size: 18px;
            font-weight: 600;
            margin: 40px 0 20px 0;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .component-card {
            background-color: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 24px;
            overflow: hidden;
            transition: border-color 0.2s;
        }

        .component-card:hover {
            border-color: #54547a;
        }

        .component-header {
            padding: 16px 20px;
            background-color: rgba(0, 0, 0, 0.1);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .component-title {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .component-title svg {
            width: 18px;
            height: 18px;
            color: var(--accent-primary);
        }

        .file-count {
            font-size: 12px;
            color: var(--text-muted);
            background: rgba(255,255,255,0.05);
            padding: 4px 10px;
            border-radius: 12px;
        }

        .file-list {
            padding: 10px 20px;
        }

        .file-item {
            padding: 14px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .file-item:last-child {
            border-bottom: none;
        }

        .file-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .file-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            padding: 3px 8px;
            border-radius: 4px;
        }

        .file-badge svg {
            width: 12px;
            height: 12px;
        }

        .file-new {
            background: rgba(158, 206, 106, 0.15);
            color: var(--accent-success);
        }

        .file-modify {
            background: rgba(224, 175, 104, 0.15);
            color: var(--accent-warning);
        }

        .file-delete {
            background: rgba(247, 118, 142, 0.15);
            color: var(--accent-danger);
        }

        .file-path {
            font-size: 13px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            color: var(--text-main);
            word-break: break-all;
        }

        .file-desc {
            font-size: 13px;
            color: var(--text-muted);
            padding-left: 12px;
            border-left: 2px solid rgba(255,255,255,0.1);
            margin-left: 14px;
        }

        .verification-card {
            background-color: var(--bg-card);
            border: 1px solid var(--accent-success);
            border-radius: 8px;
            margin-top: 40px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .verification-card .section-title {
            margin: 0 0 16px 0;
            font-size: 16px;
            color: var(--accent-success);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .verification-card .section-title svg {
            width: 20px;
            height: 20px;
        }

        .verify-list {
            margin: 0;
            padding-left: 20px;
            color: var(--text-main);
            font-size: 14px;
        }

        .verify-list li {
            margin-bottom: 8px;
            line-height: 1.5;
        }

        .verify-list li:last-child {
            margin-bottom: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <path d="M3 9h18M9 21V9"></path>
                </svg>
                ${escapeHtml(title)}
            </h1>
            <p class="summary">${escapeHtml(summary)}</p>
        </div>

        <h2 class="section-heading">Proposed File Changes</h2>
        <div class="changes">
            ${changesHtml}
        </div>

        ${verificationHtml}
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
