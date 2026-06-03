import { generatePlanHTML } from './templates/plan-template.js';
import fs from 'fs';
import path from 'path';

const content = `
## Database Models
| Table | Description |
|---|---|
| Users | User accounts |
| Projects | User projects |

## System Architecture
\`\`\`mermaid
graph LR;
    Client-->Backend;
    Backend-->DB[(Database)];
\`\`\`
`;

const html = generatePlanHTML({ title: 'Test Plan', summary: 'This is a test of tables and mermaid diagrams.', content });

const outDir = path.join(process.env.HOME, '.superluminal', 'artifacts', 'test-chat-123');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const filePath = path.join(outDir, 'plan.nebula');

fs.writeFileSync(filePath, html);
console.log('Test file written to ' + filePath);
